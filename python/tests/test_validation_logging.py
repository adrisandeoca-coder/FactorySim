"""
Tests for model validation, parameter echo-back logging, and
configured-vs-actual summary enhancements.
"""

import pytest
from factorysim.engine.simulation import Simulation, SimulationConfig


# ──────────────────────────────────────────────────────────────────
# Helper
# ──────────────────────────────────────────────────────────────────

def run_scenario(model, duration=3600, seed=42):
    config = SimulationConfig(duration=duration, seed=seed)
    sim = Simulation(model, config)
    result = sim.run()
    assert result["status"] == "completed"
    return result, sim


def find_events(sim, event_type):
    return [e for e in sim.event_log if e["type"] == event_type]


# ──────────────────────────────────────────────────────────────────
# Models
# ──────────────────────────────────────────────────────────────────

MODEL_HEALTHY = {
    "id": "healthy", "name": "Healthy Model",
    "stations": [
        {"id": "s1", "name": "Station A",
         "cycleTime": {"type": "constant", "parameters": {"value": 30}},
         "scrapRate": 0.05, "position": {"x": 100, "y": 100}},
        {"id": "s2", "name": "Station B",
         "cycleTime": {"type": "constant", "parameters": {"value": 40}},
         "position": {"x": 300, "y": 100}},
    ],
    "buffers": [
        {"id": "b1", "name": "Buffer 1", "capacity": 20, "queueRule": "FIFO"},
    ],
    "connections": [
        {"id": "c1", "source": "s1", "target": "b1"},
        {"id": "c2", "source": "b1", "target": "s2"},
    ],
    "products": [
        {"id": "p1", "name": "Widget", "routing": ["s1", "s2"], "arrivalRate": 50},
    ],
    "resources": [],
}

MODEL_WITH_WARNINGS = {
    "id": "warnings", "name": "Warning Model",
    "stations": [
        {"id": "s1", "name": "Active",
         "cycleTime": {"type": "constant", "parameters": {"value": 30}},
         "position": {"x": 100, "y": 100}},
        {"id": "s_orphan", "name": "Orphan Station",
         "cycleTime": {"type": "constant", "parameters": {"value": 30}},
         "position": {"x": 400, "y": 100}},
    ],
    "buffers": [
        {"id": "b_orphan", "name": "Orphan Buffer", "capacity": 10, "queueRule": "FIFO"},
    ],
    "connections": [],
    "products": [
        {"id": "p1", "name": "Part", "routing": ["s1"], "arrivalRate": 60},
    ],
    "resources": [],
}

MODEL_WITH_CONVEYOR = {
    "id": "conv-val", "name": "Conveyor Validation",
    "stations": [
        {"id": "s1", "name": "Cutting",
         "cycleTime": {"type": "constant", "parameters": {"value": 30}},
         "scrapRate": 0.1, "position": {"x": 100, "y": 100}},
        {"id": "s2", "name": "Welding",
         "cycleTime": {"type": "constant", "parameters": {"value": 50}},
         "position": {"x": 500, "y": 100}},
    ],
    "buffers": [],
    "connections": [
        {"id": "c1", "source": "s1", "target": "conv1"},
        {"id": "c2", "source": "conv1", "target": "s2"},
        {"id": "c3", "source": "s2", "target": "insp1"},
    ],
    "products": [
        {"id": "p1", "name": "Metal Part", "routing": ["s1", "s2"], "arrivalRate": 50},
    ],
    "resources": [],
    "extraNodes": [
        {"id": "conv1", "type": "conveyor",
         "data": {"id": "conv1", "name": "Belt A", "length": 10, "speed": 2, "capacity": 5},
         "position": {"x": 300, "y": 100}},
        {"id": "insp1", "type": "inspection",
         "data": {"id": "insp1", "name": "Final QC", "inspectionTime": 8, "defectRate": 5,
                  "inspectionType": "visual"},
         "position": {"x": 700, "y": 100}},
    ],
}

