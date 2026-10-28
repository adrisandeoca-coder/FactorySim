"""
Extra Nodes - Additional processing nodes for FactorySim.

Implements 9 node types that sit in the connection path between stations:
- Pipe nodes: Conveyor, Inspection
- Flow-altering nodes: Assembly, Disassembly, Splitter, Merge,
                       Palletize, Depalletize, MatchBuffer

Extra nodes are transparent -- they sit in the connection path between
stations/buffers.  Product routing stays as a list of station IDs.
When a product moves between stations the engine passes it through any
extra nodes in the connection chain.
"""

from typing import Dict, Any, Optional, List, TYPE_CHECKING
from enum import Enum
import simpy

if TYPE_CHECKING:
    from factorysim.engine.simulation import Simulation
    from factorysim.engine.product import Product


# ═════════════════════════════════════════════════════════════════
#  Standalone Node Types (not ExtraNode subclasses)
# ═════════════════════════════════════════════════════════════════

class Source:
    """Defines where/how products enter the factory.

    Sources are generators, not chain participants.  They are stored in
    ``Simulation.sources`` and drive arrival processes when present.
    """

    def __init__(self, data: Dict[str, Any], env: simpy.Environment, sim: "Simulation"):
        self.id: str = data.get("id", "")
        self.name: str = data.get("name", "Source")
        self.arrival_rate: float = data.get("arrivalRate", 60)
        self.feed_mode: str = data.get("feedMode", "interval")
        self.product_filter: Optional[str] = data.get("productFilter") or None
        self.product_batch_size: int = max(1, int(data.get("productBatchSize", 1) or 1))
        self.env = env
        self.sim = sim

        # Statistics
        self.total_generated: int = 0
        self.generation_by_product_type: Dict[str, int] = {}

    def get_statistics(self) -> Dict[str, Any]:
        hours = self.env.now / 3600 if self.env.now > 0 else 1
        return {
            "id": self.id,
            "name": self.name,
            "arrival_rate": self.arrival_rate,
            "feed_mode": self.feed_mode,
            "product_filter": self.product_filter,
            "product_batch_size": self.product_batch_size,
            "total_generated": self.total_generated,
            "generation_by_product_type": dict(self.generation_by_product_type),
            "actual_rate_per_hour": round(self.total_generated / hours, 2),
        }


class Sink:
    """Defines where products exit the factory.

    Sinks are exit trackers, not chain participants.  They are stored
    in ``Simulation.sinks`` and record product exits.
    """

    def __init__(self, data: Dict[str, Any], env: simpy.Environment, sim: "Simulation"):
        self.id: str = data.get("id", "")
        self.name: str = data.get("name", "Sink")
        self.env = env
        self.sim = sim

        # Statistics
        self.total_exited: int = 0
        self.exits_by_product_type: Dict[str, int] = {}
        self.first_exit_time: Optional[float] = None
        self.last_exit_time: Optional[float] = None

    def record_exit(self, product: "Product") -> None:
        """Record a product exiting through this sink."""
        self.total_exited += 1
        pt = product.product_type
        self.exits_by_product_type[pt] = self.exits_by_product_type.get(pt, 0) + 1
        now = self.env.now
        if self.first_exit_time is None:
            self.first_exit_time = now
        self.last_exit_time = now

        self.sim.log_event("sink_exit", self.id, {
            "product_id": product.id,
            "product_type": pt,
            "sink": self.name,
        })

    def get_statistics(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "total_exited": self.total_exited,
            "exits_by_product_type": dict(self.exits_by_product_type),
            "first_exit_time": self.first_exit_time,
            "last_exit_time": self.last_exit_time,
        }


class ExtraNodeState(Enum):
    """Possible states for an extra node."""
    IDLE = "idle"
    PROCESSING = "processing"
    WAITING = "waiting"
    BLOCKED = "blocked"


class ExtraNode:
    """Base class for all extra processing nodes."""

    def __init__(self, node_id: str, name: str, node_type: str,
                 env: simpy.Environment, sim: "Simulation"):
        self.id = node_id
        self.name = name
        self.node_type = node_type
        self.env = env
        self.sim = sim

        self.upstream_ids: List[str] = []
        self.downstream_ids: List[str] = []

        # Statistics
        self.items_entered = 0
        self.items_processed = 0
        self.state = ExtraNodeState.IDLE
        self._last_state_change = 0.0
        self.state_times: Dict[ExtraNodeState, float] = {
            s: 0.0 for s in ExtraNodeState
        }

    # ── state helpers ────────────────────────────────────────────

    def _flush_state_time(self) -> None:
        now = self.env.now
        elapsed = now - self._last_state_change
        if elapsed > 0:
            self.state_times[self.state] += elapsed
            self._last_state_change = now

    def _set_state(self, new_state: ExtraNodeState) -> None:
        self._flush_state_time()
        self.state = new_state

    # ── interface ────────────────────────────────────────────────

    def process(self, product: "Product"):
        """SimPy generator.  Returns the product to pass downstream,
        or ``None`` if the product was consumed."""
        raise NotImplementedError

    # ── statistics ───────────────────────────────────────────────

    def get_statistics(self) -> Dict[str, Any]:
        self._flush_state_time()
        return {
            "id": self.id,
            "name": self.name,
            "type": self.node_type,
            "items_entered": self.items_entered,
            "items_processed": self.items_processed,
            "state_times": {s.value: t for s, t in self.state_times.items()},
        }

    # ── factory ──────────────────────────────────────────────────

    @classmethod
    def from_dict(cls, entry: Dict[str, Any], env: simpy.Environment,
                  sim: "Simulation") -> Optional["ExtraNode"]:
        """Dispatch to the appropriate subclass based on *type*."""
        node_type = entry.get("type", "")
        data = entry.get("data", {})

        _constructors = {
            "conveyor": Conveyor,
            "inspection": Inspection,
            "assembly": Assembly,
            "disassembly": Disassembly,
            "splitter": Splitter,
            "merge": Merge,
            "palletize": Palletize,
            "depalletize": Depalletize,
            "matchbuffer": MatchBuffer,
            "agv": AGV,
            "crane": Crane,
            "forklift": Forklift,
            "turntable": Turntable,
            "elevator": Elevator,
            "overheadconveyor": OverheadConveyor,
            "sorter": Sorter,
            "shuttle": Shuttle,
            "rollerconveyor": RollerConveyor,
            "trackguidedvehicle": TrackGuidedVehicle,
            "crossover": Crossover,
            "pickstation": PickStation,
            "weighing": Weighing,
            "labeler": Labeler,
        }

        if node_type in ("warehouse", "coldstorage"):
            from factorysim.engine.warehouse import Warehouse  # local import: warehouse imports this module
            return Warehouse(data, env, sim)

        constructor = _constructors.get(node_type)
        if constructor:
            return constructor(data, env, sim)
        return None  # source, sink, operator -- not simulation nodes


