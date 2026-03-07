"""
Simulation - Main simulation runner using SimPy.

Orchestrates the discrete event simulation of the factory model.
Supports multiple replications with confidence intervals, event streaming,
and trace mode for model validation.
"""

from typing import Dict, Any, Optional, List, Callable
from dataclasses import dataclass
import simpy
import numpy as np
import json
import time
import copy
from datetime import datetime
from scipy import stats as scipy_stats

from factorysim.engine.station import Station, StationState
from factorysim.engine.buffer import Buffer
from factorysim.engine.resource import Resource
from factorysim.engine.product import Product, ProductType, ProductState
from factorysim.engine.distributions import Distribution
from factorysim.engine.extra_nodes import ExtraNode, Source, Sink


@dataclass
class SimulationConfig:
    """Configuration for a simulation run."""
    duration: float  # Simulation duration in seconds
    warmup_period: float = 0.0  # Warmup period to discard
    seed: Optional[int] = None  # Random seed for reproducibility
    replications: int = 1  # Number of replications
    real_time_factor: Optional[float] = None  # For visualization sync
    trace_mode: bool = False  # Enable detailed entity tracing
    confidence_level: float = 0.95  # Confidence level for CI calculation
    stream_events: bool = False  # Stream events in real-time for animation
    start_day_of_week: int = 0  # 0=Monday, 6=Sunday
    start_hour: float = 0.0  # Hour of day simulation starts (0.0-23.99)


