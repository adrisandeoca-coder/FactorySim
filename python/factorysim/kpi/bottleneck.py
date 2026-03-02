"""
Bottleneck Detector - Identify and analyze production bottlenecks.
"""

from typing import Dict, Any, List, Optional, Tuple, TYPE_CHECKING
from dataclasses import dataclass
import numpy as np

if TYPE_CHECKING:
    from factorysim.engine.simulation import Simulation
    from factorysim.engine.station import Station


@dataclass
class BottleneckInfo:
    """Information about a detected bottleneck."""
    station_id: str
    station_name: str
    bottleneck_score: float  # 0-1, higher = more likely bottleneck
    utilization: float
    blocked_percentage: float
    starved_percentage: float
    queue_level: float  # Average input queue level
    recommendations: List[str]


class BottleneckDetector:
    """
    Detector for production bottlenecks.

    Uses multiple indicators to identify bottlenecks:
    - High utilization
    - High upstream WIP
    - Downstream starvation
    - Blocking patterns
    """

    def __init__(self, simulation: "Simulation"):
        """
        Initialize bottleneck detector.

        Args:
            simulation: The simulation to analyze
        """
        self.sim = simulation

    def detect(self) -> Dict[str, Any]:
        """
        Detect bottlenecks in the simulation.

        Returns:
            Dictionary with bottleneck analysis results
        """
        bottlenecks: List[BottleneckInfo] = []

        for station in self.sim.stations.values():
            info = self._analyze_station(station)
            bottlenecks.append(info)

        # Also analyze extra nodes (palletizer, conveyor, depalletizer, etc.)
        for node_id, node in self.sim.extra_nodes.items():
            stats = node.get_statistics()
            state_times = stats.get("state_times", {})
            total_time = sum(state_times.values()) or 1
            processing = state_times.get("processing", 0) / total_time
            waiting = state_times.get("waiting", 0) / total_time
            blocked = state_times.get("blocked", 0) / total_time
            idle = state_times.get("idle", 0) / total_time
            utilization = processing + waiting  # waiting = accumulating items
            score = utilization * 0.5 + (1 - idle) * 0.3 + blocked * 0.2
            score = min(1.0, max(0.0, score))
            bottlenecks.append(BottleneckInfo(
                station_id=node_id,
                station_name=stats.get("name", node_id),
                bottleneck_score=score,
                utilization=utilization,
                blocked_percentage=blocked,
                starved_percentage=idle,
                queue_level=0.0,
                recommendations=[f"{stats.get('name', node_id)} is {utilization*100:.0f}% occupied (processing + waiting)"],
            ))

        # Sort by bottleneck score
        bottlenecks.sort(key=lambda x: x.bottleneck_score, reverse=True)

        # Get primary bottleneck
        primary = bottlenecks[0] if bottlenecks else None

        # Generate heatmap data
        heatmap = self._generate_heatmap(bottlenecks)

        return {
            "primary_bottleneck": {
                "station_id": primary.station_id,
                "station_name": primary.station_name,
                "score": primary.bottleneck_score,
                "recommendations": primary.recommendations,
            } if primary else None,
            "all_stations": [
                {
                    "station_id": b.station_id,
                    "station_name": b.station_name,
                    "bottleneck_score": b.bottleneck_score,
                    "utilization": b.utilization,
                    "blocked_percentage": b.blocked_percentage,
                    "starved_percentage": b.starved_percentage,
                    "queue_level": b.queue_level,
                }
                for b in bottlenecks
            ],
            "heatmap": heatmap,
            "shifting_bottleneck": self._detect_shifting_bottleneck(),
        }

    def _analyze_station(self, station: "Station") -> BottleneckInfo:
        """
        Analyze a single station for bottleneck indicators.

        Args:
            station: Station to analyze

        Returns:
            BottleneckInfo with analysis results
        """
        state_breakdown = station.get_state_breakdown()

        processing = state_breakdown.get("processing", 0)
        setup_pct = state_breakdown.get("setup", 0)
        failed_pct = state_breakdown.get("failed", 0)
        utilization = processing + setup_pct + failed_pct  # "occupied"
        blocked_pct = state_breakdown.get("blocked", 0)
        starved_pct = state_breakdown.get("starved", 0)

        # Get input queue level
        queue_level = 0.0
        if station.input_buffer:
            queue_level = station.input_buffer.get_utilization()

        # Calculate bottleneck score
        # High utilization + high upstream queue = bottleneck
        # High blocked time = downstream bottleneck
        # High starved time = not a bottleneck

        score = 0.0

        # High utilization is a primary indicator
        score += utilization * 0.4

        # High input queue indicates constraint
        score += queue_level * 0.3

        # Low starved time indicates constraint (others waiting on this)
        score += (1 - starved_pct) * 0.2

        # Some blocked time can indicate shared bottleneck
        score += min(blocked_pct, 0.2) * 0.1

        # Normalize to 0-1
        score = min(1.0, max(0.0, score))

        # Generate recommendations
        recommendations = self._generate_recommendations(
            station, utilization, blocked_pct, starved_pct, queue_level
        )

        return BottleneckInfo(
            station_id=station.id,
            station_name=station.name,
            bottleneck_score=score,
            utilization=utilization,
            blocked_percentage=blocked_pct,
            starved_percentage=starved_pct,
            queue_level=queue_level,
            recommendations=recommendations,
        )

    def _generate_recommendations(
        self,
        station: "Station",
        utilization: float,
        blocked_pct: float,
        starved_pct: float,
        queue_level: float,
    ) -> List[str]:
        """Generate recommendations for addressing bottleneck."""
        recommendations = []

        if utilization > 0.9:
            recommendations.append(
                f"Consider adding capacity to {station.name} - utilization is {utilization*100:.1f}%"
            )
            cycle_time = station.cycle_time_dist.mean()
            recommendations.append(
                f"Reducing cycle time from {cycle_time:.1f}s could increase throughput"
            )

        if blocked_pct > 0.1:
            recommendations.append(
                f"Downstream constraint detected - {station.name} is blocked {blocked_pct*100:.1f}% of time"
            )
            if station.output_buffer:
                recommendations.append(
                    f"Consider increasing buffer capacity after {station.name}"
                )

        if starved_pct > 0.2:
            recommendations.append(
                f"Upstream constraint detected - {station.name} is starved {starved_pct*100:.1f}% of time"
            )

        if queue_level > 0.8:
            recommendations.append(
                f"High WIP before {station.name} - input queue is {queue_level*100:.1f}% full"
            )

        if station.mtbf and station.get_availability() < 0.9:
            recommendations.append(
                f"Improve reliability of {station.name} - availability is {station.get_availability()*100:.1f}%"
            )

        return recommendations

    def _generate_heatmap(self, bottlenecks: List[BottleneckInfo]) -> Dict[str, Any]:
        """
        Generate heatmap data for visualization.

        Args:
            bottlenecks: List of bottleneck analysis results

        Returns:
            Dictionary with heatmap data
        """
        heatmap_data = {}

        for info in bottlenecks:
            station = self.sim.stations.get(info.station_id)
            if station:
                pos = station.position
            else:
                # Extra node — try to get position from its stats
                extra = self.sim.extra_nodes.get(info.station_id)
                pos = getattr(extra, 'position', {}) if extra else {}
            heatmap_data[info.station_id] = {
                "x": pos.get("x", 0) if isinstance(pos, dict) else 0,
                "y": pos.get("y", 0) if isinstance(pos, dict) else 0,
                "intensity": info.bottleneck_score,
                "color": self._score_to_color(info.bottleneck_score),
            }

        return heatmap_data

    def _score_to_color(self, score: float) -> str:
        """Convert bottleneck score to color for visualization."""
        # Green (low) to Yellow to Red (high)
        if score < 0.3:
            return "#22c55e"  # Green
        elif score < 0.5:
            return "#84cc16"  # Lime
        elif score < 0.7:
            return "#eab308"  # Yellow
        elif score < 0.85:
            return "#f97316"  # Orange
        else:
            return "#ef4444"  # Red

    def _detect_shifting_bottleneck(self) -> Dict[str, Any]:
        """
        Detect if the bottleneck shifts between stations during the simulation.

        Not yet implemented — requires periodic bottleneck scoring over the
        simulation timeline (e.g., recording utilization snapshots at fixed
        intervals). A future enhancement could compare per-interval scores
        to identify when the primary bottleneck changes stations.

        Returns:
            Dictionary with shifting bottleneck analysis (currently a stub)
        """
        return {
            "detected": False,
            "shifts": [],
            "message": "Shifting bottleneck analysis requires time-series data",
        }

    def get_capacity_recommendations(self) -> List[Dict[str, Any]]:
        """
        Get capacity recommendations based on bottleneck analysis.

        Returns:
            List of capacity recommendations
        """
        recommendations = []

        # Sort stations by bottleneck score
        stations_by_score = sorted(
            self.sim.stations.values(),
            key=lambda s: self._analyze_station(s).bottleneck_score,
            reverse=True,
        )

        for i, station in enumerate(stations_by_score[:3]):  # Top 3 bottlenecks
            info = self._analyze_station(station)

            if info.bottleneck_score > 0.5:
                # Calculate capacity increase needed
                current_rate = 3600 / station.cycle_time_dist.mean()
                target_rate = current_rate * 1.2  # 20% increase

                recommendations.append({
                    "station_id": station.id,
                    "station_name": station.name,
                    "priority": i + 1,
                    "current_capacity": current_rate,
                    "recommended_capacity": target_rate,
                    "bottleneck_score": info.bottleneck_score,
                    "expected_impact": f"{(target_rate/current_rate - 1) * 100:.0f}% throughput increase potential",
                })

        return recommendations
