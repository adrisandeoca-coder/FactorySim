"""
Statistical verification of the simulation engine against queueing theory.

These tests check that the engine's numbers are *correct*, not just that it
runs. Each expected value comes from an exact analytical result:

- M/M/1 (lambda=0.8, mu=1.0): mean time in system W = 1/(mu - lambda) = 5.0,
  utilisation rho = 0.8.
- Saturated two-station exponential line (mu1 = mu2 = 1) with B buffer slots
  between the stations and blocking-after-service: throughput = (B+2)/(B+3).
  B=1 -> 0.75, B=5 -> 0.875. Station 1 is blocked 1 - throughput of the time.

Also covered: seed reproducibility, independence of replication streams, and
regression tests for defects found during verification (Oct 2026):
- replications leaked in-flight products from the previous replication
- throughput/cycle time filtered on creation time instead of exit time
- O(n^2) cycle-time std made long runs hang
- silent throttling of arrivals by the implicit capacity-1 arrival queue

Run the full-length M/M/1 spec (10 x 100,000 time units, ~3 min) with:
    pytest tests/test_verification.py -m slow
"""

import math

import numpy as np
import pytest

from factorysim.engine.simulation import Simulation, SimulationConfig

BIG = 10**7  # effectively unlimited buffer capacity


def mm1_model(lam: float = 0.8, mu: float = 1.0, explicit_queue: bool = True):
    model = {
        "id": "mm1", "name": "M/M/1",
        "stations": [{
            "id": "s1", "name": "Server",
            "cycleTime": {"type": "exponential", "parameters": {"mean": 1.0 / mu}},
            "capacity": 1,
        }],
        "buffers": [],
        "connections": [],
        # arrivalRate is the mean inter-arrival time in seconds
        "products": [{"id": "p1", "name": "Part", "routing": ["s1"], "arrivalRate": 1.0 / lam}],
        "resources": [],
    }
    if explicit_queue:
        model["buffers"].append({"id": "q", "name": "Queue", "capacity": BIG, "queueRule": "FIFO"})
        model["connections"].append({"id": "c0", "sourceId": "q", "targetId": "s1"})
    return model


def tandem_model(B: int):
    """Two exponential(1) stations, B buffer slots between, saturated input."""
    return {
        "id": f"tandem-{B}", "name": f"Tandem B={B}",
        "stations": [
            {"id": f"s{i}", "name": f"S{i}",
             "cycleTime": {"type": "exponential", "parameters": {"mean": 1.0}}, "capacity": 1}
            for i in (1, 2)
        ],
        "buffers": [
            {"id": "in", "name": "Input", "capacity": BIG, "queueRule": "FIFO"},
            {"id": "mid", "name": "Mid", "capacity": B, "queueRule": "FIFO"},
        ],
        "connections": [
            {"id": "c0", "sourceId": "in", "targetId": "s1"},
            {"id": "c1", "sourceId": "s1", "targetId": "mid"},
            {"id": "c2", "sourceId": "mid", "targetId": "s2"},
        ],
        # Arrivals at twice the line's capacity keep station 1 saturated.
        "products": [{"id": "p1", "name": "Part", "routing": ["s1", "s2"], "arrivalRate": 0.5}],
        "resources": [],
    }


def run(model, **cfg):
    result = Simulation(model, SimulationConfig(**cfg)).run()
    assert result["status"] == "completed", result.get("error")
    return result


def _mean(x):
    return x["mean"] if isinstance(x, dict) else x


# ── M/M/1 ─────────────────────────────────────────────────────────────

class TestMM1:

    @pytest.mark.slow
    def test_mm1_full_spec(self):
        """Spec: W within 5% of 5.0 over 10 replications of 100,000 time units."""
        r = run(mm1_model(), duration=100_000, warmup_period=5_000, seed=1, replications=10)
        k = r["kpis"]
        w = k["cycle_time"]["mean"]
        assert abs(w["mean"] - 5.0) / 5.0 < 0.05, w
        assert w["ci_lower"] <= 5.0 <= w["ci_upper"], w
        rho = k["utilization"]["by_station"]["s1"]["processing"]["mean"]
        assert abs(rho - 0.8) < 0.01, rho

    def test_mm1_short(self):
        """Faster version: W within 7%, utilisation within 0.015."""
        r = run(mm1_model(), duration=20_000, warmup_period=2_000, seed=7, replications=6)
        k = r["kpis"]
        w = k["cycle_time"]["mean"]["mean"]
        assert abs(w - 5.0) / 5.0 < 0.07, w
        rho = k["utilization"]["by_station"]["s1"]["processing"]["mean"]
        assert abs(rho - 0.8) < 0.015, rho
        # Throughput after warm-up ~= lambda * (duration - warmup)
        tp = k["throughput"]["total"]["mean"]
        assert abs(tp / 18_000 - 0.8) < 0.02, tp

    def test_implicit_arrival_queue_throttling_is_reported(self):
        """Without an explicit buffer the first station gets a capacity-1
        arrival queue, which holds back arrivals. That must raise a warning."""
        r = run(mm1_model(explicit_queue=False), duration=20_000, seed=1)
        warns = [w for w in r["kpis"]["warnings"] if w["type"] == "arrivals_throttled"]
        assert warns, "throttled arrivals must be reported"
        assert warns[0]["created"] < 0.9 * warns[0]["expected_arrivals"]

    def test_no_throttling_warning_with_explicit_queue(self):
        r = run(mm1_model(), duration=20_000, seed=1)
        assert not [w for w in r["kpis"]["warnings"] if w["type"] == "arrivals_throttled"]