class Simulation:
    """
    Main simulation orchestrator.

    Features:
    - Complete factory model management
    - SimPy-based discrete event simulation
    - Event logging and KPI calculation
    - Progress reporting for UI integration
    - Multiple replications with confidence intervals
    - Trace mode for entity-level debugging
    - Real-time event streaming for animation
    """

    def __init__(self, model: Dict[str, Any], config: Optional[SimulationConfig] = None):
        self.model = model
        self.config = config or SimulationConfig(duration=3600 * 8)

        # Initialize random generator
        self.rng = np.random.default_rng(self.config.seed)

        # SimPy environment
        self.env = simpy.Environment()

        # Model components
        self.stations: Dict[str, Station] = {}
        self.buffers: Dict[str, Buffer] = {}
        self.resources: Dict[str, Resource] = {}
        self.product_types: Dict[str, ProductType] = {}
        self.connections: List[Dict[str, Any]] = []

        # Extra nodes
        self.extra_nodes: Dict[str, ExtraNode] = {}
        self._extra_node_chains: Dict[tuple, List[str]] = {}
        self._extra_node_output_chains: Dict[str, List[str]] = {}
        self._chain_buffers: Dict[tuple, List[str]] = {}  # chain key -> buffer IDs traversed
        self._output_chain_buffers: Dict[str, List[str]] = {}  # station -> buffer IDs traversed

        # Source / Sink / Operator wiring
        self.sources: Dict[str, Source] = {}
        self.sinks: Dict[str, Sink] = {}
        self._station_to_sink: Dict[str, str] = {}
        self._station_operators: Dict[str, List[str]] = {}

        # Active products
        self.active_products: Dict[str, Product] = {}
        self.completed_products: List[Product] = []

        # Hourly completion tracking for throughput by_hour
        self.hourly_completions: List[int] = []

        # Event log
        self.event_log: List[Dict[str, Any]] = []

        # Progress callback
        self.progress_callback: Optional[Callable[[float, str], None]] = None

        # Event stream callback (for real-time animation)
        self.event_stream_callback: Optional[Callable[[Dict[str, Any]], None]] = None

        # Run state
        self.run_id: Optional[str] = None
        self.is_running = False
        self.should_stop = False
        self.start_time: Optional[float] = None
        self.end_time: Optional[float] = None

        # WIP time-series sampler (tracks active_products count periodically)
        self._wip_samples: List[Dict[str, Any]] = []

        # Build model
        self._build_model()

    def _build_model(self) -> None:
        """Build simulation components from model definition."""
        for station_data in self.model.get("stations", []):
            station = Station.from_dict(station_data, self.env, self)
            self.stations[station.id] = station

        for buffer_data in self.model.get("buffers", []):
            buffer = Buffer.from_dict(buffer_data, self.env, self)
            self.buffers[buffer.id] = buffer

        for resource_data in self.model.get("resources", []):
            resource = Resource.from_dict(resource_data, self.env, self)
            self.resources[resource.id] = resource

        for product_data in self.model.get("products", []):
            product_type = ProductType.from_dict(product_data, self)
            self.product_types[product_type.id] = product_type

        self.connections = self.model.get("connections", [])

        for entry in self.model.get("extraNodes", []):
            node = ExtraNode.from_dict(entry, self.env, self)
            if node is not None:
                self.extra_nodes[node.id] = node

        # Parse source / sink / operator from extraNodes
        for entry in self.model.get("extraNodes", []):
            node_type = entry.get("type", "")
            data = entry.get("data", {})
            if node_type == "source":
                src = Source(data, self.env, self)
                self.sources[src.id] = src
            elif node_type == "sink":
                snk = Sink(data, self.env, self)
                self.sinks[snk.id] = snk
            elif node_type == "operator":
                resource_data = {
                    "id": data.get("id", ""),
                    "name": data.get("name", "Operator"),
                    "type": "operator",
                    "capacity": data.get("count", 1),
                    "efficiency": data.get("efficiency", 100) / 100.0,
                    "skills": [data["skill"]] if data.get("skill") else None,
                }
                resource = Resource.from_dict(resource_data, self.env, self)
                self.resources[resource.id] = resource

        self._wire_connections()
        self._build_extra_node_chains()
        self._suppress_chain_output_buffers()
        self._build_sink_map()
        self._build_operator_station_map()
        self._ensure_arrival_buffers()
        self._validate_model()
        self._log_model_config()

    def _wire_connections(self) -> None:
        """Wire up input/output connections between stations and buffers.

        Supports merge topology: a station can receive from multiple buffers.
        All connected input buffers are collected in station.input_buffers;
        station.input_buffer is set to the first one for backward compat.

        Detects splitter fan-out: when a buffer connects to a Splitter AND
        directly to the splitter's downstream stations, skip those direct
        buffer→station connections so the splitter controls routing.
        """
        from factorysim.engine.extra_nodes import Splitter

        # Detect buffer→station connections that bypass a splitter
        # Also build ordered output stations for each splitter (for routing redirect)
        skip_pairs = set()  # (buffer_id, station_id)
        for node_id, node in self.extra_nodes.items():
            if isinstance(node, Splitter):
                upstream_bufs = set()
                downstream_stations = set()
                for conn in self.connections:
                    src = conn.get("source") or conn.get("sourceId") or conn.get("source_id")
                    tgt = conn.get("target") or conn.get("targetId") or conn.get("target_id")
                    if tgt == node_id and src in self.buffers:
                        upstream_bufs.add(src)
                    if src == node_id and tgt in self.stations:
                        downstream_stations.add(tgt)
                for b in upstream_bufs:
                    for s in downstream_stations:
                        skip_pairs.add((b, s))
                # Build ordered output stations: splitter→station or splitter→buffer→station
                ordered_targets = []
                for conn in self.connections:
                    src = conn.get("source") or conn.get("sourceId") or conn.get("source_id")
                    tgt = conn.get("target") or conn.get("targetId") or conn.get("target_id")
                    if src == node_id:
                        if tgt in self.stations and tgt not in ordered_targets:
                            ordered_targets.append(tgt)
                        elif tgt in self.buffers:
                            for c2 in self.connections:
                                s2 = c2.get("source") or c2.get("sourceId") or c2.get("source_id")
                                t2 = c2.get("target") or c2.get("targetId") or c2.get("target_id")
                                if s2 == tgt and t2 in self.stations and t2 not in ordered_targets:
                                    ordered_targets.append(t2)
                node._output_stations = ordered_targets

        # First pass: build buffer→downstream station mapping
        buffer_to_downstream: Dict[str, List[str]] = {}
        for conn in self.connections:
            src = conn.get("source") or conn.get("sourceId") or conn.get("source_id")
            tgt = conn.get("target") or conn.get("targetId") or conn.get("target_id")
            if src in self.buffers and tgt in self.stations:
                buffer_to_downstream.setdefault(src, []).append(tgt)

        for conn in self.connections:
            source_id = conn.get("source") or conn.get("sourceId") or conn.get("source_id")
            target_id = conn.get("target") or conn.get("targetId") or conn.get("target_id")

            source = self.stations.get(source_id) or self.buffers.get(source_id)
            target = self.stations.get(target_id) or self.buffers.get(target_id)

            if source and target:
                if isinstance(source, Station) and isinstance(target, Buffer):
                    source.output_buffer = target
                    # Multi-output: map downstream stations to this buffer
                    for downstream_station_id in buffer_to_downstream.get(target_id, []):
                        source.output_buffers[downstream_station_id] = target
                elif isinstance(source, Buffer) and isinstance(target, Station):
                    if (source_id, target_id) not in skip_pairs:
                        if source not in target.input_buffers:
                            target.input_buffers.append(source)

        # Set input_buffer to first connected buffer for backward compat
        for station in self.stations.values():
            if station.input_buffers and station.input_buffer is None:
                station.input_buffer = station.input_buffers[0]

    def _build_extra_node_chains(self) -> None:
        """Build chains of extra nodes between consecutive routing stations.

        Also discovers pre-routing chains: extra nodes upstream of the first
        routing station (e.g., a splitter before the first station).
        """
        if not self.extra_nodes:
            return

        # Build adjacency graph from connections
        graph: Dict[str, List[str]] = {}
        reverse_graph: Dict[str, List[str]] = {}
        for conn in self.connections:
            source = conn.get("source") or conn.get("sourceId") or conn.get("source_id")
            target = conn.get("target") or conn.get("targetId") or conn.get("target_id")
            if source and target:
                graph.setdefault(source, []).append(target)
                reverse_graph.setdefault(target, []).append(source)

        for pt in self.product_types.values():
            for i in range(len(pt.routing)):
                current_station = pt.routing[i]
                next_station = pt.routing[i + 1] if i + 1 < len(pt.routing) else None

                # Chain between consecutive stations
                if next_station:
                    key = (current_station, next_station)
                    if key not in self._extra_node_chains:
                        chain, chain_bufs = self._find_extra_node_chain(graph, current_station, next_station)
                        if chain:
                            self._extra_node_chains[key] = chain
                            if chain_bufs:
                                self._chain_buffers[key] = chain_bufs

                # Output chain after last station
                if next_station is None and current_station not in self._extra_node_output_chains:
                    output_chain, output_bufs = self._find_output_chain(graph, current_station)
                    if output_chain:
                        self._extra_node_output_chains[current_station] = output_chain
                        if output_bufs:
                            self._output_chain_buffers[current_station] = output_bufs

            # Pre-routing chain: extra nodes upstream of the first routing station
            if pt.routing:
                first_station = pt.routing[0]
                key = (None, first_station)
                if key not in self._extra_node_chains:
                    pre_chain, pre_bufs = self._find_pre_routing_chain(reverse_graph, first_station)
                    if pre_chain:
                        self._extra_node_chains[key] = pre_chain
                        if pre_bufs:
                            self._chain_buffers[key] = pre_bufs

    def _find_extra_node_chain(self, graph: Dict[str, List[str]],
                               from_id: str, to_id: str) -> tuple:
        """BFS to find an ordered chain of extra nodes between two stations.

        Seeds BFS with ONLY extra-node neighbors of from_id so that direct
        station→buffer shortcuts never enter the visited set and cannot block
        the extra-node path from being discovered.

        Traverses through both extra nodes AND buffers so that splitters/routers
        sitting between buffers are discovered.  Only extra node IDs are
        included in the returned chain; buffers are traversed but tracked
        separately so their statistics can be updated during product flow.

        Returns (chain, buffer_ids) tuple.
        """
        from collections import deque
        queue = deque()
        visited = {from_id}

        # Seed with ONLY extra-node neighbors (skip direct station→buffer edges)
        for neighbor in graph.get(from_id, []):
            if neighbor in self.extra_nodes and neighbor not in visited:
                visited.add(neighbor)
                queue.append((neighbor, [neighbor], []))

        while queue:
            current, path, bufs = queue.popleft()
            for neighbor in graph.get(current, []):
                if neighbor == to_id:
                    return path, bufs
                if neighbor not in visited:
                    if neighbor in self.extra_nodes:
                        visited.add(neighbor)
                        queue.append((neighbor, path + [neighbor], bufs))
                    elif neighbor in self.buffers:
                        visited.add(neighbor)
                        new_bufs = bufs + [neighbor] if not neighbor.startswith('__arrival_') else bufs
                        queue.append((neighbor, path, new_bufs))
        return [], []

    def _find_output_chain(self, graph: Dict[str, List[str]],
                           from_id: str) -> tuple:
        """Follow connections from a station through extra nodes (for post-routing).

        Traverses through buffers transparently so that extra nodes sitting
        behind a buffer are still discovered.  Tracks traversed buffer IDs.

        Returns (chain, buffer_ids) tuple.
        """
        chain: List[str] = []
        bufs: List[str] = []
        current = from_id
        visited = {from_id}
        while True:
            neighbors = [n for n in graph.get(current, []) if n not in visited]
            extra = [n for n in neighbors if n in self.extra_nodes]
            buffers = [n for n in neighbors if n in self.buffers]
            if len(extra) == 1:
                chain.append(extra[0])
                visited.add(extra[0])
                current = extra[0]
            elif len(extra) == 0 and len(buffers) == 1:
                # Traverse through buffer without adding to chain
                visited.add(buffers[0])
                if not buffers[0].startswith('__arrival_'):
                    bufs.append(buffers[0])
                current = buffers[0]
            else:
                break
        return chain, bufs

    def _find_pre_routing_chain(self, reverse_graph: Dict[str, List[str]],
                                first_station_id: str) -> tuple:
        """Reverse BFS from first_station_id to find extra nodes upstream.

        Discovers chains like: buffer → splitter → station, where the splitter
        is before the first routing station.  Returns (chain, buffer_ids) in
        forward order.
        """
        from collections import deque
        visited = {first_station_id}
        queue = deque()
        found_nodes = []
        found_bufs = []

        # Seed with predecessors of first_station_id that are extra nodes or buffers
        for pred in reverse_graph.get(first_station_id, []):
            if pred not in visited:
                if pred in self.extra_nodes:
                    visited.add(pred)
                    queue.append(pred)
                    found_nodes.append(pred)
                elif pred in self.buffers:
                    visited.add(pred)
                    queue.append(pred)
                    if not pred.startswith('__arrival_'):
                        found_bufs.append(pred)

        while queue:
            current = queue.popleft()
            for pred in reverse_graph.get(current, []):
                if pred not in visited:
                    if pred in self.extra_nodes:
                        visited.add(pred)
                        queue.append(pred)
                        found_nodes.append(pred)
                    elif pred in self.buffers:
                        visited.add(pred)
                        queue.append(pred)
                        if not pred.startswith('__arrival_'):
                            found_bufs.append(pred)

        # Return in forward order (reverse of BFS discovery)
        found_nodes.reverse()
        found_bufs.reverse()
        return found_nodes, found_bufs

    def _suppress_chain_output_buffers(self) -> None:
        """Clear output_buffer for stations that feed into extra-node chains.

        When a chain exists between station A and B, A's worker must NOT
        push to the shared buffer — the chain handles the handoff and
        product_flow deposits into B's input after the chain completes.

        Also suppresses output buffers for stations with output chains
        (e.g., disassembly after the last routing station) to prevent
        orphaned products from accumulating in the buffer.
        """
        for (from_id, to_id) in self._extra_node_chains:
            station = self.stations.get(from_id)
            if station and station.output_buffer:
                station.output_buffer = None

        for station_id in self._extra_node_output_chains:
            station = self.stations.get(station_id)
            if station and station.output_buffer:
                station.output_buffer = None

    # ── Source / Sink / Operator wiring ─────────────────────────────

    def _build_sink_map(self) -> None:
        """Build mapping from last-routing-station → sink ID.

        Follows the connection graph from each routing endpoint through
        extra nodes to find a connected sink.  Also detects buffers that
        sit between the last station and the sink — these need a drain
        process to prevent deadlock (the station worker blocks on put()
        and never fires done_event if no consumer pulls from the buffer).
        """
        self._sink_buffers: set = set()
        if not self.sinks:
            return

        # Build adjacency graph from connections
        graph: Dict[str, List[str]] = {}
        for conn in self.connections:
            source = conn.get("source") or conn.get("sourceId") or conn.get("source_id")
            target = conn.get("target") or conn.get("targetId") or conn.get("target_id")
            if source and target:
                graph.setdefault(source, []).append(target)

        sink_ids = set(self.sinks.keys())

        # Detect buffers directly connected to sinks (buffer → sink)
        for conn in self.connections:
            source = conn.get("source") or conn.get("sourceId") or conn.get("source_id")
            target = conn.get("target") or conn.get("targetId") or conn.get("target_id")
            if source in self.buffers and target in sink_ids:
                self._sink_buffers.add(source)

        # For every last station in every product routing, BFS to find a sink.
        # Include ALL stations that could be routing endpoints:
        # - Normal product type routings
        # - Disassembly output product types (spawned with their own routing)
        # - Any station connected upstream of a sink (fallback)
        last_stations: set = set()
        for pt in self.product_types.values():
            if pt.routing:
                last_stations.add(pt.routing[-1])
                # Also map every station in the routing — depalletize creates
                # partial routings where any mid-routing station could become
                # the last station for a spawned product.
                for sid in pt.routing:
                    if sid in self.stations:
                        last_stations.add(sid)

        for station_id in last_stations:
            # BFS from station through extra nodes / direct connections to sink
            from collections import deque
            queue = deque([station_id])
            visited = {station_id}
            while queue:
                current = queue.popleft()
                for neighbor in graph.get(current, []):
                    if neighbor in sink_ids:
                        self._station_to_sink[station_id] = neighbor
                        break
                    if neighbor not in visited and (neighbor in self.extra_nodes or neighbor in self.buffers):
                        visited.add(neighbor)
                        queue.append(neighbor)
                if station_id in self._station_to_sink:
                    break

    def _find_sink_for_station(self, station_id: str) -> Optional[str]:
        """Runtime BFS fallback: find a sink reachable from *station_id*.

        Caches the result in ``_station_to_sink`` so subsequent lookups are
        O(1).  Returns ``None`` if no sink is reachable.
        """
        from collections import deque

        # Build adjacency on-the-fly (connections don't change during a run)
        if not hasattr(self, '_conn_graph'):
            self._conn_graph: Dict[str, List[str]] = {}
            for conn in self.connections:
                src = conn.get("source") or conn.get("sourceId") or conn.get("source_id")
                tgt = conn.get("target") or conn.get("targetId") or conn.get("target_id")
                if src and tgt:
                    self._conn_graph.setdefault(src, []).append(tgt)

        sink_ids = set(self.sinks.keys())
        queue = deque([station_id])
        visited = {station_id}
        while queue:
            current = queue.popleft()
            for neighbor in self._conn_graph.get(current, []):
                if neighbor in sink_ids:
                    self._station_to_sink[station_id] = neighbor
                    return neighbor
                if neighbor not in visited and (
                    neighbor in self.extra_nodes or neighbor in self.buffers
                ):
                    visited.add(neighbor)
                    queue.append(neighbor)
        # No sink found — cache None-result to avoid re-BFS
        self._station_to_sink[station_id] = None  # type: ignore[assignment]
        return None

    def _sink_buffer_drain(self, buffer: "Buffer"):
        """Drain a buffer connected to a sink.

        When the last station's output buffer connects to a sink, nothing
        consumes from the buffer — the station worker pushes products in
        but no downstream worker pulls them out.  Without this drain,
        the buffer fills up, the station worker blocks on put(), done_event
        never fires, and product_flow deadlocks.

        Products pulled here have already been completed by product_flow
        (done_event fires after put, and product_flow records completion).
        We just need to remove them from the buffer to free space.
        """
        while True:
            yield buffer.get()

    def _build_operator_station_map(self) -> None:
        """Build mapping from station_id → list of resource IDs for operator connections."""
        if not self.resources:
            return

        # Operator IDs parsed from extraNodes (type=operator)
        operator_ids = set()
        for entry in self.model.get("extraNodes", []):
            if entry.get("type") == "operator":
                data = entry.get("data", {})
                operator_ids.add(data.get("id", ""))

        if not operator_ids:
            return

        station_ids = set(self.stations.keys())

        for conn in self.connections:
            source = conn.get("source") or conn.get("sourceId") or conn.get("source_id")
            target = conn.get("target") or conn.get("targetId") or conn.get("target_id")
            if source in operator_ids and target in station_ids:
                self._station_operators.setdefault(target, []).append(source)
            elif target in operator_ids and source in station_ids:
                self._station_operators.setdefault(source, []).append(target)

    def _any_station_in_shift(self) -> bool:
        """Check if at least one station with shifts is currently in-shift.

        If no stations have shifts configured, returns True (24/7 operation).
        """
        stations_with_shifts = [s for s in self.stations.values() if s.shifts]
        if not stations_with_shifts:
            return True  # No shift constraints
        return any(s.is_in_shift() for s in stations_with_shifts)

    def _source_arrival_process(self, source: "Source"):
        """SimPy process for source-driven arrivals.

        feedMode='interval' → constant deterministic inter-arrival time.
        feedMode='orders'   → treated as interval (with logged warning).
        Pauses when all downstream stations are off-shift to prevent
        unrealistic WIP buildup.
        Applies backpressure: waits when downstream input buffers are full.
        """
        # Build a forward adjacency from connections (used for auto-detect and
        # for finding explicit buffers connected to this source).
        fwd: dict = {}
        for conn in self.connections:
            src_id = conn.get("source") or conn.get("sourceId") or conn.get("source_id")
            tgt_id = conn.get("target") or conn.get("targetId") or conn.get("target_id")
            fwd.setdefault(src_id, []).append(tgt_id)

        # Determine target product types
        if source.product_filter and source.product_filter in self.product_types:
            target_types = [self.product_types[source.product_filter]]
        else:
            # Auto-detect: follow connections from source through buffers and
            # extra nodes (splitters) to find the downstream stations.
            connected_stations: set = set()
            # BFS from source to find reachable stations (through buffers/extra nodes)
            from collections import deque
            queue: deque = deque(fwd.get(source.id, []))
            visited = {source.id}
            while queue:
                nid = queue.popleft()
                if nid in visited:
                    continue
                visited.add(nid)
                if nid in self.stations:
                    connected_stations.add(nid)
                    # Don't traverse further past stations
                elif nid in self.buffers or nid in self.extra_nodes:
                    for tgt in fwd.get(nid, []):
                        if tgt not in visited:
                            queue.append(tgt)

            if connected_stations:
                filtered = [pt for pt in self.product_types.values()
                            if pt.routing and pt.routing[0] in connected_stations]
                target_types = filtered if filtered else list(self.product_types.values())
            else:
                target_types = list(self.product_types.values())

        if not target_types:
            return

        # Collect downstream first stations and input buffers for backpressure
        downstream_buffers = []
        downstream_shifted_stations = []  # only stations with shifts defined
        for pt in target_types:
            if pt.routing:
                first_station = self.stations.get(pt.routing[0])
                if first_station:
                    if first_station.input_buffer:
                        downstream_buffers.append(first_station.input_buffer)
                    if first_station.shifts:
                        downstream_shifted_stations.append(first_station)
        # Deduplicate buffers
        seen = set()
        unique_buffers = []
        for buf in downstream_buffers:
            if buf.id not in seen:
                seen.add(buf.id)
                unique_buffers.append(buf)
        downstream_buffers = unique_buffers
        # Deduplicate shifted stations
        seen_st = set()
        unique_shifted = []
        for st in downstream_shifted_stations:
            if st.id not in seen_st:
                seen_st.add(st.id)
                unique_shifted.append(st)
        downstream_shifted_stations = unique_shifted

        # Find explicit buffers directly connected to the source so we can
        # track product transit through them (prevents "orphaned buffer" stats).
        source_exit_buffers = []
        for bid in fwd.get(source.id, []):
            if bid in self.buffers and not bid.startswith('__arrival_'):
                source_exit_buffers.append(self.buffers[bid])

        inter_arrival_time = source.arrival_rate  # constant deterministic
        type_index = 0
        batch_counter = 0
        product_batch_size = source.product_batch_size

        while True:
            # Wait for inter-arrival time
            yield self.env.timeout(inter_arrival_time)

            if self.should_stop:
                break

            # Pause source only when its OWN downstream shifted stations
            # are all off-shift.  Sources whose downstream stations have no
            # shifts at all run 24/7 (never paused).
            if downstream_shifted_stations and not any(
                    s.is_in_shift() for s in downstream_shifted_stations):
                while not any(s.is_in_shift() for s in downstream_shifted_stations):
                    yield self.env.timeout(60)  # Poll every 60s

            # Backpressure: wait while ALL downstream buffers are full
            if downstream_buffers and all(buf.is_full() for buf in downstream_buffers):
                while all(buf.is_full() for buf in downstream_buffers):
                    yield self.env.timeout(1.0)  # Poll every 1s

            # Round-robin across target product types with batch support
            pt = target_types[type_index % len(target_types)]
            batch_counter += 1
            if batch_counter >= product_batch_size:
                batch_counter = 0
                type_index += 1

            product = pt.create_product()

            source.total_generated += 1
            source.generation_by_product_type[pt.id] = (
                source.generation_by_product_type.get(pt.id, 0) + 1
            )

            self.log_event("source_generate", source.id, {
                "product_id": product.id,
                "product_type": pt.id,
                "source": source.name,
            })

            # Record transit through explicit buffers between source and
            # downstream extra nodes (e.g. source → buffer → splitter).
            # This ensures the buffer's statistics reflect actual product flow.
            for buf in source_exit_buffers:
                buf.total_items_entered += 1

            self.env.process(self._product_flow_process(product))

    def _acquire_operators(self, station_id: str, product: "Product"):
        """Acquire all operators wired to a station.

        Returns list of (resource, request, acquire_time) triples.
        acquire_time is stored per-request so multi-capacity resources
        track busy time correctly (no overwrite of a shared _busy_since).
        """
        op_ids = self._station_operators.get(station_id, [])
        if not op_ids:
            return []

        requests = []
        min_efficiency = 1.0
        for op_id in op_ids:
            resource = self.resources.get(op_id)
            if resource:
                req = resource.request()
                yield req
                acquire_time = self.env.now
                requests.append((resource, req, acquire_time))
                if resource.efficiency < min_efficiency:
                    min_efficiency = resource.efficiency

        if min_efficiency < 1.0:
            product.set_attribute("_operator_efficiency", min_efficiency)

        return requests

    def _release_operators(self, operator_requests):
        """Release all acquired operator requests."""
        for resource, req, acquire_time in operator_requests:
            resource.total_busy_time += self.env.now - acquire_time
            resource.release(req)

    def _resolve_output_buffer(self, station: Station, product: "Product") -> Optional["Buffer"]:
        """Select the correct output buffer for a product leaving a station.

        If the station has multiple output buffers (multi-output routing),
        pick the one that leads to the product's next station in its routing.
        Falls back to station.output_buffer for single-output stations.
        """
        if len(station.output_buffers) > 1:
            # Look ahead: the product's routing index still points at the
            # current station, so the *next* station is index + 1.
            next_idx = product.current_routing_index + 1
            if next_idx < len(product.routing):
                next_station_id = product.routing[next_idx]
                if next_station_id in station.output_buffers:
                    return station.output_buffers[next_station_id]
        return station.output_buffer

    # ── Validation & config logging ────────────────────────────────

    def _validate_model(self) -> List[Dict[str, Any]]:
        """Check model for configuration issues and log them as events.

        Returns the list of issues found (each is a dict with severity,
        code, and message).  Issues are also written to the event log so
        they appear in the simulation output.
        """
        issues: List[Dict[str, Any]] = []

        def _warn(code: str, msg: str) -> None:
            issues.append({"severity": "warning", "code": code, "message": msg})

        def _error(code: str, msg: str) -> None:
            issues.append({"severity": "error", "code": code, "message": msg})

        def _info(code: str, msg: str) -> None:
            issues.append({"severity": "info", "code": code, "message": msg})

        # ── stations ───────────────────────────────────────────────
        # Build set of station IDs that appear in explicit connections
        connected_stations = set()
        for conn in self.connections:
            src = conn.get("source") or conn.get("sourceId") or conn.get("source_id")
            tgt = conn.get("target") or conn.get("targetId") or conn.get("target_id")
            if src in self.stations:
                connected_stations.add(src)
            if tgt in self.stations:
                connected_stations.add(tgt)

        for sid, st in self.stations.items():
            if st.scrap_rate < 0 or st.scrap_rate > 1:
                _error("STATION_SCRAP_RANGE", f"Station '{st.name}' scrap rate {st.scrap_rate} outside [0,1]")
            if st.mtbf is not None and st.mttr is None:
                _warn("STATION_MTBF_NO_MTTR", f"Station '{st.name}' has MTBF but no MTTR — failures will never be repaired")
            if sid not in connected_stations:
                in_routing = any(sid in pt.routing for pt in self.product_types.values())
                if not in_routing:
                    _warn("STATION_ORPHAN", f"Station '{st.name}' has no connections and is not in any routing")

        # ── buffers ────────────────────────────────────────────────
        connected_buffers = set()
        for conn in self.connections:
            src = conn.get("source") or conn.get("sourceId") or conn.get("source_id")
            tgt = conn.get("target") or conn.get("targetId") or conn.get("target_id")
            if src in self.buffers:
                connected_buffers.add(src)
            if tgt in self.buffers:
                connected_buffers.add(tgt)
        for bid, buf in self.buffers.items():
            if not bid.startswith("__arrival_") and bid not in connected_buffers:
                _warn("BUFFER_ORPHAN", f"Buffer '{buf.name}' ({bid}) has no connections")
            if buf.capacity <= 0:
                _error("BUFFER_CAPACITY", f"Buffer '{buf.name}' has non-positive capacity {buf.capacity}")

        # ── products ───────────────────────────────────────────────
        for pid, pt in self.product_types.items():
            if not pt.routing:
                _warn("PRODUCT_NO_ROUTING", f"Product '{pt.name}' has an empty routing")
            for i, station_id in enumerate(pt.routing):
                if station_id not in self.stations:
                    _error("PRODUCT_BAD_STATION",
                           f"Product '{pt.name}' routing[{i}] references "
                           f"unknown station '{station_id}'")
            if pt.arrival_rate is not None and pt.arrival_rate <= 0:
                _error("PRODUCT_ARRIVAL_RATE",
                       f"Product '{pt.name}' has non-positive arrival rate {pt.arrival_rate}")

        # ── extra nodes ────────────────────────────────────────────
        active_en = set()
        for chain in self._extra_node_chains.values():
            active_en.update(chain)
        for chain in self._extra_node_output_chains.values():
            active_en.update(chain)
        for nid, node in self.extra_nodes.items():
            if nid not in active_en:
                _warn("EXTRA_NODE_ORPHAN",
                      f"Extra node '{node.name}' ({node.node_type}) is not in any "
                      f"connection chain — it won't participate in simulation")
            # type-specific checks
            if node.node_type == "conveyor":
                if getattr(node, 'speed', 0) <= 0:
                    _error("CONVEYOR_SPEED", f"Conveyor '{node.name}' has non-positive speed")
            if node.node_type == "inspection":
                dr = getattr(node, 'defect_rate', 0)
                if dr < 0 or dr > 1:
                    _error("INSPECTION_DEFECT_RANGE",
                           f"Inspection '{node.name}' defect rate "
                           f"{dr*100:.1f}% outside [0%,100%]")

        # ── chain connectivity ─────────────────────────────────────
        for pt in self.product_types.values():
            for i in range(len(pt.routing) - 1):
                a, b = pt.routing[i], pt.routing[i + 1]
                sa = self.stations.get(a)
                sb = self.stations.get(b)
                has_buffer = sa and sa.output_buffer and sb and sb.input_buffer
                has_chain = (a, b) in self._extra_node_chains
                if not has_buffer and not has_chain and sa and sb:
                    _info("NO_LINK",
                          f"Product '{pt.name}': no buffer or extra-node chain "
                          f"between '{sa.name}' → '{sb.name}' (direct processing)")

        # ── sources ───────────────────────────────────────────────
        for sid, src in self.sources.items():
            if src.arrival_rate is not None and src.arrival_rate <= 0:
                _error("SOURCE_ARRIVAL_RATE",
                       f"Source '{src.name}' has non-positive arrival rate {src.arrival_rate}")
            if src.product_filter and src.product_filter not in self.product_types:
                _warn("SOURCE_BAD_FILTER",
                      f"Source '{src.name}' productFilter '{src.product_filter}' "
                      f"references unknown product type")
            # feedMode='orders' uses interval-based generation with due_date
            # tracking on products — delivery metrics computed from due_dates

        # ── sinks ─────────────────────────────────────────────────
        reachable_sinks = set(self._station_to_sink.values())
        for sid, snk in self.sinks.items():
            if sid not in reachable_sinks:
                _warn("SINK_UNREACHABLE",
                      f"Sink '{snk.name}' is not reachable from any routing endpoint")

        # ── operators (from extraNodes) ───────────────────────────
        connected_operators = set()
        for ops in self._station_operators.values():
            connected_operators.update(ops)
        for entry in self.model.get("extraNodes", []):
            if entry.get("type") == "operator":
                data = entry.get("data", {})
                op_id = data.get("id", "")
                eff = data.get("efficiency", 100) / 100.0
                if eff <= 0:
                    _error("OPERATOR_EFFICIENCY",
                           f"Operator '{data.get('name', op_id)}' has non-positive efficiency {eff}")
                if op_id not in connected_operators:
                    _warn("OPERATOR_ORPHAN",
                          f"Operator '{data.get('name', op_id)}' is not connected to any station")

        # Log all issues as events
        for issue in issues:
            self.log_event("validation_" + issue["severity"], "model", issue)

        self._validation_issues = issues
        return issues

    def validate(self) -> Dict[str, Any]:
        """Public method returning a structured model health report."""
        issues = getattr(self, '_validation_issues', None)
        if issues is None:
            issues = self._validate_model()
        errors = [i for i in issues if i["severity"] == "error"]
        warnings = [i for i in issues if i["severity"] == "warning"]
        infos = [i for i in issues if i["severity"] == "info"]
        return {
            "valid": len(errors) == 0,
            "error_count": len(errors),
            "warning_count": len(warnings),
            "info_count": len(infos),
            "issues": issues,
            "summary": {
                "stations": len(self.stations),
                "buffers": len([b for b in self.buffers if not b.startswith("__arrival_")]),
                "implicit_buffers": len([b for b in self.buffers if b.startswith("__arrival_")]),
                "products": len(self.product_types),
                "extra_nodes": len(self.extra_nodes),
                "extra_node_chains": len(self._extra_node_chains),
                "output_chains": len(self._extra_node_output_chains),
                "connections": len(self.connections),
                "sources": len(self.sources),
                "sinks": len(self.sinks),
                "operators": len([r for r in self.resources.values()
                                  if r.resource_type.value == "operator"]),
            },
        }

    def _log_model_config(self) -> None:
        """Emit a structured event echoing every configured parameter.

        This lets the user verify that the engine received exactly what
        the UI sent — every station's cycle time, every buffer's capacity,
        every extra node's parameters, and the discovered chains.
        """
        station_configs = {}
        for sid, st in self.stations.items():
            station_configs[sid] = {
                "name": st.name,
                "cycle_time": st.cycle_time_dist.to_dict(),
                "scrap_rate": st.scrap_rate,
                "batch_size": st.batch_size,
                "mtbf": st.mtbf,
                "mttr": st.mttr,
                "has_setup_time": st.setup_time_dist is not None,
                "setup_time": st.setup_time_dist.to_dict() if st.setup_time_dist else None,
                "product_cycle_times": {
                    pid: d.to_dict()
                    for pid, d in st.product_cycle_time_dists.items()
                } if st.product_cycle_time_dists else {},
                "shifts": st.shifts if st.shifts else None,
                "input_buffer": st.input_buffer.id if st.input_buffer else None,
                "input_buffers": [b.id for b in st.input_buffers] if len(st.input_buffers) > 1 else None,
                "output_buffer": st.output_buffer.id if st.output_buffer else None,
            }

        buffer_configs = {}
        for bid, buf in self.buffers.items():
            buffer_configs[bid] = {
                "name": buf.name,
                "capacity": buf.capacity,
                "queue_rule": buf.queue_rule.value,
                "is_implicit": bid.startswith("__arrival_"),
            }

        product_configs = {}
        for pid, pt in self.product_types.items():
            product_configs[pid] = {
                "name": pt.name,
                "routing": pt.routing,
                "arrival_rate": pt.arrival_rate,
                "priority": pt.priority,
            }

        extra_node_configs = {}
        for nid, node in self.extra_nodes.items():
            cfg: Dict[str, Any] = {
                "name": node.name,
                "type": node.node_type,
            }
            # echo type-specific parameters
            if node.node_type == "conveyor":
                cfg.update({"length": node.length, "speed": node.speed,
                            "capacity": node.capacity, "transit_time": node.transit_time})
            elif node.node_type == "inspection":
                cfg.update({"inspection_time": node.inspection_time,
                            "defect_rate_pct": node.defect_rate * 100,
                            "inspection_type": node.inspection_type})
            elif node.node_type == "assembly":
                cfg.update({"cycle_time": node.cycle_time,
                            "input_parts": node.input_parts,
                            "input_parts_by_product": node.input_parts_by_product})
            elif node.node_type == "disassembly":
                cfg.update({"cycle_time": node.cycle_time,
                            "output_parts": node.output_parts})
            elif node.node_type == "splitter":
                cfg.update({"outputs": node.outputs, "split_type": node.split_type,
                            "product_routing": node.product_routing,
                            "percentages": node.percentages})
            elif node.node_type == "merge":
                cfg.update({"inputs": node.inputs, "merge_type": node.merge_type})
            elif node.node_type == "palletize":
                cfg.update({"default_pallet_size": node.default_pallet_size,
                            "cycle_time": node.cycle_time,
                            "pallet_size_by_product": node.pallet_size_by_product})
            elif node.node_type == "depalletize":
                cfg.update({"cycle_time": node.cycle_time})
            elif node.node_type == "matchbuffer":
                cfg.update({"capacity": node.capacity, "match_key": node.match_key,
                            "required_parts": node.required_parts,
                            "timeout": node.timeout_duration})
            extra_node_configs[nid] = cfg

        chain_info = {
            "between_stations": {
                f"{a}->{b}": node_ids
                for (a, b), node_ids in self._extra_node_chains.items()
            },
            "output_chains": {
                station_id: node_ids
                for station_id, node_ids in self._extra_node_output_chains.items()
            },
        }

        # Source / Sink / Operator configs
        source_configs = {
            sid: {
                "name": s.name,
                "arrival_rate": s.arrival_rate,
                "feed_mode": s.feed_mode,
                "product_filter": s.product_filter,
            }
            for sid, s in self.sources.items()
        }
        sink_configs = {
            sid: {"name": s.name}
            for sid, s in self.sinks.items()
        }
        operator_configs = {}
        for rid, r in self.resources.items():
            if r.resource_type.value == "operator":
                operator_configs[rid] = {
                    "name": r.name,
                    "capacity": r.capacity,
                    "efficiency": r.efficiency,
                    "skills": list(r.skills) if r.skills else [],
                }

        self.log_event("model_config", "system", {
            "config": {
                "duration": self.config.duration,
                "warmup_period": self.config.warmup_period,
                "seed": self.config.seed,
                "replications": self.config.replications,
                "trace_mode": self.config.trace_mode,
                "confidence_level": self.config.confidence_level,
                "stream_events": self.config.stream_events,
                "start_day_of_week": self.config.start_day_of_week,
                "start_hour": self.config.start_hour,
            },
            "stations": station_configs,
            "buffers": buffer_configs,
            "products": product_configs,
            "extra_nodes": extra_node_configs,
            "chains": chain_info,
            "sources": source_configs,
            "sinks": sink_configs,
            "operators": operator_configs,
            "operator_station_map": {
                sid: ops for sid, ops in self._station_operators.items()
            },
            "validation": {
                "issues": getattr(self, '_validation_issues', []),
            },
        })

    def _ensure_arrival_buffers(self) -> None:
        """Create implicit input buffers for ALL stations that lack one.

        Without an explicit buffer the station has no worker process, so it
        processes products directly via _product_flow_process.  This means:
          - wait time in the invisible SimPy resource queue is untracked
          - the station never enters STARVED state (shows IDLE instead)

        By adding a bounded implicit buffer every station gets a proper
        worker that tracks starvation and queue waiting time consistently,
        whether the station is fed by an explicit buffer, a conveyor, or
        is the first in a product routing.  The capacity matches the
        station's downstream output buffer to enable backpressure.
        """
        # Pre-compute: station -> its output buffer's capacity
        downstream_cap = {}
        for conn in self.connections:
            src = conn.get("source") or conn.get("sourceId") or conn.get("source_id")
            tgt = conn.get("target") or conn.get("targetId") or conn.get("target_id")
            if src in self.stations and tgt in self.buffers:
                downstream_cap[src] = self.buffers[tgt].capacity

        for station_id, station in self.stations.items():
            if not station.input_buffers:
                cap = downstream_cap.get(station_id, 1)
                implicit_buf = Buffer.from_dict({
                    "id": f"__arrival_{station_id}",
                    "name": f"Arrival Queue ({station.name})",
                    "capacity": cap,
                    "queueRule": "FIFO",
                }, self.env, self)
                self.buffers[implicit_buf.id] = implicit_buf
                station.input_buffers.append(implicit_buf)
                station.input_buffer = implicit_buf

    def log_event(self, event_type: str, entity_id: str, details: Dict[str, Any]) -> None:
        """Log a simulation event."""
        event = {
            "time": self.env.now,
            "type": event_type,
            "entityId": entity_id,
            "entity_id": entity_id,
            "details": details,
        }
        self.event_log.append(event)

        # Stream event in real-time if enabled
        if self.config.stream_events and self.event_stream_callback:
            self.event_stream_callback(event)

    def _station_worker(self, station: Station):
        """
        Station-consumer process: pulls products from input buffer, processes
        them, and pushes to output buffer.  This is the correct way to model
        a station that is fed by a buffer — the station drives the pull.

        Supports merge topology: when a station has multiple input buffers,
        the worker round-robin polls all of them.
        """
        # Merge state: round-robin index across input buffers
        merge_buf_idx = 0

        while True:
            # ── Starved: wait for a product in the input buffer(s) ──
            wait_start = self.env.now
            was_starved = False

            if len(station.input_buffers) > 1:
                # ── Multi-buffer merge: round-robin poll ──
                product = None
                source_buffer = None
                if all(buf.is_empty() for buf in station.input_buffers):
                    station._log_state_change(StationState.STARVED)
                    was_starved = True

                while product is None:
                    for i in range(len(station.input_buffers)):
                        idx = (merge_buf_idx + i) % len(station.input_buffers)
                        buf = station.input_buffers[idx]
                        if not buf.is_empty():
                            product = yield buf.get()
                            source_buffer = buf
                            merge_buf_idx = (idx + 1) % len(station.input_buffers)
                            break
                    if product is None:
                        yield self.env.timeout(1.0)  # Poll every 1s when all empty

                self.log_event("product_exiting_buffer", product.id, {
                    "buffer": source_buffer.id,
                    "station": station.id,
                })

                if station.state == StationState.STARVED:
                    station._log_state_change(StationState.IDLE)
                    was_starved = True
            else:
                # ── Single buffer (original behavior) ──
                if station.input_buffer.is_empty():
                    station._log_state_change(StationState.STARVED)
                    was_starved = True

                product = yield station.input_buffer.get()

                self.log_event("product_exiting_buffer", product.id, {
                    "buffer": station.input_buffer.id,
                    "station": station.id,
                })

                if station.state == StationState.STARVED:
                    station._log_state_change(StationState.IDLE)
                    was_starved = True

            # ── Reclassify off-shift time that was counted as starvation ──
            if was_starved and station.shifts:
                off_shift_during_wait = station.calc_off_shift_time(wait_start, self.env.now)
                if off_shift_during_wait > 0:
                    station.total_starved_time -= off_shift_during_wait
                    station.total_off_shift_time += off_shift_during_wait

            # ── Batch accumulation ──
            batch = [product]
            if station.batch_size > 1:
                station._log_state_change(StationState.BATCH_WAIT)
                station.batch_queue_count = 1
                station._record_batch_queue_wip(1)
                while len(batch) < station.batch_size:
                    if len(station.input_buffers) > 1:
                        next_item = None
                        while next_item is None:
                            for i in range(len(station.input_buffers)):
                                idx = (merge_buf_idx + i) % len(station.input_buffers)
                                buf = station.input_buffers[idx]
                                if not buf.is_empty():
                                    next_item = yield buf.get()
                                    merge_buf_idx = (idx + 1) % len(station.input_buffers)
                                    break
                            if next_item is None:
                                yield self.env.timeout(1.0)
                        batch.append(next_item)
                    else:
                        next_item = yield station.input_buffer.get()
                        batch.append(next_item)
                    station.batch_queue_count = len(batch)
                    station._record_batch_queue_wip(len(batch))
                station.batch_queue_count = 0
                station._record_batch_queue_wip(0)
                station._log_state_change(StationState.IDLE)

            # ── Acquire operators ──
            op_requests = yield self.env.process(self._acquire_operators(station.id, product))

            # ── Process (op_requests passed so operators can be released during failure) ──
            product.state = ProductState.IN_PROCESS
            product._log_trace("entering_station", {"station": station.id})
            yield station.process(product, op_requests=op_requests)

            # ── Release operators ──
            self._release_operators(op_requests)

            # Get the cycle time that was used for processing (from the product's record)
            batch_cycle_time = product.station_times.get(station.id, 0.0)

            # ── Handle scrap for the entire batch ──
            if product.is_scrap:
                # Batch-level scrap: all items in batch are scrapped
                for bp in batch[1:]:
                    bp.is_scrap = True
                    station.items_scrapped += 1
                    bp.record_station_time(station.id, batch_cycle_time)
                    if hasattr(bp, '_station_done_event') and not bp._station_done_event.triggered:
                        bp._station_done_event.succeed()
                if hasattr(product, '_station_done_event') and not product._station_done_event.triggered:
                    product._station_done_event.succeed()
                continue

            # ── Record remaining batch items as processed ──
            for bp in batch[1:]:
                bp.record_station_time(station.id, batch_cycle_time)
                station.items_processed += 1

            # ── Blocked: push to output buffer (may block if full) ──
            out_buf = self._resolve_output_buffer(station, product)
            if out_buf:
                if out_buf.is_full():
                    station._log_state_change(StationState.BLOCKED)
                product._log_trace("entering_output_buffer", {"buffer": out_buf.id})
                self.log_event("product_entering_buffer", product.id, {
                    "buffer": out_buf.id,
                    "station": station.id,
                    "direction": "output",
                })
                pre_put_time = self.env.now
                yield out_buf.put(product)
                # Track time spent blocked waiting to enter the buffer
                blocked_duration = self.env.now - pre_put_time
                if blocked_duration > 0:
                    product.total_waiting_time += blocked_duration
                if station.state == StationState.BLOCKED:
                    station._log_state_change(StationState.IDLE)

            # ── Signal the first product's flow process that this station is done ──
            if hasattr(product, '_station_done_event') and not product._station_done_event.triggered:
                product._station_done_event.succeed()

            # ── Push remaining batch items to output and signal done ──
            for bp in batch[1:]:
                bp_out_buf = self._resolve_output_buffer(station, bp)
                if bp_out_buf:
                    if bp_out_buf.is_full():
                        station._log_state_change(StationState.BLOCKED)
                    self.log_event("product_entering_buffer", bp.id, {
                        "buffer": bp_out_buf.id,
                        "station": station.id,
                        "direction": "output",
                    })
                    pre_put_time = self.env.now
                    yield bp_out_buf.put(bp)
                    blocked_duration = self.env.now - pre_put_time
                    if blocked_duration > 0:
                        bp.total_waiting_time += blocked_duration
                    if station.state == StationState.BLOCKED:
                        station._log_state_change(StationState.IDLE)
                if hasattr(bp, '_station_done_event') and not bp._station_done_event.triggered:
                    bp._station_done_event.succeed()

    def _product_flow_process(self, product: Product, skip_pre_chain: bool = False):
        """
        SimPy process for a product flowing through the factory.

        For stations WITH an input buffer the product enqueues itself and waits
        for the station-worker to pull, process, and (optionally) push to the
        output buffer.  For stations WITHOUT an input buffer the product
        processes directly.

        `in_buffer` tracks whether the previous station's worker already pushed
        the product into a buffer (the output buffer of station N is the input
        buffer of station N+1).  When True we skip the put to avoid double-puts.

        After each station, the product is passed through any extra-node chain
        that sits between the current station and the next station in the
        routing (conveyors, inspections, assembly nodes, etc.).

        *skip_pre_chain*: when True, skip the pre-routing chain.  Used for
        products spawned by extra nodes (disassembly, depalletize) that should
        NOT re-enter the upstream extra-node chain they were created from.
        """
        self.active_products[product.id] = product

        self.log_event("product_created", product.id, {
            "product_type": product.product_type,
            "routing": product.routing,
            "attributes": product.attributes,
        })

        in_buffer = False  # True when product is already sitting in the next input buffer
        consumed = False   # True when an extra node consumed this product

        try:
            # ── Pre-routing chain: extra nodes before the first station ──
            # Skip for products spawned by extra nodes (disassembly/depalletize)
            # to avoid re-entering the upstream node that created them.
            if product.routing and not skip_pre_chain:
                pre_key = (None, product.routing[0])
                pre_chain = self._extra_node_chains.get(pre_key, [])
                # Record transit through buffers in this chain
                for bid in self._chain_buffers.get(pre_key, []):
                    buf = self.buffers.get(bid)
                    if buf:
                        buf.total_items_entered += 1
                for node_id in pre_chain:
                    node = self.extra_nodes.get(node_id)
                    if node:
                        result = yield self.env.process(node.process(product))
                        if result is None:
                            consumed = True
                            break
                        product = result
                # Input-chain splitters redirect routing[0] (the first
                # station) instead of routing[routing_index+1].  Apply the
                # redirect here and clear the tags so the between-station
                # redirect code later is a no-op.
                if pre_chain and "_splitter_output" in product.attributes:
                    splitter_idx = product.attributes.pop("_splitter_output")
                    splitter_id = product.attributes.pop("_splitter_id", None)
                    if splitter_id:
                        node = self.extra_nodes.get(splitter_id)
                        if (node and hasattr(node, '_output_stations')
                                and node._output_stations
                                and splitter_idx < len(node._output_stations)):
                            product.routing[0] = node._output_stations[splitter_idx]

            if consumed:
                if product.id in self.active_products:
                    del self.active_products[product.id]
                return

            while not product.is_scrap:
                next_station_id = product.get_next_station()

                if next_station_id is None:
                    # ── Routing complete: process output chain then finish ──
                    last_station_id = product.routing[-1] if product.routing else None
                    output_chain = self._extra_node_output_chains.get(last_station_id, [])
                    # Record transit through buffers in output chain
                    for bid in self._output_chain_buffers.get(last_station_id, []):
                        buf = self.buffers.get(bid)
                        if buf:
                            buf.total_items_entered += 1
                    for node_id in output_chain:
                        if product.is_scrap or consumed:
                            break
                        node = self.extra_nodes.get(node_id)
                        if node:
                            result = yield self.env.process(node.process(product))
                            if result is None:
                                consumed = True
                                break
                            product = result

                    if consumed:
                        break

                    if not product.is_scrap:
                        self.log_event("product_routing_complete", product.id, {
                            "product_type": product.product_type,
                            "cycle_time": product.get_cycle_time(),
                            "waiting_time": product.total_waiting_time,
                        })
                        product.complete()
                        self.product_types[product.product_type].record_completion(product)
                        # Track hourly completions
                        hour_bucket = int(self.env.now / 3600)
                        while len(self.hourly_completions) <= hour_bucket:
                            self.hourly_completions.append(0)
                        self.hourly_completions[hour_bucket] += 1
                        # Record sink exit — try mapping, fallback to BFS
                        sink_id = self._station_to_sink.get(last_station_id)
                        if not sink_id and last_station_id:
                            # Runtime fallback: BFS from this station to find a sink.
                            # This handles spawned products (disassembly/depalletize)
                            # whose routing endpoints weren't in the initial map.
                            sink_id = self._find_sink_for_station(last_station_id)
                        if sink_id and sink_id in self.sinks:
                            self.sinks[sink_id].record_exit(product)
                    break

                station = self.stations.get(next_station_id)
                if station is None:
                    self.log_event("routing_error", product.id, {
                        "message": f"Station {next_station_id} not found",
                    })
                    break

                # Create a per-visit completion event
                product._station_done_event = self.env.event()

                if station.input_buffer:
                    # ── Station has a worker ──
                    if not in_buffer:
                        # First station or previous station had no output buffer
                        product.state = ProductState.IN_QUEUE
                        product._log_trace("entering_buffer", {"buffer": station.input_buffer.id})
                        self.log_event("product_entering_buffer", product.id, {
                            "buffer": station.input_buffer.id,
                            "station": station.id,
                        })
                        pre_put_time = self.env.now
                        yield station.input_buffer.put(product)   # blocks if buffer full
                        # Track time spent blocked waiting to enter the buffer
                        blocked_duration = self.env.now - pre_put_time
                        if blocked_duration > 0:
                            product.total_waiting_time += blocked_duration
                            self.log_event("product_blocked", product.id, {
                                "buffer": station.input_buffer.id,
                                "blocked_duration": blocked_duration,
                            })
                    # Wait for the worker to pull, process, and (optionally) push to output
                    yield product._station_done_event
                    # After worker signals done, product may be in the output buffer
                    # (scrapped products are NOT pushed to output buffer by the worker)
                    in_buffer = self._resolve_output_buffer(station, product) is not None and not product.is_scrap
                else:
                    # ── No input buffer — process directly ──
                    in_buffer = False
                    op_requests = yield self.env.process(self._acquire_operators(next_station_id, product))
                    product.state = ProductState.IN_PROCESS
                    product._log_trace("entering_station", {"station": station.id})
                    yield station.process(product, op_requests=op_requests)
                    self._release_operators(op_requests)

                    # Scrapped products skip the output buffer
                    if product.is_scrap:
                        continue

                    # Push to output buffer if it exists (blocks if full)
                    out_buf = self._resolve_output_buffer(station, product)
                    if out_buf:
                        if out_buf.is_full():
                            station._log_state_change(StationState.BLOCKED)
                        product._log_trace("entering_output_buffer", {"buffer": out_buf.id})
                        self.log_event("product_entering_buffer", product.id, {
                            "buffer": out_buf.id,
                            "station": station.id,
                            "direction": "output",
                        })
                        pre_put_time = self.env.now
                        yield out_buf.put(product)
                        # Track time spent blocked waiting to enter the buffer
                        blocked_duration = self.env.now - pre_put_time
                        if blocked_duration > 0:
                            product.total_waiting_time += blocked_duration
                            self.log_event("product_blocked", product.id, {
                                "buffer": out_buf.id,
                                "blocked_duration": blocked_duration,
                            })
                        if station.state == StationState.BLOCKED:
                            station._log_state_change(StationState.IDLE)
                        in_buffer = True

                # ── Extra-node chain between this station and the next ──
                if self._extra_node_chains and not product.is_scrap:
                    next_idx = product.current_routing_index + 1
                    next_after = (
                        product.routing[next_idx]
                        if next_idx < len(product.routing) else None
                    )
                    chain_key = (next_station_id, next_after)
                    chain = self._extra_node_chains.get(chain_key, [])
                    # Record transit through buffers in this chain
                    if chain:
                        for bid in self._chain_buffers.get(chain_key, []):
                            buf = self.buffers.get(bid)
                            if buf:
                                buf.total_items_entered += 1
                    for node_id in chain:
                        if product.is_scrap or consumed:
                            break
                        node = self.extra_nodes.get(node_id)
                        if node:
                            result = yield self.env.process(
                                node.process(product)
                            )
                            if result is None:
                                consumed = True
                                break
                            product = result
                    # After extra-node processing product is no longer in a buffer
                    if chain:
                        in_buffer = False

                if consumed:
                    break

                # Splitter routing redirect: override next routing step
                if "_splitter_output" in product.attributes:
                    splitter_idx = product.attributes.pop("_splitter_output")
                    splitter_id = product.attributes.pop("_splitter_id", None)
                    if splitter_id:
                        node = self.extra_nodes.get(splitter_id)
                        if node and hasattr(node, '_output_stations') and node._output_stations:
                            if splitter_idx < len(node._output_stations):
                                next_idx = product.current_routing_index + 1
                                if next_idx < len(product.routing):
                                    product.routing[next_idx] = node._output_stations[splitter_idx]

                product.advance_routing()

            if product.is_scrap:
                product.scrap()
                self.product_types[product.product_type].record_completion(product)
                # Scrapped products do NOT exit through the sink — they are
                # removed from the flow.  Scrap counts are tracked per-station
                # (station.items_scrapped) and in product_type completion stats.

        finally:
            if product.id in self.active_products:
                del self.active_products[product.id]
            if not getattr(product, '_consumed', False):
                self.completed_products.append(product)

    def _arrival_process(self, product_type: ProductType):
        """SimPy process for generating product arrivals."""
        if product_type.arrival_rate is None:
            return

        # arrival_rate is inter-arrival time in seconds (e.g. 120 = one product every 120s)
        inter_arrival_dist = Distribution.exponential(product_type.arrival_rate, self.rng)

        # Find the first station's input buffer for backpressure
        first_station = self.stations.get(product_type.routing[0]) if product_type.routing else None
        input_buffer = first_station.input_buffer if first_station else None

        while True:
            inter_arrival_time = inter_arrival_dist.sample()
            yield self.env.timeout(inter_arrival_time)

            if self.should_stop:
                break

            # Backpressure: wait while input buffer is full
            if input_buffer and input_buffer.is_full():
                while input_buffer.is_full():
                    yield self.env.timeout(1.0)

            product = product_type.create_product()
            self.env.process(self._product_flow_process(product))

    def _progress_reporter(self):
        """SimPy process for reporting progress with diagnostics."""
        # Use up to 500 updates for smooth animation, but no faster than every 2 sim-seconds
        report_interval = max(self.config.duration / 500, min(self.config.duration / 20, 2.0))

        while self.env.now < self.config.duration:
            yield self.env.timeout(report_interval)

            if self.should_stop:
                break

            progress = self.env.now / self.config.duration

            if self.progress_callback:
                self.progress_callback(progress, f"Simulating... {progress*100:.1f}%")

    def _snapshot_process(self):
        """SimPy process that logs periodic system state snapshots."""
        interval = min(self.config.duration / 10, 3600)
        while self.env.now < self.config.duration:
            yield self.env.timeout(interval)
            if self.should_stop:
                break
            self.log_event("snapshot", "system", {
                "sim_time": self.env.now,
                "active_products": len(self.active_products),
                "completed_products": len(self.completed_products),
                "buffer_levels": {bid: b.level() for bid, b in self.buffers.items()},
                "station_states": {sid: s.state.value for sid, s in self.stations.items()},
            })

    def _wip_sampler(self):
        """SimPy process that periodically samples active_products count for WIP time series."""
        interval = max(self.config.duration / 200, 60)
        while True:
            yield self.env.timeout(interval)
            self._wip_samples.append({"time": self.env.now, "level": len(self.active_products)})

    def _simplify_wip_series(self, samples, max_points=200, epsilon=0.5):
        """Simplify WIP time series using RDP algorithm to remove redundant points."""
        if len(samples) <= max_points:
            return samples
        # Convert to (time, level) tuples for RDP
        points = [(s["time"], s["level"]) for s in samples]
        simplified = self._rdp(points, epsilon)
        # If RDP didn't reduce enough, fall back to uniform downsampling
        if len(simplified) > max_points:
            step = len(simplified) / max_points
            simplified = [simplified[int(i * step)] for i in range(max_points)]
        return [{"time": t, "level": int(l)} for t, l in simplified]

    @staticmethod
    def _rdp(points, epsilon):
        """Ramer-Douglas-Peucker line simplification."""
        if len(points) <= 2:
            return points
        # Find point with max distance from line between first and last
        start, end = points[0], points[-1]
        max_dist = 0
        max_idx = 0
        for i in range(1, len(points) - 1):
            dx, dy = end[0] - start[0], end[1] - start[1]
            if dx == 0 and dy == 0:
                dist = ((points[i][0] - start[0])**2 + (points[i][1] - start[1])**2)**0.5
            else:
                t = max(0, min(1, ((points[i][0]-start[0])*dx + (points[i][1]-start[1])*dy) / (dx*dx + dy*dy)))
                proj = (start[0] + t*dx, start[1] + t*dy)
                dist = ((points[i][0]-proj[0])**2 + (points[i][1]-proj[1])**2)**0.5
            if dist > max_dist:
                max_dist = dist
                max_idx = i
        if max_dist > epsilon:
            left = Simulation._rdp(points[:max_idx+1], epsilon)
            right = Simulation._rdp(points[max_idx:], epsilon)
            return left[:-1] + right
        return [start, end]

    def _fixup_end_of_sim_off_shift(self):
        """Reclassify starvation as off-shift for the tail of the simulation.

        When the simulation clock expires, stations with shifts may be stuck
        waiting on an empty input buffer (state = STARVED).  The time between
        their last state-change and env.now includes off-shift hours that
        should not count as starvation.  This method retroactively moves that
        portion from total_starved_time to total_off_shift_time.
        """
        for station in self.stations.values():
            if not station.shifts:
                continue
            if station.state != StationState.STARVED:
                continue
            # Station is stuck in STARVED — compute how much of that is off-shift
            remaining = self.env.now - station._last_state_change
            if remaining <= 0:
                continue
            off_shift = station.calc_off_shift_time(station._last_state_change, self.env.now)
            if off_shift > 0:
                station.total_starved_time -= off_shift
                station.total_off_shift_time += off_shift

    def _record_abandoned_products(self):
        """Record products still in-flight when the simulation clock expires.

        Products that started processing but didn't finish are logged as
        'product_abandoned' events so they're not silently lost.
        """
        # Check all buffers for products still waiting
        for buf_id, buf in self.buffers.items():
            for part in list(getattr(buf, '_store', {}).get('items', [])):
                self._log_event("product_abandoned", getattr(part, 'id', 'unknown'), {
                    "location": buf.name,
                    "location_type": "buffer",
                    "product_type": getattr(part, 'product_type', 'unknown'),
                    "reason": "simulation_ended",
                })
        # Check stations for products mid-processing
        for station_id, station in self.stations.items():
            if hasattr(station, '_current_part') and station._current_part is not None:
                part = station._current_part
                self._log_event("product_abandoned", getattr(part, 'id', 'unknown'), {
                    "location": station.name,
                    "location_type": "station",
                    "product_type": getattr(part, 'product_type', 'unknown'),
                    "reason": "simulation_ended",
                })

    def _log_simulation_summary(self):
        """Log a summary event at the end of the simulation.

        Includes configured-vs-actual comparisons for **every** component
        and parameter so the user can verify nothing was silently dropped.
        """
        # ── station configured-vs-actual ──────────────────────────
        station_summaries: Dict[str, Any] = {}
        for sid, s in self.stations.items():
            total_items = s.items_processed + s.items_scrapped
            actual_scrap_rate = (
                s.items_scrapped / total_items if total_items > 0 else 0.0
            )
            summary: Dict[str, Any] = {
                "name": s.name,
                "items_processed": s.items_processed,
                "items_scrapped": s.items_scrapped,
                "utilization": s.get_utilization(),
                "state_breakdown": s.get_state_breakdown(),
                "configured_vs_actual": {
                    "scrap_rate": {
                        "configured": s.scrap_rate,
                        "actual": round(actual_scrap_rate, 4),
                    },
                    "cycle_time": {
                        "configured_mean": s.cycle_time_dist.mean(),
                        "actual_mean": round(
                            s.total_processing_time / max(1, total_items), 2
                        ),
                    },
                    "batch_size": s.batch_size,
                },
            }
            if s.mtbf is not None:
                actual_failures = sum(
                    1 for entry in s.state_log
                    if entry.get("to_state") == "failed"
                )
                actual_mtbf_h = (
                    (self.config.duration / 3600) / actual_failures
                    if actual_failures > 0 else None
                )
                summary["configured_vs_actual"]["mtbf_hours"] = {
                    "configured": s.mtbf,
                    "actual": round(actual_mtbf_h, 2) if actual_mtbf_h else "no_failures",
                }
            if s.mttr is not None:
                summary["configured_vs_actual"]["mttr_hours"] = {
                    "configured": s.mttr,
                    "actual_total_repair_s": round(s.total_failed_time, 2),
                }
            if s.setup_time_dist is not None:
                summary["configured_vs_actual"]["setup_time"] = {
                    "configured_mean": s.setup_time_dist.mean(),
                    "actual_total_s": round(s.total_setup_time, 2),
                }
            if s.product_cycle_time_dists:
                summary["configured_vs_actual"]["product_cycle_times"] = {
                    pid: {"configured_mean": d.mean()}
                    for pid, d in s.product_cycle_time_dists.items()
                }
            if s.shifts:
                summary["configured_vs_actual"]["shifts"] = s.shifts
                summary["configured_vs_actual"]["off_shift_time_s"] = round(
                    s.total_off_shift_time, 2
                )
            station_summaries[sid] = summary

        # ── buffer summaries ──────────────────────────────────────
        buffer_summaries: Dict[str, Any] = {}
        for bid, b in self.buffers.items():
            buf_stats = b.get_statistics()
            buf_stats["configured_vs_actual"] = {
                "capacity": b.capacity,
                "queue_rule": b.queue_rule.value,
                "is_implicit": bid.startswith("__arrival_"),
            }
            buffer_summaries[bid] = buf_stats

        # ── extra node configured-vs-actual ───────────────────────
        extra_node_summaries: Dict[str, Any] = {}
        for nid, n in self.extra_nodes.items():
            stats = n.get_statistics()
            if n.node_type == "conveyor":
                stats["configured_vs_actual"] = {
                    "transit_time": {
                        "configured": n.transit_time,
                        "length": n.length,
                        "speed": n.speed,
                    },
                    "capacity": n.capacity,
                    "items_transported": n.items_processed,
                }
            elif n.node_type == "inspection":
                stats["configured_vs_actual"] = {
                    "defect_rate": {
                        "configured_pct": round(n.defect_rate * 100, 2),
                        "actual_pct": round(
                            stats.get("defect_rate_actual", 0) * 100, 2
                        ),
                    },
                    "inspection_time": n.inspection_time,
                    "inspection_type": n.inspection_type,
                    "total_items": n.items_processed,
                    "items_passed": n.items_passed,
                    "items_failed": n.items_failed,
                }
            elif n.node_type == "assembly":
                stats["configured_vs_actual"] = {
                    "cycle_time": n.cycle_time,
                    "input_parts_required": n.input_parts,
                    "input_parts_by_product": n.input_parts_by_product,
                    "assemblies_completed": n.items_processed,
                }
            elif n.node_type == "disassembly":
                stats["configured_vs_actual"] = {
                    "cycle_time": n.cycle_time,
                    "output_parts": n.output_parts,
                    "items_disassembled": n.items_processed,
                }
            elif n.node_type == "splitter":
                stats["configured_vs_actual"] = {
                    "outputs": n.outputs,
                    "split_type": n.split_type,
                    "product_routing": n.product_routing,
                    "items_routed": n.items_processed,
                }
            elif n.node_type == "merge":
                stats["configured_vs_actual"] = {
                    "inputs": n.inputs,
                    "merge_type": n.merge_type,
                    "items_merged": n.items_processed,
                }
            elif n.node_type == "palletize":
                stats["configured_vs_actual"] = {
                    "default_pallet_size": n.default_pallet_size,
                    "pallet_size_by_product": n.pallet_size_by_product,
                    "cycle_time": n.cycle_time,
                    "pallets_created": n.items_processed,
                }
            elif n.node_type == "depalletize":
                stats["configured_vs_actual"] = {
                    "cycle_time": n.cycle_time,
                    "items_depalletized": n.items_processed,
                }
            elif n.node_type == "matchbuffer":
                stats["configured_vs_actual"] = {
                    "capacity": n.capacity,
                    "match_key": n.match_key,
                    "required_parts": n.required_parts,
                    "timeout": n.timeout_duration,
                    "items_matched": n.items_processed,
                }
            extra_node_summaries[nid] = stats

        # ── product configured-vs-actual ──────────────────────────
        product_summaries: Dict[str, Any] = {}
        for pid, pt in self.product_types.items():
            product_summaries[pid] = {
                "name": pt.name,
                "routing": pt.routing,
                "priority": pt.priority,
                "configured_arrival_rate": pt.arrival_rate,
                "total_created": pt.total_created,
                "total_completed": pt.total_completed,
                "actual_arrival_rate_per_h": round(
                    pt.total_created / max(1, self.config.duration / 3600), 2
                ),
                "routing_length": len(pt.routing),
            }

        # ── source summaries ──────────────────────────────────────
        source_summaries: Dict[str, Any] = {}
        for sid, src in self.sources.items():
            stats = src.get_statistics()
            hours = self.config.duration / 3600
            stats["configured_vs_actual"] = {
                "arrival_rate": {
                    "configured_s": src.arrival_rate,
                    "configured_per_h": round(3600 / src.arrival_rate, 2) if src.arrival_rate else 0,
                    "actual_per_h": stats["actual_rate_per_hour"],
                },
            }
            source_summaries[sid] = stats

        # ── sink summaries ────────────────────────────────────────
        sink_summaries: Dict[str, Any] = {}
        for sid, snk in self.sinks.items():
            sink_summaries[sid] = snk.get_statistics()

        # ── resource summaries ────────────────────────────────────
        resource_summaries: Dict[str, Any] = {}
        for rid, r in self.resources.items():
            stats = r.get_statistics()
            stats["configured_vs_actual"] = {
                "efficiency": {
                    "configured": r.efficiency,
                    "utilization_actual": r.get_utilization(),
                },
                "capacity": r.capacity,
            }
            resource_summaries[rid] = stats

        self.log_event("simulation_summary", "system", {
            "config": {
                "duration": self.config.duration,
                "warmup_period": self.config.warmup_period,
                "seed": self.config.seed,
                "replications": self.config.replications,
                "trace_mode": self.config.trace_mode,
                "confidence_level": self.config.confidence_level,
                "stream_events": self.config.stream_events,
            },
            "total_products_created": sum(
                pt.total_created for pt in self.product_types.values()
            ),
            "total_completed": len(
                [p for p in self.completed_products if not p.is_scrap]
            ),
            "total_scrapped": len(
                [p for p in self.completed_products if p.is_scrap]
            ),
            "total_in_progress": len(self.active_products),
            "station_summaries": station_summaries,
            "buffer_summaries": buffer_summaries,
            "extra_node_summaries": extra_node_summaries,
            "product_summaries": product_summaries,
            "source_summaries": source_summaries,
            "sink_summaries": sink_summaries,
            "resource_summaries": resource_summaries,
        })

    def _run_single(self, run_id: Optional[str] = None, seed: Optional[int] = None) -> Dict[str, Any]:
        """Run a single replication of the simulation."""
        # Reset environment and model for this replication
        self.env = simpy.Environment()
        self.rng = np.random.default_rng(seed)
        self.stations = {}
        self.buffers = {}
        self.resources = {}
        self.product_types = {}
        self.active_products = {}
        self.completed_products = []
        self.hourly_completions = []
        self.event_log = []
        self.should_stop = False
        self.extra_nodes = {}
        self._extra_node_chains = {}
        self._extra_node_output_chains = {}
        self.sources = {}
        self.sinks = {}
        self._station_to_sink = {}
        self._station_operators = {}
        self._wip_samples = []

        self._build_model()

        # Start station-consumer workers for stations fed by buffers
        for station in self.stations.values():
            if station.input_buffer:
                self.env.process(self._station_worker(station))

        # Drain buffers connected to sinks (prevents deadlock when the
        # last station's output buffer fills and blocks the worker).
        for buf_id in getattr(self, '_sink_buffers', set()):
            buf = self.buffers.get(buf_id)
            if buf:
                self.env.process(self._sink_buffer_drain(buf))

        # Start arrivals — sources take over for their filtered products
        source_driven_products: set = set()
        for source in self.sources.values():
            if source.product_filter and source.product_filter in self.product_types:
                source_driven_products.add(source.product_filter)
            elif not source.product_filter:
                source_driven_products.update(self.product_types.keys())
            self.env.process(self._source_arrival_process(source))

        for product_type in self.product_types.values():
            if product_type.arrival_rate and product_type.id not in source_driven_products:
                self.env.process(self._arrival_process(product_type))

        # Start progress reporter, snapshot, and WIP sampler
        self.env.process(self._progress_reporter())
        self.env.process(self._snapshot_process())
        self.env.process(self._wip_sampler())

        # Run
        self.env.run(until=self.config.duration)

        # Reclassify off-shift starvation at simulation end
        self._fixup_end_of_sim_off_shift()

        # Log summary
        self._log_simulation_summary()

        return self._calculate_kpis()

    def run(self, run_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Run the simulation (supports multiple replications).

        Returns:
            Simulation results including KPIs (with confidence intervals if replications > 1)
        """
        self.run_id = run_id
        self.is_running = True
        self.should_stop = False
        self.start_time = time.time()

        try:
            n_reps = self.config.replications

            if n_reps <= 1:
                # Single replication — run directly

                # Start station-consumer workers for stations fed by buffers
                for station in self.stations.values():
                    if station.input_buffer:
                        self.env.process(self._station_worker(station))

                # Drain buffers connected to sinks (prevents deadlock)
                for buf_id in getattr(self, '_sink_buffers', set()):
                    buf = self.buffers.get(buf_id)
                    if buf:
                        self.env.process(self._sink_buffer_drain(buf))

                # Start arrivals — sources take over for their filtered products
                source_driven_products: set = set()
                for source in self.sources.values():
                    if source.product_filter and source.product_filter in self.product_types:
                        source_driven_products.add(source.product_filter)
                    elif not source.product_filter:
                        source_driven_products.update(self.product_types.keys())
                    self.env.process(self._source_arrival_process(source))

                for product_type in self.product_types.values():
                    if product_type.arrival_rate and product_type.id not in source_driven_products:
                        self.env.process(self._arrival_process(product_type))

                self.env.process(self._progress_reporter())
                self.env.process(self._snapshot_process())
                self.env.process(self._wip_sampler())
                self.env.run(until=self.config.duration)
                self.end_time = time.time()

                # Reclassify off-shift starvation at simulation end
                self._fixup_end_of_sim_off_shift()

                # Track in-flight products abandoned at simulation end
                self._record_abandoned_products()

                # Log summary
                self._log_simulation_summary()

                kpis = self._calculate_kpis()

                return {
                    "run_id": self.run_id,
                    "status": "completed",
                    "kpis": kpis,
                    "events": self.event_log,
                    "duration": self.end_time - self.start_time,
                    "simulated_time": self.config.duration,
                    "replications": 1,
                }
            else:
                # Multiple replications — aggregate with confidence intervals
                base_seed = self.config.seed or 42
                all_kpis: List[Dict[str, Any]] = []

                for rep in range(n_reps):
                    if self.should_stop:
                        break

                    rep_seed = base_seed + rep
                    if self.progress_callback:
                        self.progress_callback(
                            rep / n_reps,
                            f"Replication {rep + 1}/{n_reps}..."
                        )

                    kpis = self._run_single(run_id, seed=rep_seed)
                    all_kpis.append(kpis)

                self.end_time = time.time()

                # Aggregate results with confidence intervals
                aggregated = self._aggregate_replications(all_kpis)

                return {
                    "run_id": self.run_id,
                    "status": "completed",
                    "kpis": aggregated,
                    "events": self.event_log,
                    "duration": self.end_time - self.start_time,
                    "simulated_time": self.config.duration,
                    "replications": len(all_kpis),
                    "replication_results": all_kpis,
                }

        except Exception as e:
            self.end_time = time.time()
            return {
                "run_id": self.run_id,
                "status": "error",
                "error": str(e),
                "duration": self.end_time - self.start_time if self.start_time else 0,
            }

        finally:
            self.is_running = False

    def _aggregate_replications(self, all_kpis: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Aggregate KPIs across replications and compute confidence intervals."""
        n = len(all_kpis)
        alpha = 1 - self.config.confidence_level

        def ci(values: List[float]) -> Dict[str, float]:
            """Compute mean and confidence interval for a list of values."""
            if len(values) == 0:
                return {"mean": 0.0, "ci_lower": 0.0, "ci_upper": 0.0, "std": 0.0, "half_width": 0.0}
            arr = np.array(values, dtype=float)
            mean_val = float(np.mean(arr))
            if n < 2:
                return {"mean": mean_val, "ci_lower": mean_val, "ci_upper": mean_val, "std": 0.0}
            std_val = float(np.std(arr, ddof=1))
            se = std_val / np.sqrt(n)
            t_crit = scipy_stats.t.ppf(1 - alpha / 2, n - 1)
            half_width = t_crit * se
            return {
                "mean": mean_val,
                "ci_lower": mean_val - half_width,
                "ci_upper": mean_val + half_width,
                "std": std_val,
                "half_width": half_width,
            }

        # Aggregate OEE
        oee_overall = ci([k["oee"]["overall"] for k in all_kpis])
        oee_avail = ci([k["oee"]["availability"] for k in all_kpis])
        oee_perf = ci([k["oee"]["performance"] for k in all_kpis])
        oee_qual = ci([k["oee"]["quality"] for k in all_kpis])

        # Aggregate throughput
        tp_total = ci([k["throughput"]["total"] for k in all_kpis])
        tp_rate = ci([k["throughput"]["rate_per_hour"] for k in all_kpis])

        # Aggregate cycle time
        ct_mean = ci([k["cycle_time"]["mean"] for k in all_kpis])

        # Aggregate utilization per station
        station_ids = set()
        for k in all_kpis:
            station_ids.update(k["utilization"]["by_station"].keys())

        by_station_agg = {}
        for sid in station_ids:
            processing_vals = []
            blocked_vals = []
            starved_vals = []
            idle_vals = []
            failed_vals = []
            for k in all_kpis:
                s = k["utilization"]["by_station"].get(sid, {})
                processing_vals.append(s.get("processing", 0))
                blocked_vals.append(s.get("blocked", 0))
                starved_vals.append(s.get("starved", 0))
                idle_vals.append(s.get("idle", 0))
                failed_vals.append(s.get("failed", 0))
            by_station_agg[sid] = {
                "processing": ci(processing_vals),
                "blocked": ci(blocked_vals),
                "starved": ci(starved_vals),
                "idle": ci(idle_vals),
                "failed": ci(failed_vals),
            }

        return {
            "oee": {
                "overall": oee_overall,
                "availability": oee_avail,
                "performance": oee_perf,
                "quality": oee_qual,
                "by_station": {},  # Simplified for aggregate
            },
            "throughput": {
                "total": tp_total,
                "rate_per_hour": tp_rate,
                "by_product": {},
                "by_hour": [],
            },
            "utilization": {
                "by_station": by_station_agg,
                "by_resource": {},
            },
            "wip": {
                "total": ci([k["wip"]["total"] for k in all_kpis]),
                "by_buffer": {},
                "time_series": [],
            },
            "cycle_time": {
                "mean": ct_mean,
                "std": ci([k["cycle_time"]["std"] for k in all_kpis]),
                "min": ci([k["cycle_time"]["min"] for k in all_kpis]),
                "max": ci([k["cycle_time"]["max"] for k in all_kpis]),
                "by_product": {},
            },
            "delivery": {
                "on_time_rate": ci([k.get("delivery", {}).get("on_time_rate", 1.0) for k in all_kpis]),
            },
            "_replications": n,
            "_confidence_level": self.config.confidence_level,
        }

    def stop(self) -> None:
        """Stop the running simulation."""
        self.should_stop = True

    def get_entity_traces(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get entity-level traces for model validation (trace mode)."""
        traces = []
        for product in self.completed_products[:limit]:
            traces.append({
                "id": product.id,
                "product_type": product.product_type,
                "order_id": product.order_id,
                "state": product.state.value,
                "cycle_time": product.get_cycle_time(),
                "waiting_time": product.total_waiting_time,
                "processing_time": product.total_processing_time,
                "flow_efficiency": product.get_flow_efficiency(),
                "attributes": product.attributes,
                "trace": product.get_trace(),
            })
        return traces

    def get_event_log_filtered(self, event_types: Optional[List[str]] = None,
                                entity_id: Optional[str] = None,
                                time_range: Optional[tuple] = None,
                                limit: int = 500) -> List[Dict[str, Any]]:
        """Get filtered event log for inspection."""
        filtered = self.event_log
        if event_types:
            filtered = [e for e in filtered if e["type"] in event_types]
        if entity_id:
            filtered = [e for e in filtered if e["entity_id"] == entity_id]
        if time_range:
            t_start, t_end = time_range
            filtered = [e for e in filtered if t_start <= e["time"] <= t_end]
        return filtered[-limit:]

    def _calculate_kpis(self) -> Dict[str, Any]:
        """Calculate all KPIs from simulation results."""
        kpis = {
            "oee": self._calculate_oee(),
            "throughput": self._calculate_throughput(),
            "utilization": self._calculate_utilization(),
            "wip": self._calculate_wip(),
            "cycle_time": self._calculate_cycle_time(),
            "delivery": self._calculate_delivery(),
        }

        if self.extra_nodes:
            kpis["extra_nodes"] = {
                nid: node.get_statistics()
                for nid, node in self.extra_nodes.items()
            }

        if self.sources:
            kpis["sources"] = {
                sid: src.get_statistics()
                for sid, src in self.sources.items()
            }

        if self.sinks:
            kpis["sinks"] = {
                sid: snk.get_statistics()
                for sid, snk in self.sinks.items()
            }

        # Check for WIP warnings (monotonic growth suggests no steady state),
        # buffer capacity warnings, station blocking/starvation, and source throttling
        kpis["warnings"] = (
            self._check_wip_warnings()
            + self._check_buffer_warnings()
            + self._check_station_warnings()
            + self._check_source_warnings()
        )

        return kpis

    def _check_wip_warnings(self) -> list:
        """Check WIP timeseries for signs that steady state was not reached."""
        warnings = []
        samples = self._wip_samples
        if len(samples) < 10:
            return warnings

        levels = [s["level"] for s in samples]
        n = len(levels)
        # Compare first 20% average vs last 20% average
        seg = max(1, n // 5)
        early_avg = sum(levels[:seg]) / seg
        late_avg = sum(levels[-seg:]) / seg

        # If WIP at end is significantly higher than start
        if late_avg > early_avg * 1.5 and late_avg > 5:
            # Stabilization check: if WIP in the last 50% has very low
            # variance relative to the mean, the system reached steady state
            # (possibly at a buffer capacity ceiling).
            half_idx = n // 2
            latter_half = levels[half_idx:]
            if len(latter_half) > 2:
                latter_mean = sum(latter_half) / len(latter_half)
                latter_var = sum((x - latter_mean) ** 2 for x in latter_half) / len(latter_half)
                latter_std = latter_var ** 0.5
                # Coefficient of variation < 5% means stable
                cv = latter_std / latter_mean if latter_mean > 0 else 0
                if cv < 0.05:
                    # WIP stabilized — no warning needed
                    return warnings

            # Check if last 20% is still trending up
            last_seg = levels[-seg:]
            mid = len(last_seg) // 2
            if mid > 0:
                last_first_half = sum(last_seg[:mid]) / mid
                last_second_half = sum(last_seg[mid:]) / (len(last_seg) - mid)
                if last_second_half > last_first_half * 1.02:  # require 2% growth, not any
                    warnings.append({
                        "type": "wip_no_steady_state",
                        "severity": "warning",
                        "message": (
                            f"WIP grew from ~{early_avg:.0f} to ~{late_avg:.0f} and is still rising. "
                            "The simulation may not have reached steady state. Consider increasing "
                            "the simulation duration or adding a warmup period."
                        ),
                    })

        return warnings

    def _check_buffer_warnings(self) -> list:
        """Check for persistently full buffers that indicate bottlenecks."""
        warnings = []
        for buf_id, buf in self.buffers.items():
            if buf_id.startswith('__arrival_'):
                continue
            stats = buf.get_statistics()
            if (stats["max_level"] >= stats["capacity"] and
                    buf.get_utilization() > 0.90 and
                    stats["capacity"] > 1):
                warnings.append({
                    "type": "buffer_at_capacity",
                    "severity": "warning",
                    "message": (
                        f"Buffer '{stats['name']}' was persistently full "
                        f"({stats['capacity']} capacity, {buf.get_utilization()*100:.0f}% avg utilization). "
                        "This causes upstream blocking. Consider increasing capacity or "
                        "improving downstream throughput."
                    ),
                })
        return warnings

    def _check_station_warnings(self) -> list:
        """Check for stations with extreme blocking or starvation."""
        warnings = []
        for station_id, station in self.stations.items():
            breakdown = station.get_state_breakdown()
            blocked = breakdown.get("blocked", 0)
            starved = breakdown.get("starved", 0)
            if blocked > 0.40:
                warnings.append({
                    "type": "station_blocked",
                    "severity": "warning",
                    "message": (
                        f"Station '{station.name}' is blocked {blocked*100:.0f}% of the time "
                        "waiting to push items downstream. The downstream station or buffer "
                        "is the constraint."
                    ),
                })
            elif starved > 0.60:
                warnings.append({
                    "type": "station_starved",
                    "severity": "info",
                    "message": (
                        f"Station '{station.name}' is starved {starved*100:.0f}% of the time "
                        "waiting for input. The upstream process cannot keep up."
                    ),
                })
            setup = breakdown.get("setup", 0)
            if setup > 0.50:
                warnings.append({
                    "type": "station_setup_dominant",
                    "severity": "warning",
                    "message": (
                        f"Station '{station.name}' spends {setup*100:.0f}% of its time on "
                        "setup/changeover. Consider reducing setup time or increasing batch sizes "
                        "to improve throughput."
                    ),
                })
        return warnings

    def _check_source_warnings(self) -> list:
        """Check if sources are throttled significantly below their configured rate."""
        warnings = []
        hours = self.env.now / 3600 if self.env.now > 0 else 1
        for src_id, src in self.sources.items():
            if src.arrival_rate <= 0:
                continue
            configured_per_h = 3600 / src.arrival_rate
            actual_per_h = src.total_generated / hours
            # Warn if actual rate is below 80% of configured rate
            if configured_per_h > 0 and actual_per_h < configured_per_h * 0.80:
                pct = actual_per_h / configured_per_h * 100
                warnings.append({
                    "type": "source_throttled",
                    "severity": "info",
                    "message": (
                        f"Source '{src.name}' achieved only {actual_per_h:.1f}/hr "
                        f"({pct:.0f}% of configured {configured_per_h:.1f}/hr). "
                        "Downstream backpressure is limiting the arrival rate."
                    ),
                })
        return warnings

    def _calculate_oee(self) -> Dict[str, Any]:
        """Calculate OEE with A and P averaged across stations.

        A (availability) and P (performance) are averaged across all stations
        so that failures at any station are reflected in the overall metric.
        Q (quality) uses system-boundary counts.  OEE = A × P × Q.

        Quality is adjusted for inspection node rejects, since those represent
        upstream quality losses that standard per-station OEE doesn't capture.
        """
        station_oee = {}
        n = len(self.stations)
        if n == 0:
            return {
                "overall": 0.0,
                "availability": 0.0,
                "performance": 0.0,
                "quality": 0.0,
                "by_station": {},
            }

        sum_availability = 0.0
        sum_performance = 0.0
        sum_quality = 0.0

        for station_id, station in self.stations.items():
            oee = station.get_oee()
            station_oee[station_id] = oee
            sum_availability += oee["availability"]
            sum_performance += oee["performance"]
            sum_quality += oee["quality"]

        # Calculate system-wide quality using system-boundary counts:
        # good output = completed products that aren't scrap
        # This avoids double-counting products processed by multiple stations
        total_good_output = len([p for p in self.completed_products if not p.is_scrap])
        total_scrapped = sum(s.items_scrapped for s in self.stations.values())
        system_quality = (total_good_output / (total_good_output + total_scrapped)
                          if (total_good_output + total_scrapped) > 0 else 1.0)

        # Attribute inspection quality losses back to the upstream station
        # so that per-station OEE reflects defects caught downstream.
        from factorysim.engine.extra_nodes import Inspection
        inspection_yield = 1.0
        for node in self.extra_nodes.values():
            if isinstance(node, Inspection) and node.items_processed > 0:
                node_yield = 1.0 - (node.items_failed / node.items_processed)
                inspection_yield *= node_yield

                # Find the upstream station for this inspection via chains
                upstream_sid = None
                # Check output chains: station → [... inspection ...]
                for sid, chain in self._extra_node_output_chains.items():
                    if node.id in chain and sid in station_oee:
                        upstream_sid = sid
                        break
                # Check between-station chains: (from, to) → [... inspection ...]
                if upstream_sid is None:
                    for (from_sid, to_sid), chain in self._extra_node_chains.items():
                        if node.id in chain and from_sid in station_oee:
                            upstream_sid = from_sid
                            break
                if upstream_sid is not None:
                    oee = station_oee[upstream_sid]
                    oee["quality"] = oee["quality"] * node_yield
                    oee["oee"] = oee["availability"] * oee["performance"] * oee["quality"]

        system_quality *= inspection_yield

        # Use averaged A and P across all stations with system-wide Q
        top_a = sum_availability / n
        top_p = sum_performance / n
        top_q = system_quality
        overall = top_a * top_p * top_q

        return {
            "overall": overall,
            "availability": top_a,
            "performance": top_p,
            "quality": top_q,
            "by_station": station_oee,
        }

    def _calculate_throughput(self) -> Dict[str, Any]:
        total_completed = len([p for p in self.completed_products if not p.is_scrap])
        total_in_progress = len(self.active_products)

        by_product = {}
        for product_type in self.product_types.values():
            by_product[product_type.id] = product_type.total_completed

        # When sinks are present, use sink-based counts for accurate
        # "finished goods" throughput (avoids counting intermediate products
        # like disassembly sub-parts that complete routing but never exit).
        if self.sinks:
            total_completed = sum(s.total_exited for s in self.sinks.values())
            by_product_sink: Dict[str, int] = {}
            for sink in self.sinks.values():
                for pt, count in sink.exits_by_product_type.items():
                    by_product_sink[pt] = by_product_sink.get(pt, 0) + count
            by_product = by_product_sink

        hours = self.config.duration / 3600

        # Use actual per-hour-bucket completions
        n_hours = int(hours) if hours > 0 else 0
        by_hour = list(self.hourly_completions[:n_hours])
        # Pad with zeros if simulation had fewer completions than hours
        while len(by_hour) < n_hours:
            by_hour.append(0)

        # Per-station throughput for bottleneck analysis
        by_station = {}
        for station_id, station in self.stations.items():
            by_station[station_id] = station.items_processed

        # Aggregate consumed products from assembly/matchbuffer nodes
        consumed = {}
        for node in self.extra_nodes.values():
            if hasattr(node, '_consumed_by_product'):
                for pt, count in node._consumed_by_product.items():
                    consumed[pt] = consumed.get(pt, 0) + count

        return {
            "total": total_completed,
            "in_progress": total_in_progress,
            "rate_per_hour": total_completed / hours if hours > 0 else 0,
            "by_product": by_product,
            "by_hour": by_hour,
            "by_station": by_station,
            "consumed": consumed,
        }

    def _calculate_utilization(self) -> Dict[str, Any]:
        by_station = {}
        for station_id, station in self.stations.items():
            by_station[station_id] = station.get_state_breakdown()

        by_resource = {}
        for resource_id, resource in self.resources.items():
            stats = resource.get_statistics()
            by_resource[resource_id] = {
                "utilization": stats.get("utilization", 0),
                "name": stats.get("name", resource_id),
                "capacity": stats.get("capacity", 1),
                "total_busy_time": stats.get("total_busy_time", 0),
                "total_idle_time": stats.get("total_idle_time", 0),
                "request_count": stats.get("request_count", 0),
            }

        return {
            "by_station": by_station,
            "by_resource": by_resource,
        }

    def _calculate_wip(self) -> Dict[str, Any]:
        by_buffer = {}

        # Map input buffer IDs to the batch queue WIP of their downstream batch station
        batch_queue_wip_by_buffer: Dict[str, float] = {}
        for station_id, station in self.stations.items():
            if station.batch_size > 1 and station.input_buffer is not None:
                avg_bq = station.get_average_batch_queue_wip()
                buf_id = station.input_buffer.id
                batch_queue_wip_by_buffer[buf_id] = batch_queue_wip_by_buffer.get(buf_id, 0) + avg_bq

        for buffer_id, buffer in self.buffers.items():
            # Skip implicit arrival buffers — internal implementation detail
            if buffer_id.startswith('__arrival_'):
                continue
            stats = buffer.get_statistics()
            avg_wip = stats["average_wip"] + batch_queue_wip_by_buffer.get(buffer_id, 0)
            by_buffer[buffer_id] = {
                "average_wip": avg_wip,
                "average_waiting_time": stats["average_waiting_time"],
                "blocking_time": stats["total_blocking_time"],
                "starving_time": stats["total_starving_time"],
                "block_count": stats["block_count"],
                "starve_count": stats["starve_count"],
                "total_items": stats["total_items_entered"],
                "is_pass_through": (
                    avg_wip < 0.01
                    and stats["total_items_entered"] > 0
                    and stats["capacity"] <= 1
                ),
            }

        # Include conveyor WIP in by_buffer so they're visible in analytics
        from factorysim.engine.extra_nodes import Conveyor
        for node_id, node in self.extra_nodes.items():
            if isinstance(node, Conveyor):
                stats = node.get_statistics()
                avg_wip = stats.get("average_wip", 0)
                by_buffer[node_id] = {
                    "average_wip": avg_wip,
                    "average_waiting_time": node.transit_time if node.items_entered > 0 else 0,
                    "blocking_time": 0,
                    "starving_time": 0,
                    "block_count": 0,
                    "starve_count": 0,
                    "total_items": node.items_processed,
                    "is_pass_through": True,  # conveyors are always pass-through by nature
                }

        # WIP = only active products (buffer contents are already in active_products)
        total_wip = len(self.active_products)

        # WIP time series from periodic sampler (includes items at stations)
        # Compress periodic/redundant WIP series using RDP simplification
        time_series = self._simplify_wip_series(list(self._wip_samples))

        return {
            "total": total_wip,
            "by_buffer": by_buffer,
            "time_series": time_series,
        }

    def _calculate_cycle_time(self) -> Dict[str, Any]:
        warmup = self.config.warmup_period
        completed = [p for p in self.completed_products
                     if not p.is_scrap and p.creation_time >= warmup]

        if not completed:
            return {"mean": 0, "std": 0, "min": 0, "max": 0, "by_product": {}}

        cycle_times = [p.get_cycle_time() for p in completed]

        by_product = {}
        for product_type in self.product_types.values():
            if product_type.total_completed == 0:
                continue  # Omit products with no completions (avoids misleading 0s)
            stats = product_type.get_statistics()
            by_product[product_type.id] = {
                "mean": stats["average_cycle_time"],
                "std": stats["cycle_time_std"],
            }

        return {
            "mean": float(np.mean(cycle_times)),
            "std": float(np.std(cycle_times)),
            "min": float(np.min(cycle_times)),
            "max": float(np.max(cycle_times)),
            "by_product": by_product,
        }

    def _calculate_delivery(self) -> Dict[str, Any]:
        completed = [p for p in self.completed_products if not p.is_scrap]

        if not completed:
            return {"on_time_rate": None, "average_lateness": 0, "orders_at_risk": 0}

        # Only consider products that actually have due dates for delivery metrics
        with_due = [p for p in completed if p.due_date is not None]
        if not with_due:
            # No products have due dates — delivery metrics are meaningless
            return {"on_time_rate": None, "average_lateness": 0, "orders_at_risk": 0}

        on_time = [p for p in with_due if p.is_on_time()]
        lateness_values = [p.get_lateness() for p in with_due]

        # Count at-risk orders using product-level delivery data
        orders = self.model.get("orders", [])
        at_risk = 0

        if orders:
            # Build per-product-type delivery stats from completed products
            throughput_by_product: Dict[str, int] = {}
            late_by_product: Dict[str, int] = {}
            for p in completed:
                throughput_by_product[p.product_type] = throughput_by_product.get(p.product_type, 0) + 1
            for p in with_due:
                if not p.is_on_time():
                    late_by_product[p.product_type] = late_by_product.get(p.product_type, 0) + 1

            for order in orders:
                pid = order.get("productId", "")
                qty = order.get("quantity", 0)
                produced = throughput_by_product.get(pid, 0)
                if produced < qty:
                    # Order not fully fulfilled — at risk
                    at_risk += 1
                # Fulfilled orders are never "at risk" — late delivery rates
                # are already captured by on_time_rate.
        else:
            # No formal orders — count in-flight products past their due date
            at_risk = len([p for p in self.active_products.values()
                           if p.due_date is not None and not p.is_on_time()])

        return {
            "on_time_rate": len(on_time) / len(with_due),
            "average_lateness": float(np.mean(lateness_values)) if lateness_values else 0,
            "orders_at_risk": at_risk,
        }

    def to_dict(self) -> Dict[str, Any]:
        """Export simulation state to dictionary."""
        return {
            "model": self.model,
            "config": {
                "duration": self.config.duration,
                "warmup_period": self.config.warmup_period,
                "seed": self.config.seed,
                "replications": self.config.replications,
            },
            "run_id": self.run_id,
            "current_time": self.env.now,
            "is_running": self.is_running,
        }

    def export_to_python(self) -> str:
        """Export the model as standalone Python/SimPy code.

        Generates a comprehensive, runnable script that reproduces the
        full simulation including: stations with cycle times, setup times,
        MTBF/MTTR failures, scrap; buffers with capacity and blocking/
        starving tracking; extra nodes (conveyor, inspection, assembly,
        matchbuffer, splitter, merge, palletize, depalletize, disassembly);
        source/sink nodes; operators; per-process RNG; and encapsulated
        results via a SimResults dataclass.
        """
        L: list = []  # lines accumulator

        # ── Analyze topology ──────────────────────────────────────
        station_keys, config = self._export_analyze_topology()

        # ── Generate each section ─────────────────────────────────
        self._export_header(L)
        self._export_imports(L)
        self._export_config(L, config, station_keys)
        self._export_helpers(L)
        self._export_dataclasses(L, config)
        self._export_buffer_queue(L)
        self._export_extra_node_processors(L, config)
        self._export_station_worker(L, config)
        self._export_product_flow(L, config)
        self._export_source_processes(L, config)
        self._export_main_function(L, config)
        self._export_results_reporting(L, config)
        self._export_entry_point(L)

        return '\n'.join(L)

    # ── Export helpers ─────────────────────────────────────────────

    def _export_analyze_topology(self):
        """Build station keys and config dict for code generation."""

        def _safe_name(name):
            s = ''.join(c if c.isalnum() or c == '_' else '_' for c in name.lower())
            s = '_'.join(p for p in s.split('_') if p)
            return s or 'station'

        # Station keys
        station_keys = {}
        used_keys = set()
        for sid, st in self.stations.items():
            key = _safe_name(st.name)
            if key in used_keys:
                i = 2
                while f"{key}_{i}" in used_keys:
                    i += 1
                key = f"{key}_{i}"
            used_keys.add(key)
            station_keys[sid] = key

        # Buffer keys
        buffer_keys = {}
        used_buf_keys = set()
        for bid, buf in self.buffers.items():
            key = _safe_name(buf.name)
            if key in used_buf_keys:
                i = 2
                while f"{key}_{i}" in used_buf_keys:
                    i += 1
                key = f"{key}_{i}"
            used_buf_keys.add(key)
            buffer_keys[bid] = key

        # Detect splitter fan-out bypass pairs (same logic as _wire_connections)
        from factorysim.engine.extra_nodes import Splitter
        export_skip_pairs = set()  # (buffer_id, station_id)
        for node_id, node in self.extra_nodes.items():
            if isinstance(node, Splitter):
                upstream_bufs = set()
                downstream_stations = set()
                for conn in self.connections:
                    src = conn.get("source") or conn.get("sourceId") or conn.get("source_id")
                    tgt = conn.get("target") or conn.get("targetId") or conn.get("target_id")
                    if tgt == node_id and src in self.buffers:
                        upstream_bufs.add(src)
                    if src == node_id and tgt in self.stations:
                        downstream_stations.add(tgt)
                for b in upstream_bufs:
                    for s in downstream_stations:
                        export_skip_pairs.add((b, s))

        # Station → input/output buffer mapping (input is a list for merge support)
        station_input_buffers = {}  # maps station_key → list of buffer_keys
        station_output_buffers = {}
        for conn in self.connections:
            src = conn.get("source") or conn.get("sourceId") or conn.get("source_id")
            tgt = conn.get("target") or conn.get("targetId") or conn.get("target_id")
            if src in self.buffers and tgt in self.stations:
                if (src, tgt) not in export_skip_pairs:
                    st_key = station_keys[tgt]
                    if st_key not in station_input_buffers:
                        station_input_buffers[st_key] = []
                    buf_key = buffer_keys[src]
                    if buf_key not in station_input_buffers[st_key]:
                        station_input_buffers[st_key].append(buf_key)
            elif src in self.stations and tgt in self.buffers:
                station_output_buffers[station_keys[src]] = buffer_keys[tgt]

        # Create implicit arrival buffers for ANY station that has no explicit
        # input buffer.  This mirrors _ensure_arrival_buffers() at runtime and
        # guarantees every station_worker receives a valid input queue.
        # Capacity matches the station's output buffer to enable backpressure.
        if not hasattr(self, '_export_implicit_buffers'):
            self._export_implicit_buffers = {}
        for station_id, st in self.stations.items():
            st_key = station_keys.get(station_id)
            if st_key and st_key not in station_input_buffers:
                arrival_buf_key = f"arrival_queue_{st_key}"
                buffer_keys[f"__arrival_{station_id}"] = arrival_buf_key
                # Derive capacity from this station's output buffer
                out_buf_key = station_output_buffers.get(st_key)
                cap = 1
                if out_buf_key:
                    for bid, buf in self.buffers.items():
                        if buffer_keys.get(bid) == out_buf_key:
                            cap = buf.capacity
                            break
                buffers_cfg_implicit = {
                    "name": f"Arrival Queue ({st.name})",
                    "capacity": cap,
                    "queue_rule": "FIFO",
                }
                self._export_implicit_buffers[arrival_buf_key] = buffers_cfg_implicit
                station_input_buffers[st_key] = [arrival_buf_key]

        # Map product IDs → safe keys (needed for station productCycleTimes and matchbuffer export)
        product_id_to_key = {pt_id: _safe_name(pt.name) for pt_id, pt in self.product_types.items()}

        # Build stations config
        stations_cfg = {}
        for sid, st in self.stations.items():
            key = station_keys[sid]
            dist_dict = st.cycle_time_dist.to_dict()
            cfg = {
                "name": st.name,
                "cycle_time": {"type": dist_dict["type"], "parameters": dist_dict["parameters"]},
                "scrap_rate": st.scrap_rate or 0.0,
                "batch_size": st.batch_size or 1,
            }
            if st.setup_time_dist:
                setup_dict = st.setup_time_dist.to_dict()
                cfg["setup_time"] = {"type": setup_dict["type"], "parameters": setup_dict["parameters"]}
            if st.mtbf is not None:
                cfg["mtbf"] = st.mtbf
            if st.mttr is not None:
                cfg["mttr"] = st.mttr
            if st.shifts:
                cfg["shifts"] = st.shifts
            # Per-product cycle time overrides
            if st.product_cycle_time_dists:
                pct = {}
                for pid, dist in st.product_cycle_time_dists.items():
                    pkey = product_id_to_key.get(pid, pid)
                    d = dist.to_dict()
                    pct[pkey] = {"type": d["type"], "parameters": d["parameters"]}
                cfg["product_cycle_times"] = pct
            stations_cfg[key] = cfg

        # Build buffers config
        buffers_cfg = {}
        for bid, buf in self.buffers.items():
            key = buffer_keys[bid]
            buffers_cfg[key] = {
                "name": buf.name,
                "capacity": buf.capacity,
                "queue_rule": buf.queue_rule.value if hasattr(buf.queue_rule, 'value') else str(buf.queue_rule),
            }
        # Include implicit arrival buffers created for first-in-routing stations
        if hasattr(self, '_export_implicit_buffers'):
            buffers_cfg.update(self._export_implicit_buffers)
            del self._export_implicit_buffers

        # Build products config
        products_cfg = {}
        source_driven_products = set()
        for pt_id, pt in self.product_types.items():
            key = _safe_name(pt.name)
            routing_keys = [station_keys.get(sid, sid) for sid in pt.routing]
            products_cfg[key] = {
                "name": pt.name,
                "routing": routing_keys,
                "arrival_rate": pt.arrival_rate,
            }
            if pt.due_date_offset is not None:
                products_cfg[key]["due_date_offset"] = pt.due_date_offset
            if pt.priority:
                products_cfg[key]["priority"] = pt.priority

        # Build sources config
        sources_cfg = {}
        for src_id, src in self.sources.items():
            src_key = _safe_name(src.name) + "_src"
            sources_cfg[src_key] = {
                "name": src.name,
                "arrival_rate": src.arrival_rate,
                "product_filter": None,
                "product_batch_size": src.product_batch_size,
            }
            # Determine product filter as product key
            if src.product_filter:
                pt = self.product_types.get(src.product_filter)
                if pt:
                    sources_cfg[src_key]["product_filter"] = _safe_name(pt.name)
                    source_driven_products.add(_safe_name(pt.name))
            else:
                # Auto-detect: follow connections from source through buffers
                # and extra nodes (splitters) to find downstream stations.
                connected_stations = set()
                fwd: dict = {}
                for conn in self.connections:
                    s_id = conn.get("source") or conn.get("sourceId") or conn.get("source_id")
                    t_id = conn.get("target") or conn.get("targetId") or conn.get("target_id")
                    fwd.setdefault(s_id, []).append(t_id)
                from collections import deque
                bfs_q: deque = deque(fwd.get(src.id, []))
                bfs_visited = {src.id}
                while bfs_q:
                    nid = bfs_q.popleft()
                    if nid in bfs_visited:
                        continue
                    bfs_visited.add(nid)
                    if nid in self.stations:
                        connected_stations.add(nid)
                    elif nid in self.buffers or nid in self.extra_nodes:
                        for t in fwd.get(nid, []):
                            if t not in bfs_visited:
                                bfs_q.append(t)
                if connected_stations:
                    filtered = []
                    for pt_id, pt in self.product_types.items():
                        key = _safe_name(pt.name)
                        if pt.routing and pt.routing[0] in connected_stations:
                            filtered.append(key)
                    if filtered:
                        sources_cfg[src_key]["product_filter_list"] = filtered
                        for k in filtered:
                            source_driven_products.add(k)
                    else:
                        for pt_id, pt in self.product_types.items():
                            source_driven_products.add(_safe_name(pt.name))
                else:
                    for pt_id, pt in self.product_types.items():
                        source_driven_products.add(_safe_name(pt.name))

        # Build sinks config
        sinks_cfg = {}
        for snk_id, snk in self.sinks.items():
            snk_key = _safe_name(snk.name) + "_snk"
            sinks_cfg[snk_key] = {"name": snk.name}

        # Build station_to_sink mapping
        station_to_sink = {}
        for sid, snk_id in self._station_to_sink.items():
            st_key = station_keys.get(sid)
            snk = self.sinks.get(snk_id)
            if st_key and snk:
                snk_key = _safe_name(snk.name) + "_snk"
                station_to_sink[st_key] = snk_key

        # Detect buffers connected to sinks (buffer → sink).  These need a
        # drain process in the exported code to prevent the same deadlock
        # that the internal simulation fixes with _sink_buffer_drain().
        sink_buffer_keys = set()
        for buf_id in getattr(self, '_sink_buffers', set()):
            bk = buffer_keys.get(buf_id)
            if bk:
                sink_buffer_keys.add(bk)

        # Build operators config
        operators_cfg = {}
        operator_id_to_key = {}
        for res_id, res in self.resources.items():
            if res.resource_type.value == "operator" if hasattr(res.resource_type, 'value') else str(res.resource_type) == "operator":
                op_key = _safe_name(res.name) + "_op"
                operators_cfg[op_key] = {
                    "name": res.name,
                    "count": res.capacity,
                    "efficiency": res.efficiency,
                }
                operator_id_to_key[res_id] = op_key

        # Build station_operators mapping
        station_operators = {}
        for sid, op_ids in self._station_operators.items():
            st_key = station_keys.get(sid)
            if st_key:
                station_operators[st_key] = [
                    operator_id_to_key[oid] for oid in op_ids
                    if oid in operator_id_to_key
                ]

        # Build extra-node chains config
        extra_node_chains = {}
        pre_routing_chains = {}  # (None, station) chains for input-chain splitters
        for (from_id, to_id), node_ids in self._extra_node_chains.items():
            from_key = station_keys.get(from_id)
            to_key = station_keys.get(to_id)
            if from_id is None and to_key and node_ids:
                # Pre-routing chain (input chain): extra nodes before first station
                chain = []
                for nid in node_ids:
                    node = self.extra_nodes.get(nid)
                    if node:
                        chain.append(self._export_extra_node_cfg(node, product_id_to_key))
                if chain:
                    pre_routing_chains[to_key] = chain
            elif from_key and to_key and node_ids:
                chain = []
                for nid in node_ids:
                    node = self.extra_nodes.get(nid)
                    if node:
                        chain.append(self._export_extra_node_cfg(node, product_id_to_key))
                if chain:
                    extra_node_chains[f"{from_key}->{to_key}"] = chain

        # Suppress output buffers for chain-source stations
        for chain_key in extra_node_chains:
            from_key = chain_key.split("->")[0]
            station_output_buffers.pop(from_key, None)

        # Build output chains config
        output_chains = {}
        for sid, node_ids in self._extra_node_output_chains.items():
            st_key = station_keys.get(sid)
            if st_key and node_ids:
                chain = []
                for nid in node_ids:
                    node = self.extra_nodes.get(nid)
                    if node:
                        chain.append(self._export_extra_node_cfg(node, product_id_to_key))
                if chain:
                    output_chains[st_key] = chain

        # Suppress output buffers for output-chain stations too
        for st_key in output_chains:
            station_output_buffers.pop(st_key, None)

        # Build splitter → ordered output stations map for routing redirect
        splitter_output_stations = {}
        for node_id, node in self.extra_nodes.items():
            if isinstance(node, Splitter):
                ordered_targets = []
                for conn in self.connections:
                    src = conn.get("source") or conn.get("sourceId") or conn.get("source_id")
                    tgt = conn.get("target") or conn.get("targetId") or conn.get("target_id")
                    if src == node_id:
                        if tgt in self.stations and station_keys[tgt] not in ordered_targets:
                            ordered_targets.append(station_keys[tgt])
                        elif tgt in self.buffers:
                            for c2 in self.connections:
                                s2 = c2.get("source") or c2.get("sourceId") or c2.get("source_id")
                                t2 = c2.get("target") or c2.get("targetId") or c2.get("target_id")
                                if s2 == tgt and t2 in self.stations and station_keys[t2] not in ordered_targets:
                                    ordered_targets.append(station_keys[t2])
                if ordered_targets:
                    # Use original name (not _safe_name) to match process_splitter
                    # which reads from node_cfg["name"] (the display name).
                    splitter_output_stations[node.name] = ordered_targets

        # Determine which extra node types are used
        extra_node_types_used = set()
        for node in self.extra_nodes.values():
            extra_node_types_used.add(node.node_type)

        config = {
            "model_name": self.model.get("name", "Untitled"),
            "duration": self.config.duration,
            "seed": self.config.seed or 42,
            "start_day_of_week": self.config.start_day_of_week,
            "start_hour": self.config.start_hour,
            "stations": stations_cfg,
            "buffers": buffers_cfg,
            "products": products_cfg,
            "sources": sources_cfg,
            "sinks": sinks_cfg,
            "operators": operators_cfg,
            "station_operators": station_operators,
            "station_input_buffers": station_input_buffers,
            "station_output_buffers": station_output_buffers,
            "station_to_sink": station_to_sink,
            "sink_buffers": list(sink_buffer_keys),
            "extra_node_chains": extra_node_chains,
            "pre_routing_chains": pre_routing_chains,
            "output_chains": output_chains,
            "source_driven_products": list(source_driven_products),
            "extra_node_types_used": extra_node_types_used,
            "splitter_output_stations": splitter_output_stations,
        }

        return station_keys, config

    def _export_extra_node_cfg(self, node, product_id_to_key=None) -> dict:
        """Convert an ExtraNode instance to a config dict for code generation."""
        cfg = {"type": node.node_type, "name": node.name}
        if node.node_type == "conveyor":
            cfg["length"] = node.length
            cfg["speed"] = node.speed
        elif node.node_type == "inspection":
            cfg["inspection_time"] = node.inspection_time
            cfg["defect_rate"] = node.defect_rate
        elif node.node_type == "assembly":
            cfg["cycle_time"] = node.cycle_time
            cfg["input_parts"] = node.input_parts
        elif node.node_type == "matchbuffer":
            cfg["capacity"] = node.capacity
            cfg["match_key"] = node.match_key
            cfg["timeout"] = node.timeout_duration
            if product_id_to_key and hasattr(node, 'required_parts') and node.required_parts:
                cfg["required_parts"] = [
                    {"product_key": product_id_to_key.get(r.get("productId", ""), r.get("productId", "")),
                     "quantity": r.get("quantity", 1)}
                    for r in node.required_parts
                ]
        elif node.node_type == "splitter":
            cfg["outputs"] = node.outputs
            cfg["split_type"] = node.split_type
            if node.percentages:
                cfg["percentages"] = node.percentages
            if node.product_routing:
                if product_id_to_key:
                    cfg["product_routing"] = {
                        product_id_to_key.get(pid, pid): idx
                        for pid, idx in node.product_routing.items()
                    }
                else:
                    cfg["product_routing"] = node.product_routing
        elif node.node_type == "merge":
            cfg["inputs"] = node.inputs
        elif node.node_type == "disassembly":
            cfg["cycle_time"] = node.cycle_time
            if node.output_parts:
                cfg["output_parts"] = [
                    {"product_key": product_id_to_key.get(p["productId"], p["productId"]) if product_id_to_key else p["productId"],
                     "quantity": p.get("quantity", 1)}
                    for p in node.output_parts
                ]
        elif node.node_type == "palletize":
            cfg["pallet_size"] = node.default_pallet_size
            cfg["cycle_time"] = node.cycle_time
        elif node.node_type == "depalletize":
            cfg["cycle_time"] = node.cycle_time
        return cfg

    def _export_header(self, L):
        model_name = self.model.get("name", "Untitled")
        L.append('"""')
        L.append(f'FactorySim Model: {model_name}')
        L.append(f'Generated: {datetime.now().isoformat()}')
        L.append('')
        L.append('Standalone SimPy discrete-event simulation.')
        L.append('Supports: stations, buffers, extra nodes, sources, sinks,')
        L.append('operators, failures (MTBF/MTTR), setup times, and scrap.')
        L.append('')
        L.append('Requirements: pip install simpy numpy')
        L.append('"""')
        L.append('')

    def _export_imports(self, L):
        L.append('import math')
        L.append('import simpy')
        L.append('import numpy as np')
        L.append('from dataclasses import dataclass, field')
        L.append('from typing import List, Dict, Optional, Any')
        L.append('')
        L.append('')

    def _export_config(self, L, config, station_keys):
        """Emit the MODEL_CONFIG dict literal."""
        L.append('# ═══════════════════════════════════════════════════════════')
        L.append('#  MODEL CONFIGURATION')
        L.append('# ═══════════════════════════════════════════════════════════')
        L.append('')

        def _repr(obj, indent=0):
            """Pretty-print a Python object as source code."""
            prefix = '    ' * indent
            if obj is None:
                return 'None'
            if isinstance(obj, bool):
                return 'True' if obj else 'False'
            if isinstance(obj, (int, float)):
                return repr(obj)
            if isinstance(obj, str):
                return repr(obj)
            if isinstance(obj, list):
                if not obj:
                    return '[]'
                if all(isinstance(x, (str, int, float, bool)) for x in obj):
                    return '[' + ', '.join(_repr(x) for x in obj) + ']'
                items = []
                for x in obj:
                    items.append(prefix + '    ' + _repr(x, indent + 1))
                return '[\n' + ',\n'.join(items) + ',\n' + prefix + ']'
            if isinstance(obj, dict):
                if not obj:
                    return '{}'
                items = []
                for k, v in obj.items():
                    items.append(prefix + '    ' + repr(k) + ': ' + _repr(v, indent + 1))
                return '{\n' + ',\n'.join(items) + ',\n' + prefix + '}'
            return repr(obj)

        # Build a serializable config (no sets)
        serializable = {
            "name": config["model_name"],
            "duration": config["duration"],
            "seed": config["seed"],
            "start_day_of_week": config["start_day_of_week"],
            "start_hour": config["start_hour"],
            "stations": config["stations"],
            "buffers": config["buffers"],
            "products": config["products"],
            "sources": config["sources"],
            "sinks": config["sinks"],
            "operators": config["operators"],
            "station_operators": config["station_operators"],
            "station_input_buffers": config["station_input_buffers"],
            "station_output_buffers": config["station_output_buffers"],
            "station_to_sink": config["station_to_sink"],
            "extra_node_chains": config["extra_node_chains"],
            "pre_routing_chains": config.get("pre_routing_chains", {}),
            "output_chains": config["output_chains"],
            "source_driven_products": config["source_driven_products"],
            "splitter_output_stations": config.get("splitter_output_stations", {}),
        }

        L.append('MODEL_CONFIG = ' + _repr(serializable))
        L.append('')
        L.append('')

    def _export_helpers(self, L):
        L.append('# ═══════════════════════════════════════════════════════════')
        L.append('#  HELPERS')
        L.append('# ═══════════════════════════════════════════════════════════')
        L.append('')
        L.append('def sample_distribution(dist: dict, rng) -> float:')
        L.append('    """Sample from a configured statistical distribution."""')
        L.append('    dt, p = dist["type"], dist["parameters"]')
        L.append('    if dt == "constant":')
        L.append('        return p["value"]')
        L.append('    elif dt == "normal":')
        L.append('        return max(0.0, rng.normal(p["mean"], p.get("std", 0)))')
        L.append('    elif dt == "exponential":')
        L.append('        return rng.exponential(p["mean"])')
        L.append('    elif dt == "triangular":')
        L.append('        return rng.triangular(p["min"], p["mode"], p["max"])')
        L.append('    elif dt == "weibull":')
        L.append('        return p.get("scale", 1) * rng.weibull(p.get("shape", 1))')
        L.append('    elif dt == "uniform":')
        L.append('        return rng.uniform(p["min"], p["max"])')
        L.append('    elif dt == "lognormal":')
        L.append('        return rng.lognormal(p["mean"], p.get("std", 0))')
        L.append('    elif dt == "empirical":')
        L.append('        return float(rng.choice(p["data"]))')
        L.append('    raise ValueError(f"Unknown distribution type: {dt}")')
        L.append('')
        L.append('')
        L.append('def make_rng(master_rng, label: str):')
        L.append('    """Spawn a child RNG with a deterministic seed from master."""')
        L.append('    seed = int(master_rng.integers(0, 2**31))')
        L.append('    return np.random.default_rng(seed)')
        L.append('')
        L.append('')

    def _export_dataclasses(self, L, config):
        L.append('# ═══════════════════════════════════════════════════════════')
        L.append('#  DATA CLASSES')
        L.append('# ═══════════════════════════════════════════════════════════')
        L.append('')
        # Part dataclass
        L.append('@dataclass')
        L.append('class Part:')
        L.append('    """A part flowing through the factory."""')
        L.append('    id: int')
        L.append('    product_type: str')
        L.append('    routing: List[str]')
        L.append('    routing_index: int = 0')
        L.append('    created_at: float = 0.0')
        L.append('    completed_at: Optional[float] = None')
        L.append('    is_scrapped: bool = False')
        L.append('    timestamps: Dict[str, float] = field(default_factory=dict)')
        L.append('    attributes: Dict[str, Any] = field(default_factory=dict)')
        L.append('    priority: int = 0')
        L.append('    due_date: Optional[float] = None')
        L.append('    _done_event: Any = field(default=None, repr=False)')
        L.append('')
        L.append('    def next_station(self) -> Optional[str]:')
        L.append('        if self.routing_index < len(self.routing):')
        L.append('            return self.routing[self.routing_index]')
        L.append('        return None')
        L.append('')
        L.append('    def advance(self):')
        L.append('        self.routing_index += 1')
        L.append('')
        L.append('    def cycle_time(self) -> float:')
        L.append('        if self.completed_at is not None:')
        L.append('            return self.completed_at - self.created_at')
        L.append('        return 0.0')
        L.append('')
        L.append('')
        # SimResults dataclass
        L.append('@dataclass')
        L.append('class SimResults:')
        L.append('    """Encapsulated simulation results (no globals)."""')
        L.append('    completed: list = field(default_factory=list)')
        L.append('    scrapped: list = field(default_factory=list)')
        L.append('    active: Dict[int, Any] = field(default_factory=dict)  # id -> Part (in-flight)')
        L.append('    part_counter: int = 0')
        L.append('    station_busy: Dict[str, float] = field(default_factory=dict)')
        L.append('    station_idle: Dict[str, float] = field(default_factory=dict)')
        L.append('    station_blocked: Dict[str, float] = field(default_factory=dict)')
        L.append('    station_failed: Dict[str, float] = field(default_factory=dict)')
        L.append('    station_setup: Dict[str, float] = field(default_factory=dict)')
        L.append('    station_off_shift: Dict[str, float] = field(default_factory=dict)')
        L.append('    station_count: Dict[str, int] = field(default_factory=dict)')
        L.append('    station_batch_wait: Dict[str, float] = field(default_factory=dict)')
        L.append('    source_generated: Dict[str, int] = field(default_factory=dict)')
        L.append('    sink_exited: Dict[str, int] = field(default_factory=dict)')
        L.append('')
        L.append('    def new_part_id(self):')
        L.append('        self.part_counter += 1')
        L.append('        return self.part_counter')
        L.append('')
        L.append('')

    def _export_buffer_queue(self, L):
        L.append('# ═══════════════════════════════════════════════════════════')
        L.append('#  BUFFER QUEUE')
        L.append('# ═══════════════════════════════════════════════════════════')
        L.append('')
        L.append('class BufferQueue:')
        L.append('    """Capacity-limited queue with blocking/starving tracking."""')
        L.append('')
        L.append('    def __init__(self, env, name, capacity=float("inf"), queue_rule="FIFO"):')
        L.append('        self.store = simpy.Store(env, capacity=int(capacity) if capacity != float("inf") else capacity)')
        L.append('        self.env = env')
        L.append('        self.name = name')
        L.append('        self.capacity = capacity')
        L.append('        self.queue_rule = queue_rule')
        L.append('        self.current_level = 0')
        L.append('        self.blocking_time = 0.0')
        L.append('        self.blocking_count = 0')
        L.append('        self.starving_time = 0.0')
        L.append('        self.starving_count = 0')
        L.append('        self.max_level = 0')
        L.append('        self.wip_area = 0.0')
        L.append('        self._last_change_time = 0.0')
        L.append('        self._space_event = env.event()  # signalled when an item is removed')
        L.append('')
        L.append('    @property')
        L.append('    def items(self):')
        L.append('        return self.store.items')
        L.append('')
        L.append('    def put(self, item):')
        L.append('        t0 = self.env.now')
        L.append('        if self.capacity != float("inf") and self.current_level >= self.capacity:')
        L.append('            self.blocking_count += 1')
        L.append('        yield self.store.put(item)')
        L.append('        if self.queue_rule == "LIFO":')
        L.append('            # Move newest item to front so Store.get() (FIFO pop-0) returns it first')
        L.append('            self.store.items.insert(0, self.store.items.pop())')
        L.append('        elif self.queue_rule == "PRIORITY":')
        L.append('            # Sort by priority descending so Store.get() (pop-0) returns highest priority')
        L.append('            self.store.items.sort(key=lambda p: getattr(p, "priority", 0), reverse=True)')
        L.append('        blocked = self.env.now - t0')
        L.append('        if blocked > 0:')
        L.append('            self.blocking_time += blocked')
        L.append('        self._update_level(self.current_level + 1)')
        L.append('')
        L.append('    def get(self):')
        L.append('        t0 = self.env.now')
        L.append('        if self.current_level == 0:')
        L.append('            self.starving_count += 1')
        L.append('        item = yield self.store.get()')
        L.append('        starved = self.env.now - t0')
        L.append('        if starved > 0:')
        L.append('            self.starving_time += starved')
        L.append('        self._update_level(self.current_level - 1)')
        L.append('        # Signal any source waiting for space')
        L.append('        old_evt = self._space_event')
        L.append('        self._space_event = self.env.event()')
        L.append('        if not old_evt.triggered:')
        L.append('            old_evt.succeed()')
        L.append('        return item')
        L.append('')
        L.append('    def _update_level(self, new_level):')
        L.append('        dt = self.env.now - self._last_change_time')
        L.append('        self.wip_area += self.current_level * dt')
        L.append('        self.current_level = new_level')
        L.append('        self.max_level = max(self.max_level, new_level)')
        L.append('        self._last_change_time = self.env.now')
        L.append('')
        L.append('    def avg_wip(self, duration):')
        L.append('        total = self.wip_area + self.current_level * (self.env.now - self._last_change_time)')
        L.append('        return total / duration if duration > 0 else 0')
        L.append('')
        L.append('')

    def _export_extra_node_processors(self, L, config):
        types_used = config.get("extra_node_types_used", set())
        if not types_used:
            return

        L.append('# ═══════════════════════════════════════════════════════════')
        L.append('#  EXTRA-NODE PROCESSORS')
        L.append('# ═══════════════════════════════════════════════════════════')
        L.append('')

        if "conveyor" in types_used:
            L.append('def process_conveyor(env, part, node_cfg, rng, results):')
            L.append('    """Transport delay: length / speed."""')
            L.append('    speed = node_cfg.get("speed", 1)')
            L.append('    length = node_cfg.get("length", 5)')
            L.append('    transit = length / speed if speed > 0 else 0')
            L.append('    yield env.timeout(transit)')
            L.append('    return part')
            L.append('')
            L.append('')

        if "inspection" in types_used:
            L.append('def process_inspection(env, part, node_cfg, rng, results):')
            L.append('    """Inspection delay + defect check."""')
            L.append('    yield env.timeout(node_cfg.get("inspection_time", 10))')
            L.append('    if node_cfg.get("defect_rate", 0) > 0 and rng.random() < node_cfg["defect_rate"]:')
            L.append('        part.is_scrapped = True')
            L.append('        part.completed_at = env.now')
            L.append('        results.scrapped.append(part)')
            L.append('    return part')
            L.append('')
            L.append('')

        if "splitter" in types_used:
            L.append('_splitter_counters = {}')
            L.append('')
            L.append('def process_splitter(env, part, node_cfg, rng, results):')
            L.append('    """Tag part with splitter output index (instant)."""')
            L.append('    split_type = node_cfg.get("split_type", "equal")')
            L.append('    outputs = node_cfg.get("outputs", 2)')
            L.append('    name = node_cfg.get("name", "splitter")')
            L.append('    if split_type == "equal":')
            L.append('        idx = _splitter_counters.get(name, 0)')
            L.append('        _splitter_counters[name] = (idx + 1) % outputs')
            L.append('        part.attributes["_splitter_output"] = idx')
            L.append('    elif split_type == "percentage":')
            L.append('        pcts = node_cfg.get("percentages", [])')
            L.append('        if pcts:')
            L.append('            r = rng.random() * 100')
            L.append('            cumulative = 0.0')
            L.append('            idx = len(pcts) - 1')
            L.append('            for i, p in enumerate(pcts):')
            L.append('                cumulative += p')
            L.append('                if r < cumulative:')
            L.append('                    idx = i')
            L.append('                    break')
            L.append('            part.attributes["_splitter_output"] = idx')
            L.append('        else:')
            L.append('            part.attributes["_splitter_output"] = int(rng.random() * outputs)')
            L.append('    elif split_type == "product-based":')
            L.append('        pr = node_cfg.get("product_routing", {})')
            L.append('        pt = part.attributes.get("product_type", "")')
            L.append('        part.attributes["_splitter_output"] = pr.get(pt, 0)')
            L.append('    part.attributes["_splitter_name"] = name')
            L.append('    yield env.timeout(0)')
            L.append('    return part')
            L.append('')
            L.append('')

        if "merge" in types_used:
            L.append('def process_merge(env, part, node_cfg, rng, results):')
            L.append('    """Pass-through (instant)."""')
            L.append('    yield env.timeout(0)')
            L.append('    return part')
            L.append('')
            L.append('')

        if "assembly" in types_used:
            L.append('_assembly_buffers = {}')
            L.append('')
            L.append('def process_assembly(env, part, node_cfg, rng, results):')
            L.append('    """Wait for required parts, consume secondaries, output primary."""')
            L.append('    name = node_cfg.get("name", "assembly")')
            L.append('    required = node_cfg.get("input_parts", 2)')
            L.append('    ct = node_cfg.get("cycle_time", 0)')
            L.append('    buf = _assembly_buffers.setdefault(name, [])')
            L.append('    buf.append(part)')
            L.append('    if len(buf) < required:')
            L.append('        event = env.event()')
            L.append('        part._done_event = event')
            L.append('        yield event')
            L.append('        return part._done_event  # will be set to result by assembler')
            L.append('    # Enough parts: assemble')
            L.append('    items = buf[:required]')
            L.append('    _assembly_buffers[name] = buf[required:]')
            L.append('    yield env.timeout(ct)')
            L.append('    primary = items[0]')
            L.append('    for other in items[1:]:')
            L.append('        if hasattr(other, "_done_event") and other._done_event and not other._done_event.triggered:')
            L.append('            other._done_event.succeed()')
            L.append('    return primary')
            L.append('')
            L.append('')

        if "disassembly" in types_used:
            L.append('def process_disassembly(env, part, node_cfg, rng, results, queues):')
            L.append('    """Cycle time delay + spawn sub-products from output_parts config."""')
            L.append('    yield env.timeout(node_cfg.get("cycle_time", 0))')
            L.append('    for op in node_cfg.get("output_parts", []):')
            L.append('        pk = op["product_key"]')
            L.append('        qty = op.get("quantity", 1)')
            L.append('        pcfg = MODEL_CONFIG["products"].get(pk)')
            L.append('        if not pcfg:')
            L.append('            continue')
            L.append('        for _ in range(qty):')
            L.append('            new_part = Part(')
            L.append('                id=results.new_part_id(),')
            L.append('                product_type=pk,')
            L.append('                routing=list(pcfg["routing"]),')
            L.append('                created_at=env.now,')
            L.append('            )')
            L.append('            env.process(product_flow(env, new_part, queues, results, rng))')
            L.append('    return part')
            L.append('')
            L.append('')

        if "palletize" in types_used:
            L.append('_palletize_buffers = {}')
            L.append('')
            L.append('def process_palletize(env, part, node_cfg, rng, results):')
            L.append('    """Accumulate parts until pallet_size, then output carrier."""')
            L.append('    name = node_cfg.get("name", "palletize")')
            L.append('    pallet_size = node_cfg.get("pallet_size", 10)')
            L.append('    ct = node_cfg.get("cycle_time", 0)')
            L.append('    buf = _palletize_buffers.setdefault(name, [])')
            L.append('    buf.append(part)')
            L.append('    if len(buf) < pallet_size:')
            L.append('        event = env.event()')
            L.append('        part._done_event = event')
            L.append('        yield event')
            L.append('        return None  # consumed')
            L.append('    items = buf[:pallet_size]')
            L.append('    _palletize_buffers[name] = buf[pallet_size:]')
            L.append('    yield env.timeout(ct)')
            L.append('    primary = items[0]')
            L.append('    primary.attributes["_pallet_size"] = len(items)')
            L.append('    for other in items[1:]:')
            L.append('        if hasattr(other, "_done_event") and other._done_event and not other._done_event.triggered:')
            L.append('            other._done_event.succeed()')
            L.append('    return primary')
            L.append('')
            L.append('')

        if "depalletize" in types_used:
            L.append('def process_depalletize(env, part, node_cfg, rng, results, queues):')
            L.append('    """Unpack pallet: primary continues, extras spawned as new flows."""')
            L.append('    pallet_size = part.attributes.get("_pallet_size", 1)')
            L.append('    ct = node_cfg.get("cycle_time", 5) * pallet_size')
            L.append('    yield env.timeout(ct)')
            L.append('    part.attributes.pop("_pallet_size", None)')
            L.append('    part.attributes.pop("_is_pallet", None)')
            L.append('    extra_count = pallet_size - 1')
            L.append('    if extra_count > 0:')
            L.append('        remaining = part.routing[part.routing_index:]')
            L.append('        for _ in range(extra_count):')
            L.append('            new_part = Part(')
            L.append('                id=results.new_part_id(),')
            L.append('                product_type=part.product_type,')
            L.append('                routing=list(remaining),')
            L.append('                created_at=env.now,')
            L.append('            )')
            L.append('            env.process(product_flow(env, new_part, queues, results, rng))')
            L.append('    return part')
            L.append('')
            L.append('')

        if "matchbuffer" in types_used:
            L.append('_match_buffers = {}')
            L.append('')
            L.append('def process_matchbuffer(env, part, node_cfg, rng, results):')
            L.append('    """Match-key synchronization buffer."""')
            L.append('    name = node_cfg["name"]')
            L.append('    timeout_dur = node_cfg.get("timeout", 0)')
            L.append('    required = node_cfg.get("required_parts", [])')
            L.append('    if name not in _match_buffers:')
            L.append('        _match_buffers[name] = {"waiting": {}, "events": {}}')
            L.append('    mb = _match_buffers[name]')
            L.append('')
            L.append('    # If no required_parts configured, pass through')
            L.append('    if not required:')
            L.append('        if timeout_dur:')
            L.append('            yield env.timeout(timeout_dur)')
            L.append('        else:')
            L.append('            yield env.timeout(0)')
            L.append('        return part')
            L.append('')
            L.append('    # Store arriving part by product type')
            L.append('    pt = part.product_type')
            L.append('    if pt not in mb["waiting"]:')
            L.append('        mb["waiting"][pt] = []')
            L.append('    mb["waiting"][pt].append(part)')
            L.append('    done_event = env.event()')
            L.append('    if pt not in mb["events"]:')
            L.append('        mb["events"][pt] = []')
            L.append('    mb["events"][pt].append(done_event)')
            L.append('')
            L.append('    # Check if all required parts are met')
            L.append('    def _check_match():')
            L.append('        for req in required:')
            L.append('            pk = req["product_key"]')
            L.append('            qty = req.get("quantity", 1)')
            L.append('            if len(mb["waiting"].get(pk, [])) < qty:')
            L.append('                return False')
            L.append('        return True')
            L.append('')
            L.append('    if _check_match():')
            L.append('        # Release matched set: primary part continues, others consumed')
            L.append('        primary = None')
            L.append('        for req in required:')
            L.append('            pk = req["product_key"]')
            L.append('            qty = req.get("quantity", 1)')
            L.append('            for _ in range(qty):')
            L.append('                p = mb["waiting"][pk].pop(0)')
            L.append('                e = mb["events"][pk].pop(0)')
            L.append('                if p.id == part.id:')
            L.append('                    primary = p')
            L.append('                    e.succeed(value=p)')
            L.append('                else:')
            L.append('                    e.succeed(value=p)     # secondary continues through routing')
            L.append('        if primary is None:')
            L.append('            # This part was consumed by the match')
            L.append('            result = yield done_event')
            L.append('            return result')
            L.append('        return primary')
            L.append('')
            L.append('    # Wait for match or timeout')
            L.append('    if timeout_dur:')
            L.append('        result = yield done_event | env.timeout(timeout_dur)')
            L.append('        if done_event.triggered:')
            L.append('            return done_event.value')
            L.append('        # Timeout: remove from waiting and continue')
            L.append('        if pt in mb["waiting"] and part in mb["waiting"][pt]:')
            L.append('            idx = mb["waiting"][pt].index(part)')
            L.append('            mb["waiting"][pt].pop(idx)')
            L.append('            mb["events"][pt].pop(idx)')
            L.append('        return part')
            L.append('    else:')
            L.append('        result = yield done_event')
            L.append('        return result')
            L.append('')
            L.append('')

        # Dispatcher
        L.append('def process_extra_node(env, part, node_cfg, rng, results, queues):')
        L.append('    """Dispatch to the appropriate extra-node processor."""')
        L.append('    processors = {')
        if "conveyor" in types_used:
            L.append('        "conveyor": process_conveyor,')
        if "inspection" in types_used:
            L.append('        "inspection": process_inspection,')
        if "splitter" in types_used:
            L.append('        "splitter": process_splitter,')
        if "merge" in types_used:
            L.append('        "merge": process_merge,')
        if "assembly" in types_used:
            L.append('        "assembly": process_assembly,')
        if "disassembly" in types_used:
            L.append('        "disassembly": process_disassembly,')
        if "palletize" in types_used:
            L.append('        "palletize": process_palletize,')
        if "depalletize" in types_used:
            L.append('        "depalletize": process_depalletize,')
        if "matchbuffer" in types_used:
            L.append('        "matchbuffer": process_matchbuffer,')
        L.append('    }')
        L.append('    processor = processors.get(node_cfg["type"])')
        L.append('    if processor:')
        _needs_queues = {"depalletize", "disassembly"} & types_used
        if _needs_queues:
            conditions = ' or '.join(f'node_cfg["type"] == "{t}"' for t in sorted(_needs_queues))
            L.append(f'        if {conditions}:')
            L.append('            result = yield env.process(processor(env, part, node_cfg, rng, results, queues))')
            L.append('        else:')
            L.append('            result = yield env.process(processor(env, part, node_cfg, rng, results))')
        else:
            L.append('        result = yield env.process(processor(env, part, node_cfg, rng, results))')
        L.append('        return result')
        L.append('    yield env.timeout(0)')
        L.append('    return part')
        L.append('')
        L.append('')

    def _export_station_worker(self, L, config):
        has_operators = bool(config["operators"])
        has_failures = any(
            s.get("mtbf") for s in config["stations"].values()
        )
        has_setup = any(
            s.get("setup_time") for s in config["stations"].values()
        )
        has_shifts = any(
            s.get("shifts") for s in config["stations"].values()
        )

        L.append('# ═══════════════════════════════════════════════════════════')
        L.append('#  STATION PROCESSES')
        L.append('# ═══════════════════════════════════════════════════════════')
        L.append('')

        # Shift helper
        if has_shifts:
            L.append('def is_in_shift(env, shifts):')
            L.append('    """Check if current simulation time falls within an active shift."""')
            L.append('    if not shifts:')
            L.append('        return True  # No shifts = 24/7 operation')
            L.append('    hours_in_day = 24 * 3600')
            L.append('    seconds_per_hour = 3600')
            L.append('    start_offset = (MODEL_CONFIG.get("start_day_of_week", 0) * hours_in_day')
            L.append('                     + MODEL_CONFIG.get("start_hour", 0.0) * seconds_per_hour)')
            L.append('    adjusted_time = env.now + start_offset')
            L.append('    day_of_week = int((adjusted_time // hours_in_day) % 7)')
            L.append('    hour_of_day = (adjusted_time % hours_in_day) / seconds_per_hour')
            L.append('    for shift in shifts:')
            L.append('        days = shift.get("days", [0, 1, 2, 3, 4])')
            L.append('        start_hour = shift.get("startHour", shift.get("start_hour", 0))')
            L.append('        end_hour = shift.get("endHour", shift.get("end_hour", 24))')
            L.append('        if day_of_week in days:')
            L.append('            if start_hour <= end_hour:')
            L.append('                if start_hour <= hour_of_day < end_hour:')
            L.append('                    return True')
            L.append('            else:')
            L.append('                # Overnight shift')
            L.append('                if hour_of_day >= start_hour or hour_of_day < end_hour:')
            L.append('                    return True')
            L.append('    return False')
            L.append('')
            L.append('')
            L.append('def _is_in_shift_at(t, shifts):')
            L.append('    """Check if a specific simulation time t falls within an active shift."""')
            L.append('    if not shifts:')
            L.append('        return True')
            L.append('    hours_in_day = 24 * 3600')
            L.append('    seconds_per_hour = 3600')
            L.append('    start_offset = (MODEL_CONFIG.get("start_day_of_week", 0) * hours_in_day')
            L.append('                     + MODEL_CONFIG.get("start_hour", 0.0) * seconds_per_hour)')
            L.append('    adjusted_time = t + start_offset')
            L.append('    day_of_week = int((adjusted_time // hours_in_day) % 7)')
            L.append('    hour_of_day = (adjusted_time % hours_in_day) / seconds_per_hour')
            L.append('    for shift in shifts:')
            L.append('        days = shift.get("days", [0, 1, 2, 3, 4])')
            L.append('        start_hour = shift.get("startHour", shift.get("start_hour", 0))')
            L.append('        end_hour = shift.get("endHour", shift.get("end_hour", 24))')
            L.append('        if day_of_week in days:')
            L.append('            if start_hour <= end_hour:')
            L.append('                if start_hour <= hour_of_day < end_hour:')
            L.append('                    return True')
            L.append('            else:')
            L.append('                if hour_of_day >= start_hour or hour_of_day < end_hour:')
            L.append('                    return True')
            L.append('    return False')
            L.append('')
            L.append('')
            L.append('def _off_shift_time_in_interval(t_start, t_end, shifts):')
            L.append('    """Calculate how many seconds in [t_start, t_end] fall outside active shifts."""')
            L.append('    if not shifts or t_end <= t_start:')
            L.append('        return 0.0')
            L.append('    step = 60  # 60-second granularity')
            L.append('    off_time = 0.0')
            L.append('    t = t_start')
            L.append('    while t < t_end:')
            L.append('        chunk = min(step, t_end - t)')
            L.append('        if not _is_in_shift_at(t, shifts):')
            L.append('            off_time += chunk')
            L.append('        t += chunk')
            L.append('    return off_time')
            L.append('')
            L.append('')

        # Failure process — event-based pattern (no PreemptiveResource)
        if has_failures:
            L.append('# Shared failure state')
            L.append('fail_events = {}      # key -> simpy.Event (fired when failure starts)')
            L.append('repair_events = {}    # key -> simpy.Event (fired when repair completes)')
            L.append('station_failed = {}   # key -> bool')
            L.append('')
            L.append('')
            L.append('def failure_process(env, key, cfg, results, rng):')
            L.append('    """Random failures: event-based pattern matching internal engine."""')
            L.append('    mtbf_s = cfg["mtbf"] * 3600  # convert hours to seconds')
            L.append('    mttr_s = cfg.get("mttr", 0.5) * 3600')
            L.append('    station_failed[key] = False')
            L.append('    fail_events[key] = env.event()')
            L.append('    repair_events[key] = env.event()')
            L.append('    while True:')
            L.append('        ttf = rng.exponential(mtbf_s)')
            L.append('        yield env.timeout(ttf)')
            L.append('        station_failed[key] = True')
            L.append('        if not fail_events[key].triggered:')
            L.append('            fail_events[key].succeed()')
            L.append('        fail_events[key] = env.event()')
            L.append('        repair = rng.exponential(mttr_s)')
            L.append('        results.station_failed[key] = results.station_failed.get(key, 0) + repair')
            L.append('        yield env.timeout(repair)')
            L.append('        station_failed[key] = False')
            L.append('        if not repair_events[key].triggered:')
            L.append('            repair_events[key].succeed()')
            L.append('        repair_events[key] = env.event()')
            L.append('')
            L.append('')

        L.append('def station_worker(env, key, cfg, input_buf, output_buf, queues,')
        L.append('                   operators, results, rng):')
        L.append('    """Pull from input, process (with failures/setup/operators), push to output."""')
        L.append('    # Normalize input_buf: may be a single buffer or a list (merge topology)')
        L.append('    input_bufs = input_buf if isinstance(input_buf, list) else [input_buf]')
        L.append('    merge_idx = 0')
        L.append('    results.station_busy[key] = 0.0')
        L.append('    results.station_count[key] = 0')
        L.append('    results.station_batch_wait[key] = 0.0')
        L.append('    results.station_blocked[key] = 0.0')
        L.append('    results.station_failed[key] = results.station_failed.get(key, 0.0)')
        L.append('    results.station_setup[key] = 0.0')
        if has_shifts:
            L.append('    results.station_off_shift[key] = 0.0')
        L.append('    last_product_type = None')
        L.append('')
        L.append('    while True:')

        if has_shifts:
            L.append('        # Wait if outside shift schedule')
            L.append('        shifts = cfg.get("shifts")')
            L.append('        if shifts and not is_in_shift(env, shifts):')
            L.append('            off_start = env.now')
            L.append('            while not is_in_shift(env, shifts):')
            L.append('                yield env.timeout(60)  # Poll every 60s')
            L.append('            results.station_off_shift[key] += env.now - off_start')
            L.append('')

        if has_shifts:
            L.append('        # Get part from input buffer(s), tracking off-shift time during wait')
            L.append('        get_start = env.now')
            L.append('        if len(input_bufs) > 1:')
            L.append('            # merge_idx tracks round-robin position across calls')
            L.append('            part = None')
            L.append('            while part is None:')
            L.append('                for _i in range(len(input_bufs)):')
            L.append('                    _idx = (merge_idx + _i) % len(input_bufs)')
            L.append('                    if input_bufs[_idx].items:')
            L.append('                        part = yield from input_bufs[_idx].get()')
            L.append('                        merge_idx = (_idx + 1) % len(input_bufs)')
            L.append('                        break')
            L.append('                if part is None:')
            L.append('                    yield env.timeout(1.0)')
            L.append('        else:')
            L.append('            part = yield from input_bufs[0].get()')
            L.append('        get_end = env.now')
            L.append('        shifts = cfg.get("shifts")')
            L.append('        if shifts and get_end > get_start:')
            L.append('            off_during_get = _off_shift_time_in_interval(get_start, get_end, shifts)')
            L.append('            results.station_off_shift[key] += off_during_get')
            L.append('        part.timestamps[f"{key}_start"] = env.now')
            L.append('')
            L.append('        # Wait if currently outside shift schedule after receiving part')
            L.append('        if shifts and not is_in_shift(env, shifts):')
            L.append('            off_start = env.now')
            L.append('            while not is_in_shift(env, shifts):')
            L.append('                yield env.timeout(60)')
            L.append('            results.station_off_shift[key] += env.now - off_start')
            L.append('')
        else:
            L.append('        # Get part from input buffer(s) (starving)')
            L.append('        if len(input_bufs) > 1:')
            L.append('            # merge_idx tracks round-robin position across calls')
            L.append('            part = None')
            L.append('            while part is None:')
            L.append('                for _i in range(len(input_bufs)):')
            L.append('                    _idx = (merge_idx + _i) % len(input_bufs)')
            L.append('                    if input_bufs[_idx].items:')
            L.append('                        part = yield from input_bufs[_idx].get()')
            L.append('                        merge_idx = (_idx + 1) % len(input_bufs)')
            L.append('                        break')
            L.append('                if part is None:')
            L.append('                    yield env.timeout(1.0)')
            L.append('        else:')
            L.append('            part = yield from input_bufs[0].get()')
            L.append('        part.timestamps[f"{key}_start"] = env.now')
            L.append('')

        # Batch accumulation (when capacity > 1)
        L.append('        # Batch accumulation')
        L.append('        batch = [part]')
        L.append('        batch_size = cfg.get("batch_size", 1)')
        L.append('        if batch_size > 1:')
        L.append('            _batch_start = env.now')
        L.append('            while len(batch) < batch_size:')
        L.append('                if len(input_bufs) > 1:')
        L.append('                    next_item = None')
        L.append('                    while next_item is None:')
        L.append('                        for _i in range(len(input_bufs)):')
        L.append('                            _idx = (merge_idx + _i) % len(input_bufs)')
        L.append('                            if input_bufs[_idx].items:')
        L.append('                                next_item = yield from input_bufs[_idx].get()')
        L.append('                                merge_idx = (_idx + 1) % len(input_bufs)')
        L.append('                                break')
        L.append('                        if next_item is None:')
        L.append('                            yield env.timeout(1.0)')
        L.append('                    batch.append(next_item)')
        L.append('                else:')
        L.append('                    next_item = yield from input_bufs[0].get()')
        L.append('                    batch.append(next_item)')
        L.append('            results.station_batch_wait[key] += env.now - _batch_start')
        L.append('')

        if has_operators:
            L.append('        # Acquire operators')
            L.append('        op_requests = []')
            L.append('        min_efficiency = 1.0')
            L.append('        for op_key in MODEL_CONFIG["station_operators"].get(key, []):')
            L.append('            op_cfg = MODEL_CONFIG["operators"][op_key]')
            L.append('            req = operators[op_key].request()')
            L.append('            yield req')
            L.append('            op_requests.append((op_key, req))')
            L.append('            min_efficiency = min(min_efficiency, op_cfg["efficiency"])')
            L.append('')

        if has_setup and has_failures:
            L.append('        # Setup time (if product type changed) — with failure interruption')
            L.append('        if cfg.get("setup_time") and last_product_type and last_product_type != part.product_type:')
            L.append('            st = sample_distribution(cfg["setup_time"], rng)')
            L.append('            results.station_setup[key] += st')
            L.append('            setup_remaining = st')
            L.append('            while setup_remaining > 0.001:')
            L.append('                while station_failed.get(key, False):')
            L.append('                    yield repair_events[key]')
            L.append('                setup_start = env.now')
            L.append('                setup_timeout = env.timeout(setup_remaining)')
            L.append('                setup_result = yield setup_timeout | fail_events[key]')
            L.append('                if setup_timeout in setup_result:')
            L.append('                    setup_remaining = 0')
            L.append('                else:')
            L.append('                    setup_remaining -= (env.now - setup_start)')
            L.append('        last_product_type = part.product_type')
            L.append('')
        elif has_setup:
            L.append('        # Setup time (if product type changed)')
            L.append('        if cfg.get("setup_time") and last_product_type and last_product_type != part.product_type:')
            L.append('            st = sample_distribution(cfg["setup_time"], rng)')
            L.append('            results.station_setup[key] += st')
            L.append('            yield env.timeout(st)')
            L.append('        last_product_type = part.product_type')
            L.append('')

        L.append('        # Process the part (use per-product cycle time if available)')
        L.append('        _pct = cfg.get("product_cycle_times", {})')
        L.append('        _ct_dist = _pct.get(part.product_type, cfg["cycle_time"])')
        L.append('        ct = sample_distribution(_ct_dist, rng)')
        if has_operators:
            L.append('        if min_efficiency < 1.0:')
            L.append('            ct = ct / min_efficiency')

        if has_failures:
            L.append('        # Process with failure interruption recovery (event-based)')
            L.append('        remaining = ct')
            L.append('        while remaining > 0.001:')
            L.append('            while station_failed.get(key, False):')
            L.append('                yield repair_events[key]')
            L.append('            start = env.now')
            L.append('            timeout_evt = env.timeout(remaining)')
            L.append('            result = yield timeout_evt | fail_events[key]')
            L.append('            if timeout_evt in result:')
            L.append('                remaining = 0')
            L.append('            else:')
            L.append('                remaining -= (env.now - start)')
        else:
            L.append('        yield env.timeout(ct)')

        L.append('')
        L.append('        results.station_busy[key] += ct')
        L.append('        results.station_count[key] += len(batch)')
        L.append('')
        L.append('        # Scrap check (batch-level)')
        L.append('        if cfg.get("scrap_rate", 0) > 0 and rng.random() < cfg["scrap_rate"]:')
        L.append('            for bp in batch:')
        L.append('                bp.is_scrapped = True')
        L.append('                bp.completed_at = env.now')
        L.append('                results.scrapped.append(bp)')
        L.append('                results.active.pop(bp.id, None)')
        L.append('                if bp._done_event and not bp._done_event.triggered:')
        L.append('                    bp._done_event.succeed(bp)')
        if has_operators:
            L.append('            for op_key, req in op_requests:')
            L.append('                operators[op_key].release(req)')
        L.append('            continue')
        L.append('')

        if has_operators:
            L.append('        # Release operators')
            L.append('        for op_key, req in op_requests:')
            L.append('            operators[op_key].release(req)')
            L.append('')

        L.append('        part.timestamps[f"{key}_end"] = env.now')
        L.append('        part.advance()')
        L.append('')
        L.append('        # Push to output buffer (blocked time tracking)')
        L.append('        if output_buf:')
        L.append('            t0 = env.now')
        L.append('            yield from output_buf.put(part)')
        L.append('            blocked = env.now - t0')
        L.append('            results.station_blocked[key] += blocked')
        L.append('')
        L.append('        # Signal first product flow')
        L.append('        if part._done_event and not part._done_event.triggered:')
        L.append('            part._done_event.succeed(part)')
        L.append('')
        L.append('        # Push remaining batch items to output and signal done')
        L.append('        for bp in batch[1:]:')
        L.append('            bp.timestamps[f"{key}_end"] = env.now')
        L.append('            bp.advance()')
        L.append('            if output_buf:')
        L.append('                t0 = env.now')
        L.append('                yield from output_buf.put(bp)')
        L.append('                blocked = env.now - t0')
        L.append('                results.station_blocked[key] += blocked')
        L.append('            if bp._done_event and not bp._done_event.triggered:')
        L.append('                bp._done_event.succeed(bp)')
        L.append('')
        L.append('')

    def _export_product_flow(self, L, config):
        has_extra_nodes = bool(config["extra_node_chains"]) or bool(config["output_chains"])
        has_pre_chains = bool(config["pre_routing_chains"])
        has_sinks = bool(config["sinks"])

        L.append('# ═══════════════════════════════════════════════════════════')
        L.append('#  PRODUCT FLOW')
        L.append('# ═══════════════════════════════════════════════════════════')
        L.append('')
        L.append('def product_flow(env, part, queues, results, rng):')
        L.append('    """Route part through stations and extra-node chains."""')
        L.append('    results.active[part.id] = part')

        if has_pre_chains:
            L.append('    # Pre-routing chain: extra nodes before the first station')
            L.append('    if part.routing:')
            L.append('        _pre = MODEL_CONFIG.get("pre_routing_chains", {}).get(part.routing[0], [])')
            L.append('        for node_cfg in _pre:')
            L.append('            part = yield env.process(process_extra_node(env, part, node_cfg, rng, results, queues))')
            L.append('            if part is None or getattr(part, "is_scrapped", False):')
            L.append('                return')
            L.append('        # Input-chain splitters redirect routing[0] (first station)')
            L.append('        if _pre and "_splitter_output" in part.attributes:')
            L.append('            _s_idx = part.attributes.pop("_splitter_output")')
            L.append('            _s_name = part.attributes.pop("_splitter_name", None)')
            L.append('            _s_map = MODEL_CONFIG.get("splitter_output_stations", {})')
            L.append('            if _s_name and _s_name in _s_map:')
            L.append('                _s_targets = _s_map[_s_name]')
            L.append('                if _s_idx < len(_s_targets):')
            L.append('                    part.routing[0] = _s_targets[_s_idx]')

        L.append('    last_key = None')
        L.append('    while True:')
        L.append('        station_key = part.next_station()')
        L.append('        if station_key is None:')

        if has_extra_nodes:
            L.append('            # Process output chain after last station')
            L.append('            if last_key and last_key in MODEL_CONFIG["output_chains"]:')
            L.append('                for node_cfg in MODEL_CONFIG["output_chains"][last_key]:')
            L.append('                    part = yield env.process(process_extra_node(env, part, node_cfg, rng, results, queues))')
            L.append('                    if part is None or part.is_scrapped:')
            L.append('                        return')

        if has_sinks:
            L.append('            # Record in sink')
            L.append('            sink_key = MODEL_CONFIG["station_to_sink"].get(last_key)')
            L.append('            if sink_key:')
            L.append('                results.sink_exited[sink_key] = results.sink_exited.get(sink_key, 0) + 1')

        L.append('            part.completed_at = env.now')
        L.append('            results.completed.append(part)')
        L.append('            results.active.pop(part.id, None)')
        L.append('            return')
        L.append('')
        L.append('        # Put in station input buffer and wait for worker')
        L.append('        buf_keys = MODEL_CONFIG["station_input_buffers"].get(station_key, [])')
        L.append('        buf_key = buf_keys[0] if buf_keys else None')
        L.append('        if buf_key and buf_key in queues:')
        L.append('            part._done_event = env.event()')
        L.append('            yield from queues[buf_key].put(part)')
        L.append('            part = yield part._done_event')
        L.append('        last_key = station_key')
        L.append('')

        if has_extra_nodes:
            L.append('        # Process extra-node chain to next station')
            L.append('        peek_next = part.next_station()')
            L.append('        chain_key = f"{last_key}->{peek_next}" if peek_next else None')
            L.append('        if chain_key and chain_key in MODEL_CONFIG["extra_node_chains"]:')
            L.append('            for node_cfg in MODEL_CONFIG["extra_node_chains"][chain_key]:')
            L.append('                part = yield env.process(process_extra_node(env, part, node_cfg, rng, results, queues))')
            L.append('                if part is None or part.is_scrapped:')
            L.append('                    return')
            L.append('')
            L.append('        # Splitter routing redirect: override next routing step')
            L.append('        if "_splitter_output" in part.attributes:')
            L.append('            _s_idx = part.attributes.pop("_splitter_output")')
            L.append('            _s_name = part.attributes.pop("_splitter_name", None)')
            L.append('            _s_map = MODEL_CONFIG.get("splitter_output_stations", {})')
            L.append('            if _s_name and _s_name in _s_map:')
            L.append('                _s_targets = _s_map[_s_name]')
            L.append('                if _s_idx < len(_s_targets):')
            L.append('                    _next_ri = part.routing_index + 1')
            L.append('                    if _next_ri < len(part.routing):')
            L.append('                        part.routing[_next_ri] = _s_targets[_s_idx]')
            L.append('')

        L.append('')
        L.append('')

    def _export_source_processes(self, L, config):
        has_shifts = any(
            s.get("shifts") for s in config["stations"].values()
        )

        L.append('# ═══════════════════════════════════════════════════════════')
        L.append('#  SOURCE / ARRIVAL PROCESSES')
        L.append('# ═══════════════════════════════════════════════════════════')
        L.append('')

        # Source-driven process (constant interval)
        if config["sources"]:
            L.append('def source_process(env, src_key, src_cfg, product_cfgs, queues, results, rng):')
            L.append('    """Source-node driven arrivals (constant interval)."""')
            L.append('    pf = src_cfg.get("product_filter")')
            L.append('    pfl = src_cfg.get("product_filter_list")')
            L.append('    if pf:')
            L.append('        target_types = [(pf, product_cfgs[pf])] if pf in product_cfgs else []')
            L.append('    elif pfl:')
            L.append('        target_types = [(k, product_cfgs[k]) for k in pfl if k in product_cfgs]')
            L.append('    else:')
            L.append('        target_types = list(product_cfgs.items())')
            L.append('    if not target_types:')
            L.append('        return')
            if has_shifts:
                L.append('    # Collect shifts for this source\'s downstream first stations only')
                L.append('    _downstream_shifts = []')
                L.append('    for _ptk, _ptc in target_types:')
                L.append('        if _ptc["routing"]:')
                L.append('            _st_cfg = MODEL_CONFIG["stations"].get(_ptc["routing"][0], {})')
                L.append('            if _st_cfg.get("shifts"):')
                L.append('                _downstream_shifts.append(_st_cfg["shifts"])')
            L.append('    idx = 0')
            L.append('    batch_counter = 0')
            L.append('    batch_size = src_cfg.get("product_batch_size", 1)')
            L.append('    while True:')
            L.append('        yield env.timeout(src_cfg["arrival_rate"])')
            if has_shifts:
                L.append('        # Pause only when this source\'s downstream shifted stations are off-shift')
                L.append('        if _downstream_shifts and not any(is_in_shift(env, sh) for sh in _downstream_shifts):')
                L.append('            while not any(is_in_shift(env, sh) for sh in _downstream_shifts):')
                L.append('                yield env.timeout(60)')
            L.append('        # Backpressure: wait until first station buffer has space')
            L.append('        pt_key_bp, pt_cfg_bp = target_types[idx % len(target_types)]')
            L.append('        first_routing = pt_cfg_bp["routing"]')
            L.append('        if first_routing:')
            L.append('            bp_bufs = MODEL_CONFIG["station_input_buffers"].get(first_routing[0], [])')
            L.append('            if bp_bufs:')
            L.append('                bp_buf = queues.get(bp_bufs[0])')
            L.append('                if bp_buf:')
            L.append('                    while len(bp_buf.items) >= bp_buf.capacity:')
            L.append('                        yield bp_buf._space_event')
            L.append('        pt_key, pt_cfg = target_types[idx % len(target_types)]')
            L.append('        batch_counter += 1')
            L.append('        if batch_counter >= batch_size:')
            L.append('            batch_counter = 0')
            L.append('            idx += 1')
            L.append('        dd_offset = pt_cfg.get("due_date_offset")')
            L.append('        part = Part(')
            L.append('            id=results.new_part_id(),')
            L.append('            product_type=pt_key,')
            L.append('            routing=list(pt_cfg["routing"]),')
            L.append('            created_at=env.now,')
            L.append('            priority=pt_cfg.get("priority", 0),')
            L.append('            due_date=(env.now + dd_offset) if dd_offset else None,')
            L.append('        )')
            L.append('        results.source_generated[src_key] = results.source_generated.get(src_key, 0) + 1')
            L.append('        env.process(product_flow(env, part, queues, results, rng))')
            L.append('')
            L.append('')

        # Product-type arrival (exponential)
        L.append('def arrival_process(env, pt_key, pt_cfg, queues, results, rng):')
        L.append('    """Product-type driven arrivals (exponential inter-arrival)."""')
        L.append('    while True:')
        L.append('        iat = rng.exponential(pt_cfg["arrival_rate"])')
        L.append('        yield env.timeout(iat)')
        L.append('        part = Part(')
        L.append('            id=results.new_part_id(),')
        L.append('            product_type=pt_key,')
        L.append('            routing=list(pt_cfg["routing"]),')
        L.append('            created_at=env.now,')
        L.append('        )')
        L.append('        env.process(product_flow(env, part, queues, results, rng))')
        L.append('')
        L.append('')

    def _export_main_function(self, L, config):
        has_failures = any(
            s.get("mtbf") for s in config["stations"].values()
        )
        has_operators = bool(config["operators"])

        duration = config["duration"]
        seed = config["seed"]

        L.append('# ═══════════════════════════════════════════════════════════')
        L.append('#  MAIN SIMULATION')
        L.append('# ═══════════════════════════════════════════════════════════')
        L.append('')
        L.append(f'def run_simulation(duration: float = {duration}, seed: int = {seed}):')
        L.append('    """Run the factory simulation and return results."""')
        L.append('    env = simpy.Environment()')
        L.append('    rng = np.random.default_rng(seed)')
        L.append('    results = SimResults()')
        L.append('')

        # Create buffer queues
        L.append('    # ── Buffer queues ──')
        L.append('    queues = {}')
        for buf_key, buf_cfg in config["buffers"].items():
            cap = buf_cfg["capacity"]
            qr = buf_cfg.get("queue_rule", "FIFO")
            if qr != "FIFO":
                L.append(f'    queues["{buf_key}"] = BufferQueue(env, "{buf_cfg["name"]}", {cap}, queue_rule="{qr}")  # cap={cap}, {qr}')
            else:
                L.append(f'    queues["{buf_key}"] = BufferQueue(env, "{buf_cfg["name"]}", {cap})  # cap={cap}')
        L.append('')

        # Create operator resources
        if has_operators:
            L.append('    # ── Operator resources ──')
            L.append('    operators = {}')
            for op_key, op_cfg in config["operators"].items():
                L.append(f'    operators["{op_key}"] = simpy.Resource(env, capacity={op_cfg["count"]})  # {op_cfg["name"]}')
            L.append('')
        else:
            L.append('    operators = {}')
            L.append('')

        # Create station workers
        L.append('    # ── Station workers ──')
        for st_key, st_cfg in config["stations"].items():
            in_bufs = config["station_input_buffers"].get(st_key, [])
            out_buf = config["station_output_buffers"].get(st_key)
            if len(in_bufs) == 1:
                in_buf_expr = f'queues["{in_bufs[0]}"]'
            elif len(in_bufs) > 1:
                buf_list_str = ', '.join(f'queues["{b}"]' for b in in_bufs)
                in_buf_expr = f'[{buf_list_str}]'
            else:
                in_buf_expr = 'None'
            out_buf_expr = f'queues["{out_buf}"]' if out_buf else 'None'

            if has_failures and st_cfg.get("mtbf"):
                L.append(f'    env.process(failure_process(env, "{st_key}", MODEL_CONFIG["stations"]["{st_key}"],')
                L.append(f'        results, make_rng(rng, "{st_key}_fail")))')
                L.append(f'    env.process(station_worker(env, "{st_key}", MODEL_CONFIG["stations"]["{st_key}"],')
                L.append(f'        {in_buf_expr}, {out_buf_expr}, queues,')
                L.append(f'        operators, results, make_rng(rng, "{st_key}")))')
            else:
                L.append(f'    env.process(station_worker(env, "{st_key}", MODEL_CONFIG["stations"]["{st_key}"],')
                L.append(f'        {in_buf_expr}, {out_buf_expr}, queues,')
                L.append(f'        operators, results, make_rng(rng, "{st_key}")))')
        L.append('')

        # Drain buffers connected to sinks (prevents deadlock)
        if config["sink_buffers"]:
            L.append('    # ── Sink buffer drains (prevent deadlock) ──')
            for buf_key in config["sink_buffers"]:
                L.append(f'    def _drain_{buf_key}(buf):')
                L.append(f'        while True:')
                L.append(f'            yield from buf.get()')
                L.append(f'    env.process(_drain_{buf_key}(queues["{buf_key}"]))')
            L.append('')

        # Launch source processes
        if config["sources"]:
            L.append('    # ── Source processes ──')
            for src_key in config["sources"]:
                L.append(f'    env.process(source_process(env, "{src_key}", MODEL_CONFIG["sources"]["{src_key}"],')
                L.append(f'        MODEL_CONFIG["products"], queues, results, make_rng(rng, "{src_key}")))')
            L.append('')

        # Launch product-type arrival processes (for non-source-driven products)
        L.append('    # ── Product arrival processes ──')
        has_arrival = False
        for pt_key, pt_cfg in config["products"].items():
            if pt_key in config["source_driven_products"]:
                continue
            if not pt_cfg.get("arrival_rate"):
                continue
            has_arrival = True
            L.append(f'    env.process(arrival_process(env, "{pt_key}", MODEL_CONFIG["products"]["{pt_key}"],')
            L.append(f'        queues, results, make_rng(rng, "{pt_key}")))')
        if not has_arrival and not config["sources"]:
            L.append('    # WARNING: No product types with arrival rates and no sources defined.')
        L.append('')

        # Run
        L.append('    # ── Run ──')
        L.append('    env.run(until=duration)')
        L.append('')
        L.append('    # Finalize buffer WIP stats')
        L.append('    for q in queues.values():')
        L.append('        q._update_level(q.current_level)  # flush last interval')
        L.append('')
        L.append('    return results, queues, operators')
        L.append('')
        L.append('')

    def _export_results_reporting(self, L, config):
        has_operators = bool(config["operators"])
        has_sinks = bool(config["sinks"])
        has_sources = bool(config["sources"])

        L.append('# ═══════════════════════════════════════════════════════════')
        L.append('#  RESULTS REPORTING')
        L.append('# ═══════════════════════════════════════════════════════════')
        L.append('')
        L.append('def print_results(results, queues, operators, duration):')
        L.append('    """Print comprehensive simulation results."""')
        L.append('    good = [p for p in results.completed if not p.is_scrapped]')
        L.append('    scrapped = results.scrapped')
        L.append('    hours = duration / 3600')
        L.append('')
        L.append('    print()')
        L.append('    print("=" * 65)')
        L.append(f'    print(f"SIMULATION COMPLETE: {{duration:.0f}}s ({{hours:.1f}} hours)")')
        L.append('    print("=" * 65)')
        L.append('')

        # Throughput
        L.append('    # ── Throughput ──')
        L.append('    in_progress = len(results.active)')
        L.append(f'    print(f"Throughput: {{len(good)}} parts ({{len(good) / hours:.1f}} / hour)")')
        L.append('    if in_progress > 0:')
        L.append(f'        print(f"In-flight:  {{in_progress}} parts (still in system at sim end)")')
        L.append('    if scrapped:')
        L.append(f'        print(f"Scrapped:   {{len(scrapped)}} parts")')
        L.append('')

        # Per-product throughput
        L.append('    by_product = {}')
        L.append('    for p in good:')
        L.append('        by_product[p.product_type] = by_product.get(p.product_type, 0) + 1')
        L.append('    if len(by_product) > 1:')
        L.append('        print("  By product type:")')
        L.append('        for pt, count in sorted(by_product.items()):')
        L.append(f'            print(f"    {{pt}}: {{count}} parts ({{count / hours:.1f}} / hour)")')
        L.append('')

        # Cycle time
        L.append('    # ── Cycle Time ──')
        L.append('    if good:')
        L.append('        cts = [p.cycle_time() for p in good]')
        L.append('        print(f"\\nCycle Time:")')
        L.append('        print(f"  Mean:  {np.mean(cts):.1f}s")')
        L.append('        print(f"  Std:   {np.std(cts):.1f}s")')
        L.append('        print(f"  Min:   {np.min(cts):.1f}s")')
        L.append('        print(f"  Max:   {np.max(cts):.1f}s")')
        L.append('        print(f"  P50:   {np.percentile(cts, 50):.1f}s")')
        L.append('        print(f"  P95:   {np.percentile(cts, 95):.1f}s")')
        L.append('')

        # Station utilization
        has_shifts = any(
            s.get("shifts") for s in config["stations"].values()
        )
        L.append('    # ── Station Utilization ──')
        L.append('    print(f"\\nStation Utilization:")')
        if has_shifts:
            L.append('    print(f"  {\'Station\':<20} {\'Busy%\':>7} {\'Blocked%\':>9} {\'Failed%\':>8} {\'Setup%\':>7} {\'Off%\':>6} {\'Items\':>7}")')
            L.append('    print(f"  {\'-\' * 20} {\'-\' * 7} {\'-\' * 9} {\'-\' * 8} {\'-\' * 7} {\'-\' * 6} {\'-\' * 7}")')
        else:
            L.append('    print(f"  {\'Station\':<20} {\'Busy%\':>7} {\'Blocked%\':>9} {\'Failed%\':>8} {\'Setup%\':>7} {\'Items\':>7}")')
            L.append('    print(f"  {\'-\' * 20} {\'-\' * 7} {\'-\' * 9} {\'-\' * 8} {\'-\' * 7} {\'-\' * 7}")')
        L.append('    for key in results.station_busy:')
        L.append('        busy = results.station_busy.get(key, 0) / duration * 100')
        L.append('        blocked = results.station_blocked.get(key, 0) / duration * 100')
        L.append('        failed = results.station_failed.get(key, 0) / duration * 100')
        L.append('        setup = results.station_setup.get(key, 0) / duration * 100')
        L.append('        count = results.station_count.get(key, 0)')
        if has_shifts:
            L.append('        off = results.station_off_shift.get(key, 0) / duration * 100')
            L.append('        print(f"  {key:<20} {busy:>6.1f}% {blocked:>8.1f}% {failed:>7.1f}% {setup:>6.1f}% {off:>5.1f}% {count:>7}")')
        else:
            L.append('        print(f"  {key:<20} {busy:>6.1f}% {blocked:>8.1f}% {failed:>7.1f}% {setup:>6.1f}% {count:>7}")')
        L.append('')

        # OEE
        L.append('    # ── OEE ──')
        L.append('    print(f"\\nOEE by Station:")')
        L.append('    for key, cfg in MODEL_CONFIG["stations"].items():')
        L.append('        busy_t = results.station_busy.get(key, 0)')
        L.append('        setup_t = results.station_setup.get(key, 0)')
        L.append('        blocked_t = results.station_blocked.get(key, 0)')
        L.append('        failed_t = results.station_failed.get(key, 0)')
        L.append('        off_shift_t = results.station_off_shift.get(key, 0)')
        L.append('        count = results.station_count.get(key, 0)')
        L.append('        scrap_count = len([p for p in results.scrapped if key in p.timestamps])')
        L.append('        total_items = count + scrap_count')
        L.append('        # Availability = (Scheduled - Failures - Setup) / Scheduled')
        L.append('        scheduled_time = duration - off_shift_t')
        L.append('        availability = max(0, (scheduled_time - failed_t - setup_t) / scheduled_time) if scheduled_time > 0 else 0')
        L.append('        # Performance = (Ideal CT × Total Count) / Busy Time')
        L.append('        # Busy time = actual processing time only. Starvation, blocking,')
        L.append('        # idle are external losses reflected in utilization, not speed losses.')
        L.append('        ct_cfg = cfg["cycle_time"]')
        L.append('        ct_type = ct_cfg.get("type", "constant")')
        L.append('        ct_params = ct_cfg.get("parameters", {})')
        L.append('        if ct_type == "constant":')
        L.append('            ideal_ct = ct_params.get("value", 1.0)')
        L.append('        elif ct_type == "normal":')
        L.append('            ideal_ct = max(0.001, ct_params.get("mean", 1.0) - 2 * ct_params.get("std", ct_params.get("sigma", 0)))')
        L.append('        elif ct_type == "exponential":')
        L.append('            ideal_ct = max(0.001, ct_params.get("mean", 1.0) / 3)')
        L.append('        elif ct_type == "triangular":')
        L.append('            ideal_ct = max(0.001, ct_params.get("min", 0))')
        L.append('        elif ct_type == "uniform":')
        L.append('            ideal_ct = max(0.001, ct_params.get("min", 0))')
        L.append('        elif ct_type == "weibull":')
        L.append('            _wb_shape = ct_params.get("shape", 1)')
        L.append('            _wb_scale = ct_params.get("scale", 1)')
        L.append('            ideal_ct = max(0.001, _wb_scale * math.gamma(1 + 1/_wb_shape) / 3)')
        L.append('        elif ct_type == "lognormal":')
        L.append('            _ln_mu = ct_params.get("mean", 0)')
        L.append('            _ln_sigma = ct_params.get("std", 0)')
        L.append('            ideal_ct = max(0.001, math.exp(_ln_mu + _ln_sigma**2/2) / 3)')
        L.append('        elif ct_type == "empirical":')
        L.append('            ideal_ct = max(0.001, min(ct_params.get("data", [1.0])))')
        L.append('        else:')
        L.append('            ideal_ct = 1.0')
        L.append('        batch_sz = cfg.get("batch_size", 1)')
        L.append('        effective_count = total_items / batch_sz if batch_sz > 1 else total_items')
        L.append('        performance = min(1.0, (ideal_ct * effective_count) / busy_t) if busy_t > 0 and effective_count > 0 else 0')
        L.append('        # Quality = Good / Total')
        L.append('        quality = count / total_items if total_items > 0 else 1.0')
        L.append('        oee = availability * performance * quality')
        L.append('        print(f"  {key}: OEE={oee:.1%} (A={availability:.1%} P={performance:.1%} Q={quality:.1%})")')
        L.append('')

        # Buffer stats
        L.append('    # ── Buffer Statistics ──')
        L.append('    if queues:')
        L.append('        print(f"\\nBuffer Statistics:")')
        L.append('        print(f"  {\'Buffer\':<20} {\'AvgWIP\':>8} {\'MaxWIP\':>8} {\'BlockTime\':>10} {\'StarveTime\':>11}")')
        L.append('        print(f"  {\'-\' * 20} {\'-\' * 8} {\'-\' * 8} {\'-\' * 10} {\'-\' * 11}")')
        L.append('        for name, q in queues.items():')
        L.append('            avg = q.avg_wip(duration)')
        L.append('            print(f"  {name:<20} {avg:>7.1f} {q.max_level:>8} {q.blocking_time:>9.1f}s {q.starving_time:>10.1f}s")')
        L.append('')

        if has_sources:
            L.append('    # ── Source Statistics ──')
            L.append('    if results.source_generated:')
            L.append('        print(f"\\nSource Statistics:")')
            L.append('        for key, count in results.source_generated.items():')
            L.append('            print(f"  {key}: {count} generated ({count / hours:.1f} / hour)")')
            L.append('')

        if has_sinks:
            L.append('    # ── Sink Statistics ──')
            L.append('    if results.sink_exited:')
            L.append('        print(f"\\nSink Statistics:")')
            L.append('        for key, count in results.sink_exited.items():')
            L.append('            print(f"  {key}: {count} exited")')
            L.append('')

        L.append('    return results')
        L.append('')
        L.append('')

    def _export_entry_point(self, L):
        L.append('# ═══════════════════════════════════════════════════════════')
        L.append('#  ENTRY POINT')
        L.append('# ═══════════════════════════════════════════════════════════')
        L.append('')
        L.append('if __name__ == "__main__":')
        L.append('    results, queues, operators = run_simulation()')
        L.append(f'    print_results(results, queues, operators, MODEL_CONFIG["duration"])')

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Simulation":
        """Create simulation from dictionary."""
        config = SimulationConfig(
            duration=data["config"]["duration"],
            warmup_period=data["config"].get("warmup_period", 0),
            seed=data["config"].get("seed"),
            replications=data["config"].get("replications", 1),
        )
        return cls(data["model"], config)