# ═════════════════════════════════════════════════════════════════
#  Pipe Nodes
# ═════════════════════════════════════════════════════════════════

class Conveyor(ExtraNode):
    """Adds transport delay based on length / speed.

    Supports two modes:
    - non-accumulating (default): items move independently, no blocking
    - accumulating: items queue at exit end if downstream blocks
    """

    def __init__(self, data: Dict[str, Any], env: simpy.Environment,
                 sim: "Simulation"):
        super().__init__(
            data.get("id", ""),
            data.get("name", "Conveyor"),
            "conveyor", env, sim,
        )
        self.length: float = data.get("length", 5)
        self.speed: float = data.get("speed", 1)
        self.capacity: int = data.get("capacity", 5)
        self.transit_time: float = (
            self.length / self.speed if self.speed > 0 else 0
        )
        self.accumulation_mode: str = data.get("accumulationMode", "non-accumulating")
        # WIP tracking for conveyors (mirrors Buffer.wip_history)
        self._items_on_conveyor: int = 0
        self.wip_history: list = []
        self._total_item_time: float = 0.0  # sum of (items × time) for avg WIP
        self.total_blocked_time: float = 0.0  # time items waited at exit

        # For accumulating mode: exit queue limits concurrent exits
        if self.accumulation_mode == "accumulating":
            self._exit_store = simpy.Store(env, capacity=self.capacity)
        else:
            self._exit_store = None

    def _record_wip(self) -> None:
        self.wip_history.append({"time": self.env.now, "level": self._items_on_conveyor})

    def process(self, product: "Product"):
        self.items_entered += 1
        self._items_on_conveyor += 1
        self._record_wip()
        self._set_state(ExtraNodeState.PROCESSING)
        product._log_trace("entering_conveyor", {
            "conveyor": self.id,
            "transit_time": self.transit_time,
        })

        yield self.env.timeout(self.transit_time)

        # For accumulating conveyors, items queue at exit end
        if self._exit_store is not None:
            exit_start = self.env.now
            yield self._exit_store.put(product)
            blocked = self.env.now - exit_start
            if blocked > 0:
                self.total_blocked_time += blocked
            # Immediately get to allow next item through
            yield self._exit_store.get()

        self._items_on_conveyor -= 1
        self._record_wip()
        self._total_item_time += self.transit_time
        self.items_processed += 1
        self._set_state(ExtraNodeState.IDLE)
        self.sim.log_event("conveyor_transit", self.id, {
            "product_id": product.id,
            "transit_time": self.transit_time,
            "conveyor": self.name,
        })
        product.total_waiting_time += self.transit_time
        return product

    def get_statistics(self) -> Dict[str, Any]:
        stats = super().get_statistics()
        stats["accumulation_mode"] = self.accumulation_mode
        stats["total_blocked_time"] = round(self.total_blocked_time, 2)
        # Time-weighted average WIP from wip_history (accounts for concurrency)
        hist = self.wip_history
        if len(hist) < 2:
            stats["average_wip"] = float(self._items_on_conveyor)
        else:
            total_wip_time = 0.0
            total_time = 0.0
            for i in range(len(hist) - 1):
                duration = hist[i + 1]["time"] - hist[i]["time"]
                total_wip_time += hist[i]["level"] * duration
                total_time += duration
            # Include final segment to current time
            if hist:
                duration = self.env.now - hist[-1]["time"]
                total_wip_time += hist[-1]["level"] * duration
                total_time += duration
            stats["average_wip"] = total_wip_time / total_time if total_time > 0 else 0.0
        return stats


class Inspection(ExtraNode):
    """Adds inspection delay and stochastic scrap check."""

    def __init__(self, data: Dict[str, Any], env: simpy.Environment,
                 sim: "Simulation"):
        super().__init__(
            data.get("id", ""),
            data.get("name", "Inspection"),
            "inspection", env, sim,
        )
        self.inspection_time: float = data.get("inspectionTime", 10)
        self.defect_rate: float = data.get("defectRate", 0) / 100.0
        self.inspection_type: str = data.get("inspectionType", "visual")
        self.items_passed = 0
        self.items_failed = 0

    def process(self, product: "Product"):
        self.items_entered += 1
        self._set_state(ExtraNodeState.PROCESSING)
        product._log_trace("entering_inspection", {"inspection": self.id})

        yield self.env.timeout(self.inspection_time)

        if self.sim.rng.random() < self.defect_rate:
            self.items_failed += 1
            product.is_scrap = True
            self.sim.log_event("inspection_failed", self.id, {
                "product_id": product.id,
                "inspection": self.name,
            })
        else:
            self.items_passed += 1
            self.sim.log_event("inspection_passed", self.id, {
                "product_id": product.id,
                "inspection": self.name,
            })

        self.items_processed += 1
        self._set_state(ExtraNodeState.IDLE)
        product.total_waiting_time += self.inspection_time
        return product

    def get_statistics(self) -> Dict[str, Any]:
        stats = super().get_statistics()
        stats["items_passed"] = self.items_passed
        stats["items_failed"] = self.items_failed
        stats["defect_rate_actual"] = (
            self.items_failed / max(1, self.items_processed)
        )
        return stats


# ═════════════════════════════════════════════════════════════════
#  Routing Nodes
# ═════════════════════════════════════════════════════════════════

class Splitter(ExtraNode):
    """Tags each product with the chosen output index (instant)."""

    def __init__(self, data: Dict[str, Any], env: simpy.Environment,
                 sim: "Simulation"):
        super().__init__(
            data.get("id", ""),
            data.get("name", "Splitter"),
            "splitter", env, sim,
        )
        self.outputs: int = data.get("outputs", 2)
        self.split_type: str = data.get("splitType", "equal")
        self.product_routing: Dict[str, int] = data.get("productRouting", {})
        self.percentages: List[float] = data.get("percentages", [])
        self._round_robin_index = 0

    def process(self, product: "Product"):
        self.items_entered += 1
        self._set_state(ExtraNodeState.PROCESSING)
        output_index = self._determine_output(product)
        product.set_attribute("_splitter_output", output_index)
        product.set_attribute("_splitter_id", self.id)
        self.items_processed += 1

        self.sim.log_event("splitter_route", self.id, {
            "product_id": product.id,
            "output_index": output_index,
            "splitter": self.name,
        })
        yield self.env.timeout(0)
        self._set_state(ExtraNodeState.IDLE)
        return product

    def _determine_output(self, product: "Product") -> int:
        if self.split_type == "product-based" and self.product_routing:
            return self.product_routing.get(product.product_type, 0)
        elif self.split_type == "equal":
            idx = self._round_robin_index
            self._round_robin_index = (
                (self._round_robin_index + 1) % self.outputs
            )
            return idx
        elif self.split_type == "percentage":
            if self.percentages:
                # Weighted random selection using cumulative percentages
                r = self.sim.rng.random() * 100
                cumulative = 0.0
                for i, pct in enumerate(self.percentages):
                    cumulative += pct
                    if r < cumulative:
                        return i
                return len(self.percentages) - 1
            return int(self.sim.rng.random() * self.outputs)
        return 0