MODEL_WITH_FAILURES = {
    "id": "failures", "name": "Failures Model",
    "stations": [
        {"id": "s1", "name": "Machine",
         "cycleTime": {"type": "constant", "parameters": {"value": 30}},
         "scrapRate": 0.05, "mtbf": 2.0, "mttr": 0.5,
         "position": {"x": 100, "y": 100}},
    ],
    "buffers": [],
    "connections": [],
    "products": [
        {"id": "p1", "name": "Part", "routing": ["s1"], "arrivalRate": 60},
    ],
    "resources": [],
}

MODEL_WITH_SETUP = {
    "id": "setup", "name": "Setup Model",
    "stations": [
        {"id": "s1", "name": "Lathe",
         "cycleTime": {"type": "constant", "parameters": {"value": 30}},
         "setupTime": {"type": "constant", "parameters": {"value": 20}},
         "position": {"x": 100, "y": 100}},
    ],
    "buffers": [],
    "connections": [],
    "products": [
        {"id": "p1", "name": "Type A", "routing": ["s1"], "arrivalRate": 60},
        {"id": "p2", "name": "Type B", "routing": ["s1"], "arrivalRate": 90},
    ],
    "resources": [],
}

MODEL_SPLITTER_MERGE = {
    "id": "split-merge-log", "name": "Splitter+Merge Logging",
    "stations": [
        {"id": "s1", "name": "Source Station",
         "cycleTime": {"type": "constant", "parameters": {"value": 30}},
         "position": {"x": 100, "y": 200}},
        {"id": "s2", "name": "Dest Station",
         "cycleTime": {"type": "constant", "parameters": {"value": 30}},
         "position": {"x": 700, "y": 200}},
    ],
    "buffers": [],
    "connections": [
        {"id": "c1", "source": "s1", "target": "split1"},
        {"id": "c2", "source": "split1", "target": "merge1"},
        {"id": "c3", "source": "merge1", "target": "s2"},
    ],
    "products": [
        {"id": "p1", "name": "Widget", "routing": ["s1", "s2"], "arrivalRate": 60},
    ],
    "resources": [],
    "extraNodes": [
        {"id": "split1", "type": "splitter",
         "data": {"id": "split1", "name": "Route Split", "outputs": 3,
                  "splitType": "equal", "productRouting": {}},
         "position": {"x": 300, "y": 200}},
        {"id": "merge1", "type": "merge",
         "data": {"id": "merge1", "name": "Merge Point", "inputs": 3,
                  "mergeType": "fifo"},
         "position": {"x": 500, "y": 200}},
    ],
}

MODEL_DISASSEMBLY = {
    "id": "disasm-log", "name": "Disassembly Logging",
    "stations": [
        {"id": "s1", "name": "Input Station",
         "cycleTime": {"type": "constant", "parameters": {"value": 20}},
         "position": {"x": 100, "y": 200}},
        {"id": "s2", "name": "Output Station",
         "cycleTime": {"type": "constant", "parameters": {"value": 30}},
         "position": {"x": 500, "y": 200}},
    ],
    "buffers": [],
    "connections": [
        {"id": "c1", "source": "s1", "target": "disasm1"},
        {"id": "c2", "source": "disasm1", "target": "s2"},
    ],
    "products": [
        {"id": "p1", "name": "Assembly", "routing": ["s1", "s2"], "arrivalRate": 90},
    ],
    "resources": [],
    "extraNodes": [
        {"id": "disasm1", "type": "disassembly",
         "data": {"id": "disasm1", "name": "Teardown",
                  "cycleTime": 15, "outputParts": []},
         "position": {"x": 300, "y": 200}},
    ],
}

