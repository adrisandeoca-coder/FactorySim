"""
Tests for Source, Sink, and Operator node participation in simulation.

Verifies that:
- Sources drive arrivals at constant inter-arrival times
- Sinks record product exits with statistics
- Operators create shared resources wired to stations
- Operator efficiency affects cycle times
- Logging, validation, and KPIs include all three node types
"""

import pytest
from factorysim.engine.simulation import Simulation, SimulationConfig


# ──────────────────────────────────────────────────────────────────
# Helper
# ──────────────────────────────────────────────────────────────────

def run_scenario(model, duration=3600, seed=42, label="scenario"):
    config = SimulationConfig(duration=duration, seed=seed)
    sim = Simulation(model, config)
    result = sim.run()
    assert result["status"] == "completed", f"[{label}] sim failed: {result.get('error')}"
    assert "kpis" in result, f"[{label}] no kpis in result"
    return result, sim


def get_events(sim, event_type):
    return [e for e in sim.event_log if e["type"] == event_type]


# ──────────────────────────────────────────────────────────────────
# Test models
# ──────────────────────────────────────────────────────────────────

def _basic_model(
    *,
    source=None,
    sink=None,
    operator=None,
    product_arrival_rate=60,
    cycle_time=30,
    connections=None,
):
    """Build a minimal model with optional source/sink/operator."""
    extra_nodes = []
    conns = connections if connections is not None else []

    if source:
        extra_nodes.append({
            "id": source["id"], "type": "source",
            "data": source,
        })
    if sink:
        extra_nodes.append({
            "id": sink["id"], "type": "sink",
            "data": sink,
        })
    if operator:
        extra_nodes.append({
            "id": operator["id"], "type": "operator",
            "data": operator,
        })

    return {
        "id": "test-model", "name": "Test Model",
        "stations": [
            {"id": "s1", "name": "Station 1",
             "cycleTime": {"type": "constant", "parameters": {"value": cycle_time}}},
        ],
        "buffers": [],
        "connections": conns,
        "products": [
            {"id": "p1", "name": "Widget", "routing": ["s1"],
             "arrivalRate": product_arrival_rate},
        ],
        "resources": [],
        "extraNodes": extra_nodes,
    }


# ──────────────────────────────────────────────────────────────────
# Tests: Source
# ──────────────────────────────────────────────────────────────────

class TestSource:

    def test_source_drives_arrivals(self):
        """Source with arrivalRate=60 should generate products at constant 60s intervals."""
        model = _basic_model(
            source={"id": "src-1", "name": "Source", "arrivalRate": 60, "feedMode": "interval"},
            product_arrival_rate=60,  # will be overridden by source
        )
        result, sim = run_scenario(model, duration=3600, seed=42,
                                   label="source_drives_arrivals")

        # Source should exist
        assert "src-1" in sim.sources
        src = sim.sources["src-1"]
        assert src.total_generated > 0

        # At constant 60s intervals for 3600s, expect ~59 products (first at t=60)
        assert 50 <= src.total_generated <= 65

        # source_generate events should exist
        gen_events = get_events(sim, "source_generate")
        assert len(gen_events) == src.total_generated

        # KPIs should include source stats
        kpis = result["kpis"]
        assert "sources" in kpis
        assert "src-1" in kpis["sources"]

    def test_source_with_product_filter(self):
        """Source filtering to one product type; other type uses ProductType.arrival_rate."""
        model = {
            "id": "filter-test", "name": "Filter Test",
            "stations": [
                {"id": "s1", "name": "Station 1",
                 "cycleTime": {"type": "constant", "parameters": {"value": 20}}},
            ],
            "buffers": [],
            "connections": [],
            "products": [
                {"id": "p1", "name": "Alpha", "routing": ["s1"], "arrivalRate": 120},
                {"id": "p2", "name": "Beta", "routing": ["s1"], "arrivalRate": 120},
            ],
            "resources": [],
            "extraNodes": [
                {"id": "src-1", "type": "source",
                 "data": {"id": "src-1", "name": "Source A",
                          "arrivalRate": 60, "feedMode": "interval",
                          "productFilter": "p1"}},
            ],
        }
        result, sim = run_scenario(model, duration=3600, seed=42,
                                   label="source_with_filter")

        src = sim.sources["src-1"]
        # Source only generates p1
        assert src.generation_by_product_type.get("p1", 0) > 0
        assert src.generation_by_product_type.get("p2", 0) == 0

        # p2 should still be generated via _arrival_process
        p2_type = sim.product_types["p2"]
        assert p2_type.total_created > 0

    def test_source_overrides_product_arrival(self):
        """Source rate takes over for products it covers."""
        # Source at 30s vs product at 120s — source wins
        model = _basic_model(
            source={"id": "src-1", "name": "Fast Source", "arrivalRate": 30,
                    "feedMode": "interval"},
            product_arrival_rate=120,
        )
        result, sim = run_scenario(model, duration=1800, seed=42,
                                   label="source_overrides")

        src = sim.sources["src-1"]
        # At 30s intervals for 1800s → expect ~59 products
        assert src.total_generated >= 50

        # The product type's arrival_process should NOT be running (overridden)
        # so all products come from the source
        gen_events = get_events(sim, "source_generate")
        assert len(gen_events) == src.total_generated