class Merge(ExtraNode):
    """Passes products through from multiple inputs (instant)."""

    def __init__(self, data: Dict[str, Any], env: simpy.Environment,
                 sim: "Simulation"):
        super().__init__(
            data.get("id", ""),
            data.get("name", "Merge"),
            "merge", env, sim,
        )
        self.inputs: int = data.get("inputs", 2)
        self.merge_type: str = data.get("mergeType", "fifo")

    def process(self, product: "Product"):
        self.items_entered += 1
        self.items_processed += 1
        self.sim.log_event("merge_pass", self.id, {
            "product_id": product.id,
            "merge": self.name,
        })
        yield self.env.timeout(0)
        return product


# ═════════════════════════════════════════════════════════════════
#  Synchronisation / Assembly Nodes
# ═════════════════════════════════════════════════════════════════

class Assembly(ExtraNode):
    """Collects required parts, waits until a complete set is available,
    then outputs the primary product after *cycleTime* delay.

    Products that are **not** the primary are marked complete (consumed).
    """

    def __init__(self, data: Dict[str, Any], env: simpy.Environment,
                 sim: "Simulation"):
        super().__init__(
            data.get("id", ""),
            data.get("name", "Assembly"),
            "assembly", env, sim,
        )
        self.cycle_time: float = data.get("cycleTime", 0)
        self.input_parts: int = data.get("inputParts", 2)
        self.input_parts_by_product: List[Dict[str, Any]] = (
            data.get("inputPartsByProduct", [])
        )

        # waiting area: product_type -> [products]
        self._waiting: Dict[str, List["Product"]] = {}
        # per-product completion signals
        self._done_events: Dict[str, simpy.Event] = {}
        self._results: Dict[str, Optional["Product"]] = {}
        self._consumed_by_product: Dict[str, int] = {}

    def process(self, product: "Product"):
        self.items_entered += 1
        self._set_state(ExtraNodeState.WAITING)

        pt = product.product_type
        self._waiting.setdefault(pt, []).append(product)

        done_event = self.env.event()
        self._done_events[product.id] = done_event

        if self._check_ready():
            self.env.process(self._assemble())

        yield done_event
        result = self._results.pop(product.id, None)
        self._done_events.pop(product.id, None)

        if result is not None:
            self._set_state(ExtraNodeState.IDLE)
        return result

    def _check_ready(self) -> bool:
        if self.input_parts_by_product:
            for req in self.input_parts_by_product:
                pid = req["productId"]
                qty = req["quantity"]
                if len(self._waiting.get(pid, [])) < qty:
                    return False
            return True
        total = sum(len(v) for v in self._waiting.values())
        return total >= self.input_parts

    def _assemble(self):
        self._set_state(ExtraNodeState.PROCESSING)

        consumed: List["Product"] = []
        if self.input_parts_by_product:
            for req in self.input_parts_by_product:
                pid = req["productId"]
                qty = req["quantity"]
                for _ in range(qty):
                    if self._waiting.get(pid):
                        consumed.append(self._waiting[pid].pop(0))
        else:
            remaining = self.input_parts
            for pt in list(self._waiting.keys()):
                while self._waiting[pt] and remaining > 0:
                    consumed.append(self._waiting[pt].pop(0))
                    remaining -= 1

        yield self.env.timeout(self.cycle_time)
        self.items_processed += 1

        if not consumed:
            return

        primary = consumed[0]
        self.sim.log_event("assembly_complete", self.id, {
            "primary_product_id": primary.id,
            "consumed_count": len(consumed),
            "assembly": self.name,
        })

        # primary continues downstream
        self._results[primary.id] = primary
        if primary.id in self._done_events:
            self._done_events[primary.id].succeed()

        # others are consumed (tracked via assembly items_processed, not throughput)
        for other in consumed[1:]:
            other._consumed = True
            pt = other.product_type
            self._consumed_by_product[pt] = self._consumed_by_product.get(pt, 0) + 1
            other.complete()
            self._results[other.id] = None
            if other.id in self._done_events:
                self._done_events[other.id].succeed()


    def get_statistics(self) -> Dict[str, Any]:
        stats = super().get_statistics()
        stats["consumed_by_product"] = dict(self._consumed_by_product)
        return stats


class MatchBuffer(ExtraNode):
    """Synchronises parts from multiple lines before releasing them.

    Similar to Assembly but with match-key semantics and an optional
    timeout that releases partial matches to prevent deadlock.
    """

    def __init__(self, data: Dict[str, Any], env: simpy.Environment,
                 sim: "Simulation"):
        super().__init__(
            data.get("id", ""),
            data.get("name", "MatchBuffer"),
            "matchbuffer", env, sim,
        )
        self.capacity: int = data.get("capacity", 20)
        self.match_key: str = data.get("matchKey", "batch")
        self.required_parts: List[Dict[str, Any]] = (
            data.get("requiredParts", [])
        )
        self.timeout_duration: Optional[float] = data.get("timeout")

        self._waiting: Dict[str, List["Product"]] = {}
        self._done_events: Dict[str, simpy.Event] = {}
        self._results: Dict[str, Optional["Product"]] = {}
        self._consumed_by_product: Dict[str, int] = {}

    def process(self, product: "Product"):
        self.items_entered += 1
        self._set_state(ExtraNodeState.WAITING)

        pt = product.product_type
        self._waiting.setdefault(pt, []).append(product)

        done_event = self.env.event()
        self._done_events[product.id] = done_event

        if self._check_ready():
            self.env.process(self._release_match())
        elif self.timeout_duration:
            self.env.process(self._timeout_check(product.id))

        yield done_event
        result = self._results.pop(product.id, None)
        self._done_events.pop(product.id, None)

        if result is not None:
            self._set_state(ExtraNodeState.IDLE)
        return result

    def _check_ready(self) -> bool:
        for req in self.required_parts:
            pid = req["productId"]
            qty = req["quantity"]
            if len(self._waiting.get(pid, [])) < qty:
                return False
        return True

    def _release_match(self):
        self._set_state(ExtraNodeState.PROCESSING)

        consumed: List["Product"] = []
        for req in self.required_parts:
            pid = req["productId"]
            qty = req["quantity"]
            for _ in range(qty):
                if self._waiting.get(pid):
                    consumed.append(self._waiting[pid].pop(0))

        self.items_processed += len(consumed)

        if not consumed:
            yield self.env.timeout(0)
            return

        primary = consumed[0]
        self.sim.log_event("match_release", self.id, {
            "primary_product_id": primary.id,
            "consumed_count": len(consumed),
            "match_buffer": self.name,
        })

        self._results[primary.id] = primary
        if primary.id in self._done_events:
            self._done_events[primary.id].succeed()

        # Secondary parts pass through (not consumed) so downstream assembly
        # receives all required inputs.  NOT counted as consumed since they
        # continue through routing.
        for other in consumed[1:]:
            self._results[other.id] = other   # pass through, don't consume
            if other.id in self._done_events:
                self._done_events[other.id].succeed()

        yield self.env.timeout(0)

    def get_statistics(self) -> Dict[str, Any]:
        stats = super().get_statistics()
        stats["consumed_by_product"] = dict(self._consumed_by_product)
        return stats

    def _timeout_check(self, product_id: str):
        yield self.env.timeout(self.timeout_duration)

        if (product_id in self._done_events
                and not self._done_events[product_id].triggered):
            # Find and remove the product from waiting
            product = None
            for pt_products in self._waiting.values():
                for p in pt_products:
                    if p.id == product_id:
                        product = p
                        pt_products.remove(p)
                        break
                if product:
                    break

            if product:
                self._results[product_id] = product
                self._done_events[product_id].succeed()
                self.sim.log_event("match_timeout", self.id, {
                    "product_id": product_id,
                    "match_buffer": self.name,
                })


