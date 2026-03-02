"""
OEE Calculator - Overall Equipment Effectiveness calculations.

OEE = Availability × Performance × Quality
"""

from typing import Dict, Any, List, Optional, TYPE_CHECKING
from dataclasses import dataclass
import numpy as np

if TYPE_CHECKING:
    from factorysim.engine.simulation import Simulation
    from factorysim.engine.station import Station


@dataclass
class OEEResult:
    """Result of OEE calculation for a station."""
    station_id: str
    station_name: str
    availability: float
    performance: float
    quality: float
    oee: float
    planned_production_time: float
    actual_production_time: float
    ideal_cycle_time: float
    actual_cycle_time: float
    good_units: int
    total_units: int


class OEECalculator:
    """
    Calculator for Overall Equipment Effectiveness (OEE).

    OEE is calculated as:
    OEE = Availability × Performance × Quality

    Where:
    - Availability = Run Time / Planned Production Time
    - Performance = (Ideal Cycle Time × Total Count) / Run Time
    - Quality = Good Count / Total Count
    """

    def __init__(self, simulation: "Simulation"):
        """
        Initialize OEE calculator.

        Args:
            simulation: The simulation to calculate OEE for
        """
        self.sim = simulation

    def calculate_station_oee(self, station: "Station") -> OEEResult:
        """
        Calculate OEE for a single station.

        Delegates to station.get_oee() for the core A/P/Q values to ensure
        a single source of truth (ideal_ct, batch_size, batch_wait handling).

        Args:
            station: Station to calculate OEE for

        Returns:
            OEEResult with all OEE components
        """
        total_time = self.sim.env.now
        total_units = station.items_processed + station.items_scrapped
        good_units = station.items_processed
        busy_time = station.total_processing_time

        if total_time == 0:
            return OEEResult(
                station_id=station.id,
                station_name=station.name,
                availability=1.0,
                performance=1.0,
                quality=1.0,
                oee=1.0,
                planned_production_time=0,
                actual_production_time=0,
                ideal_cycle_time=station._get_ideal_cycle_time(),
                actual_cycle_time=0,
                good_units=0,
                total_units=0,
            )

        # Delegate to station.get_oee() for consistent A/P/Q calculation
        oee = station.get_oee()

        ideal_cycle_time = station._get_ideal_cycle_time()
        actual_cycle_time = busy_time / total_units if total_units > 0 else ideal_cycle_time

        return OEEResult(
            station_id=station.id,
            station_name=station.name,
            availability=oee["availability"],
            performance=oee["performance"],
            quality=oee["quality"],
            oee=oee["oee"],
            planned_production_time=total_time,
            actual_production_time=busy_time,
            ideal_cycle_time=ideal_cycle_time,
            actual_cycle_time=actual_cycle_time,
            good_units=good_units,
            total_units=total_units,
        )

    def calculate_all(self) -> Dict[str, Any]:
        """
        Calculate OEE for all stations.

        Returns:
            Dictionary with overall and per-station OEE
        """
        results: List[OEEResult] = []

        for station in self.sim.stations.values():
            result = self.calculate_station_oee(station)
            results.append(result)

        # Calculate overall averages (A, P averaged; Q from system boundary)
        if results:
            avg_availability = np.mean([r.availability for r in results])
            avg_performance = np.mean([r.performance for r in results])
            # System-wide quality: good completed output vs good + scrapped
            total_good_output = len([p for p in self.sim.completed_products if not p.is_scrap])
            total_scrapped = sum(s.items_scrapped for s in self.sim.stations.values())
            avg_quality = (total_good_output / (total_good_output + total_scrapped)
                           if (total_good_output + total_scrapped) > 0 else 1.0)
            overall_oee = avg_availability * avg_performance * avg_quality
        else:
            avg_availability = avg_performance = avg_quality = overall_oee = 0.0

        return {
            "overall": {
                "oee": overall_oee,
                "availability": avg_availability,
                "performance": avg_performance,
                "quality": avg_quality,
            },
            "by_station": {
                r.station_id: {
                    "name": r.station_name,
                    "oee": r.oee,
                    "availability": r.availability,
                    "performance": r.performance,
                    "quality": r.quality,
                    "good_units": r.good_units,
                    "total_units": r.total_units,
                }
                for r in results
            },
        }

    def calculate_oee_trend(self, interval: float = 3600) -> List[Dict[str, Any]]:
        """
        Calculate OEE trend over time.

        Not yet implemented — requires periodic snapshot collection during
        the simulation run (e.g., recording station states at each interval).
        A future enhancement could hook into the SimPy process loop to
        capture snapshots and compute rolling OEE windows.

        Args:
            interval: Time interval for each data point (seconds)

        Returns:
            List of OEE values at each interval (currently empty)
        """
        return []

    def get_losses_breakdown(self) -> Dict[str, Any]:
        """
        Get breakdown of OEE losses by category.

        Returns:
            Dictionary with loss categories and amounts
        """
        total_time = self.sim.env.now

        availability_losses = 0.0
        performance_losses = 0.0
        quality_losses = 0.0

        for station in self.sim.stations.values():
            # Availability losses: breakdowns, changeovers
            availability_losses += station.total_failed_time
            availability_losses += station.total_setup_time

            # Performance losses: minor stoppages, speed loss
            performance_losses += station.total_blocked_time

            # Quality losses: scrap, rework
            if station.items_scrapped > 0:
                avg_cycle_time = station.cycle_time_dist.mean()
                quality_losses += station.items_scrapped * avg_cycle_time

        n_stations = len(self.sim.stations) or 1

        return {
            "availability_losses": {
                "total": availability_losses,
                "percentage": (availability_losses / (total_time * n_stations)) * 100 if total_time > 0 else 0,
                "breakdown": {
                    "equipment_failures": sum(s.total_failed_time for s in self.sim.stations.values()),
                    "setup_adjustments": sum(s.total_setup_time for s in self.sim.stations.values()),
                },
            },
            "performance_losses": {
                "total": performance_losses,
                "percentage": (performance_losses / (total_time * n_stations)) * 100 if total_time > 0 else 0,
                "breakdown": {
                    "minor_stoppages": sum(s.total_blocked_time for s in self.sim.stations.values()),
                    "reduced_speed": 0,  # Would need more detailed tracking
                },
            },
            "quality_losses": {
                "total": quality_losses,
                "percentage": (quality_losses / (total_time * n_stations)) * 100 if total_time > 0 else 0,
                "breakdown": {
                    "defects": sum(s.items_scrapped for s in self.sim.stations.values()),
                    "startup_losses": 0,  # Would need more detailed tracking
                },
            },
        }
