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
        }

        constructor = _constructors.get(node_type)
        if constructor:
            return constructor(data, env, sim)
        return None  # source, sink, operator -- not simulation nodes


# ═════════════════════════════════════════════════════════════════
#  Pipe Nodes
# ═════════════════════════════════════════════════════════════════

class Conveyor(ExtraNode):
    """Adds transport delay based on length / speed."""

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
        # WIP tracking for conveyors (mirrors Buffer.wip_history)
        self._items_on_conveyor: int = 0
        self.wip_history: list = []
        self._total_item_time: float = 0.0  # sum of (items × time) for avg WIP

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
        duration = self.env.now if self.env.now > 0 else 1
        stats["average_wip"] = self._total_item_time / duration
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
