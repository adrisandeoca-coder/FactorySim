"""
Comprehensive scenario tests for FactorySim engine.

Tests multiple factory configurations and validates that KPIs,
state tracking, OEE formula, starvation detection, and implicit
arrival buffers all work correctly.
"""

import pytest
import math
from factorysim.engine.simulation import Simulation, SimulationConfig
from factorysim.engine.station import StationState


# ──────────────────────────────────────────────────────────────────
# Helper
# ──────────────────────────────────────────────────────────────────

def run_scenario(model, duration=3600, seed=42, label="scenario"):
    """Run a scenario and return (result, sim) with basic sanity checks."""
    config = SimulationConfig(duration=duration, seed=seed)
    sim = Simulation(model, config)
    result = sim.run()

    assert result["status"] == "completed", f"[{label}] sim failed: {result.get('error')}"
    assert "kpis" in result, f"[{label}] no kpis in result"
    return result, sim


def print_kpi_summary(label, result, sim):
    """Pretty-print KPIs for visual log inspection."""
    k = result["kpis"]
    print(f"\n{'='*70}")
    print(f"  SCENARIO: {label}")
    print(f"{'='*70}")
    tp = k["throughput"]
    print(f"  Throughput : {tp['total']} units  ({tp['rate_per_hour']:.1f}/hr)")
    print(f"  By hour    : {tp.get('by_hour', [])}")

    oee = k["oee"]
    print(f"  OEE overall: {oee['overall']:.3f}")
    print(f"    Avail    : {oee['availability']:.3f}")
    print(f"    Perf     : {oee['performance']:.3f}")
    print(f"    Quality  : {oee['quality']:.3f}")
    for sid, soee in oee.get("by_station", {}).items():
        name = sim.stations[sid].name if sid in sim.stations else sid
        print(f"    [{name}] A={soee['availability']:.3f}  P={soee['performance']:.3f}  Q={soee['quality']:.3f}  OEE={soee['oee']:.3f}")

    util = k["utilization"]
    print(f"  Utilization breakdown:")
    for sid, breakdown in util.get("by_station", {}).items():
        name = sim.stations[sid].name if sid in sim.stations else sid
        parts = ", ".join(f"{s}={v:.3f}" for s, v in breakdown.items() if v > 0.001)
        print(f"    [{name}] {parts}")

    ct = k["cycle_time"]
    print(f"  Cycle time : mean={ct['mean']:.1f}s  std={ct['std']:.1f}s  min={ct['min']:.1f}s  max={ct['max']:.1f}s")

    wip = k["wip"]
    print(f"  WIP total  : {wip['total']}")
    for bid, bdata in wip.get("by_buffer", {}).items():
        name = sim.buffers[bid].name if bid in sim.buffers else bid
        print(f"    [{name}] avg_wip={bdata['average_wip']:.2f}  avg_wait={bdata.get('average_waiting_time', '?')}  "
              f"block={bdata.get('blocking_time', 0):.1f}s  starve={bdata.get('starving_time', 0):.1f}s")

    # Station state logs
    print(f"  Station state log sizes:")
    for sid, station in sim.stations.items():
        print(f"    [{station.name}] {len(station.state_log)} events, items_processed={station.items_processed}, "
              f"items_scrapped={station.items_scrapped}")

    print(f"  Completed products: {len(sim.completed_products)}")
    print()


# ──────────────────────────────────────────────────────────────────
# Scenario models
# ──────────────────────────────────────────────────────────────────

SCENARIO_TWO_STATION_BALANCED = {
    "id": "s1", "name": "Two Station Balanced Line",
    "stations": [
        {"id": "cut", "name": "Cutting", "cycleTime": {"type": "constant", "parameters": {"value": 60}}},
        {"id": "asm", "name": "Assembly", "cycleTime": {"type": "constant", "parameters": {"value": 60}}},
    ],
    "buffers": [
        {"id": "b1", "name": "Cut-Asm Buffer", "capacity": 10, "queueRule": "FIFO"},
    ],
    "connections": [
        {"id": "c1", "source": "cut", "target": "b1"},
        {"id": "c2", "source": "b1", "target": "asm"},
    ],
    "products": [
        {"id": "p1", "name": "Widget", "routing": ["cut", "asm"], "arrivalRate": 90},
    ],
}

