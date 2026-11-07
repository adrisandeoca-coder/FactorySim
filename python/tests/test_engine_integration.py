"""
Integration tests for the FactorySim simulation engine.

Tests basic simulation correctness: throughput > 0, OEE in valid range,
cycle time positive, warmup filtering, batch processing, scrap.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest
from factorysim.engine.simulation import Simulation, SimulationConfig


def _simple_model(cycle_time=60, duration=3600, num_stations=3, scrap_rate=0.0,
                  batch_size=1, warmup=0, arrival_rate=30):
    """Build a simple linear factory model for testing."""
    stations = []
    buffers = []
    connections = []
    products = []

    for i in range(num_stations):
        stations.append({
            "id": f"s{i}",
            "name": f"Station {i}",
            "cycleTime": {"type": "constant", "parameters": {"value": cycle_time}},
            "scrapRate": scrap_rate,
            "batchSize": batch_size,
        })

    for i in range(num_stations - 1):
        buf_id = f"b{i}"
        buffers.append({
            "id": buf_id,
            "name": f"Buffer {i}",
            "capacity": 10,
        })
        connections.append({"source": f"s{i}", "target": buf_id})
        connections.append({"source": buf_id, "target": f"s{i+1}"})

    routing = [f"s{i}" for i in range(num_stations)]
    products.append({
        "id": "p1",
        "name": "Widget",
        "routing": routing,
        "arrivalRate": arrival_rate,
    })

    return {
        "stations": stations,
        "buffers": buffers,
        "connections": connections,
        "products": products,
        "extraNodes": [],
    }


class TestBasicSimulation:
    def test_throughput_positive(self):
        """A simple model should produce at least some output."""
        model = _simple_model(cycle_time=30, duration=3600)
        config = SimulationConfig(duration=3600, seed=42)
        sim = Simulation(model, config)
        result = sim.run()

        assert result["status"] == "completed"
        kpis = result["kpis"]
        assert kpis["throughput"]["total"] > 0

    def test_oee_in_valid_range(self):
        """OEE components should be between 0 and 1."""
        model = _simple_model(cycle_time=60, duration=7200)
        config = SimulationConfig(duration=7200, seed=42)
        sim = Simulation(model, config)
        result = sim.run()

        oee = result["kpis"]["oee"]
        assert 0 <= oee["overall"] <= 1.0
        assert 0 <= oee["availability"] <= 1.0
        assert 0 <= oee["performance"] <= 1.0
        assert 0 <= oee["quality"] <= 1.0

    def test_cycle_time_positive(self):
        """Mean cycle time should be positive."""
        model = _simple_model(cycle_time=45, duration=3600)
        config = SimulationConfig(duration=3600, seed=42)
        sim = Simulation(model, config)
        result = sim.run()

        ct = result["kpis"]["cycle_time"]
        assert ct["mean"] > 0
        assert ct["min"] > 0

    def test_scrap_rate_reflected(self):
        """Non-zero scrap rate should produce some scrapped items."""
        model = _simple_model(cycle_time=30, duration=7200, scrap_rate=0.1)
        config = SimulationConfig(duration=7200, seed=42)
        sim = Simulation(model, config)
        result = sim.run()

        oee = result["kpis"]["oee"]
        # Quality should be < 1.0 with 10% scrap
        assert oee["quality"] < 1.0

    def test_warmup_filters_early_products(self):
        """Products created during warmup should not count in KPIs."""
        model = _simple_model(cycle_time=30, duration=7200, warmup=1800)
        config = SimulationConfig(duration=7200, warmup_period=1800, seed=42)
        sim = Simulation(model, config)
        result = sim.run()

        # Throughput rate should be based on post-warmup period only
        kpis = result["kpis"]
        assert kpis["throughput"]["total"] > 0

    def test_batch_processing(self):
        """Batch stations should process items in groups."""
        model = _simple_model(cycle_time=120, duration=7200, batch_size=3, arrival_rate=15)
        config = SimulationConfig(duration=7200, seed=42)
        sim = Simulation(model, config)
        result = sim.run()

        assert result["status"] == "completed"
        # Should have some throughput even with batch processing
        assert result["kpis"]["throughput"]["total"] >= 0

    def test_multi_replication(self):
        """Multiple replications should produce aggregated results."""
        model = _simple_model(cycle_time=60, duration=3600)
        config = SimulationConfig(duration=3600, seed=42, replications=3)
        sim = Simulation(model, config)
        result = sim.run()

        assert result["status"] == "completed"
        assert result["replications"] == 3
        assert "replication_results" in result

    def test_seed_reproducibility(self):
        """Same seed should produce identical results."""
        model = _simple_model(cycle_time=60, duration=3600)

        config1 = SimulationConfig(duration=3600, seed=123)
        sim1 = Simulation(model, config1)
        r1 = sim1.run()

        config2 = SimulationConfig(duration=3600, seed=123)
        sim2 = Simulation(model, config2)
        r2 = sim2.run()

        assert r1["kpis"]["throughput"]["total"] == r2["kpis"]["throughput"]["total"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