# ═════════════════════════════════════════════════════════════════
#  Multiplying / Reducing Nodes
# ═════════════════════════════════════════════════════════════════

class Disassembly(ExtraNode):
    """Adds cycle-time delay and optionally spawns new products
    for each entry in *outputParts* (if the product type is defined
    in the model)."""

    def __init__(self, data: Dict[str, Any], env: simpy.Environment,
                 sim: "Simulation"):
        super().__init__(
            data.get("id", ""),
            data.get("name", "Disassembly"),
            "disassembly", env, sim,
        )
        self.cycle_time: float = data.get("cycleTime", 0)
        self.output_parts: List[Dict[str, Any]] = (
            data.get("outputParts", [])
        )

    def process(self, product: "Product"):
        self.items_entered += 1
        self._set_state(ExtraNodeState.PROCESSING)

        yield self.env.timeout(self.cycle_time)
        self.items_processed += 1

        # Create new products for defined output part types
        created: List["Product"] = []
        for part_spec in self.output_parts:
            pid = part_spec["productId"]
            qty = part_spec.get("quantity", 1)
            pt = self.sim.product_types.get(pid)
            if pt:
                for _ in range(qty):
                    new_product = pt.create_product()
                    created.append(new_product)

        for new_product in created:
            self.sim.env.process(
                self.sim._product_flow_process(new_product, skip_pre_chain=True)
            )

        self.sim.log_event("disassembly_complete", self.id, {
            "input_product_id": product.id,
            "created_count": len(created),
            "disassembly": self.name,
        })

        self._set_state(ExtraNodeState.IDLE)
        product.total_waiting_time += self.cycle_time
        return product


class Palletize(ExtraNode):
    """Accumulates items until *palletSize* is reached, then outputs
    one pallet (the first item becomes the carrier; others consumed)."""

    def __init__(self, data: Dict[str, Any], env: simpy.Environment,
                 sim: "Simulation"):
        super().__init__(
            data.get("id", ""),
            data.get("name", "Palletize"),
            "palletize", env, sim,
        )
        self.default_pallet_size: int = data.get("defaultPalletSize", 10)
        self.pallet_size_by_product: Dict[str, int] = (
            data.get("palletSizeByProduct", {}) or {}
        )
        self.cycle_time: float = data.get("cycleTime", 0)

        self._staging: List["Product"] = []
        self._done_events: Dict[str, simpy.Event] = {}
        self._results: Dict[str, Optional["Product"]] = {}
        self._is_palletizing: bool = False

    def _get_pallet_size(self, product_type: str) -> int:
        return self.pallet_size_by_product.get(
            product_type, self.default_pallet_size
        )

    def process(self, product: "Product"):
        self.items_entered += 1
        if not self._is_palletizing:
            self._set_state(ExtraNodeState.WAITING)

        self._staging.append(product)
        done_event = self.env.event()
        self._done_events[product.id] = done_event

        pallet_size = self._get_pallet_size(product.product_type)
        if len(self._staging) >= pallet_size:
            self.env.process(self._palletize(pallet_size))

        yield done_event
        result = self._results.pop(product.id, None)
        self._done_events.pop(product.id, None)

        if result is not None:
            self._set_state(ExtraNodeState.IDLE)
        return result

    def _palletize(self, pallet_size: int):
        self._is_palletizing = True
        self._set_state(ExtraNodeState.PROCESSING)

        items = self._staging[:pallet_size]
        self._staging = self._staging[pallet_size:]

        yield self.env.timeout(self.cycle_time)
        self._is_palletizing = False
        self.items_processed += len(items)

        primary = items[0]
        primary.set_attribute("_pallet_size", len(items))
        primary.set_attribute("_is_pallet", True)

        self.sim.log_event("palletize_complete", self.id, {
            "primary_product_id": primary.id,
            "pallet_size": len(items),
            "palletize": self.name,
        })

        self._results[primary.id] = primary
        if primary.id in self._done_events:
            self._done_events[primary.id].succeed()

        for item in items[1:]:
            item._consumed = True
            item.complete()
            self._results[item.id] = None
            if item.id in self._done_events:
                self._done_events[item.id].succeed()


