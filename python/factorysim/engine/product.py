"""
Product - Product entity model for discrete event simulation.

Represents a product flowing through the factory with routing, tracking, and custom attributes.
"""

from typing import Dict, Any, Optional, List, TYPE_CHECKING
from dataclasses import dataclass, field
from enum import Enum
import uuid

if TYPE_CHECKING:
    from factorysim.engine.simulation import Simulation


class ProductState(Enum):
    """Possible states for a product."""
    CREATED = "created"
    IN_QUEUE = "in_queue"
    IN_PROCESS = "in_process"
    IN_TRANSPORT = "in_transport"
    COMPLETED = "completed"
    SCRAPPED = "scrapped"


@dataclass
class ProductTypeConfig:
    """Configuration for a product type."""
    id: str
    name: str
    routing: List[str]
    arrival_rate: Optional[float] = None  # Inter-arrival time in seconds (e.g. 120 = one every 120s)
    priority: int = 0
    due_date: Optional[float] = None  # Simulation time units
    initial_attributes: Optional[Dict[str, Any]] = None  # Default attributes for this product type


class Product:
    """
    A product entity flowing through the simulation.

    Features:
    - Configurable routing through stations
    - Priority for queue ordering
    - Custom attributes that flow through the system (key-value pairs)
    - Comprehensive time tracking per station
    - Quality/scrap status
    - Full event history for tracing
    """

    def __init__(
        self,
        product_type: str,
        routing: List[str],
        sim: "Simulation",
        priority: int = 0,
        due_date: Optional[float] = None,
        attributes: Optional[Dict[str, Any]] = None,
        order_id: Optional[str] = None,
    ):
        self.id = str(uuid.uuid4())[:8]
        self.product_type = product_type
        self.routing = routing.copy()
        self.sim = sim
        self.priority = priority
        self.due_date = due_date
        self.order_id = order_id

        # Custom entity attributes — flow through the entire system
        self.attributes: Dict[str, Any] = attributes.copy() if attributes else {}

        # State tracking
        self.state = ProductState.CREATED
        self.is_scrap = False

        # Routing progress
        self.current_routing_index = 0
        self.completed_stations: List[str] = []

        # Time tracking
        self.creation_time = sim.env.now
        self.completion_time: Optional[float] = None
        self.buffer_entry_time: Optional[float] = None
        self.total_waiting_time = 0.0
        self.total_processing_time = 0.0

        # Detailed station times
        self.station_times: Dict[str, float] = {}

        # Event history for trace mode
        self.event_history: List[Dict[str, Any]] = []
        self._log_trace("created", {"product_type": product_type, "routing": routing})

    def _log_trace(self, event_type: str, details: Optional[Dict[str, Any]] = None) -> None:
        """Log an event for entity-level tracing."""
        self.event_history.append({
            "time": self.sim.env.now,
            "event": event_type,
            "details": details or {},
        })

    def set_attribute(self, key: str, value: Any) -> None:
        """Set a custom attribute on this product entity."""
        self.attributes[key] = value
        self._log_trace("attribute_set", {"key": key, "value": str(value)})

    def get_attribute(self, key: str, default: Any = None) -> Any:
        """Get a custom attribute from this product entity."""
        return self.attributes.get(key, default)

    def get_next_station(self) -> Optional[str]:
        """Get the next station in the routing."""
        if self.current_routing_index < len(self.routing):
            return self.routing[self.current_routing_index]
        return None

    def advance_routing(self) -> Optional[str]:
        """Move to the next station in routing."""
        self.current_routing_index += 1
        next_station = self.get_next_station()
        self._log_trace("routing_advance", {"next_station": next_station, "index": self.current_routing_index})
        return next_station

    def record_station_time(self, station_id: str, processing_time: float) -> None:
        """Record time spent at a station."""
        self.station_times[station_id] = processing_time
        self.total_processing_time += processing_time
        self.completed_stations.append(station_id)
        self._log_trace("station_complete", {"station_id": station_id, "processing_time": processing_time})

    def complete(self) -> None:
        """Mark the product as completed."""
        self.state = ProductState.COMPLETED
        self.completion_time = self.sim.env.now
        self._log_trace("completed", {
            "cycle_time": self.get_cycle_time(),
            "waiting_time": self.total_waiting_time,
            "processing_time": self.total_processing_time,
        })

        self.sim.log_event("product_complete", self.id, {
            "product_type": self.product_type,
            "cycle_time": self.get_cycle_time(),
            "waiting_time": self.total_waiting_time,
            "processing_time": self.total_processing_time,
            "on_time": self.is_on_time(),
            "attributes": self.attributes,
        })

    def scrap(self) -> None:
        """Mark the product as scrapped."""
        self.state = ProductState.SCRAPPED
        self.is_scrap = True
        self.completion_time = self.sim.env.now
        self._log_trace("scrapped", {
            "station": self.completed_stations[-1] if self.completed_stations else None,
        })

        self.sim.log_event("product_scrapped", self.id, {
            "product_type": self.product_type,
            "station": self.completed_stations[-1] if self.completed_stations else None,
        })

    def get_cycle_time(self) -> float:
        """Get total cycle time (creation to completion)."""
        if self.completion_time is not None:
            return self.completion_time - self.creation_time
        return self.sim.env.now - self.creation_time

    def get_value_added_time(self) -> float:
        """Get total value-added (processing) time."""
        return self.total_processing_time

    def get_non_value_added_time(self) -> float:
        """Get total non-value-added (waiting) time."""
        return self.total_waiting_time

    def get_flow_efficiency(self) -> float:
        """Calculate flow efficiency (value-added / total cycle time)."""
        cycle_time = self.get_cycle_time()
        if cycle_time == 0:
            return 0.0
        return self.total_processing_time / cycle_time

    def is_on_time(self) -> bool:
        """Check if product was/will be completed on time."""
        if self.due_date is None:
            return True
        completion = self.completion_time or self.sim.env.now
        return completion <= self.due_date

    def get_lateness(self) -> float:
        """Get lateness (positive) or earliness (negative) relative to due date."""
        if self.due_date is None:
            return 0.0
        completion = self.completion_time or self.sim.env.now
        return completion - self.due_date

    def get_trace(self) -> List[Dict[str, Any]]:
        """Get full event trace for this entity."""
        return self.event_history.copy()

    def to_dict(self) -> Dict[str, Any]:
        """Convert product to dictionary representation."""
        return {
            "id": self.id,
            "product_type": self.product_type,
            "routing": self.routing,
            "priority": self.priority,
            "due_date": self.due_date,
            "order_id": self.order_id,
            "state": self.state.value,
            "is_scrap": self.is_scrap,
            "current_routing_index": self.current_routing_index,
            "completed_stations": self.completed_stations,
            "creation_time": self.creation_time,
            "completion_time": self.completion_time,
            "total_waiting_time": self.total_waiting_time,
            "total_processing_time": self.total_processing_time,
            "station_times": self.station_times,
            "attributes": self.attributes,
        }