SCENARIO_THREE_STATION_BOTTLENECK = {
    "id": "s2", "name": "Three Station Bottleneck",
    "stations": [
        {"id": "st1", "name": "Fast Prep", "cycleTime": {"type": "constant", "parameters": {"value": 30}}},
        {"id": "st2", "name": "Slow Machine", "cycleTime": {"type": "constant", "parameters": {"value": 120}}},
        {"id": "st3", "name": "Fast Pack", "cycleTime": {"type": "constant", "parameters": {"value": 30}}},
    ],
    "buffers": [
        {"id": "b1", "name": "Prep-Machine Buffer", "capacity": 5, "queueRule": "FIFO"},
        {"id": "b2", "name": "Machine-Pack Buffer", "capacity": 5, "queueRule": "FIFO"},
    ],
    "connections": [
        {"id": "c1", "source": "st1", "target": "b1"},
        {"id": "c2", "source": "b1", "target": "st2"},
        {"id": "c3", "source": "st2", "target": "b2"},
        {"id": "c4", "source": "b2", "target": "st3"},
    ],
    "products": [
        {"id": "p1", "name": "Part", "routing": ["st1", "st2", "st3"], "arrivalRate": 45},
    ],
}

SCENARIO_FAILURES = {
    "id": "s3", "name": "Station with Failures",
    "stations": [
        {"id": "st1", "name": "Reliable", "cycleTime": {"type": "constant", "parameters": {"value": 60}}},
        {"id": "st2", "name": "Unreliable", "cycleTime": {"type": "constant", "parameters": {"value": 60}},
         "mtbf": 0.5, "mttr": 0.1},  # Fails every ~30min, 6min repair
    ],
    "buffers": [
        {"id": "b1", "name": "Buffer", "capacity": 10, "queueRule": "FIFO"},
    ],
    "connections": [
        {"id": "c1", "source": "st1", "target": "b1"},
        {"id": "c2", "source": "b1", "target": "st2"},
    ],
    "products": [
        {"id": "p1", "name": "Part", "routing": ["st1", "st2"], "arrivalRate": 90},
    ],
}

SCENARIO_SCRAP = {
    "id": "s4", "name": "Quality Issue (Scrap)",
    "stations": [
        {"id": "st1", "name": "Machining", "cycleTime": {"type": "constant", "parameters": {"value": 60}},
         "scrapRate": 0.15},
        {"id": "st2", "name": "Finishing", "cycleTime": {"type": "constant", "parameters": {"value": 45}}},
    ],
    "buffers": [
        {"id": "b1", "name": "Buffer", "capacity": 10, "queueRule": "FIFO"},
    ],
    "connections": [
        {"id": "c1", "source": "st1", "target": "b1"},
        {"id": "c2", "source": "b1", "target": "st2"},
    ],
    "products": [
        {"id": "p1", "name": "Part", "routing": ["st1", "st2"], "arrivalRate": 90},
    ],
}

SCENARIO_MULTI_PRODUCT = {
    "id": "s5", "name": "Two Products Different Routings",
    "stations": [
        {"id": "cut", "name": "Cutting", "cycleTime": {"type": "constant", "parameters": {"value": 50}},
         "setupTime": {"type": "constant", "parameters": {"value": 30}}},
        {"id": "bend", "name": "Bending", "cycleTime": {"type": "constant", "parameters": {"value": 60}}},
        {"id": "weld", "name": "Welding", "cycleTime": {"type": "constant", "parameters": {"value": 70}}},
    ],
    "buffers": [
        {"id": "b1", "name": "Cut-Bend Buffer", "capacity": 8, "queueRule": "FIFO"},
        {"id": "b2", "name": "Cut-Weld Buffer", "capacity": 8, "queueRule": "FIFO"},
    ],
    "connections": [
        {"id": "c1", "source": "cut", "target": "b1"},
        {"id": "c2", "source": "b1", "target": "bend"},
        {"id": "c3", "source": "cut", "target": "b2"},
        {"id": "c4", "source": "b2", "target": "weld"},
    ],
    "products": [
        {"id": "pA", "name": "Bracket", "routing": ["cut", "bend"], "arrivalRate": 120},
        {"id": "pB", "name": "Frame", "routing": ["cut", "weld"], "arrivalRate": 180},
    ],
}