class Depalletize(ExtraNode):
    """Unpacks a pallet: primary product continues, extra items are
    spawned as new flow processes with the remaining routing."""

    def __init__(self, data: Dict[str, Any], env: simpy.Environment,
                 sim: "Simulation"):
        super().__init__(
            data.get("id", ""),
            data.get("name", "Depalletize"),
            "depalletize", env, sim,
        )
        self.cycle_time: float = data.get("cycleTime", 5)

    def process(self, product: "Product"):
        from factorysim.engine.product import Product as _Product

        self.items_entered += 1
        self._set_state(ExtraNodeState.PROCESSING)

        pallet_size = product.get_attribute("_pallet_size", 1)
        total_time = self.cycle_time * pallet_size

        yield self.env.timeout(total_time)
        self.items_processed += 1

        # Clear pallet attributes
        product.attributes.pop("_pallet_size", None)
        product.attributes.pop("_is_pallet", None)

        # Spawn extra products for the unpacked items
        extra_count = pallet_size - 1
        if extra_count > 0:
            remaining_routing = product.routing[
                product.current_routing_index + 1:
            ]
            for _ in range(extra_count):
                new_product = _Product(
                    product_type=product.product_type,
                    routing=remaining_routing,
                    sim=self.sim,
                    priority=product.priority,
                )
                self.sim.env.process(
                    self.sim._product_flow_process(new_product, skip_pre_chain=True)
                )
                pt = self.sim.product_types.get(product.product_type)
                if pt:
                    pt.total_created += 1

        self.sim.log_event("depalletize_complete", self.id, {
            "product_id": product.id,
            "pallet_size": pallet_size,
            "extra_created": extra_count,
            "depalletize": self.name,
        })

        self._set_state(ExtraNodeState.IDLE)
        product.total_waiting_time += total_time
        return product


# ═════════════════════════════════════════════════════════════════
#  Transport Nodes
# ═════════════════════════════════════════════════════════════════

class AGV(ExtraNode):
    """Models AGV transport between stations using the transport network.

    When a transport network is present, uses A* pathfinding to compute
    the route between station-stop waypoints and derives transit time
    from path distance and AGV speed.  When no network is configured,
    falls back to a fixed transit time based on configured defaults.

    The AGV fleet is modelled as a SimPy Resource so products compete
    for a limited number of vehicles.
    """

    def __init__(self, data: Dict[str, Any], env: simpy.Environment,
                 sim: "Simulation"):
        super().__init__(
            data.get("id", ""),
            data.get("name", "AGV"),
            "agv", env, sim,
        )
        self.count: int = max(1, int(data.get("count", 1)))
        self.speed: float = data.get("speed", 1.5)   # m/s
        self.capacity: int = data.get("capacity", 1)  # items per trip
        self.fallback_transit_time: float = data.get("transitTime", 30.0)  # seconds

        # Fleet resource — products must acquire an AGV before transit
        self._fleet = simpy.Resource(env, capacity=self.count)

        # Transport network (injected by Simulation after construction)
        self._network: Optional[Dict[str, Any]] = None
        self._waypoint_map: Dict[str, Dict[str, Any]] = {}
        self._graph: Dict[str, List[Dict[str, Any]]] = {}

        # Path cache: (source_wp_id, target_wp_id) -> {path, distance, time}
        self._path_cache: Dict[tuple, Optional[Dict[str, Any]]] = {}

        # Statistics
        self.total_distance: float = 0.0
        self.total_transit_time: float = 0.0
        self.total_wait_for_agv: float = 0.0
        self.trips: int = 0

    def set_transport_network(self, network: Dict[str, Any]) -> None:
        """Inject transport network data and build the pathfinding graph."""
        self._network = network
        waypoints = network.get("waypoints", [])
        lanes = network.get("lanes", [])

        self._waypoint_map = {wp["id"]: wp for wp in waypoints}

        # Build adjacency list
        self._graph = {wp["id"]: [] for wp in waypoints}
        for lane in lanes:
            wp_ids = lane.get("waypoints", [])
            speed_limit = lane.get("speedLimit", 2.0)
            one_way = lane.get("oneWay", False)
            for i in range(len(wp_ids) - 1):
                a_id, b_id = wp_ids[i], wp_ids[i + 1]
                a = self._waypoint_map.get(a_id)
                b = self._waypoint_map.get(b_id)
                if not a or not b:
                    continue
                d = self._euclidean(a["position"], b["position"])
                self._graph[a_id].append({
                    "id": b_id, "distance": d, "speed": speed_limit,
                })
                if not one_way:
                    self._graph[b_id].append({
                        "id": a_id, "distance": d, "speed": speed_limit,
                    })

        self._path_cache = {}

    @staticmethod
    def _euclidean(a: Dict[str, float], b: Dict[str, float]) -> float:
        dx = a.get("x", 0) - b.get("x", 0)
        dy = a.get("y", 0) - b.get("y", 0)
        return (dx * dx + dy * dy) ** 0.5

    def _find_station_stop(self, station_id: str) -> Optional[str]:
        """Find waypoint of type 'station-stop' linked to a station ID."""
        if not self._network:
            return None
        for wp in self._network.get("waypoints", []):
            if wp.get("type") == "station-stop" and wp.get("linkedNodeId") == station_id:
                return wp["id"]
        return None

    def _find_path(self, start_id: str, goal_id: str) -> Optional[Dict[str, Any]]:
        """A* shortest path.  Returns {path, distance, time} or None."""
        cache_key = (start_id, goal_id)
        if cache_key in self._path_cache:
            return self._path_cache[cache_key]

        start = self._waypoint_map.get(start_id)
        goal = self._waypoint_map.get(goal_id)
        if not start or not goal:
            self._path_cache[cache_key] = None
            return None

        g_score: Dict[str, float] = {start_id: 0}
        f_score: Dict[str, float] = {start_id: self._euclidean(start["position"], goal["position"])}
        parent: Dict[str, Optional[str]] = {start_id: None}
        speed_on_edge: Dict[str, float] = {}
        open_set = {start_id}
        closed_set: set = set()

        while open_set:
            current = min(open_set, key=lambda n: f_score.get(n, float("inf")))
            if current == goal_id:
                # Reconstruct path
                path = []
                c: Optional[str] = goal_id
                while c is not None:
                    path.append(c)
                    c = parent.get(c)
                path.reverse()

                total_dist = g_score[goal_id]
                # Time = sum(edge_distance / edge_speed) along path
                total_time = 0.0
                for i in range(1, len(path)):
                    prev_wp = self._waypoint_map[path[i - 1]]
                    cur_wp = self._waypoint_map[path[i]]
                    edge_dist = self._euclidean(prev_wp["position"], cur_wp["position"])
                    spd = speed_on_edge.get(path[i], self.speed)
                    total_time += edge_dist / spd if spd > 0 else 0

                result = {"path": path, "distance": total_dist, "time": total_time}
                self._path_cache[cache_key] = result
                return result

            open_set.remove(current)
            closed_set.add(current)

            for neighbor in self._graph.get(current, []):
                nid = neighbor["id"]
                if nid in closed_set:
                    continue
                tentative_g = g_score[current] + neighbor["distance"]
                if tentative_g < g_score.get(nid, float("inf")):
                    parent[nid] = current
                    g_score[nid] = tentative_g
                    wp = self._waypoint_map[nid]
                    h = self._euclidean(wp["position"], goal["position"])
                    f_score[nid] = tentative_g + h
                    speed_on_edge[nid] = neighbor["speed"]
                    open_set.add(nid)

        self._path_cache[cache_key] = None
        return None

    def _get_transit_time(self, product: "Product") -> tuple:
        """Compute transit time and distance for the current product move.

        The AGV chain runs after station N is complete and before station N+1.
        At this point current_routing_index points to station N (just finished),
        and station N+1 is routing[current_routing_index + 1].

        Returns (transit_time, distance, path_waypoints).
        Falls back to speed-based default or fixed fallback.
        """
        if self._network and self._network.get("enabled"):
            idx = product.current_routing_index
            src_station = product.routing[idx] if idx < len(product.routing) else None
            next_idx = idx + 1
            tgt_station = product.routing[next_idx] if next_idx < len(product.routing) else None

            if src_station and tgt_station:
                src_wp = self._find_station_stop(src_station)
                tgt_wp = self._find_station_stop(tgt_station)
                if src_wp and tgt_wp:
                    path_result = self._find_path(src_wp, tgt_wp)
                    if path_result:
                        return (path_result["time"], path_result["distance"], path_result["path"])

        # Fallback: use fixed transit time
        return (self.fallback_transit_time, 0.0, [])

    def process(self, product: "Product"):
        self.items_entered += 1

        # Wait for an available AGV
        wait_start = self.env.now
        self._set_state(ExtraNodeState.WAITING)
        req = self._fleet.request()
        yield req
        wait_duration = self.env.now - wait_start
        self.total_wait_for_agv += wait_duration

        if wait_duration > 0:
            product.total_waiting_time += wait_duration
            self.sim.log_event("agv_wait", self.id, {
                "product_id": product.id,
                "wait_time": wait_duration,
                "agv": self.name,
            })

        # Calculate transit
        transit_time, distance, path = self._get_transit_time(product)

        self._set_state(ExtraNodeState.PROCESSING)
        product._log_trace("agv_transit_start", {
            "agv": self.id,
            "transit_time": transit_time,
            "distance": distance,
            "path_waypoints": len(path),
        })

        self.sim.log_event("agv_transit_start", self.id, {
            "product_id": product.id,
            "transit_time": transit_time,
            "distance": distance,
            "agv": self.name,
        })

        yield self.env.timeout(transit_time)

        # Release AGV back to fleet
        self._fleet.release(req)

        # Update statistics
        self.total_distance += distance
        self.total_transit_time += transit_time
        self.trips += 1
        self.items_processed += 1
        self._set_state(ExtraNodeState.IDLE)

        self.sim.log_event("agv_transit_complete", self.id, {
            "product_id": product.id,
            "transit_time": transit_time,
            "distance": distance,
            "agv": self.name,
        })
        product.total_waiting_time += transit_time
        return product

    def get_statistics(self) -> Dict[str, Any]:
        stats = super().get_statistics()
        stats["fleet_size"] = self.count
        stats["speed"] = self.speed
        stats["total_distance"] = round(self.total_distance, 2)
        stats["total_transit_time"] = round(self.total_transit_time, 2)
        stats["total_wait_for_agv"] = round(self.total_wait_for_agv, 2)
        stats["trips"] = self.trips
        stats["avg_transit_time"] = (
            round(self.total_transit_time / self.trips, 2) if self.trips > 0 else 0
        )
        stats["avg_wait_for_agv"] = (
            round(self.total_wait_for_agv / max(1, self.items_entered), 2)
        )
        stats["fleet_utilization"] = (
            round(self.total_transit_time / (self.env.now * self.count), 4)
            if self.env.now > 0 else 0
        )
        return stats


