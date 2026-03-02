"""Tests for the simulation engine."""

import pytest
from factorysim.engine.simulation import Simulation, SimulationConfig
from factorysim.engine.distributions import Distribution


class TestDistribution:
    """Tests for statistical distributions."""

    def test_constant_distribution(self):
        """Test constant distribution returns fixed value."""
        config = {"type": "constant", "parameters": {"value": 10}}
        dist = Distribution(config)

        for _ in range(10):
            assert dist.sample() == 10

    def test_normal_distribution(self):
        """Test normal distribution returns values around mean."""
        import numpy as np
        config = {"type": "normal", "parameters": {"mean": 100, "std": 10}}
        dist = Distribution(config, rng=np.random.default_rng(42))

        samples = [dist.sample() for _ in range(1000)]
        mean = sum(samples) / len(samples)

        assert 95 < mean < 105  # Should be close to 100

    def test_exponential_distribution(self):
        """Test exponential distribution returns positive values."""
        import numpy as np
        config = {"type": "exponential", "parameters": {"mean": 50}}
        dist = Distribution(config, rng=np.random.default_rng(42))

        samples = [dist.sample() for _ in range(100)]

        assert all(s > 0 for s in samples)

    def test_triangular_distribution(self):
        """Test triangular distribution respects bounds."""
        import numpy as np
        config = {
            "type": "triangular",
            "parameters": {"min": 10, "mode": 20, "max": 30}
        }
        dist = Distribution(config, rng=np.random.default_rng(42))

        samples = [dist.sample() for _ in range(100)]

        assert all(10 <= s <= 30 for s in samples)


class TestSimulation:
    """Tests for the main simulation runner."""

    @pytest.fixture
    def simple_model(self):
        """Create a simple two-station model."""
        return {
            "id": "test-model",
            "name": "Test Model",
            "stations": [
                {
                    "id": "station-1",
                    "name": "Station 1",
                    "cycleTime": {"type": "constant", "parameters": {"value": 60}},
                    "capacity": 1,
                },
                {
                    "id": "station-2",
                    "name": "Station 2",
                    "cycleTime": {"type": "constant", "parameters": {"value": 60}},
                    "capacity": 1,
                },
            ],
            "buffers": [
                {
                    "id": "buffer-1",
                    "name": "Buffer 1",
                    "capacity": 10,
                    "queueRule": "FIFO",
                },
            ],
            "connections": [
                {"id": "c1", "sourceId": "station-1", "targetId": "buffer-1"},
                {"id": "c2", "sourceId": "buffer-1", "targetId": "station-2"},
            ],
            "products": [
                {
                    "id": "product-1",
                    "name": "Product A",
                    "routing": ["station-1", "station-2"],
                    "arrivalRate": 120,
                },
            ],
        }

    def test_simulation_creation(self, simple_model):
        """Test simulation can be created from model."""
        config = SimulationConfig(duration=3600, seed=42)
        sim = Simulation(simple_model, config)

        assert sim is not None
        assert len(sim.stations) == 2
        # 1 explicit buffer + 1 implicit arrival buffer for station-1
        assert len(sim.buffers) == 2

    def test_simulation_run(self, simple_model):
        """Test simulation can run and produce results."""
        config = SimulationConfig(duration=3600, seed=42)
        sim = Simulation(simple_model, config)

        result = sim.run()

        assert result is not None
        assert "kpis" in result
        assert "throughput" in result["kpis"]
        assert "oee" in result["kpis"]

    def test_simulation_reproducibility(self, simple_model):
        """Test simulation with same seed produces same results."""
        config1 = SimulationConfig(duration=3600, seed=42)
        config2 = SimulationConfig(duration=3600, seed=42)

        sim1 = Simulation(simple_model, config1)
        sim2 = Simulation(simple_model, config2)

        result1 = sim1.run()
        result2 = sim2.run()

        assert result1["kpis"]["throughput"]["total"] == result2["kpis"]["throughput"]["total"]

    def test_simulation_different_seeds(self, simple_model):
        """Test simulation with different seeds may produce different results."""
        config1 = SimulationConfig(duration=3600, seed=42)
        config2 = SimulationConfig(duration=3600, seed=123)

        sim1 = Simulation(simple_model, config1)
        sim2 = Simulation(simple_model, config2)

        result1 = sim1.run()
        result2 = sim2.run()

        # Results may differ (though with constant times, they might be the same)
        assert result1 is not None
        assert result2 is not None


class TestKPIs:
    """Tests for KPI calculations."""

    @pytest.fixture
    def model_with_failures(self):
        """Create a model with station failures."""
        return {
            "id": "test-model",
            "name": "Test Model with Failures",
            "stations": [
                {
                    "id": "station-1",
                    "name": "Station 1",
                    "cycleTime": {"type": "constant", "parameters": {"value": 60}},
                    "capacity": 1,
                    "mtbf": 1800,  # 30 min MTBF
                    "mttr": 300,   # 5 min MTTR
                },
            ],
            "buffers": [],
            "connections": [],
            "products": [
                {
                    "id": "product-1",
                    "name": "Product A",
                    "routing": ["station-1"],
                    "arrivalRate": 120,
                },
            ],
        }

    def test_oee_calculation(self, model_with_failures):
        """Test OEE is calculated correctly."""
        config = SimulationConfig(duration=7200, seed=42)
        sim = Simulation(model_with_failures, config)

        result = sim.run()

        oee = result["kpis"]["oee"]
        assert "availability" in oee
        assert "performance" in oee
        assert "quality" in oee
        assert "overall" in oee

        # OEE should be between 0 and 1
        assert 0 <= oee["overall"] <= 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