# ── Blocking after service ────────────────────────────────────────────

class TestBlocking:

    @pytest.mark.parametrize("B", [1, 5])
    def test_tandem_throughput_matches_exact_result(self, B):
        exact = (B + 2) / (B + 3)
        D, W = 20_000, 2_000
        r = run(tandem_model(B), duration=D, warmup_period=W, seed=3, replications=4)
        k = r["kpis"]
        tp_rate = k["throughput"]["total"]["mean"] / (D - W)
        assert abs(tp_rate - exact) < 0.02, (B, tp_rate, exact)
        u = k["utilization"]["by_station"]
        # Station 2 is busy exactly when a part is delivered; station 1 is
        # blocked for the remainder (it is never starved: saturated input).
        assert abs(u["s2"]["processing"]["mean"] - exact) < 0.02
        assert abs(u["s1"]["blocked"]["mean"] - (1 - exact)) < 0.02

    def test_small_buffer_blocks_and_lowers_throughput(self):
        D, W = 20_000, 2_000
        small = run(tandem_model(1), duration=D, warmup_period=W, seed=5)["kpis"]
        large = run(tandem_model(BIG), duration=D, warmup_period=W, seed=5)["kpis"]
        assert small["utilization"]["by_station"]["s1"]["blocked"] > 0.15
        assert large["utilization"]["by_station"]["s1"]["blocked"] < 0.01
        assert small["throughput"]["total"] < 0.85 * large["throughput"]["total"]


# ── Replications and seeds ────────────────────────────────────────────

class TestReplications:

    def test_same_seed_identical(self):
        a = run(mm1_model(), duration=5_000, seed=11)["kpis"]
        b = run(mm1_model(), duration=5_000, seed=11)["kpis"]
        assert a["throughput"]["total"] == b["throughput"]["total"]
        assert a["cycle_time"]["mean"] == b["cycle_time"]["mean"]

    def test_different_seed_differs(self):
        a = run(mm1_model(), duration=5_000, seed=11)["kpis"]
        b = run(mm1_model(), duration=5_000, seed=12)["kpis"]
        assert a["cycle_time"]["mean"] != b["cycle_time"]["mean"]

    def test_replications_reproducible(self):
        a = run(mm1_model(), duration=3_000, seed=4, replications=3)
        b = run(mm1_model(), duration=3_000, seed=4, replications=3)
        assert [x["throughput"]["total"] for x in a["replication_results"]] == \
               [x["throughput"]["total"] for x in b["replication_results"]]

    def test_seed_zero_is_not_seed_42(self):
        a = run(mm1_model(), duration=3_000, seed=0, replications=2)
        b = run(mm1_model(), duration=3_000, seed=42, replications=2)
        assert a["kpis"]["throughput"]["total"]["mean"] != b["kpis"]["throughput"]["total"]["mean"]

    def test_adjacent_seeds_do_not_share_replications(self):
        a = run(mm1_model(), duration=3_000, seed=42, replications=3)["replication_results"]
        b = run(mm1_model(), duration=3_000, seed=43, replications=3)["replication_results"]
        ta = [x["cycle_time"]["mean"] for x in a]
        tb = [x["cycle_time"]["mean"] for x in b]
        assert not set(ta) & set(tb)

    def test_no_leak_between_replications(self):
        """Regression: in-flight products of replication k were counted as
        completions of replication k+1 (via generator finally-blocks)."""
        D, W = 20_000, 2_000
        r = run(tandem_model(1), duration=D, warmup_period=W, seed=3, replications=3)
        for rep in r["replication_results"]:
            processed_s2 = rep["throughput"]["by_station"]["s2"]
            assert rep["throughput"]["total"] <= processed_s2, rep["throughput"]


# ── Output statistics ─────────────────────────────────────────────────

class TestOutputStatistics:

    def test_throughput_counts_exits_after_warmup(self):
        """Congested line: counting by creation time undercounts throughput.
        Exit-based counting gives the exact 0.75 for B=1."""
        D, W = 20_000, 2_000
        k = run(tandem_model(1), duration=D, warmup_period=W, seed=3)["kpis"]
        assert abs(k["throughput"]["total"] / (D - W) - 0.75) < 0.03

    def test_by_product_consistent_with_total(self):
        k = run(mm1_model(), duration=10_000, warmup_period=1_000, seed=2)["kpis"]
        assert k["throughput"]["by_product"]["p1"] == k["throughput"]["total"]
        assert math.isclose(k["cycle_time"]["by_product"]["p1"]["mean"], k["cycle_time"]["mean"])

    def test_long_run_statistics_are_not_quadratic(self):
        """Regression: ProductType.get_statistics() was O(n^2)."""
        import time
        from factorysim.engine.product import ProductType
        pt = ProductType.__new__(ProductType)
        pt.cycle_times = list(np.random.default_rng(0).exponential(5.0, 200_000))
        pt.id = pt.name = "x"
        pt.total_created = pt.total_completed = len(pt.cycle_times)
        pt.total_scrapped = 0
        t = time.time()
        stats = pt.get_statistics()
        assert time.time() - t < 2.0
        assert abs(stats["average_cycle_time"] - 5.0) < 0.1