MODEL_DEPALLETIZE = {
    "id": "depal-log", "name": "Depalletize Logging",
    "stations": [
        {"id": "s1", "name": "Packing",
         "cycleTime": {"type": "constant", "parameters": {"value": 20}},
         "position": {"x": 100, "y": 200}},
        {"id": "s2", "name": "Unpacking",
         "cycleTime": {"type": "constant", "parameters": {"value": 30}},
         "position": {"x": 500, "y": 200}},
    ],
    "buffers": [],
    "connections": [
        {"id": "c1", "source": "s1", "target": "depal1"},
        {"id": "c2", "source": "depal1", "target": "s2"},
    ],
    "products": [
        {"id": "p1", "name": "Item", "routing": ["s1", "s2"], "arrivalRate": 60},
    ],
    "resources": [],
    "extraNodes": [
        {"id": "depal1", "type": "depalletize",
         "data": {"id": "depal1", "name": "Depacker", "cycleTime": 8},
         "position": {"x": 300, "y": 200}},
    ],
}


# ══════════════════════════════════════════════════════════════════
#  Validation Tests
# ══════════════════════════════════════════════════════════════════

class TestModelValidation:
    """Tests for _validate_model() and validate()."""

    def test_healthy_model_no_errors(self):
        result, sim = run_scenario(MODEL_HEALTHY)
        report = sim.validate()
        assert report["valid"] is True
        assert report["error_count"] == 0

    def test_orphan_warnings_detected(self):
        result, sim = run_scenario(MODEL_WITH_WARNINGS)
        report = sim.validate()
        codes = [i["code"] for i in report["issues"]]
        assert "STATION_ORPHAN" in codes
        assert "BUFFER_ORPHAN" in codes

    def test_validation_events_in_log(self):
        result, sim = run_scenario(MODEL_WITH_WARNINGS)
        warn_events = find_events(sim, "validation_warning")
        assert len(warn_events) > 0
        codes = [e["details"]["code"] for e in warn_events]
        assert "STATION_ORPHAN" in codes

    def test_validate_returns_summary_counts(self):
        result, sim = run_scenario(MODEL_HEALTHY)
        report = sim.validate()
        assert "summary" in report
        assert report["summary"]["stations"] == 2
        assert report["summary"]["buffers"] == 1
        assert report["summary"]["products"] == 1

    def test_extra_node_orphan_detected(self):
        """An extra node that isn't in any chain should get EXTRA_NODE_ORPHAN."""
        model = {
            "id": "orphan-en", "name": "Orphan Extra Node",
            "stations": [
                {"id": "s1", "name": "Station",
                 "cycleTime": {"type": "constant", "parameters": {"value": 30}}},
            ],
            "buffers": [],
            "connections": [],
            "products": [
                {"id": "p1", "name": "Part", "routing": ["s1"], "arrivalRate": 60},
            ],
            "resources": [],
            "extraNodes": [
                {"id": "conv-orphan", "type": "conveyor",
                 "data": {"id": "conv-orphan", "name": "Unused Belt",
                          "length": 5, "speed": 1, "capacity": 3},
                 "position": {"x": 0, "y": 0}},
            ],
        }
        _, sim = run_scenario(model)
        report = sim.validate()
        codes = [i["code"] for i in report["issues"]]
        assert "EXTRA_NODE_ORPHAN" in codes


# ══════════════════════════════════════════════════════════════════
#  Parameter Echo-Back Logging Tests
# ══════════════════════════════════════════════════════════════════