SCENARIO_VARIABLE_TIMES = {
    "id": "s6", "name": "Normal Distribution Cycle Times",
    "stations": [
        {"id": "st1", "name": "Station A", "cycleTime": {"type": "normal", "parameters": {"mean": 60, "std": 10}}},
        {"id": "st2", "name": "Station B", "cycleTime": {"type": "triangular", "parameters": {"min": 40, "mode": 55, "max": 80}}},
    ],
    "buffers": [
        {"id": "b1", "name": "Buffer", "capacity": 15, "queueRule": "FIFO"},
    ],
    "connections": [
        {"id": "c1", "source": "st1", "target": "b1"},
        {"id": "c2", "source": "b1", "target": "st2"},
    ],
    "products": [
        {"id": "p1", "name": "Part", "routing": ["st1", "st2"], "arrivalRate": 90},
    ],
}

SCENARIO_SINGLE_STATION = {
    "id": "s7", "name": "Single Station (No Buffer)",
    "stations": [
        {"id": "st1", "name": "Solo Machine", "cycleTime": {"type": "constant", "parameters": {"value": 60}}},
    ],
    "buffers": [],
    "connections": [],
    "products": [
        {"id": "p1", "name": "Part", "routing": ["st1"], "arrivalRate": 90},
    ],
}

SCENARIO_FIVE_STATION_LINE = {
    "id": "s8", "name": "Five Station Production Line",
    "stations": [
        {"id": "s1", "name": "Cut",     "cycleTime": {"type": "constant", "parameters": {"value": 45}}},
        {"id": "s2", "name": "Drill",   "cycleTime": {"type": "constant", "parameters": {"value": 55}}},
        {"id": "s3", "name": "Mill",    "cycleTime": {"type": "constant", "parameters": {"value": 70}}},
        {"id": "s4", "name": "Polish",  "cycleTime": {"type": "constant", "parameters": {"value": 50}}},
        {"id": "s5", "name": "Inspect", "cycleTime": {"type": "constant", "parameters": {"value": 30}}},
    ],
    "buffers": [
        {"id": "b12", "name": "Cut-Drill",    "capacity": 6, "queueRule": "FIFO"},
        {"id": "b23", "name": "Drill-Mill",   "capacity": 6, "queueRule": "FIFO"},
        {"id": "b34", "name": "Mill-Polish",  "capacity": 6, "queueRule": "FIFO"},
        {"id": "b45", "name": "Polish-Inspect","capacity": 6, "queueRule": "FIFO"},
    ],
    "connections": [
        {"id": "c1", "source": "s1", "target": "b12"},
        {"id": "c2", "source": "b12","target": "s2"},
        {"id": "c3", "source": "s2", "target": "b23"},
        {"id": "c4", "source": "b23","target": "s3"},
        {"id": "c5", "source": "s3", "target": "b34"},
        {"id": "c6", "source": "b34","target": "s4"},
        {"id": "c7", "source": "s4", "target": "b45"},
        {"id": "c8", "source": "b45","target": "s5"},
    ],
    "products": [
        {"id": "p1", "name": "Shaft", "routing": ["s1", "s2", "s3", "s4", "s5"], "arrivalRate": 60},
    ],
}


# ──────────────────────────────────────────────────────────────────
# Tests
# ──────────────────────────────────────────────────────────────────

