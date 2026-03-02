"""
Buffer - Queue/buffer model for discrete event simulation.

Represents an inter-station buffer with configurable capacity and queue discipline.
"""

from typing import Dict, Any, Optional, List, TYPE_CHECKING
from dataclasses import dataclass, field
from enum import Enum
import simpy

if TYPE_CHECKING:
    from factorysim.engine.simulation import Simulation
    from factorysim.engine.product import Product


class QueueRule(Enum):
    """Queue discipline for buffer."""
    FIFO = "FIFO"  # First In First Out
    LIFO = "LIFO"  # Last In First Out
    PRIORITY = "PRIORITY"  # Priority-based


@dataclass
class BufferConfig:
    """Configuration for a buffer."""
    id: str
    name: str
    capacity: int
    queue_rule: str = "FIFO"
    position: Dict[str, float] = field(default_factory=lambda: {"x": 0, "y": 0})


class Buffer:
    """
    A buffer/queue in the factory simulation.

    Features:
    - Configurable capacity
    - FIFO, LIFO, or priority-based queue discipline
    - Proper SimPy event-based blocking (no polling)
    - Proper SimPy event-based starving detection
    - WIP tracking over time
    """

    def __init__(self, env: simpy.Environment, config: BufferConfig, sim: "Simulation"):
        self.env = env
        self.sim = sim
        self.id = config.id
        self.name = config.name
        self.capacity = config.capacity
        self.queue_rule = QueueRule(config.queue_rule)
        self.position = config.position

        # Internal storage
        self._items: List["Product"] = []

        # SimPy events for proper blocking/starving (no polling!)
        self._space_available = env.event()
        self._item_available = env.event()

        # Statistics
        self.total_items_entered = 0
        self.total_items_exited = 0
        self.total_waiting_time = 0.0
        self.max_level = 0
        self.wip_history: List[Dict[str, Any]] = []

        # Blocking/starving tracking
        self.total_blocking_time = 0.0
        self.total_starving_time = 0.0
        self._blocking_since: Optional[float] = None
        self._starving_since: Optional[float] = None
        self.block_count = 0
        self.starve_count = 0

        # Record initial state
        self._record_wip()

    def _record_wip(self) -> None:
        """Record current WIP level for time-series analysis."""
        self.wip_history.append({
            "time": self.env.now,
            "level": len(self._items),
        })

    def put(self, product: "Product") -> simpy.Event:
        """Put a product into the buffer. Blocks until space is available."""
        return self.env.process(self._put_impl(product))

    def _put_impl(self, product: "Product"):
        """Implementation of put operation with proper event-based blocking."""
        # Block if buffer is full — loop in case multiple producers race
        while self.is_full():
            if self._blocking_since is None:
                self.block_count += 1
                self._blocking_since = self.env.now
                self.sim.log_event("buffer_blocking", self.id, {
                    "buffer": self.name,
                    "product_id": product.id,
                    "level": len(self._items),
                })
            yield self._space_available
        # Record blocking duration
        if self._blocking_since is not None:
            blocking_duration = self.env.now - self._blocking_since
            self.total_blocking_time += blocking_duration
            self._blocking_since = None

        # Add item
        product.buffer_entry_time = self.env.now

        if self.queue_rule == QueueRule.LIFO:
            self._items.insert(0, product)
        else:
            self._items.append(product)

        self.total_items_entered += 1
        self.max_level = max(self.max_level, len(self._items))

        self._record_wip()

        # Signal item available (wake up starving downstream)
        if not self._item_available.triggered:
            self._item_available.succeed()
        self._item_available = self.env.event()

        self.sim.log_event("buffer_put", self.id, {
            "buffer": self.name,
            "product_id": product.id,
            "level": len(self._items),
        })

    def get(self) -> simpy.Event:
        """Get a product from the buffer. Blocks until an item is available."""
        return self.env.process(self._get_impl())

    def _get_impl(self):
        """Implementation of get operation with proper event-based starving."""
        # Starve if buffer is empty — loop in case multiple consumers race
        while self.is_empty():
            if self._starving_since is None:
                self.starve_count += 1
                self._starving_since = self.env.now
                self.sim.log_event("buffer_starving", self.id, {
                    "buffer": self.name,
                    "level": 0,
                })
            yield self._item_available
        # Record starving duration
        if self._starving_since is not None:
            starving_duration = self.env.now - self._starving_since
            self.total_starving_time += starving_duration
            self._starving_since = None

        # Get item based on queue rule
        if self.queue_rule == QueueRule.PRIORITY:
            self._items.sort(key=lambda p: getattr(p, 'priority', 0), reverse=True)

        product = self._items.pop(0)

        # Track waiting time
        if product.buffer_entry_time is not None:
            waiting_time = self.env.now - product.buffer_entry_time
            self.total_waiting_time += waiting_time
            product.total_waiting_time += waiting_time
            product.buffer_entry_time = None

        self.total_items_exited += 1

        self._record_wip()

        # Signal space available (wake up blocked upstream)
        if not self._space_available.triggered:
            self._space_available.succeed()
        self._space_available = self.env.event()

        self.sim.log_event("buffer_get", self.id, {
            "buffer": self.name,
            "product_id": product.id,
            "level": len(self._items),
        })

        return product

    def peek(self) -> Optional["Product"]:
        """Look at the next item without removing it."""
        if self.is_empty():
            return None

        if self.queue_rule == QueueRule.PRIORITY:
            self._items.sort(key=lambda p: getattr(p, 'priority', 0), reverse=True)

        return self._items[0]

    def is_full(self) -> bool:
        """Check if buffer is at capacity."""
        return len(self._items) >= self.capacity

    def is_empty(self) -> bool:
        """Check if buffer is empty."""
        return len(self._items) == 0

    def level(self) -> int:
        """Get current number of items in buffer."""
        return len(self._items)

    def space_available(self) -> simpy.Event:
        """Get event that triggers when space becomes available."""
        if not self.is_full():
            event = self.env.event()
            event.succeed()
            return event
        return self._space_available

    def item_available(self) -> simpy.Event:
        """Get event that triggers when an item becomes available."""
        if not self.is_empty():
            event = self.env.event()
            event.succeed()
            return event
        return self._item_available

    def get_average_wip(self) -> float:
        """Calculate average WIP level over simulation time."""
        if len(self.wip_history) < 2:
            return float(len(self._items))

        total_wip_time = 0.0
        total_time = 0.0

        for i in range(len(self.wip_history) - 1):
            current = self.wip_history[i]
            next_entry = self.wip_history[i + 1]
            duration = next_entry["time"] - current["time"]
            total_wip_time += current["level"] * duration
            total_time += duration

        if self.wip_history:
            last_entry = self.wip_history[-1]
            duration = self.env.now - last_entry["time"]
            total_wip_time += last_entry["level"] * duration
            total_time += duration

        return total_wip_time / total_time if total_time > 0 else 0.0

    def get_average_waiting_time(self) -> float:
        """Calculate average waiting time for items."""
        if self.total_items_exited == 0:
            return 0.0
        return self.total_waiting_time / self.total_items_exited

    def get_utilization(self) -> float:
        """Calculate buffer utilization (avg level / capacity)."""
        return self.get_average_wip() / self.capacity if self.capacity > 0 else 0.0

    def get_statistics(self) -> Dict[str, Any]:
        """Get comprehensive buffer statistics."""
        return {
            "id": self.id,
            "name": self.name,
            "capacity": self.capacity,
            "current_level": len(self._items),
            "max_level": self.max_level,
            "average_wip": self.get_average_wip(),
            "utilization": self.get_utilization(),
            "total_items_entered": self.total_items_entered,
            "total_items_exited": self.total_items_exited,
            "average_waiting_time": self.get_average_waiting_time(),
            "total_blocking_time": self.total_blocking_time,
            "total_starving_time": self.total_starving_time,
            "block_count": self.block_count,
            "starve_count": self.starve_count,
        }

    def to_dict(self) -> Dict[str, Any]:
        """Convert buffer to dictionary representation."""
        return {
            "id": self.id,
            "name": self.name,
            "capacity": self.capacity,
            "queue_rule": self.queue_rule.value,
            "position": self.position,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any], env: simpy.Environment, sim: "Simulation") -> "Buffer":
        """Create buffer from dictionary."""
        config = BufferConfig(
            id=data["id"],
            name=data["name"],
            capacity=data["capacity"],
            queue_rule=data.get("queue_rule", data.get("queueRule", "FIFO")),
            position=data.get("position", {"x": 0, "y": 0}),
        )
        return cls(env, config, sim)