# ──────────────────────────────────────────────────────────────────
# Tests: Backward compatibility
# ──────────────────────────────────────────────────────────────────

class TestBackwardCompat:

    def test_no_source_backward_compat(self):
        """No source/sink/operator — identical behavior to before."""
        model = _basic_model(product_arrival_rate=60)
        result, sim = run_scenario(model, duration=3600, seed=42,
                                   label="backward_compat")

        assert len(sim.sources) == 0
        assert len(sim.sinks) == 0

        # Products still generated via _arrival_process
        total = sum(pt.total_created for pt in sim.product_types.values())
        assert total > 0

        # No source/sink KPIs
        kpis = result["kpis"]
        assert "sources" not in kpis
        assert "sinks" not in kpis


# ──────────────────────────────────────────────────────────────────
# Tests: Sink
# ──────────────────────────────────────────────────────────────────

class TestSink:

    def test_sink_tracks_exits(self):
        """Sink connected after last station records exit events and stats."""
        model = _basic_model(
            source={"id": "src-1", "name": "Source", "arrivalRate": 60, "feedMode": "interval"},
            sink={"id": "snk-1", "name": "Sink"},
            product_arrival_rate=60,
            connections=[
                {"id": "c1", "source": "s1", "target": "snk-1"},
            ],
        )
        result, sim = run_scenario(model, duration=3600, seed=42,
                                   label="sink_tracks_exits")

        assert "snk-1" in sim.sinks
        snk = sim.sinks["snk-1"]
        assert snk.total_exited > 0

        # sink_exit events
        exit_events = get_events(sim, "sink_exit")
        assert len(exit_events) == snk.total_exited

        # KPIs
        kpis = result["kpis"]
        assert "sinks" in kpis
        assert "snk-1" in kpis["sinks"]
        assert kpis["sinks"]["snk-1"]["total_exited"] > 0

    def test_sink_in_output_chain(self):
        """Sink after an inspection node in output chain still records exits."""
        model = {
            "id": "chain-sink", "name": "Chain Sink Test",
            "stations": [
                {"id": "s1", "name": "Machine",
                 "cycleTime": {"type": "constant", "parameters": {"value": 30}}},
            ],
            "buffers": [],
            "connections": [
                {"id": "c1", "source": "s1", "target": "insp-1"},
                {"id": "c2", "source": "insp-1", "target": "snk-1"},
            ],
            "products": [
                {"id": "p1", "name": "Part", "routing": ["s1"], "arrivalRate": 60},
            ],
            "resources": [],
            "extraNodes": [
                {"id": "insp-1", "type": "inspection",
                 "data": {"id": "insp-1", "name": "QC", "inspectionTime": 5,
                          "defectRate": 0, "inspectionType": "visual"}},
                {"id": "snk-1", "type": "sink",
                 "data": {"id": "snk-1", "name": "Exit"}},
            ],
        }
        result, sim = run_scenario(model, duration=3600, seed=42,
                                   label="sink_output_chain")

        snk = sim.sinks["snk-1"]
        # Sink should have received products (via station→inspection→sink path)
        assert snk.total_exited > 0


# ──────────────────────────────────────────────────────────────────
# Tests: Operator
# ──────────────────────────────────────────────────────────────────

class TestOperator:

    def test_operator_creates_resource(self):
        """Operator in extraNodes creates a Resource in self.resources."""
        model = _basic_model(
            operator={"id": "op-1", "name": "Technician", "count": 2,
                      "efficiency": 90, "skill": "assembly"},
            product_arrival_rate=60,
        )
        result, sim = run_scenario(model, duration=3600, seed=42,
                                   label="operator_resource")

        assert "op-1" in sim.resources
        res = sim.resources["op-1"]
        assert res.capacity == 2
        assert res.efficiency == 0.9
        assert "assembly" in res.skills

    def test_operator_connected_to_station(self):
        """Operator→Station connection means operator acquired/released during processing."""
        model = _basic_model(
            operator={"id": "op-1", "name": "Worker", "count": 1,
                      "efficiency": 100},
            product_arrival_rate=60,
            connections=[
                {"id": "c1", "source": "op-1", "target": "s1"},
            ],
        )
        result, sim = run_scenario(model, duration=3600, seed=42,
                                   label="operator_connected")

        assert "s1" in sim._station_operators
        assert "op-1" in sim._station_operators["s1"]

        # Operator should have been used
        res = sim.resources["op-1"]
        assert res.request_count > 0
        assert res.total_busy_time > 0

    def test_operator_efficiency_slows_cycle_time(self):
        """Operator at 50% efficiency → cycle times ~2x longer."""
        # Run with 100% efficiency operator
        model_fast = _basic_model(
            operator={"id": "op-1", "name": "Fast Op", "count": 1,
                      "efficiency": 100},
            product_arrival_rate=60,
            cycle_time=30,
            connections=[
                {"id": "c1", "source": "op-1", "target": "s1"},
            ],
        )
        result_fast, sim_fast = run_scenario(model_fast, duration=3600, seed=42,
                                             label="eff_100")

        # Run with 50% efficiency operator
        model_slow = _basic_model(
            operator={"id": "op-1", "name": "Slow Op", "count": 1,
                      "efficiency": 50},
            product_arrival_rate=60,
            cycle_time=30,
            connections=[
                {"id": "c1", "source": "op-1", "target": "s1"},
            ],
        )
        result_slow, sim_slow = run_scenario(model_slow, duration=3600, seed=42,
                                             label="eff_50")

        # With 50% efficiency, throughput should be significantly lower
        tp_fast = result_fast["kpis"]["throughput"]["total"]
        tp_slow = result_slow["kpis"]["throughput"]["total"]
        assert tp_slow < tp_fast, (
            f"50% efficiency throughput ({tp_slow}) should be less than "
            f"100% efficiency ({tp_fast})"
        )


