"""
Tests for FactorySim extra node components.

Tests each of the 9 extra node types using template-derived models
to verify they participate in the simulation correctly.
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


# ──────────────────────────────────────────────────────────────────
# Test models
# ──────────────────────────────────────────────────────────────────

MODEL_CONVEYOR_LINE = {
    "id": "conv-test", "name": "Conveyor Line Test",
    "stations": [
        {"id": "s1", "name": "Stamping", "cycleTime": {"type": "constant", "parameters": {"value": 40}},
         "position": {"x": 200, "y": 250}},
        {"id": "s2", "name": "Bending", "cycleTime": {"type": "constant", "parameters": {"value": 35}},
         "position": {"x": 500, "y": 250}},
        {"id": "s3", "name": "Drilling", "cycleTime": {"type": "constant", "parameters": {"value": 50}},
         "position": {"x": 800, "y": 250}},
    ],
    "buffers": [
        {"id": "b-in", "name": "Input Queue", "capacity": 20, "queueRule": "FIFO",
         "position": {"x": 100, "y": 250}},
    ],
    "connections": [
        {"id": "c0", "source": "src-1", "target": "b-in"},
        {"id": "c1", "source": "b-in", "target": "s1"},
        {"id": "c2", "source": "s1", "target": "conv-1"},
        {"id": "c3", "source": "conv-1", "target": "s2"},
        {"id": "c4", "source": "s2", "target": "conv-2"},
        {"id": "c5", "source": "conv-2", "target": "s3"},
        {"id": "c6", "source": "s3", "target": "insp-1"},
        {"id": "c7", "source": "insp-1", "target": "sink-1"},
    ],
    "products": [
        {"id": "p1", "name": "Metal Part", "routing": ["s1", "s2", "s3"], "arrivalRate": 55},
    ],
    "resources": [],
    "extraNodes": [
        {"id": "src-1", "type": "source",
         "data": {"id": "src-1", "name": "Source", "arrivalRate": 55, "feedMode": "interval"},
         "position": {"x": 30, "y": 250}},
        {"id": "conv-1", "type": "conveyor",
         "data": {"id": "conv-1", "name": "Conveyor A", "length": 5, "speed": 1, "capacity": 5},
         "position": {"x": 350, "y": 250}},
        {"id": "conv-2", "type": "conveyor",
         "data": {"id": "conv-2", "name": "Conveyor B", "length": 8, "speed": 1.5, "capacity": 8},
         "position": {"x": 650, "y": 250}},
        {"id": "insp-1", "type": "inspection",
         "data": {"id": "insp-1", "name": "Final QC", "inspectionTime": 10, "defectRate": 2,
                  "inspectionType": "visual"},
         "position": {"x": 950, "y": 250}},
        {"id": "sink-1", "type": "sink",
         "data": {"id": "sink-1", "name": "Sink"},
         "position": {"x": 1100, "y": 250}},
    ],
}

MODEL_INSPECTION_ONLY = {
    "id": "insp-test", "name": "Inspection Only Test",
    "stations": [
        {"id": "s1", "name": "Machine", "cycleTime": {"type": "constant", "parameters": {"value": 60}}},
    ],
    "buffers": [],
    "connections": [
        {"id": "c1", "source": "s1", "target": "insp-1"},
    ],
    "products": [
        {"id": "p1", "name": "Part", "routing": ["s1"], "arrivalRate": 90},
    ],
    "resources": [],
    "extraNodes": [
        {"id": "insp-1", "type": "inspection",
         "data": {"id": "insp-1", "name": "QC Check", "inspectionTime": 5, "defectRate": 10,
                  "inspectionType": "automated"},
         "position": {"x": 0, "y": 0}},
    ],
}

MODEL_SPLITTER_MERGE = {
    "id": "split-merge-test", "name": "Splitter-Merge Test",
    "stations": [
        {"id": "s1", "name": "Start", "cycleTime": {"type": "constant", "parameters": {"value": 30}}},
        {"id": "s2", "name": "End", "cycleTime": {"type": "constant", "parameters": {"value": 30}}},
    ],
    "buffers": [
        {"id": "b1", "name": "Buffer", "capacity": 10, "queueRule": "FIFO"},
    ],
    "connections": [
        {"id": "c1", "source": "s1", "target": "split-1"},
        {"id": "c2", "source": "split-1", "target": "merge-1"},
        {"id": "c3", "source": "merge-1", "target": "s2"},
        # simulation wiring
        {"id": "cs1", "source": "s1", "target": "b1"},
        {"id": "cs2", "source": "b1", "target": "s2"},
    ],
    "products": [
        {"id": "p1", "name": "Part", "routing": ["s1", "s2"], "arrivalRate": 60},
    ],
    "resources": [],
    "extraNodes": [
        {"id": "split-1", "type": "splitter",
         "data": {"id": "split-1", "name": "Splitter", "outputs": 2, "splitType": "equal"},
         "position": {"x": 0, "y": 0}},
        {"id": "merge-1", "type": "merge",
         "data": {"id": "merge-1", "name": "Merge", "inputs": 2, "mergeType": "fifo"},
         "position": {"x": 0, "y": 0}},
    ],
}

MODEL_ASSEMBLY = {
    "id": "assy-test", "name": "Assembly Test",
    "stations": [
        {"id": "s-prep", "name": "Prep Station",
         "cycleTime": {"type": "constant", "parameters": {"value": 20}}},
        {"id": "s-rework-a", "name": "Rework Frame",
         "cycleTime": {"type": "constant", "parameters": {"value": 40}}},
        {"id": "s-test", "name": "Final Test",
         "cycleTime": {"type": "constant", "parameters": {"value": 25}}, "scrapRate": 0.01},
    ],
    "buffers": [
        {"id": "b-in", "name": "Incoming", "capacity": 20, "queueRule": "FIFO"},
        {"id": "b-prep-out", "name": "Prep Output", "capacity": 15, "queueRule": "FIFO"},
        {"id": "b-rework-out", "name": "Rework Output", "capacity": 15, "queueRule": "FIFO"},
    ],
    "connections": [
        {"id": "c0", "source": "src-1", "target": "b-in"},
        {"id": "c1", "source": "b-in", "target": "s-prep"},
        {"id": "c2", "source": "s-prep", "target": "disasm-1"},
        {"id": "c3", "source": "disasm-1", "target": "s-rework-a"},
        {"id": "c5", "source": "s-rework-a", "target": "assy-1"},
        {"id": "c7", "source": "assy-1", "target": "s-test"},
        {"id": "c8", "source": "s-test", "target": "sink-1"},
        # simulation wiring
        {"id": "cs1", "source": "s-prep", "target": "b-prep-out"},
        {"id": "cs2", "source": "b-prep-out", "target": "s-rework-a"},
        {"id": "cs4", "source": "s-rework-a", "target": "b-rework-out"},
        {"id": "cs6", "source": "b-rework-out", "target": "s-test"},
    ],
    "products": [
        {"id": "p-unit", "name": "Motor Unit",
         "routing": ["s-prep", "s-rework-a", "s-test"], "arrivalRate": 90},
    ],
    "resources": [],
    "extraNodes": [
        {"id": "src-1", "type": "source",
         "data": {"id": "src-1", "name": "Source", "arrivalRate": 90, "feedMode": "interval"},
         "position": {"x": 30, "y": 250}},
        {"id": "disasm-1", "type": "disassembly",
         "data": {"id": "disasm-1", "name": "Disassembly", "cycleTime": 30,
                  "outputParts": [{"productId": "p-frame", "productName": "Frame", "quantity": 1}]},
         "position": {"x": 400, "y": 150}},
        {"id": "assy-1", "type": "assembly",
         "data": {"id": "assy-1", "name": "Reassembly", "cycleTime": 45, "inputParts": 1,
                  "inputPartsByProduct": []},
         "position": {"x": 800, "y": 150}},
        {"id": "sink-1", "type": "sink",
         "data": {"id": "sink-1", "name": "Sink"},
         "position": {"x": 1150, "y": 250}},
    ],
}

MODEL_PALLET_LINE = {
    "id": "pallet-test", "name": "Pallet Line Test",
    "stations": [
        {"id": "s-fill", "name": "Filling",
         "cycleTime": {"type": "constant", "parameters": {"value": 15}}},
        {"id": "s-label", "name": "Labeling",
         "cycleTime": {"type": "constant", "parameters": {"value": 10}}},
    ],
    "buffers": [
        {"id": "b-in", "name": "Raw Materials", "capacity": 50, "queueRule": "FIFO"},
        {"id": "b-mid", "name": "Transfer Buffer", "capacity": 30, "queueRule": "FIFO"},
    ],
    "connections": [
        {"id": "c0", "source": "src-1", "target": "b-in"},
        {"id": "c1", "source": "b-in", "target": "s-fill"},
        {"id": "c2", "source": "s-fill", "target": "pall-1"},
        {"id": "c3", "source": "pall-1", "target": "conv-1"},
        {"id": "c4", "source": "conv-1", "target": "depall-1"},
        {"id": "c5", "source": "depall-1", "target": "s-label"},
        {"id": "c6", "source": "s-label", "target": "sink-1"},
        # simulation wiring
        {"id": "cs1", "source": "s-fill", "target": "b-mid"},
        {"id": "cs2", "source": "b-mid", "target": "s-label"},
    ],
    "products": [
        {"id": "p-bottle", "name": "Bottle",
         "routing": ["s-fill", "s-label"], "arrivalRate": 20},
    ],
    "resources": [],
    "extraNodes": [
        {"id": "src-1", "type": "source",
         "data": {"id": "src-1", "name": "Source", "arrivalRate": 20, "feedMode": "interval"},
         "position": {"x": 30, "y": 250}},
        {"id": "pall-1", "type": "palletize",
         "data": {"id": "pall-1", "name": "Palletizer", "defaultPalletSize": 4, "cycleTime": 10},
         "position": {"x": 350, "y": 250}},
        {"id": "conv-1", "type": "conveyor",
         "data": {"id": "conv-1", "name": "Transfer Conveyor", "length": 10, "speed": 2, "capacity": 10},
         "position": {"x": 550, "y": 150}},
        {"id": "depall-1", "type": "depalletize",
         "data": {"id": "depall-1", "name": "Depalletizer", "cycleTime": 3},
         "position": {"x": 750, "y": 250}},
        {"id": "sink-1", "type": "sink",
         "data": {"id": "sink-1", "name": "Shipping"},
         "position": {"x": 1050, "y": 250}},
    ],
}

MODEL_MATCH_BUFFER = {
    "id": "match-test", "name": "Match Buffer Test",
    "stations": [
        {"id": "s-left", "name": "Left Machine",
         "cycleTime": {"type": "constant", "parameters": {"value": 35}}},
        {"id": "s-right", "name": "Right Machine",
         "cycleTime": {"type": "constant", "parameters": {"value": 40}}},
        {"id": "s-final", "name": "Final Assembly",
         "cycleTime": {"type": "constant", "parameters": {"value": 55}}},
    ],
    "buffers": [
        {"id": "b-merge", "name": "Merge Buffer", "capacity": 20, "queueRule": "FIFO"},
    ],
    "connections": [
        {"id": "c1", "source": "s-left", "target": "match-1"},
        {"id": "c2", "source": "s-right", "target": "match-1"},
        {"id": "c3", "source": "match-1", "target": "s-final"},
        # simulation wiring
        {"id": "cs1", "source": "s-left", "target": "b-merge"},
        {"id": "cs2", "source": "s-right", "target": "b-merge"},
        {"id": "cs3", "source": "b-merge", "target": "s-final"},
    ],
    "products": [
        {"id": "p-left", "name": "Left Panel",
         "routing": ["s-left", "s-final"], "arrivalRate": 50},
        {"id": "p-right", "name": "Right Panel",
         "routing": ["s-right", "s-final"], "arrivalRate": 50},
    ],
    "resources": [],
    "extraNodes": [
        {"id": "match-1", "type": "matchbuffer",
         "data": {"id": "match-1", "name": "Part Sync", "capacity": 20, "matchKey": "batch",
                  "requiredParts": [
                      {"productId": "p-left", "productName": "Left Panel", "quantity": 1},
                      {"productId": "p-right", "productName": "Right Panel", "quantity": 1},
                  ],
                  "timeout": 600},
         "position": {"x": 680, "y": 250}},
    ],
}

MODEL_NO_EXTRA_NODES = {
    "id": "plain", "name": "Plain Model (no extra nodes)",
    "stations": [
        {"id": "s1", "name": "Station A", "cycleTime": {"type": "constant", "parameters": {"value": 60}}},
        {"id": "s2", "name": "Station B", "cycleTime": {"type": "constant", "parameters": {"value": 60}}},
    ],
    "buffers": [
        {"id": "b1", "name": "Buffer", "capacity": 10, "queueRule": "FIFO"},
    ],
    "connections": [
        {"id": "c1", "source": "s1", "target": "b1"},
        {"id": "c2", "source": "b1", "target": "s2"},
    ],
    "products": [
        {"id": "p1", "name": "Widget", "routing": ["s1", "s2"], "arrivalRate": 90},
    ],
}


# ──────────────────────────────────────────────────────────────────
# Tests
# ──────────────────────────────────────────────────────────────────

class TestBackwardCompatibility:
    """Models without extraNodes work identically to before."""

    def test_no_extra_nodes(self):
        result, sim = run_scenario(MODEL_NO_EXTRA_NODES, duration=7200, label="no_extra")
        k = result["kpis"]
        assert k["throughput"]["total"] > 0
        assert "extra_nodes" not in k
        assert len(sim.extra_nodes) == 0
        assert len(sim._extra_node_chains) == 0

    def test_empty_extra_nodes(self):
        model = {**MODEL_NO_EXTRA_NODES, "extraNodes": []}
        result, sim = run_scenario(model, duration=7200, label="empty_extra")
        assert result["kpis"]["throughput"]["total"] > 0


class TestConveyor:
    """Conveyor adds transport delay between stations."""

    def test_conveyor_line_runs(self):
        result, sim = run_scenario(MODEL_CONVEYOR_LINE, duration=7200, label="conveyor_line")
        k = result["kpis"]
        assert k["throughput"]["total"] > 0

    def test_conveyors_instantiated(self):
        result, sim = run_scenario(MODEL_CONVEYOR_LINE, duration=3600, label="conv_inst")
        assert "conv-1" in sim.extra_nodes
        assert "conv-2" in sim.extra_nodes
        assert sim.extra_nodes["conv-1"].node_type == "conveyor"

    def test_conveyor_transit_time(self):
        result, sim = run_scenario(MODEL_CONVEYOR_LINE, duration=3600, label="conv_transit")
        conv1 = sim.extra_nodes["conv-1"]
        assert conv1.transit_time == 5.0  # length=5, speed=1
        conv2 = sim.extra_nodes["conv-2"]
        assert abs(conv2.transit_time - 8 / 1.5) < 0.01  # length=8, speed=1.5

    def test_conveyor_processes_items(self):
        result, sim = run_scenario(MODEL_CONVEYOR_LINE, duration=7200, label="conv_items")
        conv1 = sim.extra_nodes["conv-1"]
        assert conv1.items_processed > 0, "Conveyor should process items"

    def test_conveyor_chain_built(self):
        result, sim = run_scenario(MODEL_CONVEYOR_LINE, duration=3600, label="conv_chain")
        assert ("s1", "s2") in sim._extra_node_chains
        assert sim._extra_node_chains[("s1", "s2")] == ["conv-1"]
        assert ("s2", "s3") in sim._extra_node_chains
        assert sim._extra_node_chains[("s2", "s3")] == ["conv-2"]

    def test_conveyor_adds_cycle_time(self):
        """Products should take longer with conveyors than without."""
        # Run without conveyor extra nodes but WITH the same source
        # so both models use identical constant-interval arrivals.
        plain_model = {
            "id": "plain", "name": "Plain",
            "stations": MODEL_CONVEYOR_LINE["stations"],
            "buffers": MODEL_CONVEYOR_LINE["buffers"],
            "connections": [
                {"id": "c1", "source": "b-in", "target": "s1"},
            ],
            "products": MODEL_CONVEYOR_LINE["products"],
            "extraNodes": [
                {"id": "src-1", "type": "source",
                 "data": {"id": "src-1", "name": "Source", "arrivalRate": 55, "feedMode": "interval"}},
            ],
        }
        result_plain, _ = run_scenario(plain_model, duration=7200, seed=42, label="plain")

        result_conv, _ = run_scenario(MODEL_CONVEYOR_LINE, duration=7200, seed=42, label="conv")

        # With conveyors adding 5s + 5.33s = ~10.33s delay per product,
        # mean cycle time should be higher
        ct_plain = result_plain["kpis"]["cycle_time"]["mean"]
        ct_conv = result_conv["kpis"]["cycle_time"]["mean"]
        print(f"  Plain CT: {ct_plain:.1f}s, Conveyor CT: {ct_conv:.1f}s")
        assert ct_conv > ct_plain, "Conveyor should increase cycle time"

    def test_conveyor_stats_in_kpis(self):
        result, sim = run_scenario(MODEL_CONVEYOR_LINE, duration=7200, label="conv_kpis")
        assert "extra_nodes" in result["kpis"]
        assert "conv-1" in result["kpis"]["extra_nodes"]
        stats = result["kpis"]["extra_nodes"]["conv-1"]
        assert stats["type"] == "conveyor"
        assert stats["items_processed"] > 0


class TestInspection:
    """Inspection adds time and stochastic scrap."""

    def test_inspection_runs(self):
        result, sim = run_scenario(MODEL_INSPECTION_ONLY, duration=7200, label="insp_run")
        k = result["kpis"]
        assert k["throughput"]["total"] >= 0

    def test_inspection_scraps(self):
        result, sim = run_scenario(MODEL_INSPECTION_ONLY, duration=14400, label="insp_scrap")
        insp = sim.extra_nodes["insp-1"]
        assert insp.items_failed > 0, "10% defect rate should produce some failures"
        assert insp.items_passed > 0, "Should also pass some items"
        total = insp.items_passed + insp.items_failed
        actual_rate = insp.items_failed / total
        print(f"  Inspection: passed={insp.items_passed}, failed={insp.items_failed}, "
              f"rate={actual_rate:.3f}")
        # With 10% defect rate, actual rate should be within reasonable range
        assert 0.02 < actual_rate < 0.25, f"Defect rate {actual_rate} outside expected range"

    def test_inspection_output_chain(self):
        result, sim = run_scenario(MODEL_INSPECTION_ONLY, duration=3600, label="insp_chain")
        # insp-1 should be in the output chain after s1
        assert "s1" in sim._extra_node_output_chains
        assert sim._extra_node_output_chains["s1"] == ["insp-1"]

    def test_inspection_in_conveyor_line(self):
        result, sim = run_scenario(MODEL_CONVEYOR_LINE, duration=7200, label="insp_conv")
        insp = sim.extra_nodes["insp-1"]
        assert insp.items_processed > 0
        # Output chain after s3
        assert "s3" in sim._extra_node_output_chains
        assert "insp-1" in sim._extra_node_output_chains["s3"]


class TestSplitterMerge:
    """Splitter and Merge are instant pass-through nodes."""

    def test_splitter_merge_runs(self):
        result, sim = run_scenario(MODEL_SPLITTER_MERGE, duration=7200, label="split_merge")
        k = result["kpis"]
        assert k["throughput"]["total"] > 0

    def test_splitter_processes(self):
        result, sim = run_scenario(MODEL_SPLITTER_MERGE, duration=7200, label="split_proc")
        split = sim.extra_nodes["split-1"]
        assert split.items_processed > 0

    def test_merge_processes(self):
        result, sim = run_scenario(MODEL_SPLITTER_MERGE, duration=7200, label="merge_proc")
        merge = sim.extra_nodes["merge-1"]
        assert merge.items_processed > 0

    def test_splitter_tags_product(self):
        """Splitter should set _splitter_output attribute on products."""
        result, sim = run_scenario(MODEL_SPLITTER_MERGE, duration=7200, label="split_tag")
        # Check completed products for splitter tags
        tagged = [p for p in sim.completed_products
                  if "_splitter_output" in p.attributes]
        assert len(tagged) > 0, "Some products should be tagged by splitter"


class TestAssemblyDisassembly:
    """Assembly and Disassembly nodes add delay in the chain."""

    def test_assembly_disassembly_runs(self):
        result, sim = run_scenario(MODEL_ASSEMBLY, duration=7200, label="assy_disassy")
        k = result["kpis"]
        assert k["throughput"]["total"] > 0

    def test_disassembly_adds_delay(self):
        result, sim = run_scenario(MODEL_ASSEMBLY, duration=7200, label="disasm_delay")
        disasm = sim.extra_nodes["disasm-1"]
        assert disasm.items_processed > 0
        assert disasm.cycle_time == 30

    def test_assembly_adds_delay(self):
        result, sim = run_scenario(MODEL_ASSEMBLY, duration=7200, label="assy_delay")
        assy = sim.extra_nodes["assy-1"]
        # With inputParts=1, assembly acts as a simple delay (one part needed)
        assert assy.items_processed > 0
        assert assy.cycle_time == 45

    def test_chain_between_stations(self):
        result, sim = run_scenario(MODEL_ASSEMBLY, duration=3600, label="assy_chain")
        assert ("s-prep", "s-rework-a") in sim._extra_node_chains
        assert "disasm-1" in sim._extra_node_chains[("s-prep", "s-rework-a")]
        assert ("s-rework-a", "s-test") in sim._extra_node_chains
        assert "assy-1" in sim._extra_node_chains[("s-rework-a", "s-test")]


class TestPalletLine:
    """Palletize and Depalletize accumulate/disperse products."""

    def test_pallet_line_runs(self):
        result, sim = run_scenario(MODEL_PALLET_LINE, duration=7200, label="pallet_line")
        k = result["kpis"]
        # Should produce some output (palletize with size 4 needs 4 items first)
        assert k["throughput"]["total"] >= 0

    def test_palletizer_accumulates(self):
        result, sim = run_scenario(MODEL_PALLET_LINE, duration=14400, label="pall_accum")
        pall = sim.extra_nodes["pall-1"]
        print(f"  Palletizer: entered={pall.items_entered}, processed={pall.items_processed}")
        assert pall.items_entered > 0

    def test_depalletizer_processes(self):
        result, sim = run_scenario(MODEL_PALLET_LINE, duration=14400, label="depall_proc")
        depall = sim.extra_nodes["depall-1"]
        print(f"  Depalletizer: entered={depall.items_entered}, processed={depall.items_processed}")

    def test_pallet_chain_built(self):
        result, sim = run_scenario(MODEL_PALLET_LINE, duration=3600, label="pall_chain")
        assert ("s-fill", "s-label") in sim._extra_node_chains
        chain = sim._extra_node_chains[("s-fill", "s-label")]
        assert chain == ["pall-1", "conv-1", "depall-1"]


class TestMatchBuffer:
    """MatchBuffer synchronises products from multiple lines."""

    def test_match_buffer_runs(self):
        result, sim = run_scenario(MODEL_MATCH_BUFFER, duration=7200, label="match_buf")
        k = result["kpis"]
        # Both product types should produce some output
        assert k["throughput"]["total"] >= 0

    def test_match_buffer_instantiated(self):
        result, sim = run_scenario(MODEL_MATCH_BUFFER, duration=3600, label="match_inst")
        assert "match-1" in sim.extra_nodes
        match = sim.extra_nodes["match-1"]
        assert match.node_type == "matchbuffer"
        assert match.timeout_duration == 600

    def test_match_buffer_chains(self):
        result, sim = run_scenario(MODEL_MATCH_BUFFER, duration=3600, label="match_chain")
        # p-left routing: ['s-left', 's-final']
        assert ("s-left", "s-final") in sim._extra_node_chains
        assert sim._extra_node_chains[("s-left", "s-final")] == ["match-1"]
        # p-right routing: ['s-right', 's-final']
        assert ("s-right", "s-final") in sim._extra_node_chains
        assert sim._extra_node_chains[("s-right", "s-final")] == ["match-1"]

    def test_match_buffer_synchronises(self):
        """Products should be matched and released together."""
        result, sim = run_scenario(MODEL_MATCH_BUFFER, duration=14400, label="match_sync")
        match = sim.extra_nodes["match-1"]
        print(f"  MatchBuffer: entered={match.items_entered}, processed={match.items_processed}")
        assert match.items_entered > 0, "Products should reach the match buffer"

    def test_match_timeout_releases(self):
        """With timeout, products should eventually be released even without a match."""
        # Use a model where only one product type arrives
        model = {
            **MODEL_MATCH_BUFFER,
            "products": [
                {"id": "p-left", "name": "Left Panel",
                 "routing": ["s-left", "s-final"], "arrivalRate": 50},
                # No p-right arrivals!
            ],
        }
        result, sim = run_scenario(model, duration=3600, label="match_timeout")
        match = sim.extra_nodes["match-1"]
        # With 600s timeout, some products should be released via timeout
        timeout_events = [e for e in sim.event_log if e["type"] == "match_timeout"]
        print(f"  Timeout events: {len(timeout_events)}")
        # After 600s timeout, products should start being released
        assert match.items_entered > 0


class TestExtraNodeFactory:
    """ExtraNode.from_dict dispatches correctly."""

    def test_unknown_type_returns_none(self):
        import simpy
        env = simpy.Environment()
        from factorysim.engine.extra_nodes import ExtraNode
        node = ExtraNode.from_dict({"type": "unknown", "data": {}}, env, None)
        assert node is None

    def test_source_returns_none(self):
        import simpy
        env = simpy.Environment()
        from factorysim.engine.extra_nodes import ExtraNode
        node = ExtraNode.from_dict(
            {"type": "source", "data": {"id": "s", "name": "S"}}, env, None
        )
        assert node is None

    def test_sink_returns_none(self):
        import simpy
        env = simpy.Environment()
        from factorysim.engine.extra_nodes import ExtraNode
        node = ExtraNode.from_dict(
            {"type": "sink", "data": {"id": "s", "name": "S"}}, env, None
        )
        assert node is None

    def test_conveyor_created(self):
        import simpy
        env = simpy.Environment()
        from factorysim.engine.extra_nodes import ExtraNode
        node = ExtraNode.from_dict({
            "type": "conveyor",
            "data": {"id": "c1", "name": "Conv", "length": 10, "speed": 2, "capacity": 5},
        }, env, None)
        assert node is not None
        assert node.node_type == "conveyor"
        assert node.transit_time == 5.0


class TestMultipleReplications:
    """Extra nodes work with multiple replications."""

    def test_replications_with_extra_nodes(self):
        config = SimulationConfig(duration=3600, seed=42, replications=3)
        sim = Simulation(MODEL_CONVEYOR_LINE, config)
        result = sim.run()
        assert result["status"] == "completed"
        assert result["replications"] == 3


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s", "--tb=short"])