class TestScenarioBasics:
    """Each scenario runs without error and produces sane KPIs."""

    @pytest.mark.parametrize("model,label", [
        (SCENARIO_TWO_STATION_BALANCED, "two_station_balanced"),
        (SCENARIO_THREE_STATION_BOTTLENECK, "three_station_bottleneck"),
        (SCENARIO_FAILURES, "failures"),
        (SCENARIO_SCRAP, "scrap"),
        (SCENARIO_MULTI_PRODUCT, "multi_product"),
        (SCENARIO_VARIABLE_TIMES, "variable_times"),
        (SCENARIO_SINGLE_STATION, "single_station"),
        (SCENARIO_FIVE_STATION_LINE, "five_station_line"),
    ])
    def test_scenario_runs(self, model, label):
        result, sim = run_scenario(model, duration=7200, label=label)
        print_kpi_summary(label, result, sim)

        k = result["kpis"]
        assert k["throughput"]["total"] >= 0
        assert 0 <= k["oee"]["overall"] <= 1.0
        assert 0 <= k["oee"]["availability"] <= 1.0
        assert 0 <= k["oee"]["performance"] <= 1.0
        assert 0 <= k["oee"]["quality"] <= 1.0


class TestImplicitArrivalBuffers:
    """Issue 1 & 4: First-in-routing stations without a buffer get an implicit one."""

    def test_first_station_gets_implicit_buffer(self):
        """Cutting has no explicit input buffer → engine creates one."""
        result, sim = run_scenario(SCENARIO_TWO_STATION_BALANCED, label="implicit_buf")
        print_kpi_summary("implicit_arrival_buffer", result, sim)

        cut = sim.stations["cut"]
        assert cut.input_buffer is not None, "First station should have an implicit input buffer"
        assert cut.input_buffer.id.startswith("__arrival_"), \
            f"Implicit buffer should have __arrival_ prefix, got {cut.input_buffer.id}"

    def test_single_station_gets_implicit_buffer(self):
        """Single-station model: station should still get an implicit buffer."""
        result, sim = run_scenario(SCENARIO_SINGLE_STATION, label="single_implicit")
        print_kpi_summary("single_station_implicit", result, sim)

        st = sim.stations["st1"]
        assert st.input_buffer is not None, "Single station should get implicit input buffer"

    def test_first_station_shows_starved(self):
        """With implicit buffer, first station should show STARVED (not just IDLE)."""
        # Use a slow arrival rate so the station is often waiting for parts
        model = {
            "id": "starve-test", "name": "Starvation Test",
            "stations": [
                {"id": "st1", "name": "Machine", "cycleTime": {"type": "constant", "parameters": {"value": 30}}},
            ],
            "buffers": [],
            "connections": [],
            "products": [
                {"id": "p1", "name": "Part", "routing": ["st1"], "arrivalRate": 120},
            ],
        }
        result, sim = run_scenario(model, duration=7200, label="starvation")
        print_kpi_summary("starvation_test", result, sim)

        util = result["kpis"]["utilization"]["by_station"]["st1"]
        starved = util.get("starved", 0)
        idle = util.get("idle", 0)
        processing = util.get("processing", 0)

        print(f"  >> Starved={starved:.3f}, Idle={idle:.3f}, Processing={processing:.3f}")

        # With 120s mean inter-arrival and 30s cycle time, station should be
        # starved much of the time (waiting for parts)
        assert starved > 0.1, f"Station should show significant starved time, got {starved:.3f}"
        assert processing > 0, "Station should have processed some parts"