class TestModelConfigLogging:
    """Tests for _log_model_config() parameter echo-back."""

    def test_model_config_event_emitted(self):
        _, sim = run_scenario(MODEL_HEALTHY)
        config_events = find_events(sim, "model_config")
        assert len(config_events) == 1

    def test_station_config_echoed(self):
        _, sim = run_scenario(MODEL_HEALTHY)
        config_event = find_events(sim, "model_config")[0]
        stations = config_event["details"]["stations"]
        assert "s1" in stations
        assert stations["s1"]["scrap_rate"] == 0.05
        assert stations["s1"]["cycle_time"]["type"] == "constant"
        assert stations["s1"]["cycle_time"]["parameters"]["value"] == 30

    def test_buffer_config_echoed(self):
        _, sim = run_scenario(MODEL_HEALTHY)
        config_event = find_events(sim, "model_config")[0]
        buffers = config_event["details"]["buffers"]
        assert "b1" in buffers
        assert buffers["b1"]["capacity"] == 20
        assert buffers["b1"]["queue_rule"] == "FIFO"

    def test_product_config_echoed(self):
        _, sim = run_scenario(MODEL_HEALTHY)
        config_event = find_events(sim, "model_config")[0]
        products = config_event["details"]["products"]
        assert "p1" in products
        assert products["p1"]["routing"] == ["s1", "s2"]
        assert products["p1"]["arrival_rate"] == 50

    def test_extra_node_config_echoed(self):
        _, sim = run_scenario(MODEL_WITH_CONVEYOR)
        config_event = find_events(sim, "model_config")[0]
        extra = config_event["details"]["extra_nodes"]
        assert "conv1" in extra
        assert extra["conv1"]["type"] == "conveyor"
        assert extra["conv1"]["length"] == 10
        assert extra["conv1"]["speed"] == 2
        assert extra["conv1"]["transit_time"] == 5.0
        assert "insp1" in extra
        assert extra["insp1"]["type"] == "inspection"
        assert extra["insp1"]["defect_rate_pct"] == 5.0

    def test_chain_info_echoed(self):
        _, sim = run_scenario(MODEL_WITH_CONVEYOR)
        config_event = find_events(sim, "model_config")[0]
        chains = config_event["details"]["chains"]
        assert "between_stations" in chains
        # s1->s2 should have conv1 in its chain
        found_chain = False
        for key, node_ids in chains["between_stations"].items():
            if "conv1" in node_ids:
                found_chain = True
        assert found_chain, "Expected conv1 in a between_stations chain"

    def test_sim_config_echoed(self):
        _, sim = run_scenario(MODEL_HEALTHY, duration=7200)
        config_event = find_events(sim, "model_config")[0]
        sim_cfg = config_event["details"]["config"]
        assert sim_cfg["duration"] == 7200
        assert sim_cfg["seed"] == 42

    def test_validation_issues_in_config(self):
        _, sim = run_scenario(MODEL_WITH_WARNINGS)
        config_event = find_events(sim, "model_config")[0]
        validation = config_event["details"]["validation"]
        assert "issues" in validation
        assert len(validation["issues"]) > 0


# ══════════════════════════════════════════════════════════════════
#  Configured-vs-Actual Summary Tests
# ══════════════════════════════════════════════════════════════════