class Crane(ExtraNode):
    """Crane simulation — gantry or bridge crane with lift/travel/lower cycle."""

    def __init__(self, data: Dict[str, Any], env: simpy.Environment,
                 sim: "Simulation"):
        super().__init__(
            data.get("id", ""),
            data.get("name", "Crane"),
            "crane", env, sim,
        )
        self.crane_type: str = data.get("craneType", "bridge")
        self.lift_capacity: float = data.get("liftCapacity", 5000)  # kg
        self.travel_speed: float = data.get("travelSpeed", 1.0)  # m/s
        self.lift_speed: float = data.get("liftSpeed", 0.5)  # m/s
        self.span_width: float = data.get("spanWidth", 10)  # m
        self.lift_height: float = data.get("liftHeight", 5)  # m default lift
        self._resource = simpy.Resource(env, capacity=1)
        self.total_lift_time = 0.0
        self.total_travel_time = 0.0
        self.total_wait_time = 0.0
        self.lifts = 0

    def process(self, product: "Product"):
        self.items_entered += 1
        self._set_state(ExtraNodeState.WAITING)

        wait_start = self.env.now
        req = self._resource.request()
        yield req
        wait_time = self.env.now - wait_start
        self.total_wait_time += wait_time

        self._set_state(ExtraNodeState.PROCESSING)

        # Lift cycle: lift + travel + lower
        lift_time = self.lift_height / self.lift_speed if self.lift_speed > 0 else 0
        travel_time = self.span_width / self.travel_speed if self.travel_speed > 0 else 0
        lower_time = lift_time  # same as lift
        total_cycle = lift_time + travel_time + lower_time

        yield self.env.timeout(total_cycle)

        self._resource.release(req)
        self.total_lift_time += lift_time + lower_time
        self.total_travel_time += travel_time
        self.lifts += 1
        self.items_processed += 1
        self._set_state(ExtraNodeState.IDLE)

        self.sim.log_event("crane_cycle", self.id, {
            "product_id": product.id,
            "cycle_time": total_cycle,
            "crane": self.name,
        })
        product.total_waiting_time += total_cycle + wait_time
        return product

    def get_statistics(self) -> Dict[str, Any]:
        stats = super().get_statistics()
        stats["crane_type"] = self.crane_type
        stats["lifts"] = self.lifts
        stats["total_lift_time"] = round(self.total_lift_time, 2)
        stats["total_travel_time"] = round(self.total_travel_time, 2)
        stats["total_wait_time"] = round(self.total_wait_time, 2)
        stats["utilization"] = (
            round((self.total_lift_time + self.total_travel_time) / self.env.now, 4)
            if self.env.now > 0 else 0
        )
        return stats