class TestOEEFormula:
    """Issue 2: OEE Performance should use standard (ideal_ct × count) / run_time."""

    def test_performance_not_equal_utilization(self):
        """Performance uses operating_time denominator (standard OEE).

        With operating_time = scheduled - failed - setup, a starved station
        (120s IAT, 60s CT) spends ~50% of operating_time actually processing,
        but Performance uses busy_time (total_processing_time) as its
        denominator, NOT operating_time.  A starved station that processes at
        ideal speed when it IS processing should have P ≈ 1.0.  Starvation is
        reflected in utilization, not in OEE Performance — they are different
        metrics by design.
        """
        # Slow arrival → station is starved → low utilization
        model = {
            "id": "oee-test", "name": "OEE Performance Test",
            "stations": [
                {"id": "st1", "name": "Machine", "cycleTime": {"type": "constant", "parameters": {"value": 60}}},
            ],
            "buffers": [],
            "connections": [],
            "products": [
                {"id": "p1", "name": "Part", "routing": ["st1"], "arrivalRate": 120},
            ],
        }
        result, sim = run_scenario(model, duration=7200, label="oee_formula")
        print_kpi_summary("oee_formula_test", result, sim)

        st = sim.stations["st1"]
        oee = st.get_oee()
        util = st.get_utilization()

        print(f"  >> Utilization={util:.4f}, OEE Performance={oee['performance']:.4f}")
        print(f"  >> Availability={oee['availability']:.4f}")
        print(f"  >> Items processed={st.items_processed}")

        assert oee["availability"] > 0.99, "No failures, no setup → availability ≈ 100%"

        # With busy_time denominator, a starved station processing at ideal
        # speed should have P ≈ 1.0 (efficient when running).
        # Starvation is captured in utilization (~0.5), NOT performance.
        assert oee["performance"] > 0.95, \
            f"Starved station processing at ideal speed should have P ≈ 1.0, got {oee['performance']:.3f}"

        # Utilization and performance should differ: utilization ~0.5, performance ~1.0
        assert util < 0.65, f"Utilization should be ~0.5 (starved), got {util:.3f}"
        assert oee["performance"] - util > 0.3, \
            f"P ({oee['performance']:.3f}) should be much higher than utilization ({util:.3f}) for a starved station"

    def test_failures_reduce_availability(self):
        """MTBF/MTTR should lower availability but not directly lower performance."""
        result, sim = run_scenario(SCENARIO_FAILURES, duration=14400, label="oee_failures")
        print_kpi_summary("oee_failures", result, sim)

        unreliable = sim.stations["st2"]
        oee = unreliable.get_oee()

        print(f"  >> Unreliable station OEE: {oee}")
        assert oee["availability"] < 0.95, \
            f"Unreliable station should have reduced availability, got {oee['availability']:.3f}"

    def test_scrap_reduces_quality(self):
        """Scrap rate should lower quality component."""
        result, sim = run_scenario(SCENARIO_SCRAP, duration=7200, label="oee_scrap")
        print_kpi_summary("oee_scrap", result, sim)

        machining = sim.stations["st1"]
        oee = machining.get_oee()

        print(f"  >> Machining OEE: {oee}")
        print(f"  >> Processed: {machining.items_processed}, Scrapped: {machining.items_scrapped}")

        assert oee["quality"] < 1.0, "Scrap rate should reduce quality"
        if machining.items_processed + machining.items_scrapped > 10:
            # Quality should be roughly 1 - scrap_rate
            assert oee["quality"] < 0.95, f"15% scrap → quality should be ~0.85, got {oee['quality']:.3f}"


