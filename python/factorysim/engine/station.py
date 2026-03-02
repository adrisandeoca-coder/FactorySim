"""
Station - Workstation model for discrete event simulation.

Represents a processing station with cycle time, setup time, failures, and quality metrics.
Supports per-product cycle times, proper blocking/starving, and preemptive failures.
"""

from typing import Dict, Any, Optional, List, TYPE_CHECKING
from dataclasses import dataclass, field
from enum import Enum
import simpy

from factorysim.engine.distributions import Distribution

if TYPE_CHECKING:
    from factorysim.engine.simulation import Simulation
    from factorysim.engine.product import Product


class StationState(Enum):
    """Possible states for a station."""
    IDLE = "idle"
    PROCESSING = "processing"
    SETUP = "setup"
    BLOCKED = "blocked"
    FAILED = "failed"
    STARVED = "starved"
    OFF_SHIFT = "off_shift"
    BATCH_WAIT = "batch_wait"


@dataclass
class StationConfig:
    """Configuration for a station."""
    id: str
    name: str
    cycle_time: Dict[str, Any]
    setup_time: Optional[Dict[str, Any]] = None
    mtbf: Optional[float] = None  # Mean Time Between Failures (hours)
    mttr: Optional[float] = None  # Mean Time To Repair (hours)
    scrap_rate: float = 0.0  # Probability of producing scrap (0-1)
    batch_size: int = 1
    position: Dict[str, float] = field(default_factory=lambda: {"x": 0, "y": 0})
    product_cycle_times: Optional[Dict[str, Dict[str, Any]]] = None  # productId -> distribution config
    shifts: Optional[List[Dict[str, Any]]] = None  # Shift schedules