class ProductType:
    """A product type definition for the simulation."""

    def __init__(self, config: ProductTypeConfig, sim: "Simulation"):
        self.id = config.id
        self.name = config.name
        self.routing = config.routing
        self.arrival_rate = config.arrival_rate
        self.priority = config.priority
        self.due_date_offset = config.due_date
        self.initial_attributes = config.initial_attributes or {}
        self.sim = sim

        # Statistics
        self.total_created = 0
        self.total_completed = 0
        self.total_scrapped = 0
        self.cycle_times: List[float] = []

    def create_product(self, due_date: Optional[float] = None, order_id: Optional[str] = None) -> Product:
        """Create a new product instance of this type."""
        if due_date is None and self.due_date_offset is not None:
            due_date = self.sim.env.now + self.due_date_offset

        product = Product(
            product_type=self.id,
            routing=self.routing,
            sim=self.sim,
            priority=self.priority,
            due_date=due_date,
            attributes=self.initial_attributes.copy(),
            order_id=order_id,
        )

        self.total_created += 1
        return product

    def record_completion(self, product: Product) -> None:
        """Record a product completion for statistics."""
        if product.is_scrap:
            self.total_scrapped += 1
        else:
            self.total_completed += 1
            self.cycle_times.append(product.get_cycle_time())

    def get_average_cycle_time(self) -> float:
        """Get average cycle time for completed products."""
        if not self.cycle_times:
            return 0.0
        return sum(self.cycle_times) / len(self.cycle_times)

    def get_throughput(self, time_period: float) -> float:
        """Calculate throughput rate."""
        if time_period == 0:
            return 0.0
        return self.total_completed / time_period

    def get_yield_rate(self) -> float:
        """Calculate yield rate."""
        if self.total_created == 0:
            return 1.0
        return self.total_completed / self.total_created

    def get_statistics(self) -> Dict[str, Any]:
        """Get comprehensive statistics for this product type."""
        return {
            "id": self.id,
            "name": self.name,
            "total_created": self.total_created,
            "total_completed": self.total_completed,
            "total_scrapped": self.total_scrapped,
            "yield_rate": self.get_yield_rate(),
            "average_cycle_time": self.get_average_cycle_time(),
            "cycle_time_std": (
                (sum((ct - self.get_average_cycle_time()) ** 2 for ct in self.cycle_times) / len(self.cycle_times)) ** 0.5
                if len(self.cycle_times) > 1 else 0.0
            ),
        }

    def to_dict(self) -> Dict[str, Any]:
        """Convert product type to dictionary representation."""
        return {
            "id": self.id,
            "name": self.name,
            "routing": self.routing,
            "arrival_rate": self.arrival_rate,
            "priority": self.priority,
            "due_date": self.due_date_offset,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any], sim: "Simulation") -> "ProductType":
        """Create product type from dictionary."""
        config = ProductTypeConfig(
            id=data["id"],
            name=data["name"],
            routing=data["routing"],
            arrival_rate=data.get("arrival_rate", data.get("arrivalRate")),
            priority=data.get("priority", 0),
            due_date=data.get("due_date", data.get("dueDate")),
            initial_attributes=data.get("initial_attributes", data.get("initialAttributes")),
        )
        return cls(config, sim)