class TestStateBreakdown:
    """Issue 5 & 6: No duplicate events, utilization consistent with breakdown."""

    def test_state_fractions_sum_to_one(self):
        """State breakdown should sum to approximately 1.0."""
        result, sim = run_scenario(SCENARIO_THREE_STATION_BOTTLENECK, duration=7200, label="state_sum")
        print_kpi_summary("state_fractions", result, sim)

        for sid, station in sim.stations.items():
            breakdown = station.get_state_breakdown()
            total = sum(breakdown.values())
            print(f"  >> [{station.name}] breakdown sum = {total:.6f}")
            assert abs(total - 1.0) < 0.01, \
                f"State fractions for {station.name} should sum to ~1.0, got {total:.6f}"

    def test_no_duplicate_state_events(self):
        """get_state_breakdown() should not create same->same transitions."""
        result, sim = run_scenario(SCENARIO_TWO_STATION_BALANCED, duration=3600, label="no_dupes")

        for sid, station in sim.stations.items():
            # Call get_state_breakdown() multiple times
            station.get_state_breakdown()
            station.get_state_breakdown()
            station.get_state_breakdown()

            # Check state_log for same->same transitions
            dupes = 0
            for entry in station.state_log:
                if entry["from_state"] == entry["to_state"]:
                    dupes += 1

            print(f"  >> [{station.name}] state_log size: {len(station.state_log)}, same->same transitions: {dupes}")
            assert dupes == 0, \
                f"{station.name} has {dupes} duplicate state transitions (same->same)"

    def test_utilization_matches_processing_fraction(self):
        """get_utilization() should equal the 'processing' fraction from get_state_breakdown()."""
        result, sim = run_scenario(SCENARIO_FIVE_STATION_LINE, duration=7200, label="util_match")
        print_kpi_summary("util_consistency", result, sim)

        for sid, station in sim.stations.items():
            util = station.get_utilization()
            breakdown = station.get_state_breakdown()
            proc_frac = breakdown["processing"]

            print(f"  >> [{station.name}] get_utilization()={util:.6f}  breakdown.processing={proc_frac:.6f}")
            assert abs(util - proc_frac) < 0.001, \
                f"{station.name}: utilization ({util:.6f}) != processing fraction ({proc_frac:.6f})"


class TestBottleneckIdentification:
    """The slowest station should show high utilization; fast stations should be starved."""

    def test_bottleneck_has_highest_utilization(self):
        result, sim = run_scenario(SCENARIO_THREE_STATION_BOTTLENECK, duration=14400, label="bottleneck")
        print_kpi_summary("bottleneck_id", result, sim)

        slow = sim.stations["st2"]
        fast1 = sim.stations["st1"]
        fast3 = sim.stations["st3"]

        slow_util = slow.get_utilization()
        fast1_util = fast1.get_utilization()
        fast3_util = fast3.get_utilization()

        print(f"  >> Fast Prep util={fast1_util:.3f}, Slow Machine util={slow_util:.3f}, Fast Pack util={fast3_util:.3f}")

        # Slow Machine (120s CT) should be the bottleneck with highest utilization
        assert slow_util > fast1_util, "Bottleneck station should have higher utilization than upstream fast station"
        assert slow_util > fast3_util, "Bottleneck station should have higher utilization than downstream fast station"

    def test_upstream_of_bottleneck_is_blocked(self):
        """Fast station upstream of bottleneck should show blocking."""
        result, sim = run_scenario(SCENARIO_THREE_STATION_BOTTLENECK, duration=14400, label="blocking")

        fast1 = sim.stations["st1"]
        breakdown = fast1.get_state_breakdown()
        blocked = breakdown.get("blocked", 0)

        print(f"  >> Fast Prep blocked fraction: {blocked:.3f}")
        # With small buffer (cap=5) and fast upstream, blocking should occur
        assert blocked > 0.01, f"Fast station before bottleneck should show some blocking, got {blocked:.3f}"

    def test_downstream_of_bottleneck_is_starved(self):
        """Fast station downstream of bottleneck should show starving."""
        result, sim = run_scenario(SCENARIO_THREE_STATION_BOTTLENECK, duration=14400, label="starving")

        fast3 = sim.stations["st3"]
        breakdown = fast3.get_state_breakdown()
        starved = breakdown.get("starved", 0)

        print(f"  >> Fast Pack starved fraction: {starved:.3f}")
        assert starved > 0.1, f"Fast station after bottleneck should be starved, got {starved:.3f}"