class Station:
    """
    A processing station in the factory simulation.

    Features:
    - Configurable cycle time with statistical distributions
    - Per-product cycle time overrides
    - Setup time between different product types
    - Preemptive failures based on MTBF/MTTR (interrupts processing)
    - Scrap rate for quality modeling
    - Batch processing capability
    - Proper starving/blocking state tracking
    """

    def __init__(self, env: simpy.Environment, config: StationConfig, sim: "Simulation"):
        self.env = env
        self.sim = sim
        self.id = config.id
        self.name = config.name
        self.batch_size = config.batch_size
        self.scrap_rate = config.scrap_rate
        self.position = config.position

        # Initialize distributions
        self.cycle_time_dist = Distribution(config.cycle_time, sim.rng)
        self.setup_time_dist = Distribution(config.setup_time, sim.rng) if config.setup_time else None

        # Per-product cycle time distributions
        self.product_cycle_time_dists: Dict[str, Distribution] = {}
        if config.product_cycle_times:
            for product_id, dist_config in config.product_cycle_times.items():
                self.product_cycle_time_dists[product_id] = Distribution(dist_config, sim.rng)

        # Shift schedules
        self.shifts: List[Dict[str, Any]] = config.shifts or []

        # Failure parameters
        self.mtbf = config.mtbf
        self.mttr = config.mttr
        self.failure_dist = Distribution.exponential(config.mtbf * 3600, sim.rng) if config.mtbf else None
        self.repair_dist = Distribution.exponential(config.mttr * 3600, sim.rng) if config.mttr else None

        # Use PreemptiveResource so failures can interrupt processing
        self.resource = simpy.PreemptiveResource(env, capacity=1)

        # Failure state
        self._failed = False
        self._failure_event = env.event()  # Signals when failure starts (for interruption)
        self._repair_event = env.event()   # Signals when repair completes

        # State tracking
        self.state = StationState.IDLE
        self.current_product_type: Optional[str] = None
        self.items_processed = 0
        self.items_scrapped = 0
        self.total_processing_time = 0.0
        self.total_setup_time = 0.0
        self.total_blocked_time = 0.0
        self.total_failed_time = 0.0
        self.total_idle_time = 0.0
        self.total_starved_time = 0.0
        self.total_off_shift_time = 0.0
        self.total_batch_wait_time = 0.0  # Time spent accumulating batch items
        self.batch_queue_count = 0  # Current items accumulating in batch
        self._batch_queue_wip_history: list = []  # For time-weighted avg batch queue

        # State change tracking for detailed analysis
        self.state_log: List[Dict[str, Any]] = []
        self._last_state_change = 0.0

        # Input/output connections
        self.input_buffer: Optional["Buffer"] = None
        self.input_buffers: list = []  # All input buffers (for merge topology)
        self.output_buffer: Optional["Buffer"] = None

        # Start failure process if configured
        if self.mtbf and self.mttr:
            env.process(self._failure_process())

    def _log_state_change(self, new_state: StationState) -> None:
        """Log a state change for KPI tracking."""
        current_time = self.env.now
        duration = current_time - self._last_state_change

        if self.state == StationState.IDLE:
            self.total_idle_time += duration
        elif self.state == StationState.PROCESSING:
            self.total_processing_time += duration
        elif self.state == StationState.SETUP:
            self.total_setup_time += duration
        elif self.state == StationState.BLOCKED:
            self.total_blocked_time += duration
        elif self.state == StationState.FAILED:
            self.total_failed_time += duration
        elif self.state == StationState.STARVED:
            self.total_starved_time += duration
        elif self.state == StationState.OFF_SHIFT:
            self.total_off_shift_time += duration
        elif self.state == StationState.BATCH_WAIT:
            self.total_batch_wait_time += duration

        self.state_log.append({
            "time": current_time,
            "from_state": self.state.value,
            "to_state": new_state.value,
            "duration": duration,
        })

        self.state = new_state
        self._last_state_change = current_time

        self.sim.log_event("state_change", self.id, {
            "station": self.name,
            "state": new_state.value,
        })

    def _flush_state_time(self) -> None:
        """Accumulate elapsed time for the current state without logging a state-change event.

        Call this before reading any cumulative time counters (e.g. in get_utilization,
        get_state_breakdown) so the numbers include the in-progress period since the
        last real state change.  Unlike _log_state_change, this does NOT append to
        state_log or fire a log_event — it just brings the counters up to date.
        """
        current_time = self.env.now
        duration = current_time - self._last_state_change
        if duration <= 0:
            return

        if self.state == StationState.IDLE:
            self.total_idle_time += duration
        elif self.state == StationState.PROCESSING:
            self.total_processing_time += duration
        elif self.state == StationState.SETUP:
            self.total_setup_time += duration
        elif self.state == StationState.BLOCKED:
            self.total_blocked_time += duration
        elif self.state == StationState.FAILED:
            self.total_failed_time += duration
        elif self.state == StationState.STARVED:
            self.total_starved_time += duration
        elif self.state == StationState.OFF_SHIFT:
            self.total_off_shift_time += duration
        elif self.state == StationState.BATCH_WAIT:
            self.total_batch_wait_time += duration

        self._last_state_change = current_time

    def _failure_process(self):
        """SimPy process for preemptive random failures."""
        while True:
            # Wait for next failure
            time_to_failure = self.failure_dist.sample()
            yield self.env.timeout(time_to_failure)

            # Station fails — preempt current work
            self._failed = True
            prev_state = self.state
            self._log_state_change(StationState.FAILED)
            self.sim.log_event("failure", self.id, {
                "station": self.name,
                "interrupted_state": prev_state.value,
            })

            # Signal failure to any waiting process
            if not self._failure_event.triggered:
                self._failure_event.succeed()
            self._failure_event = self.env.event()

            # Repair time
            repair_time = self.repair_dist.sample()
            yield self.env.timeout(repair_time)

            # Station repaired
            self._failed = False
            self._log_state_change(StationState.IDLE)

            # Signal repair complete
            if not self._repair_event.triggered:
                self._repair_event.succeed()
            self._repair_event = self.env.event()

            self.sim.log_event("repair", self.id, {
                "station": self.name,
                "repair_time": repair_time,
            })

    def _get_cycle_time_for_product(self, product: "Product") -> float:
        """Get the cycle time for a specific product, using per-product override if available.

        If an operator with efficiency < 1.0 is assigned (via the
        ``_operator_efficiency`` product attribute), the base cycle time
        is divided by that efficiency — e.g. 80% efficiency → 1.25× longer.
        """
        product_dist = self.product_cycle_time_dists.get(product.product_type)
        base_ct = product_dist.sample() if product_dist else self.cycle_time_dist.sample()
        efficiency = product.get_attribute("_operator_efficiency", 1.0)
        if 0 < efficiency < 1.0:
            base_ct = base_ct / efficiency
        return base_ct

    def is_in_shift(self, at_time: float = None) -> bool:
        """Check if the station is in an active shift period.

        Args:
            at_time: Simulation time to check. Defaults to env.now.
        """
        if not self.shifts:
            return True  # No shifts = 24/7 operation

        current_time = at_time if at_time is not None else self.env.now
        hours_in_day = 24 * 3600
        seconds_per_hour = 3600

        # Offset by simulation start day/hour from config
        start_offset = self.sim.config.start_day_of_week * hours_in_day + self.sim.config.start_hour * seconds_per_hour
        adjusted_time = current_time + start_offset
        day_of_week = int((adjusted_time // hours_in_day) % 7)
        hour_of_day = (adjusted_time % hours_in_day) / seconds_per_hour

        for shift in self.shifts:
            days = shift.get("days", [0, 1, 2, 3, 4])
            start_hour = shift.get("startHour", shift.get("start_hour", 0))
            end_hour = shift.get("endHour", shift.get("end_hour", 24))

            if day_of_week in days:
                if start_hour <= end_hour:
                    if start_hour <= hour_of_day < end_hour:
                        return True
                else:
                    # Overnight shift
                    if hour_of_day >= start_hour or hour_of_day < end_hour:
                        return True

        return False

    def calc_off_shift_time(self, t_start: float, t_end: float) -> float:
        """Calculate total seconds in [t_start, t_end] that fall outside active shifts.

        Uses 60-second granularity (matches the shift-polling interval).
        """
        if not self.shifts or t_end <= t_start:
            return 0.0

        step = 60.0
        off_time = 0.0
        t = t_start
        while t < t_end:
            chunk = min(step, t_end - t)
            if not self.is_in_shift(t):
                off_time += chunk
            t += chunk
        return off_time

    def process(self, product: "Product", op_requests: list = None) -> simpy.Event:
        """Process a product at this station."""
        return self.env.process(self._process_impl(product, op_requests))

    def _process_impl(self, product: "Product", op_requests: list = None):
        """Implementation of the processing logic with proper blocking/starving/failure handling.

        If op_requests is provided (list of (resource, req, acquire_time) triples),
        operators are released during failure repair and re-acquired afterwards.
        The list is mutated in-place so the caller's reference stays valid.
        """
        # Track total time in station for overhead accounting
        enter_time = self.env.now

        # Request the station resource (preemptive — failures can interrupt)
        with self.resource.request(priority=0) as req:
            yield req

            # Wait if outside shift schedule
            if self.shifts and not self.is_in_shift():
                self._log_state_change(StationState.OFF_SHIFT)
                while not self.is_in_shift():
                    yield self.env.timeout(60)  # Poll every 60s
                self._log_state_change(StationState.IDLE)

            # Wait if station is failed
            while self._failed:
                yield self._repair_event

            # Setup time if product type changed
            if self.setup_time_dist and self.current_product_type != product.product_type:
                self._log_state_change(StationState.SETUP)
                setup_time = self.setup_time_dist.sample()
                remaining = setup_time
                while remaining > 0.001:
                    if self._failed:
                        self._log_state_change(StationState.FAILED)
                        # Release operators during repair
                        if op_requests:
                            self.sim._release_operators(op_requests)
                            op_requests.clear()
                        yield self._repair_event
                        # Re-acquire operators after repair
                        if self.sim._station_operators.get(self.id):
                            new_reqs = yield self.env.process(
                                self.sim._acquire_operators(self.id, product)
                            )
                            if op_requests is not None:
                                op_requests.extend(new_reqs)
                        self._log_state_change(StationState.SETUP)
                    start = self.env.now
                    timeout_evt = self.env.timeout(remaining)
                    result = yield timeout_evt | self._failure_event
                    if timeout_evt in result:
                        remaining = 0  # Timeout completed normally
                    else:
                        # Failure interrupted — subtract elapsed time
                        remaining -= self.env.now - start

                self.current_product_type = product.product_type
                self.sim.log_event("setup_complete", self.id, {
                    "station": self.name,
                    "product_type": product.product_type,
                    "setup_time": setup_time,
                })

            # Processing — use per-product cycle time if available
            self._log_state_change(StationState.PROCESSING)
            cycle_time = self._get_cycle_time_for_product(product)

            self.sim.log_event("processing_start", self.id, {
                "station": self.name,
                "product_id": product.id,
                "product_type": product.product_type,
                "cycle_time": cycle_time,
            })

            # Processing can be interrupted by failure (AnyOf waits on both)
            remaining = cycle_time
            while remaining > 0.001:
                if self._failed:
                    self._log_state_change(StationState.FAILED)
                    # Release operators during repair so they can serve other stations
                    if op_requests:
                        self.sim._release_operators(op_requests)
                        op_requests.clear()
                    yield self._repair_event
                    # Re-acquire operators after repair
                    if self.sim._station_operators.get(self.id):
                        new_reqs = yield self.env.process(
                            self.sim._acquire_operators(self.id, product)
                        )
                        if op_requests is not None:
                            op_requests.extend(new_reqs)
                    self._log_state_change(StationState.PROCESSING)
                start = self.env.now
                timeout_evt = self.env.timeout(remaining)
                result = yield timeout_evt | self._failure_event
                if timeout_evt in result:
                    remaining = 0  # Timeout completed normally
                else:
                    # Failure interrupted — subtract elapsed time
                    remaining -= self.env.now - start

            # Quality check
            is_scrap = self.sim.rng.random() < self.scrap_rate
            if is_scrap:
                self.items_scrapped += 1
                product.is_scrap = True
                self.sim.log_event("scrap", self.id, {
                    "station": self.name,
                    "product_id": product.id,
                })
            else:
                self.items_processed += 1

            self._log_state_change(StationState.IDLE)

            self.sim.log_event("processing_complete", self.id, {
                "station": self.name,
                "product_id": product.id,
                "is_scrap": is_scrap,
            })

            # Record cycle time on product
            product.record_station_time(self.id, cycle_time)

            # Track overhead (resource wait + setup + failure repair + off-shift)
            # that is part of cycle time but not captured by processing or buffer waits
            total_station_time = self.env.now - enter_time
            overhead = total_station_time - cycle_time
            if overhead > 0:
                product.total_waiting_time += overhead

    def get_utilization(self) -> float:
        """Calculate station utilization (processing time / total time)."""
        total_time = self.env.now
        if total_time == 0:
            return 0.0
        self._flush_state_time()
        return self.total_processing_time / total_time

    def get_availability(self) -> float:
        """Calculate station availability (standard OEE).

        A = (Scheduled - Failures - Setup) / Scheduled
        Setup/changeover is an availability loss, not a speed loss.
        """
        total_time = self.env.now
        if total_time == 0:
            return 1.0
        self._flush_state_time()
        scheduled_time = total_time - self.total_off_shift_time
        if scheduled_time <= 0:
            return 1.0
        return max(0.0, 1.0 - (self.total_failed_time + self.total_setup_time) / scheduled_time)

    def get_quality(self) -> float:
        """Calculate quality rate (good items / total items)."""
        total_items = self.items_processed + self.items_scrapped
        if total_items == 0:
            return 1.0
        return self.items_processed / total_items

    def _get_ideal_cycle_time(self) -> float:
        """Return the ideal (best-case) cycle time from the distribution config.

        In standard OEE, the ideal cycle time is the *nameplate* or designed
        best-case rate — the fastest the station can theoretically produce.
        For variable distributions this is the practical minimum; for constant
        distributions it equals the configured value (no speed losses).

        Using the mean would make P ≈ 1.0 for all symmetric distributions,
        providing no diagnostic value.
        """
        d = self.cycle_time_dist.to_dict()
        dt = d.get("type", "constant")
        p = d.get("parameters", {})
        if dt == "constant":
            return p.get("value", 1.0)
        elif dt == "normal":
            # Practical minimum: 2σ below mean (≈2.5th percentile)
            mean = p.get("mean", 1.0)
            std = p.get("std", p.get("sigma", 0))
            return max(0.001, mean - 2 * std)
        elif dt == "exponential":
            # Exponential has theoretical min of 0; use mean/3 as practical best-case
            return max(0.001, p.get("mean", 1.0) / 3)
        elif dt == "triangular":
            return max(0.001, p.get("min", 0))
        elif dt == "uniform":
            return max(0.001, p.get("min", 0))
        elif dt == "lognormal":
            import math
            mu = p.get("mean", 1.0)
            sigma = p.get("sigma", p.get("std", 0.5))
            # Practical minimum: 2σ below in log-space
            return max(0.001, math.exp(mu - 2 * sigma))
        elif dt == "weibull":
            # Weibull minimum is 0; use scale * 0.3 as practical best-case
            return max(0.001, p.get("scale", 1.0) * 0.3)
        elif dt == "empirical":
            data = p.get("data", [1.0])
            return max(0.001, min(data)) if data else 1.0
        return 1.0

    def get_oee(self) -> Dict[str, float]:
        """Calculate OEE components for this station.

        Availability = (Scheduled - Failures - Setup) / Scheduled
        Performance  = (Ideal CT × Total Count) / Busy Time
        Quality      = Good Count / Total Count
        OEE          = Availability × Performance × Quality

        Busy Time = total time spent in the PROCESSING state.  Performance
        measures how efficiently the station produces *when it is actually
        producing* — only capturing true speed losses (running slower than
        ideal cycle time).  Starvation, blocking, and idle time are external
        constraints already reflected in utilization; including them in the
        Performance denominator would make P redundant with utilization.
        Setup/changeover is an Availability loss, not a Performance loss.
        """
        self._flush_state_time()
        total_time = self.env.now
        if total_time == 0:
            return {"availability": 1.0, "performance": 1.0, "quality": 1.0, "oee": 1.0}

        availability = self.get_availability()
        quality = self.get_quality()

        # Performance = (ideal_ct × total_items) / busy_time
        # Busy time = total time in PROCESSING state.  This isolates true
        # speed losses from external losses (starvation, blocking, idle).
        # Batch accumulation wait is a starvation/idle loss reflected in
        # utilization, NOT a speed loss — it must NOT inflate the denominator.
        busy_time = self.total_processing_time
        total_items = self.items_processed + self.items_scrapped
        if busy_time > 0 and total_items > 0:
            ideal_ct = self._get_ideal_cycle_time()
            # Normalize count for batch stations: idealCT is per-batch, so
            # divide item count by batch_size to get the number of batches.
            effective_count = total_items / self.batch_size if self.batch_size > 1 else total_items
            performance = min(1.0, (ideal_ct * effective_count) / busy_time)
        else:
            performance = 0.0

        result = {
            "availability": availability,
            "performance": performance,
            "quality": quality,
            "oee": availability * performance * quality,
        }
        # Annotate when P ≈ 1.0 is expected due to constant cycle time
        d = self.cycle_time_dist.to_dict()
        if d.get("type") == "constant" and performance >= 0.98:
            result["performance_note"] = "constant_ct"
        return result

    def _record_batch_queue_wip(self, count: int) -> None:
        """Record batch queue level for time-weighted average."""
        self._batch_queue_wip_history.append({
            "time": self.env.now,
            "level": count,
        })

    def get_average_batch_queue_wip(self) -> float:
        """Time-weighted average of items in the batch queue."""
        hist = self._batch_queue_wip_history
        if len(hist) < 2:
            return 0.0
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
        return total_wip_time / total_time if total_time > 0 else 0.0

    def get_state_breakdown(self) -> Dict[str, float]:
        """Get breakdown of time spent in each state."""
        total_time = self.env.now
        if total_time == 0:
            return {state.value: 0.0 for state in StationState}

        # Flush current state's elapsed time (no duplicate event / state_log entry)
        self._flush_state_time()

        return {
            "idle": self.total_idle_time / total_time,
            "processing": self.total_processing_time / total_time,
            "setup": self.total_setup_time / total_time,
            "blocked": self.total_blocked_time / total_time,
            "failed": self.total_failed_time / total_time,
            "starved": self.total_starved_time / total_time,
            "off_shift": self.total_off_shift_time / total_time,
            "batch_wait": self.total_batch_wait_time / total_time,
        }

    def to_dict(self) -> Dict[str, Any]:
        """Convert station to dictionary representation."""
        return {
            "id": self.id,
            "name": self.name,
            "cycle_time": self.cycle_time_dist.to_dict(),
            "setup_time": self.setup_time_dist.to_dict() if self.setup_time_dist else None,
            "mtbf": self.mtbf,
            "mttr": self.mttr,
            "scrap_rate": self.scrap_rate,
            "batch_size": self.batch_size,
            "position": self.position,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any], env: simpy.Environment, sim: "Simulation") -> "Station":
        """Create station from dictionary."""
        config = StationConfig(
            id=data["id"],
            name=data["name"],
            cycle_time=data.get("cycle_time", data.get("cycleTime", {"type": "constant", "parameters": {"value": 60}})),
            setup_time=data.get("setup_time", data.get("setupTime")),
            mtbf=data.get("mtbf"),
            mttr=data.get("mttr"),
            scrap_rate=data.get("scrap_rate", data.get("scrapRate", 0.0)),
            batch_size=data.get("batch_size", data.get("batchSize", 1)),
            position=data.get("position", {"x": 0, "y": 0}),
            product_cycle_times=data.get("product_cycle_times", data.get("productCycleTimes")),
            shifts=data.get("shifts"),
        )
        return cls(env, config, sim)