class TestConfiguredVsActual:
    """Tests for the enhanced simulation_summary with configured-vs-actual data."""

    def test_summary_has_station_cva(self):
        """Station summaries should include configured_vs_actual."""
        _, sim = run_scenario(MODEL_HEALTHY)
        summary_events = find_events(sim, "simulation_summary")
        assert len(summary_events) == 1
        station_summaries = summary_events[0]["details"]["station_summaries"]
        s1 = station_summaries["s1"]
        assert "configured_vs_actual" in s1
        cva = s1["configured_vs_actual"]
        assert cva["scrap_rate"]["configured"] == 0.05
        assert 0.0 <= cva["scrap_rate"]["actual"] <= 1.0
        assert cva["cycle_time"]["configured_mean"] == 30

    def test_scrap_rate_converges(self):
        """Over a long enough run, actual scrap should approach configured."""
        _, sim = run_scenario(MODEL_HEALTHY, duration=36000)
        summary = find_events(sim, "simulation_summary")[0]["details"]
        cva = summary["station_summaries"]["s1"]["configured_vs_actual"]
        configured = cva["scrap_rate"]["configured"]
        actual = cva["scrap_rate"]["actual"]
        # With 10 hours of sim, should be within 5 percentage points
        assert abs(actual - configured) < 0.05, (
            f"Scrap rate {actual} too far from configured {configured}"
        )

    def test_mtbf_in_cva(self):
        """Stations with MTBF should show configured-vs-actual failure data."""
        _, sim = run_scenario(MODEL_WITH_FAILURES, duration=36000)
        summary = find_events(sim, "simulation_summary")[0]["details"]
        cva = summary["station_summaries"]["s1"]["configured_vs_actual"]
        assert "mtbf_hours" in cva
        assert cva["mtbf_hours"]["configured"] == 2.0
        assert "mttr_hours" in cva
        assert cva["mttr_hours"]["configured"] == 0.5
        assert cva["mttr_hours"]["actual_total_repair_s"] > 0

    def test_setup_time_in_cva(self):
        """Stations with setup time should show it in configured_vs_actual."""
        _, sim = run_scenario(MODEL_WITH_SETUP)
        summary = find_events(sim, "simulation_summary")[0]["details"]
        cva = summary["station_summaries"]["s1"]["configured_vs_actual"]
        assert "setup_time" in cva
        assert cva["setup_time"]["configured_mean"] == 20

    def test_inspection_cva(self):
        """Inspection nodes should have defect rate configured-vs-actual."""
        _, sim = run_scenario(MODEL_WITH_CONVEYOR, duration=36000)
        summary = find_events(sim, "simulation_summary")[0]["details"]
        en_summaries = summary["extra_node_summaries"]
        insp = en_summaries["insp1"]
        assert "configured_vs_actual" in insp
        cva = insp["configured_vs_actual"]
        assert cva["defect_rate"]["configured_pct"] == 5.0
        # Actual defect rate should be in a reasonable range
        assert 0.0 <= cva["defect_rate"]["actual_pct"] <= 100.0

    def test_conveyor_cva(self):
        """Conveyor nodes should have transit time configured-vs-actual."""
        _, sim = run_scenario(MODEL_WITH_CONVEYOR)
        summary = find_events(sim, "simulation_summary")[0]["details"]
        en_summaries = summary["extra_node_summaries"]
        conv = en_summaries["conv1"]
        assert "configured_vs_actual" in conv
        cva = conv["configured_vs_actual"]
        assert cva["transit_time"]["configured"] == 5.0
        assert cva["transit_time"]["length"] == 10
        assert cva["transit_time"]["speed"] == 2

    def test_product_summaries_in_summary(self):
        """Product summaries should include arrival rate comparison."""
        _, sim = run_scenario(MODEL_HEALTHY)
        summary = find_events(sim, "simulation_summary")[0]["details"]
        assert "product_summaries" in summary
        p1 = summary["product_summaries"]["p1"]
        assert p1["name"] == "Widget"
        assert p1["configured_arrival_rate"] == 50
        assert p1["total_created"] > 0
        assert p1["actual_arrival_rate_per_h"] > 0

    def test_station_name_in_summary(self):
        """Station summaries should include the station name."""
        _, sim = run_scenario(MODEL_HEALTHY)
        summary = find_events(sim, "simulation_summary")[0]["details"]
        s1 = summary["station_summaries"]["s1"]
        assert s1["name"] == "Station A"

    def test_batch_size_in_cva(self):
        """Station batch_size should appear in configured_vs_actual."""
        _, sim = run_scenario(MODEL_HEALTHY)
        summary = find_events(sim, "simulation_summary")[0]["details"]
        cva = summary["station_summaries"]["s1"]["configured_vs_actual"]
        assert "batch_size" in cva

    def test_buffer_cva_has_capacity_and_queue_rule(self):
        """Buffer summaries should include configured capacity and queue rule."""
        _, sim = run_scenario(MODEL_HEALTHY)
        summary = find_events(sim, "simulation_summary")[0]["details"]
        b1 = summary["buffer_summaries"]["b1"]
        assert "configured_vs_actual" in b1
        cva = b1["configured_vs_actual"]
        assert cva["capacity"] == 20
        assert cva["queue_rule"] == "FIFO"

    def test_product_priority_in_summary(self):
        """Product summaries should include priority."""
        _, sim = run_scenario(MODEL_HEALTHY)
        summary = find_events(sim, "simulation_summary")[0]["details"]
        p1 = summary["product_summaries"]["p1"]
        assert "priority" in p1

    def test_product_routing_in_summary(self):
        """Product summaries should include full routing."""
        _, sim = run_scenario(MODEL_HEALTHY)
        summary = find_events(sim, "simulation_summary")[0]["details"]
        p1 = summary["product_summaries"]["p1"]
        assert p1["routing"] == ["s1", "s2"]

    def test_inspection_type_in_cva(self):
        """Inspection configured_vs_actual should include inspection_type."""
        _, sim = run_scenario(MODEL_WITH_CONVEYOR, duration=3600)
        summary = find_events(sim, "simulation_summary")[0]["details"]
        insp = summary["extra_node_summaries"]["insp1"]
        cva = insp["configured_vs_actual"]
        assert cva["inspection_type"] == "visual"

    def test_sim_config_in_summary(self):
        """Simulation config should be echoed in the summary event."""
        _, sim = run_scenario(MODEL_HEALTHY, duration=7200)
        summary = find_events(sim, "simulation_summary")[0]["details"]
        assert "config" in summary
        assert summary["config"]["duration"] == 7200
        assert summary["config"]["seed"] == 42

    def test_model_config_has_all_sim_params(self):
        """model_config should include trace_mode, confidence_level, etc."""
        _, sim = run_scenario(MODEL_HEALTHY)
        config_event = find_events(sim, "model_config")[0]
        cfg = config_event["details"]["config"]
        assert "trace_mode" in cfg
        assert "confidence_level" in cfg
        assert "stream_events" in cfg
        assert "start_day_of_week" in cfg
        assert "start_hour" in cfg

    def test_splitter_cva(self):
        """Splitter configured_vs_actual should include outputs, split_type."""
        _, sim = run_scenario(MODEL_SPLITTER_MERGE)
        summary = find_events(sim, "simulation_summary")[0]["details"]
        split = summary["extra_node_summaries"]["split1"]
        assert "configured_vs_actual" in split
        cva = split["configured_vs_actual"]
        assert cva["outputs"] == 3
        assert cva["split_type"] == "equal"
        assert "items_routed" in cva

    def test_merge_cva(self):
        """Merge configured_vs_actual should include inputs, merge_type."""
        _, sim = run_scenario(MODEL_SPLITTER_MERGE)
        summary = find_events(sim, "simulation_summary")[0]["details"]
        merge = summary["extra_node_summaries"]["merge1"]
        assert "configured_vs_actual" in merge
        cva = merge["configured_vs_actual"]
        assert cva["inputs"] == 3
        assert cva["merge_type"] == "fifo"
        assert "items_merged" in cva

    def test_disassembly_cva(self):
        """Disassembly configured_vs_actual should include cycle_time, output_parts."""
        _, sim = run_scenario(MODEL_DISASSEMBLY)
        summary = find_events(sim, "simulation_summary")[0]["details"]
        disasm = summary["extra_node_summaries"]["disasm1"]
        assert "configured_vs_actual" in disasm
        cva = disasm["configured_vs_actual"]
        assert cva["cycle_time"] == 15
        assert "output_parts" in cva
        assert "items_disassembled" in cva

    def test_depalletize_cva(self):
        """Depalletize configured_vs_actual should include cycle_time."""
        _, sim = run_scenario(MODEL_DEPALLETIZE)
        summary = find_events(sim, "simulation_summary")[0]["details"]
        depal = summary["extra_node_summaries"]["depal1"]
        assert "configured_vs_actual" in depal
        cva = depal["configured_vs_actual"]
        assert cva["cycle_time"] == 8
        assert "items_depalletized" in cva