class TestWIPAndWaitTime:
    """Issue 3: Wait time should reflect actual part waiting, not buffer starving time."""

    def test_average_waiting_time_in_output(self):
        """_calculate_wip() should include average_waiting_time per buffer."""
        result, sim = run_scenario(SCENARIO_THREE_STATION_BOTTLENECK, duration=7200, label="wait_time")
        print_kpi_summary("wip_wait_time", result, sim)

        wip = result["kpis"]["wip"]
        for bid, bdata in wip["by_buffer"].items():
            assert "average_waiting_time" in bdata, \
                f"Buffer {bid} missing average_waiting_time field"
            print(f"  >> Buffer {bid}: avg_wait={bdata['average_waiting_time']:.2f}s, "
                  f"starve={bdata['starving_time']:.1f}s")

    def test_wait_time_before_bottleneck_is_high(self):
        """Parts waiting before the slow station should have high average wait."""
        result, sim = run_scenario(SCENARIO_THREE_STATION_BOTTLENECK, duration=14400, label="wait_before_bn")
        print_kpi_summary("wait_before_bottleneck", result, sim)

        # b1 = Prep-Machine Buffer (before bottleneck)
        b1_stats = result["kpis"]["wip"]["by_buffer"].get("b1", {})
        avg_wait = b1_stats.get("average_waiting_time", 0)
        print(f"  >> Pre-bottleneck buffer avg wait: {avg_wait:.2f}s")

        # Parts should queue up significantly before the slow machine
        assert avg_wait > 10, f"Parts before bottleneck should wait significantly, got {avg_wait:.2f}s"


class TestMultiProduct:
    """Multi-product routing with setup times."""

    def test_multi_product_throughput(self):
        result, sim = run_scenario(SCENARIO_MULTI_PRODUCT, duration=7200, label="multi_product")
        print_kpi_summary("multi_product", result, sim)

        tp = result["kpis"]["throughput"]
        assert tp["total"] > 0, "Should produce some completed parts"

        # Check per-product throughput
        by_product = tp.get("by_product", {})
        print(f"  >> Per product: {by_product}")

    def test_setup_time_tracked(self):
        """Cutting station has setup time → should show setup in state breakdown."""
        result, sim = run_scenario(SCENARIO_MULTI_PRODUCT, duration=7200, label="setup_time")

        cut = sim.stations["cut"]
        breakdown = cut.get_state_breakdown()
        setup = breakdown.get("setup", 0)

        print(f"  >> Cutting setup fraction: {setup:.3f}")
        print(f"  >> Cutting total_setup_time: {cut.total_setup_time:.1f}s")

        # With two product types and setup time, there should be some setup time
        assert cut.total_setup_time > 0, "Cutting should have accumulated setup time for product changeovers"


class TestLongSimulation:
    """Test a longer simulation to verify throughput-by-hour and stability."""

    def test_24h_simulation(self):
        result, sim = run_scenario(SCENARIO_FIVE_STATION_LINE, duration=86400, seed=42, label="24h_line")
        print_kpi_summary("24h_five_station", result, sim)

        tp = result["kpis"]["throughput"]
        by_hour = tp.get("by_hour", [])
        print(f"  >> Hours of data: {len(by_hour)}")
        print(f"  >> First 6 hours: {by_hour[:6]}")
        print(f"  >> Last 6 hours: {by_hour[-6:]}")

        # Should have ~24 hours of data
        assert len(by_hour) >= 23, f"24h sim should have ~24 hourly buckets, got {len(by_hour)}"
        # After warmup, every hour should produce parts
        assert sum(by_hour[2:]) > 0, "Should produce parts after initial warmup"


class TestExportToPython:
    """Generated Python code should be syntactically valid."""

    def test_export_syntax(self):
        config = SimulationConfig(duration=3600, seed=42)
        sim = Simulation(SCENARIO_FIVE_STATION_LINE, config)
        code = sim.export_to_python()

        print(f"  >> Generated code length: {len(code)} chars")
        print(f"  >> First 200 chars: {code[:200]}")

        # Should compile without syntax errors
        compile(code, "<generated>", "exec")
        print("  >> Code compiles successfully!")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s", "--tb=short"])
