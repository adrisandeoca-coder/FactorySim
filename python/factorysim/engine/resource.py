"""
Resource - Resource and operator models for discrete event simulation.

Represents shared resources like operators, tools, and equipment with scheduling.
"""

from typing import Dict, Any, Optional, List, TYPE_CHECKING
from dataclasses import dataclass, field
from enum import Enum
import simpy

if TYPE_CHECKING:
    from factorysim.engine.simulation import Simulation


class ResourceType(Enum):
    """Types of resources."""
    OPERATOR = "operator"
    MACHINE = "machine"
    TOOL = "tool"
    AGV = "agv"
    FIXTURE = "fixture"


@dataclass
class ShiftSchedule:
    """A shift schedule definition."""
    name: str
    start_hour: float  # 0-24
    end_hour: float  # 0-24
    days: List[int]  # 0=Monday, 6=Sunday


@dataclass
class ResourceConfig:
    """Configuration for a resource."""
    id: str
    name: str
    resource_type: str = "operator"
    capacity: int = 1
    shifts: Optional[List[Dict[str, Any]]] = None
    skills: Optional[List[str]] = None
    efficiency: float = 1.0  # Efficiency factor (0-1)


class Resource:
    """
    A shared resource in the factory simulation.

    Features:
    - Configurable capacity
    - Shift scheduling
    - Skill-based assignment
    - Efficiency modeling
    - Utilization tracking
    """

    def __init__(self, env: simpy.Environment, config: ResourceConfig, sim: "Simulation"):
        """
        Initialize the resource.

        Args:
            env: SimPy environment
            config: Resource configuration
            sim: Parent simulation instance
        """
        self.env = env
        self.sim = sim
        self.id = config.id
        self.name = config.name
        self.resource_type = ResourceType(config.resource_type)
        self.capacity = config.capacity
        self.efficiency = config.efficiency
        self.skills = set(config.skills) if config.skills else set()

        # Parse shifts
        self.shifts: List[ShiftSchedule] = []
        if config.shifts:
            for shift_data in config.shifts:
                self.shifts.append(ShiftSchedule(
                    name=shift_data["name"],
                    start_hour=shift_data["start_hour"],
                    end_hour=shift_data["end_hour"],
                    days=shift_data.get("days", [0, 1, 2, 3, 4]),  # Default Mon-Fri
                ))

        # SimPy resource
        self._resource = simpy.Resource(env, capacity=config.capacity)

        # Statistics
        self.total_busy_time = 0.0
        self.total_idle_time = 0.0
        self.request_count = 0
        self.usage_log: List[Dict[str, Any]] = []

        # Current state tracking
        self._busy_since: Optional[float] = None
        self._idle_since: float = 0.0

    def is_available(self) -> bool:
        """Check if resource is currently available (considering shifts)."""
        if not self.shifts:
            return True

        # Get current time of day and day of week
        current_time = self.env.now
        hours_in_day = 24 * 3600  # seconds
        seconds_per_hour = 3600

        # Assuming simulation starts at midnight Monday
        day_of_week = int((current_time // hours_in_day) % 7)
        hour_of_day = (current_time % hours_in_day) / seconds_per_hour

        # Check if current time falls within any shift
        for shift in self.shifts:
            if day_of_week in shift.days:
                if shift.start_hour <= hour_of_day < shift.end_hour:
                    return True
                # Handle overnight shifts
                if shift.start_hour > shift.end_hour:
                    if hour_of_day >= shift.start_hour or hour_of_day < shift.end_hour:
                        return True

        return False

    def has_skill(self, required_skill: str) -> bool:
        """Check if resource has a required skill."""
        if not self.skills:
            return True  # No skills defined means can do anything
        return required_skill in self.skills

    def request(self) -> simpy.Resource.request:
        """
        Request this resource.

        Returns:
            SimPy resource request
        """
        self.request_count += 1
        return self._resource.request()

    def release(self, request) -> None:
        """
        Release this resource.

        Args:
            request: The request to release
        """
        self._resource.release(request)

    def use(self, duration: float) -> simpy.Event:
        """
        Use this resource for a duration.

        Args:
            duration: How long to use the resource

        Returns:
            SimPy event that completes when usage is done
        """
        return self.env.process(self._use_impl(duration))

    def _use_impl(self, duration: float):
        """Implementation of resource usage."""
        # Wait for resource
        with self._resource.request() as req:
            yield req

            # Check shift availability
            while not self.is_available():
                # Wait until next shift
                yield self.env.timeout(60)  # Check every minute

            # Mark as busy
            start_time = self.env.now
            self._busy_since = start_time

            if self._idle_since is not None:
                self.total_idle_time += start_time - self._idle_since

            # Apply efficiency factor
            actual_duration = duration / self.efficiency

            self.usage_log.append({
                "time": start_time,
                "duration": actual_duration,
                "type": "use",
            })

            self.sim.log_event("resource_use_start", self.id, {
                "resource": self.name,
                "duration": actual_duration,
            })

            # Use the resource
            yield self.env.timeout(actual_duration)

            # Mark as idle
            end_time = self.env.now
            self.total_busy_time += end_time - start_time
            self._idle_since = end_time
            self._busy_since = None

            self.sim.log_event("resource_use_end", self.id, {
                "resource": self.name,
            })

    def get_utilization(self) -> float:
        """Calculate resource utilization."""
        total_time = self.env.now
        if total_time == 0:
            return 0.0
        return self.total_busy_time / (total_time * self.capacity)

    def get_statistics(self) -> Dict[str, Any]:
        """Get comprehensive resource statistics."""
        return {
            "id": self.id,
            "name": self.name,
            "type": self.resource_type.value,
            "capacity": self.capacity,
            "utilization": self.get_utilization(),
            "total_busy_time": self.total_busy_time,
            "total_idle_time": self.total_idle_time,
            "request_count": self.request_count,
            "skills": list(self.skills),
        }

    def to_dict(self) -> Dict[str, Any]:
        """Convert resource to dictionary representation."""
        return {
            "id": self.id,
            "name": self.name,
            "type": self.resource_type.value,
            "capacity": self.capacity,
            "shifts": [
                {
                    "name": s.name,
                    "start_hour": s.start_hour,
                    "end_hour": s.end_hour,
                    "days": s.days,
                }
                for s in self.shifts
            ] if self.shifts else None,
            "skills": list(self.skills) if self.skills else None,
            "efficiency": self.efficiency,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any], env: simpy.Environment, sim: "Simulation") -> "Resource":
        """Create resource from dictionary."""
        config = ResourceConfig(
            id=data["id"],
            name=data["name"],
            resource_type=data.get("type", "operator"),
            capacity=data.get("capacity", 1),
            shifts=data.get("shifts"),
            skills=data.get("skills"),
            efficiency=data.get("efficiency", 1.0),
        )
        return cls(env, config, sim)


class Operator(Resource):
    """
    An operator resource with additional workforce-specific features.

    Extends Resource with:
    - Break scheduling
    - Fatigue modeling
    - Cross-training tracking
    """

    def __init__(self, env: simpy.Environment, config: ResourceConfig, sim: "Simulation"):
        super().__init__(env, config, sim)

        # Override type
        self.resource_type = ResourceType.OPERATOR

        # Operator-specific attributes
        self.break_duration = 30 * 60  # 30 minutes in seconds
        self.break_interval = 4 * 3600  # Every 4 hours
        self.last_break_time = 0.0
        self.fatigue_factor = 1.0  # Starts at 100% efficiency

        # Start break process
        env.process(self._break_process())

    def _break_process(self):
        """SimPy process for operator breaks."""
        while True:
            # Wait for break interval
            yield self.env.timeout(self.break_interval)

            # Take break
            self.sim.log_event("break_start", self.id, {"operator": self.name})

            yield self.env.timeout(self.break_duration)

            self.last_break_time = self.env.now
            self.fatigue_factor = 1.0  # Reset fatigue after break

            self.sim.log_event("break_end", self.id, {"operator": self.name})

    def get_current_efficiency(self) -> float:
        """Get current efficiency considering fatigue."""
        # Simple fatigue model: efficiency decreases linearly since last break
        time_since_break = self.env.now - self.last_break_time
        hours_since_break = time_since_break / 3600

        # Lose 2% efficiency per hour without break
        fatigue_loss = min(0.2, hours_since_break * 0.02)
        self.fatigue_factor = 1.0 - fatigue_loss

        return self.efficiency * self.fatigue_factor