class Forklift(ExtraNode):
    """Forklift fleet simulation — similar to AGV with lift operations."""

    def __init__(self, data: Dict[str, Any], env: simpy.Environment,
                 sim: "Simulation"):
        super().__init__(
            data.get("id", ""),
            data.get("name", "Forklift"),
            "forklift", env, sim,
        )
        self.count: int = max(1, int(data.get("count", 1)))
        self.lift_capacity: float = data.get("liftCapacity", 2000)  # kg
        self.speed: float = data.get("speed", 2.0)  # m/s
        self.lift_height: float = data.get("liftHeight", 3)  # m
        self.lift_speed: float = data.get("liftSpeed", 0.3)  # m/s
        self.transit_distance: float = data.get("transitDistance", 20)  # m fallback
        self._fleet = simpy.Resource(env, capacity=self.count)
        self.total_transit_time = 0.0
        self.total_lift_time = 0.0
        self.total_wait_time = 0.0
        self.trips = 0

    def process(self, product: "Product"):
        self.items_entered += 1
        self._set_state(ExtraNodeState.WAITING)

        wait_start = self.env.now
        req = self._fleet.request()
        yield req
        wait_time = self.env.now - wait_start
        self.total_wait_time += wait_time

        self._set_state(ExtraNodeState.PROCESSING)

        # Lift + travel + lower
        lift_time = self.lift_height / self.lift_speed if self.lift_speed > 0 else 0
        travel_time = self.transit_distance / self.speed if self.speed > 0 else 0
        lower_time = lift_time
        total_cycle = lift_time + travel_time + lower_time

        yield self.env.timeout(total_cycle)

        self._fleet.release(req)
        self.total_transit_time += travel_time
        self.total_lift_time += lift_time + lower_time
        self.trips += 1
        self.items_processed += 1
        self._set_state(ExtraNodeState.IDLE)

        self.sim.log_event("forklift_cycle", self.id, {
            "product_id": product.id,
            "cycle_time": total_cycle,
            "forklift": self.name,
        })
        product.total_waiting_time += total_cycle + wait_time
        return product

    def get_statistics(self) -> Dict[str, Any]:
        stats = super().get_statistics()
        stats["fleet_size"] = self.count
        stats["trips"] = self.trips
        stats["total_transit_time"] = round(self.total_transit_time, 2)
        stats["total_lift_time"] = round(self.total_lift_time, 2)
        stats["total_wait_time"] = round(self.total_wait_time, 2)
        stats["fleet_utilization"] = (
            round((self.total_transit_time + self.total_lift_time) / (self.env.now * self.count), 4)
            if self.env.now > 0 else 0
        )
        return stats


# ═════════════════════════════════════════════════════════════════
#  Additional Material Flow Nodes
# ═════════════════════════════════════════════════════════════════

class Turntable(ExtraNode):
    """Rotary turntable — rotates to align with a lane before transferring."""

    def __init__(self, data: Dict[str, Any], env: simpy.Environment,
                 sim: "Simulation"):
        super().__init__(data.get("id", ""), data.get("name", "Turntable"),
                         "turntable", env, sim)
        self.rotation_time: float = data.get("rotationTime", 5)  # seconds per 90 deg
        self.transfer_time: float = data.get("transferTime", 3)
        self._resource = simpy.Resource(env, capacity=1)

    def process(self, product: "Product"):
        self.items_entered += 1
        req = self._resource.request()
        yield req
        self._set_state(ExtraNodeState.PROCESSING)
        yield self.env.timeout(self.rotation_time + self.transfer_time)
        self._resource.release(req)
        self.items_processed += 1
        self._set_state(ExtraNodeState.IDLE)
        product.total_waiting_time += self.rotation_time + self.transfer_time
        return product


class Elevator(ExtraNode):
    """Vertical elevator — transports items between floors/levels."""

    def __init__(self, data: Dict[str, Any], env: simpy.Environment,
                 sim: "Simulation"):
        super().__init__(data.get("id", ""), data.get("name", "Elevator"),
                         "elevator", env, sim)
        self.height: float = data.get("height", 5)  # meters
        self.speed: float = data.get("speed", 0.5)  # m/s
        self.load_time: float = data.get("loadTime", 5)  # seconds
        self.unload_time: float = data.get("unloadTime", 5)
        self._resource = simpy.Resource(env, capacity=1)

    def process(self, product: "Product"):
        self.items_entered += 1
        req = self._resource.request()
        yield req
        self._set_state(ExtraNodeState.PROCESSING)
        travel = self.height / self.speed if self.speed > 0 else 0
        total = self.load_time + travel + self.unload_time
        yield self.env.timeout(total)
        self._resource.release(req)
        self.items_processed += 1
        self._set_state(ExtraNodeState.IDLE)
        product.total_waiting_time += total
        return product


class OverheadConveyor(ExtraNode):
    """Overhead power-and-free conveyor with carrier-based transport."""

    def __init__(self, data: Dict[str, Any], env: simpy.Environment,
                 sim: "Simulation"):
        super().__init__(data.get("id", ""), data.get("name", "Overhead Conveyor"),
                         "overheadconveyor", env, sim)
        self.length: float = data.get("length", 20)
        self.speed: float = data.get("speed", 0.5)
        self.carriers: int = max(1, int(data.get("carriers", 10)))
        self._carrier_resource = simpy.Resource(env, capacity=self.carriers)
        self.total_wait_time = 0.0

    def process(self, product: "Product"):
        self.items_entered += 1
        wait_start = self.env.now
        req = self._carrier_resource.request()
        yield req
        self.total_wait_time += self.env.now - wait_start
        self._set_state(ExtraNodeState.PROCESSING)
        transit = self.length / self.speed if self.speed > 0 else 0
        yield self.env.timeout(transit)
        self._carrier_resource.release(req)
        self.items_processed += 1
        self._set_state(ExtraNodeState.IDLE)
        product.total_waiting_time += transit
        return product

    def get_statistics(self) -> Dict[str, Any]:
        stats = super().get_statistics()
        stats["carriers"] = self.carriers
        stats["total_wait_time"] = round(self.total_wait_time, 2)
        return stats


class Sorter(ExtraNode):
    """High-speed sorter — routes items to lanes based on attributes."""

    def __init__(self, data: Dict[str, Any], env: simpy.Environment,
                 sim: "Simulation"):
        super().__init__(data.get("id", ""), data.get("name", "Sorter"),
                         "sorter", env, sim)
        self.sort_time: float = data.get("sortTime", 2)
        self.lanes: int = data.get("lanes", 4)
        self.error_rate: float = data.get("errorRate", 0) / 100.0
        self.items_missorted = 0

    def process(self, product: "Product"):
        self.items_entered += 1
        self._set_state(ExtraNodeState.PROCESSING)
        yield self.env.timeout(self.sort_time)
        if self.sim.rng.random() < self.error_rate:
            self.items_missorted += 1
            product.set_attribute("_missorted", True)
        self.items_processed += 1
        self._set_state(ExtraNodeState.IDLE)
        product.total_waiting_time += self.sort_time
        return product

    def get_statistics(self) -> Dict[str, Any]:
        stats = super().get_statistics()
        stats["lanes"] = self.lanes
        stats["items_missorted"] = self.items_missorted
        return stats