# ──────────────────────────────────────────────────────────────────
# Tests: Logging & Validation
# ──────────────────────────────────────────────────────────────────

class TestLoggingValidation:

    def test_source_sink_operator_in_model_config(self):
        """All three logged in model_config event."""
        model = _basic_model(
            source={"id": "src-1", "name": "Source", "arrivalRate": 60, "feedMode": "interval"},
            sink={"id": "snk-1", "name": "Sink"},
            operator={"id": "op-1", "name": "Op", "count": 1, "efficiency": 80},
            product_arrival_rate=60,
            connections=[
                {"id": "c1", "source": "s1", "target": "snk-1"},
                {"id": "c2", "source": "op-1", "target": "s1"},
            ],
        )
        result, sim = run_scenario(model, duration=600, seed=42,
                                   label="model_config_log")

        config_events = get_events(sim, "model_config")
        assert len(config_events) == 1
        details = config_events[0]["details"]

        assert "sources" in details
        assert "src-1" in details["sources"]
        assert details["sources"]["src-1"]["arrival_rate"] == 60

        assert "sinks" in details
        assert "snk-1" in details["sinks"]

        assert "operators" in details
        assert "op-1" in details["operators"]
        assert details["operators"]["op-1"]["efficiency"] == 0.8

        assert "operator_station_map" in details
        assert "s1" in details["operator_station_map"]

    def test_source_sink_operator_in_summary(self):
        """All three in simulation_summary with configured_vs_actual."""
        model = _basic_model(
            source={"id": "src-1", "name": "Source", "arrivalRate": 60, "feedMode": "interval"},
            sink={"id": "snk-1", "name": "Sink"},
            operator={"id": "op-1", "name": "Op", "count": 1, "efficiency": 80},
            product_arrival_rate=60,
            connections=[
                {"id": "c1", "source": "s1", "target": "snk-1"},
                {"id": "c2", "source": "op-1", "target": "s1"},
            ],
        )
        result, sim = run_scenario(model, duration=600, seed=42,
                                   label="summary_log")

        summary_events = get_events(sim, "simulation_summary")
        assert len(summary_events) == 1
        details = summary_events[0]["details"]

        assert "source_summaries" in details
        assert "src-1" in details["source_summaries"]
        src_sum = details["source_summaries"]["src-1"]
        assert "configured_vs_actual" in src_sum

        assert "sink_summaries" in details
        assert "snk-1" in details["sink_summaries"]

        assert "resource_summaries" in details
        assert "op-1" in details["resource_summaries"]
        res_sum = details["resource_summaries"]["op-1"]
        assert "configured_vs_actual" in res_sum

    def test_source_sink_operator_validation(self):
        """Orphan operator, bad source rate → validation warnings/errors."""
        model = _basic_model(
            source={"id": "src-1", "name": "Bad Source", "arrivalRate": -10,
                    "feedMode": "interval", "productFilter": "nonexistent"},
            operator={"id": "op-1", "name": "Orphan Op", "count": 1,
                      "efficiency": 0},
            product_arrival_rate=60,
            connections=[],  # operator not connected to any station
        )
        config = SimulationConfig(duration=600, seed=42)
        sim = Simulation(model, config)
        report = sim.validate()

        issues = report["issues"]
        codes = [i["code"] for i in issues]

        # Bad source arrival rate
        assert "SOURCE_ARRIVAL_RATE" in codes
        # Bad product filter
        assert "SOURCE_BAD_FILTER" in codes
        # Orphan operator (not connected)
        assert "OPERATOR_ORPHAN" in codes
        # Bad operator efficiency
        assert "OPERATOR_EFFICIENCY" in codes

        # Summary should include counts
        assert report["summary"]["sources"] == 1
        assert report["summary"]["operators"] >= 1
