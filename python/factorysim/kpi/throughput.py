"""
Throughput Calculator - Production throughput metrics.
"""

from typing import Dict, Any, List, Optional, TYPE_CHECKING
from dataclasses import dataclass
import numpy as np

if TYPE_CHECKING:
    from factorysim.engine.simulation import Simulation


@dataclass
class ThroughputResult:
    """Result of throughput calculation."""
    total_output: int
    throughput_rate: float  # Units per hour
    theoretical_max: float
    efficiency: float
    by_product: Dict[str, int]
    by_hour: List[float]


class ThroughputCalculator:
    """
    Calculator for production throughput metrics.
    """

    def __init__(self, simulation: "Simulation"):
        """
        Initialize throughput calculator.

        Args:
            simulation: The simulation to calculate throughput for
        """
        self.sim = simulation

    def calculate(self) -> ThroughputResult:
        """
        Calculate throughput metrics.

        Returns:
            ThroughputResult with all throughput metrics
        """
        # Count completed products
        completed = [p for p in self.sim.completed_products if not p.is_scrap]
        total_output = len(completed)

        # Calculate rate
        hours = self.sim.env.now / 3600
        throughput_rate = total_output / hours if hours > 0 else 0

        # Theoretical maximum based on bottleneck
        theoretical_max = self._calculate_theoretical_max()

        # Efficiency
        efficiency = throughput_rate / theoretical_max if theoretical_max > 0 else 0

        # By product type
        by_product: Dict[str, int] = {}
        for product_type in self.sim.product_types.values():
            by_product[product_type.id] = product_type.total_completed

        # By hour
        by_hour = self._calculate_hourly_throughput()

        return ThroughputResult(
            total_output=total_output,
            throughput_rate=throughput_rate,
            theoretical_max=theoretical_max,
            efficiency=efficiency,
            by_product=by_product,
            by_hour=by_hour,
        )

    def _calculate_theoretical_max(self) -> float:
        """
        Calculate theoretical maximum throughput based on bottleneck.

        Returns:
            Maximum possible throughput rate (units per hour)
        """
        if not self.sim.stations:
            return 0.0

        # Find station with longest cycle time (bottleneck)
        max_cycle_time = 0.0
        for station in self.sim.stations.values():
            cycle_time = station.cycle_time_dist.mean()
            if cycle_time > max_cycle_time:
                max_cycle_time = cycle_time

        if max_cycle_time == 0:
            return float('inf')

        # Theoretical max is 3600 seconds per hour / bottleneck cycle time
        return 3600 / max_cycle_time

    def _calculate_hourly_throughput(self) -> List[float]:
        """
        Calculate throughput broken down by hour.

        Returns:
            List of throughput values per hour
        """
        hours = int(self.sim.env.now / 3600) + 1
        by_hour = [0.0] * hours

        for product in self.sim.completed_products:
            if not product.is_scrap and product.completion_time is not None:
                hour_index = int(product.completion_time / 3600)
                if 0 <= hour_index < hours:
                    by_hour[hour_index] += 1

        return by_hour

    def calculate_cycle_time_metrics(self) -> Dict[str, Any]:
        """
        Calculate cycle time metrics.

        Returns:
            Dictionary with cycle time statistics
        """
        completed = [p for p in self.sim.completed_products if not p.is_scrap]

        if not completed:
            return {
                "mean": 0,
                "std": 0,
                "min": 0,
                "max": 0,
                "p50": 0,
                "p90": 0,
                "p99": 0,
            }

        cycle_times = [p.get_cycle_time() for p in completed]

        return {
            "mean": float(np.mean(cycle_times)),
            "std": float(np.std(cycle_times)),
            "min": float(np.min(cycle_times)),
            "max": float(np.max(cycle_times)),
            "p50": float(np.percentile(cycle_times, 50)),
            "p90": float(np.percentile(cycle_times, 90)),
            "p99": float(np.percentile(cycle_times, 99)),
        }

    def calculate_wip_metrics(self) -> Dict[str, Any]:
        """
        Calculate Work In Progress metrics.

        Returns:
            Dictionary with WIP statistics
        """
        buffer_wip = {}
        total_wip = 0

        for buffer_id, buffer in self.sim.buffers.items():
            stats = buffer.get_statistics()
            buffer_wip[buffer_id] = {
                "name": buffer.name,
                "current": stats["current_level"],
                "average": stats["average_wip"],
                "max": stats["max_level"],
                "utilization": stats["utilization"],
            }
            total_wip += stats["current_level"]

        # Add in-process products
        total_wip += len(self.sim.active_products)

        return {
            "total": total_wip,
            "in_buffers": sum(b.level() for b in self.sim.buffers.values()),
            "in_process": len(self.sim.active_products),
            "by_buffer": buffer_wip,
        }

    def to_dict(self) -> Dict[str, Any]:
        """Convert all throughput metrics to dictionary."""
        result = self.calculate()

        return {
            "total_output": result.total_output,
            "throughput_rate": result.throughput_rate,
            "theoretical_max": result.theoretical_max,
            "efficiency": result.efficiency,
            "by_product": result.by_product,
            "by_hour": result.by_hour,
            "cycle_time": self.calculate_cycle_time_metrics(),
            "wip": self.calculate_wip_metrics(),
        }