class Shuttle(ExtraNode):
    """Shuttle car — moves items between parallel lanes."""

    def __init__(self, data: Dict[str, Any], env: simpy.Environment,
                 sim: "Simulation"):
        super().__init__(data.get("id", ""), data.get("name", "Shuttle"),
                         "shuttle", env, sim)
        self.travel_distance: float = data.get("travelDistance", 10)
        self.speed: float = data.get("speed", 2.0)
        self.load_time: float = data.get("loadTime", 3)
        self._resource = simpy.Resource(env, capacity=1)

    def process(self, product: "Product"):
        self.items_entered += 1
        req = self._resource.request()
        yield req
        self._set_state(ExtraNodeState.PROCESSING)
        travel = self.travel_distance / self.speed if self.speed > 0 else 0
        total = self.load_time + travel + self.load_time
        yield self.env.timeout(total)
        self._resource.release(req)
        self.items_processed += 1
        self._set_state(ExtraNodeState.IDLE)
        product.total_waiting_time += total
        return product


class RollerConveyor(ExtraNode):
    """Gravity or powered roller conveyor — simple transport with accumulation zones."""

    def __init__(self, data: Dict[str, Any], env: simpy.Environment,
                 sim: "Simulation"):
        super().__init__(data.get("id", ""), data.get("name", "Roller Conveyor"),
                         "rollerconveyor", env, sim)
        self.length: float = data.get("length", 10)
        self.speed: float = data.get("speed", 0.8)
        self.powered: bool = data.get("powered", True)

    def process(self, product: "Product"):
        self.items_entered += 1
        self._set_state(ExtraNodeState.PROCESSING)
        transit = self.length / self.speed if self.speed > 0 else 0
        yield self.env.timeout(transit)
        self.items_processed += 1
        self._set_state(ExtraNodeState.IDLE)
        product.total_waiting_time += transit
        return product


class TrackGuidedVehicle(ExtraNode):
    """Track-guided vehicle (EHB/EMS) — follows fixed rail tracks."""

    def __init__(self, data: Dict[str, Any], env: simpy.Environment,
                 sim: "Simulation"):
        super().__init__(data.get("id", ""), data.get("name", "Track Vehicle"),
                         "trackguidedvehicle", env, sim)
        self.count: int = max(1, int(data.get("count", 3)))
        self.speed: float = data.get("speed", 1.5)
        self.track_length: float = data.get("trackLength", 50)
        self._fleet = simpy.Resource(env, capacity=self.count)
        self.total_wait = 0.0

    def process(self, product: "Product"):
        self.items_entered += 1
        wait_start = self.env.now
        req = self._fleet.request()
        yield req
        self.total_wait += self.env.now - wait_start
        self._set_state(ExtraNodeState.PROCESSING)
        transit = self.track_length / self.speed if self.speed > 0 else 0
        yield self.env.timeout(transit)
        self._fleet.release(req)
        self.items_processed += 1
        self._set_state(ExtraNodeState.IDLE)
        product.total_waiting_time += transit
        return product

    def get_statistics(self) -> Dict[str, Any]:
        stats = super().get_statistics()
        stats["fleet_size"] = self.count
        stats["total_wait"] = round(self.total_wait, 2)
        return stats


class Crossover(ExtraNode):
    """Crossover/transfer — transfers items between parallel conveyor lines."""

    def __init__(self, data: Dict[str, Any], env: simpy.Environment,
                 sim: "Simulation"):
        super().__init__(data.get("id", ""), data.get("name", "Crossover"),
                         "crossover", env, sim)
        self.transfer_time: float = data.get("transferTime", 4)
        self._resource = simpy.Resource(env, capacity=1)

    def process(self, product: "Product"):
        self.items_entered += 1
        req = self._resource.request()
        yield req
        self._set_state(ExtraNodeState.PROCESSING)
        yield self.env.timeout(self.transfer_time)
        self._resource.release(req)
        self.items_processed += 1
        self._set_state(ExtraNodeState.IDLE)
        product.total_waiting_time += self.transfer_time
        return product


class PickStation(ExtraNode):
    """Pick-to-light / pick-by-voice station for manual picking operations."""

    def __init__(self, data: Dict[str, Any], env: simpy.Environment,
                 sim: "Simulation"):
        super().__init__(data.get("id", ""), data.get("name", "Pick Station"),
                         "pickstation", env, sim)
        self.pick_time: float = data.get("pickTime", 15)
        self.error_rate: float = data.get("errorRate", 0) / 100.0
        self.pickers: int = max(1, int(data.get("pickers", 1)))
        self._resource = simpy.Resource(env, capacity=self.pickers)
        self.pick_errors = 0

    def process(self, product: "Product"):
        self.items_entered += 1
        req = self._resource.request()
        yield req
        self._set_state(ExtraNodeState.PROCESSING)
        yield self.env.timeout(self.pick_time)
        if self.sim.rng.random() < self.error_rate:
            self.pick_errors += 1
        self._resource.release(req)
        self.items_processed += 1
        self._set_state(ExtraNodeState.IDLE)
        product.total_waiting_time += self.pick_time
        return product

    def get_statistics(self) -> Dict[str, Any]:
        stats = super().get_statistics()
        stats["pickers"] = self.pickers
        stats["pick_errors"] = self.pick_errors
        return stats


class Weighing(ExtraNode):
    """Weighing/measurement station — adds a measurement delay."""

    def __init__(self, data: Dict[str, Any], env: simpy.Environment,
                 sim: "Simulation"):
        super().__init__(data.get("id", ""), data.get("name", "Weighing"),
                         "weighing", env, sim)
        self.measure_time: float = data.get("measureTime", 5)

    def process(self, product: "Product"):
        self.items_entered += 1
        self._set_state(ExtraNodeState.PROCESSING)
        yield self.env.timeout(self.measure_time)
        self.items_processed += 1
        self._set_state(ExtraNodeState.IDLE)
        product.total_waiting_time += self.measure_time
        return product


class Labeler(ExtraNode):
    """Labeling station — applies labels with configurable time."""

    def __init__(self, data: Dict[str, Any], env: simpy.Environment,
                 sim: "Simulation"):
        super().__init__(data.get("id", ""), data.get("name", "Labeler"),
                         "labeler", env, sim)
        self.label_time: float = data.get("labelTime", 3)

    def process(self, product: "Product"):
        self.items_entered += 1
        self._set_state(ExtraNodeState.PROCESSING)
        yield self.env.timeout(self.label_time)
        self.items_processed += 1
        self._set_state(ExtraNodeState.IDLE)
        product.total_waiting_time += self.label_time
        return product
