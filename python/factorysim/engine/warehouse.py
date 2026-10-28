"""
Warehouse element — rack-level storage with material handling, inbound
docks, inventory control and order picking.

One ``Warehouse`` node is a self-contained subsystem: it owns its racks,
forklift fleet, pickers, dock doors, pack stations and inventory, and runs
its own SimPy processes (inbound trucks, replenishment, customer orders).
It can be used standalone (a distribution centre with no stations) or
linked to production lines through the normal connection graph:

* upstream of a line's first station  → **raw-material supply**: every part
  that enters the line draws one unit of its SKU from line-side stock; a
  forklift retrieves a full pallet from the racks when line-side runs out.
* after a line's last station          → **finished-goods store**: completed
  parts build up a pallet at the hand-over point; full pallets are put away
  and become stock that customer orders can pick.
* between two stations                 → **WIP store**: each part is handled
  as a pallet — put away, optionally dwells, then retrieved.

Geometry (metres, seconds; 1 time unit = 1 s, as in the rest of the app)
-----------------------------------------------------------------------
Aisles run along +Y from a front cross-aisle at Y = 0. Each aisle has a
rack on both sides; every rack has ``baysPerAisle`` bays × ``levels``
levels × ``palletsPerBay`` pallet positions. The I/O point (docks /
hand-over) is at X = 0 on the front cross-aisle. Forklift one-way travel to
a location is rectilinear: |x_aisle| + frontClearance + y_bay, at
``speed``; lifting runs at ``liftSpeed`` and every pick-up / set-down costs
``handlingTime``. Level 0 holds **pick faces** (order pickers pick from
them); levels ≥ 1 are **reserve**. When a pick face runs empty a forklift
replenishes it from reserve.

Order picking is picker-to-goods with S-shape routing: the picker walks the
front cross-aisle to the farthest aisle with a pick, traverses every aisle
containing a pick (the last one is a return trip if the count is odd) and
walks back, plus time per line and per unit.

Inventory control is (s, Q) per SKU in pallets: when the inventory position
(on-hand + on-order) drops to the reorder point s, Q pallets are ordered
and arrive on a truck after the lead time.
"""

from __future__ import annotations

import math
from collections import deque
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Tuple

import simpy

from factorysim.engine.distributions import Distribution
from factorysim.engine.extra_nodes import ExtraNode, ExtraNodeState

if TYPE_CHECKING:
    from factorysim.engine.product import Product
    from factorysim.engine.simulation import Simulation


# ── helpers ──────────────────────────────────────────────────────────────

def _dist(spec: Any, default: float, rng) -> Distribution:
    """Distribution from a config value: dict spec, plain number, or default."""
    if isinstance(spec, dict) and "type" in spec:
        return Distribution.from_dict(spec, rng)
    if isinstance(spec, (int, float)):
        return Distribution.constant(float(spec), rng)
    return Distribution.constant(float(default), rng)


def _pos(d: Distribution) -> float:
    return max(0.0, float(d.sample()))


class _TimeAvg:
    """Time-weighted average / max of a piecewise-constant level."""

    def __init__(self, env: simpy.Environment, start: float = 0.0):
        self.env = env
        self.level = start
        self.area = 0.0
        self.max = start
        self._t = env.now

    def set(self, level: float) -> None:
        now = self.env.now
        self.area += self.level * (now - self._t)
        self._t = now
        self.level = level
        self.max = max(self.max, level)

    def average(self) -> float:
        now = self.env.now
        total = self.area + self.level * (now - self._t)
        return total / now if now > 0 else self.level


class _Pallet:
    __slots__ = ("sku", "units", "since", "loc", "visits", "lock")

    def __init__(self, sku: str, units: int, since: float):
        self.sku = sku
        self.units = units
        self.since = since
        self.loc: Optional[int] = None
        self.visits = 0                    # AS/RS: pick visits still to make with this pallet
        self.lock: Optional[simpy.Resource] = None


class _Sku:
    def __init__(self, cfg: Dict[str, Any], rng, index: int):
        self.id: str = str(cfg.get("id") or cfg.get("name") or f"SKU-{index + 1}")
        self.name: str = str(cfg.get("name") or self.id)
        self.product_id: Optional[str] = cfg.get("productId") or None
        self.abc: str = str(cfg.get("class", "B")).upper()[:1] or "B"
        self.units_per_pallet: int = max(1, int(cfg.get("unitsPerPallet", 40)))
        self.initial_pallets: int = max(0, int(cfg.get("initialPallets", 0)))
        self.reorder_point: int = int(cfg.get("reorderPoint", -1))   # pallets; −1 = no (s,Q)
        self.order_qty: int = max(1, int(cfg.get("orderQuantity", 4)))
        self.lead_time = _dist(cfg.get("leadTime"), 4 * 3600, rng)
        self.demand_share: float = max(0.0, float(cfg.get("demandShare", 1.0)))
        # State
        self.reserve: deque = deque()       # pallets on levels ≥ 1, FIFO by arrival
        self.faces: List[_Pallet] = []      # pallets on level 0 (pick faces)
        self.staged_inbound = 0             # pallets unloaded, waiting for put-away
        self.on_order = 0                   # pallets ordered, not yet arrived
        self.in_putaway = 0                 # pallets being put away
        self.fg_open_units = 0              # finished-goods units building a pallet
        self.line_side_units = 0            # raw-material units at the line
        self.line_retrieval_pending = False
        self.face_refill_pending = False
        self.waiting_demand = 0             # units of order lines waiting for this SKU
        self.backorder = 0                  # units of open order lines that were short on arrival
        self.stock_event: Optional[simpy.Event] = None
        # Statistics
        self.units_picked = 0
        self.units_supplied = 0
        self.pallets_received = 0
        self.pallets_from_production = 0
        self.stockout_time = 0.0
        self._stockout_since: Optional[float] = None
        self.level = None                   # _TimeAvg of units on hand

    def units_on_hand(self) -> int:
        return sum(p.units for p in self.faces) + sum(p.units for p in self.reserve)

    def pallets_on_hand(self) -> int:
        return len(self.faces) + len(self.reserve)

    def position(self) -> int:
        """Inventory position in pallets (on hand + in the building + on order)."""
        return self.pallets_on_hand() + self.staged_inbound + self.in_putaway + self.on_order


class Warehouse(ExtraNode):
    """Rack-level warehouse subsystem (see module docstring)."""

    def __init__(self, data: Dict[str, Any], env: simpy.Environment, sim: "Simulation"):
        super().__init__(data.get("id", ""), data.get("name", "Warehouse"), "warehouse", env, sim)
        rng = sim.rng
        self.rng = rng
        lay = dict(data.get("layout", {}) or {})
        if not lay and data.get("capacity"):
            # Models saved before rack layouts: capacity + levels → 2 aisles of racks
            levels = max(1, int(data.get("levels", 4)))
            per_bay = 2
            bays = max(1, math.ceil(int(data["capacity"]) / (2 * 2 * levels * per_bay)))
            lay = {"aisles": 2, "baysPerAisle": bays, "levels": levels, "palletsPerBay": per_bay}
        self.aisles = max(1, int(lay.get("aisles", 4)))
        self.bays = max(1, int(lay.get("baysPerAisle", 10)))
        self.levels = max(1, int(lay.get("levels", 4)))
        self.per_bay = max(1, int(lay.get("palletsPerBay", 2)))
        self.bay_w = float(lay.get("bayWidth", 2.7))
        self.level_h = float(lay.get("levelHeight", 1.5))
        self.aisle_w = float(lay.get("aisleWidth", 3.5))
        self.rack_d = float(lay.get("rackDepth", 1.1))
        self.front = float(lay.get("frontClearance", 4.0))
        self.slotting: str = str(data.get("slotting", "closest"))

        fl = data.get("forklifts", {}) or {}
        self.n_forklifts = max(1, int(fl.get("count", 2)))
        self.fl_speed = max(0.1, float(fl.get("speed", 2.0)))
        self.lift_speed = max(0.05, float(fl.get("liftSpeed", 0.4)))
        self.handling = max(0.0, float(fl.get("handlingTime", 15.0)))
        # Forklifts allowed in one aisle at a time (0 = no limit). Others wait at the aisle mouth.
        self.max_per_aisle = max(0, int(fl.get("maxPerAisle", 0)))

        # Storage type: "racks" (forklifts, pick faces) or "asrs" (automated high-bay:
        # one stacker crane per aisle, goods-to-person picking at pick stations)
        self.mode: str = "asrs" if str(data.get("storageType", "racks")).lower() == "asrs" else "racks"
        cr = data.get("cranes", {}) or {}
        self.crane_vh = max(0.1, float(cr.get("speed", 3.0)))           # m/s along the aisle
        self.crane_vv = max(0.05, float(cr.get("liftSpeed", 1.0)))      # m/s vertical
        self.crane_handling = max(0.0, float(cr.get("handlingTime", 10.0)))
        self.conveyor_speed = max(0.05, float(cr.get("conveyorSpeed", 0.5)))

        pk = data.get("pickers", {}) or {}
        self.n_pickers = max(1, int(pk.get("count", 3)))
        self.walk_speed = max(0.1, float(pk.get("walkSpeed", 1.0)))
        self.t_line = max(0.0, float(pk.get("timePerLine", 10.0)))
        self.t_unit = max(0.0, float(pk.get("timePerUnit", 2.0)))
        self.t_setup = max(0.0, float(pk.get("setupTime", 30.0)))
        # Working calendar for pickers and packers (seconds of day). No shifts = always on.
        self.shifts: List[Tuple[float, float]] = [
            (self._hhmm(w.get("start", "00:00")), self._hhmm(w.get("end", "24:00")))
            for w in (pk.get("shifts") or [])
        ]
        self.breaks: List[Tuple[float, float]] = [
            (self._hhmm(b.get("start", "12:00")), max(0.0, float(b.get("minutes", 30))) * 60)
            for b in (pk.get("breaks") or [])
        ]

        ib = data.get("inbound", {}) or {}
        self.inbound_enabled = bool(ib.get("enabled", False))
        self.truck_iat = _dist(ib.get("interarrival"), 3600, rng)
        self.pallets_per_truck = _dist(ib.get("palletsPerTruck"), 20, rng)
        self.n_doors = max(1, int(ib.get("doors", 2)))
        self.unload_per_pallet = _dist(ib.get("unloadTimePerPallet"), 60, rng)

        od = data.get("orders", {}) or {}
        self.orders_enabled = bool(od.get("enabled", False))
        self.order_iat = _dist(od.get("interarrival"), 300, rng)
        self.lines_per_order = _dist(od.get("linesPerOrder"), 3, rng)
        self.units_per_line = _dist(od.get("unitsPerLine"), 2, rng)
        self.n_pack = max(1, int(od.get("packStations", 1)))
        self.pack_time = _dist(od.get("packTime"), 120, rng)
        self.departure_interval = max(0.0, float(od.get("departureInterval", 0)))
        ob = data.get("outbound", {}) or {}
        self.load_per_order = _dist(ob.get("loadTimePerOrder"), 20, rng)
        # Cross-docking: inbound pallets for SKUs with waiting orders go straight to picking
        self.crossdock = bool(data.get("crossDock", False))

        st = data.get("store", {}) or {}
        self.dwell = _dist(st.get("dwellTime"), 0, rng)
        ls = data.get("lineSupply", {}) or {}
        # Call off the next pallet when line-side stock falls to this share of a pallet
        self.call_off_share = min(1.0, max(0.0, float(ls.get("callOffShare", 0.2))))

        self.skus: Dict[str, _Sku] = {}
        for i, cfg in enumerate(data.get("skus", []) or []):
            s = _Sku(cfg, rng, i)
            self.skus[s.id] = s
        self._sku_by_product: Dict[str, str] = {
            s.product_id: s.id for s in self.skus.values() if s.product_id
        }

        # Locations: index → (aisle, side, bay, level, slot); occupant pallet
        self._locs: List[Tuple[int, int, int, int, int]] = []
        self._loc_time: List[float] = []      # one-way forklift time from I/O incl. lift
        self._occ: List[Optional[_Pallet]] = []
        for a in range(self.aisles):
            for side in (0, 1):
                for b in range(self.bays):
                    for lv in range(self.levels):
                        for k in range(self.per_bay):
                            self._locs.append((a, side, b, lv, k))
                            self._loc_time.append(self._one_way(a, b, lv))
                            self._occ.append(None)
        # Candidate order by travel time (closest first)
        order = sorted(range(len(self._locs)), key=lambda i: self._loc_time[i])
        if self.mode == "asrs":
            # No pick faces: every location is reachable by the crane for picking
            self._faces_by_dist = order
            self._reserve_by_dist = order
        else:
            self._faces_by_dist = [i for i in order if self._locs[i][3] == 0]
            self._reserve_by_dist = [i for i in order if self._locs[i][3] >= 1] or self._faces_by_dist
        self._free_count = len(self._locs)
        self._slot_free = simpy.Event(env)    # re-armed whenever a location frees up

        # Resources
        self.forklifts = simpy.PriorityResource(env, capacity=self.n_forklifts)
        self._fl_free = list(range(self.n_forklifts))           # which truck takes a task (3D)
        self.aisle_tokens = ([simpy.Resource(env, capacity=self.max_per_aisle) for _ in range(self.aisles)]
                             if self.max_per_aisle > 0 and self.mode == "racks" else None)
        self.cranes = ([simpy.PriorityResource(env, capacity=1) for _ in range(self.aisles)]
                       if self.mode == "asrs" else [])
        self.pickers = simpy.Resource(env, capacity=self.n_pickers)
        self.doors = simpy.Resource(env, capacity=self.n_doors)
        self._door_free = list(range(self.n_doors))
        self.packers = simpy.Resource(env, capacity=self.n_pack)

        # Statistics
        self.occupancy = _TimeAvg(env, 0)
        self.fl_busy = 0.0
        self.picker_busy = 0.0
        self.door_busy = 0.0
        self.pack_busy = 0.0
        self.tasks: Dict[str, int] = {"putaway": 0, "retrieve": 0, "replenish": 0, "pick": 0}
        self.task_time: Dict[str, float] = {"putaway": 0.0, "retrieve": 0.0, "replenish": 0.0, "pick": 0.0}
        self.congestion_wait = 0.0
        self.congestion_waits = 0
        self.crane_busy = [0.0] * (self.aisles if self.mode == "asrs" else 0)
        self.crane_wait = 0.0
        self.off_shift_wait = 0.0
        self.off_shift_waits = 0
        self.crossdock_pallets = 0
        self.crossdock_units = 0
        self.backorder_waits: List[float] = []
        self.outbound_trucks = 0
        self.outbound_orders = 0
        self._ship_queue: List[simpy.Event] = []
        # 3D replay logs (capped): equipment trips and trucks at doors
        self._trips: List[List[float]] = []
        self._trucks: List[List[float]] = []
        self._pick_starts: List[float] = []   # sim times picks started (verification)
        self.fl_wait = 0.0
        self.trucks_in = 0
        self.door_wait = 0.0
        self.reorders = 0
        self.storage_full_waits = 0
        self.orders_created = 0
        self.orders_shipped = 0
        self.lines_created = 0
        self.lines_filled_on_arrival = 0
        self.units_ordered = 0
        self.order_cycle: List[float] = []
        self.pick_times: List[float] = []
        self.parts_supplied = 0
        self.supply_wait_total = 0.0
        self.supply_waits = 0
        self.fg_units = 0
        self.wip_items = 0
        self._series: List[Dict[str, Any]] = []
        self._moves: List[Tuple[float, int, int]] = []   # (time, location, SKU index or −1 = emptied)
        self._sku_index: Dict[str, int] = {sid: i for i, sid in enumerate(self.skus)}
        self._started = False

    # ── geometry ──────────────────────────────────────────────────────

    @property
    def width(self) -> float:
        return self.aisles * (self.aisle_w + 2 * self.rack_d)

    def aisle_x(self, a: int) -> float:
        """Aisle centre-line X, with the dock (I/O point) at X = 0 in the middle of the front."""
        return a * (self.aisle_w + 2 * self.rack_d) + self.rack_d + self.aisle_w / 2 - self.width / 2

    def _one_way(self, a: int, b: int, lv: int) -> float:
        if self.mode == "asrs":
            # Conveyor dock → aisle P&D, then the crane moves horizontally and vertically at once
            conv = (abs(self.aisle_x(a)) + self.front) / self.conveyor_speed
            return conv + self._crane_one_way(b, lv)
        horiz = abs(self.aisle_x(a)) + self.front + (b + 0.5) * self.bay_w
        return horiz / self.fl_speed + (lv * self.level_h) / self.lift_speed

    def _crane_one_way(self, b: int, lv: int) -> float:
        """Stacker crane P&D → location: Chebyshev (simultaneous travel and lift)."""
        return max(((b + 0.5) * self.bay_w) / self.crane_vh, (lv * self.level_h) / self.crane_vv)

    @staticmethod
    def _hhmm(v: Any) -> float:
        """'06:30' or 6.5 (hours) → seconds of day."""
        if isinstance(v, (int, float)):
            return float(v) * 3600
        hh, _, mm = str(v).partition(":")
        return (int(hh or 0) * 60 + int(mm or 0)) * 60

    # ── working calendar (pickers, packers) ──────────────────────────────

    def _working_at(self, clock: float) -> bool:
        c = clock % 86400
        on = not self.shifts or any(
            (a <= c < b) if a <= b else (c >= a or c < b) for a, b in self.shifts)
        if not on:
            return False
        return not any((c - bs) % 86400 < bd for bs, bd in self.breaks)

    def _time_to_work(self, t: float) -> float:
        """Seconds from sim time t until pickers are working (0 if working now)."""
        if not self.shifts and not self.breaks:
            return 0.0
        clock = self.sim.config.start_hour * 3600 + t
        if self._working_at(clock):
            return 0.0
        # Candidate restart times: shift starts and break ends over the next two days
        c0 = clock % 86400
        cands = sorted({((a - c0) % 86400) for a, _ in self.shifts} |
                       {((bs + bd - c0) % 86400) for bs, bd in self.breaks})
        for day in (0, 86400):
            for d in cands:
                if d + day > 0 and self._working_at(clock + d + day):
                    return d + day
        return 0.0

    def _wait_shift(self):
        w = self._time_to_work(self.env.now)
        if w > 0:
            self.off_shift_waits += 1
            self.off_shift_wait += w
            yield self.env.timeout(w)

    @property
    def capacity(self) -> int:
        return len(self._locs)

    def loc_info(self, i: int) -> Dict[str, int]:
        a, side, b, lv, k = self._locs[i]
        return {"aisle": a, "side": side, "bay": b, "level": lv, "slot": k}

    # ── SKU lookup ────────────────────────────────────────────────────

    def sku_for(self, product_type: str, role: str = "store") -> _Sku:
        sid = self._sku_by_product.get(product_type)
        if sid is None:
            # Product name or id used directly as SKU id; create on demand
            if product_type in self.skus:
                sid = product_type
            else:
                pt = self.sim.product_types.get(product_type)
                cfg: Dict[str, Any] = {"id": product_type, "name": getattr(pt, "name", product_type),
                                       "productId": product_type, "unitsPerPallet": 40, "demandShare": 0}
                if role == "supply":
                    # Not configured: start with stock and reorder so the line can run
                    cfg.update({"initialPallets": 4, "reorderPoint": 2, "orderQuantity": 6,
                                "leadTime": {"type": "constant", "parameters": {"value": 7200}}})
                s = _Sku(cfg, self.rng, len(self.skus))
                self.skus[s.id] = s
                self._init_stock(s)
                self.sim.log_event("wh_sku_auto", self.id, {"sku": s.id, "role": role})
                sid = s.id
            self._sku_by_product[product_type] = sid
        return self.skus[sid]

    def _init_stock(self, s: _Sku) -> None:
        """Place a SKU's initial pallets (no handling time): first to a pick face."""
        s.level = _TimeAvg(self.env, 0)
        for k in range(s.initial_pallets):
            p = _Pallet(s.id, s.units_per_pallet, self.env.now)
            loc = self._pick_location(p, face=(k == 0))
            if loc is None:
                break
            self._occupy(loc, p)
            (s.faces if self._locs[loc][3] == 0 or self.mode == "asrs" else s.reserve).append(p)
        self._units_changed(s)
        self._request_face_refill(s)
        self._check_reorder(s)

    # ── locations ─────────────────────────────────────────────────────

    def _pick_location(self, pallet: _Pallet, face: bool) -> Optional[int]:
        """Free location by the slotting policy (face = level 0)."""
        cands = self._faces_by_dist if face else self._reserve_by_dist
        free = [i for i in cands if self._occ[i] is None]
        if not free:
            other = self._reserve_by_dist if face else self._faces_by_dist
            free = [i for i in other if self._occ[i] is None]
            if not free:
                return None
        if self.mode == "asrs":
            # Spread each SKU over the aisles (every crane can serve it, a crane
            # breakdown or queue never blocks a SKU), then nearest within the aisle
            per_aisle = [0] * self.aisles
            for i, occ in enumerate(self._occ):
                if occ is not None and occ.sku == pallet.sku:
                    per_aisle[self._locs[i][0]] += 1
            free_aisles = {self._locs[i][0] for i in free}
            best = min(free_aisles, key=lambda a: (per_aisle[a], a))
            free = [i for i in free if self._locs[i][0] == best]
        if self.slotting == "random":
            return free[int(self.rng.integers(len(free)))]
        if self.slotting == "abc":
            sku = self.skus.get(pallet.sku)
            cls = sku.abc if sku else "B"
            # A: closest 20 %, B: next 30 %, C: the rest (of each list)
            n = len(cands)
            lo, hi = {"A": (0, 0.2), "B": (0.2, 0.5)}.get(cls, (0.5, 1.0))
            zone = set(cands[int(lo * n):max(int(hi * n), int(lo * n) + 1)])
            in_zone = [i for i in free if i in zone]
            return (in_zone or free)[0]
        return free[0]  # closest open location

    def _occupy(self, i: int, pallet: _Pallet) -> None:
        self._occ[i] = pallet
        pallet.loc = i
        self._free_count -= 1
        if len(self._moves) < 50_000:
            self._moves.append((round(self.env.now, 1), i, self._sku_index.setdefault(pallet.sku, len(self._sku_index))))
        self.occupancy.set(self.capacity - self._free_count)
        self.sim.log_event("wh_store", self.id, {"loc": self.loc_info(i), "sku": pallet.sku, "units": pallet.units})

    def _vacate(self, pallet: _Pallet) -> None:
        if pallet.loc is None:
            return
        i = pallet.loc
        self._occ[i] = None
        pallet.loc = None
        self._free_count += 1
        if len(self._moves) < 50_000:
            self._moves.append((round(self.env.now, 1), i, -1))
        self.occupancy.set(self.capacity - self._free_count)
        self.sim.log_event("wh_remove", self.id, {"loc": self.loc_info(i), "sku": pallet.sku})
        ev, self._slot_free = self._slot_free, simpy.Event(self.env)
        ev.succeed()

    def _wait_free_location(self):
        while self._free_count <= 0:
            self.storage_full_waits += 1
            yield self._slot_free

    # ── stock bookkeeping ─────────────────────────────────────────────

    def _units_changed(self, sku: _Sku) -> None:
        on_hand = sku.units_on_hand()
        if sku.level is not None:
            sku.level.set(on_hand)
        face_units = sum(p.units for p in sku.faces)
        now = self.env.now
        if face_units == 0 and sku._stockout_since is None:
            sku._stockout_since = now
        elif face_units > 0 and sku._stockout_since is not None:
            sku.stockout_time += now - sku._stockout_since
            sku._stockout_since = None
        if face_units > 0 and sku.stock_event is not None:
            ev, sku.stock_event = sku.stock_event, None
            ev.succeed()

    def _wait_stock(self, sku: _Sku):
        if sku.stock_event is None:
            sku.stock_event = simpy.Event(self.env)
        yield sku.stock_event

    def _check_reorder(self, sku: _Sku) -> None:
        if sku.reorder_point < 0:
            return
        while sku.position() <= sku.reorder_point:
            sku.on_order += sku.order_qty
            self.reorders += 1
            self.sim.log_event("wh_reorder", self.id, {"sku": sku.id, "pallets": sku.order_qty})
            self.env.process(self._replenishment_delivery(sku, sku.order_qty))

    # ── forklift tasks ────────────────────────────────────────────────

    def _log_trip(self, unit_type: int, unit: int, loc: int, kind: str,
                  t_leave: float, t_mouth: float, t_in: float, t_out: float, t_back: float) -> None:
        """Trip log for the 3D replay: [type (0 forklift, 1 crane), unit, location, kind,
        leave dock/P&D, arrive aisle mouth (or start moving), enter aisle (or reach location),
        leave location, back]."""
        if len(self._trips) < 50_000:
            code = {"putaway": 0, "retrieve": 1, "replenish": 2, "pick": 3}.get(kind, 0)
            self._trips.append([unit_type, unit, loc, code, round(t_leave, 1), round(t_mouth, 1),
                                round(t_in, 1), round(t_out, 1), round(t_back, 1)])

    def _move(self, kind: str, locs: Any, priority: int, conv_before: bool = False, conv_after: bool = False):
        """One handling task touching the given location(s)."""
        if isinstance(locs, int):
            locs = [locs]
        if self.mode == "asrs":
            for loc in locs:
                yield from self._crane(kind, loc, priority, conv_before, conv_after)
        else:
            yield from self._forklift_task(kind, locs, priority)

    def _forklift_task(self, kind: str, locs: List[int], priority: int):
        """Forklift: pick up at the dock, then per location drive the front cross-aisle,
        enter the aisle (waiting at its mouth if it is at its forklift limit), lift,
        set down / pick up, lower, drive back. Single location = 2·one-way + 2·handling."""
        t0 = self.env.now
        with self.forklifts.request(priority=priority) as req:
            yield req
            self.fl_wait += self.env.now - t0
            fl = self._fl_free.pop(0) if self._fl_free else 0
            start = self.env.now
            yield self.env.timeout(self.handling)
            for loc in locs:
                a, _side, b, lv, _k = self._locs[loc]
                out = (abs(self.aisle_x(a)) + self.front) / self.fl_speed
                inside = ((b + 0.5) * self.bay_w) / self.fl_speed
                lift = (lv * self.level_h) / self.lift_speed
                t_leave = self.env.now
                yield self.env.timeout(out)
                t_mouth = self.env.now
                tok = None
                if self.aisle_tokens is not None:
                    tok = self.aisle_tokens[a].request()
                    yield tok
                    waited = self.env.now - t_mouth
                    if waited > 0:
                        self.congestion_wait += waited
                        self.congestion_waits += 1
                t_in = self.env.now
                yield self.env.timeout(2 * inside + 2 * lift + self.handling)
                t_out = self.env.now
                if tok is not None:
                    self.aisle_tokens[a].release(tok)
                yield self.env.timeout(out)
                self._log_trip(0, fl, loc, kind, t_leave, t_mouth, t_in, t_out, self.env.now)
            busy = self.env.now - start
            self._fl_free.append(fl)
            self._fl_free.sort()
        self.fl_busy += busy
        self.tasks[kind] += 1
        self.task_time[kind] += busy

    def _crane(self, kind: str, loc: int, priority: int, conv_before: bool, conv_after: bool):
        """AS/RS stacker crane of the location's aisle: pick up at the P&D, travel
        (horizontal and vertical at once), deposit / pick, travel back. Conveyors move
        loads between the dock (or pick station) and the aisle's P&D."""
        a, _side, b, lv, _k = self._locs[loc]
        conv = (abs(self.aisle_x(a)) + self.front) / self.conveyor_speed
        if conv_before:
            yield self.env.timeout(conv)
        one = self._crane_one_way(b, lv)
        t0 = self.env.now
        with self.cranes[a].request(priority=priority) as req:
            yield req
            self.crane_wait += self.env.now - t0
            start = self.env.now
            yield self.env.timeout(self.crane_handling)
            t_move = self.env.now
            yield self.env.timeout(one)
            t_at = self.env.now
            yield self.env.timeout(self.crane_handling)
            t_leave = self.env.now
            yield self.env.timeout(one)
            busy = self.env.now - start
            self._log_trip(1, a, loc, kind, start, t_move, t_at, t_leave, self.env.now)
        self.crane_busy[a] += busy
        self.tasks[kind] += 1
        self.task_time[kind] += busy
        if conv_after:
            yield self.env.timeout(conv)

    def _putaway(self, pallet: _Pallet, priority: int = 2):
        sku = self.skus[pallet.sku]
        sku.in_putaway += 1
        yield from self._wait_free_location()
        face = len(sku.faces) == 0  # first pallet of a SKU becomes its pick face
        loc = self._pick_location(pallet, face)
        while loc is None:  # race with another task: wait again
            yield from self._wait_free_location()
            loc = self._pick_location(pallet, face)
        self._occupy(loc, pallet)   # reserve the slot before driving
        yield from self._move("putaway", loc, priority, conv_before=True)
        sku.in_putaway -= 1
        if self._locs[loc][3] == 0 or self.mode == "asrs":
            sku.faces.append(pallet)
        else:
            sku.reserve.append(pallet)
        self._units_changed(sku)
        self._request_face_refill(sku)

    def _face_units(self, sku: _Sku) -> int:
        return sum(p.units for p in sku.faces)

    def _request_face_refill(self, sku: _Sku) -> None:
        """Bring a reserve pallet to a pick face when the faces are empty or
        hold less than the order lines currently waiting for this SKU."""
        if self.mode == "asrs" or sku.face_refill_pending or not sku.reserve:
            return
        if sku.faces and self._face_units(sku) >= max(1, sku.waiting_demand):
            return
        sku.face_refill_pending = True
        self.env.process(self._face_refill(sku))

    def _face_refill(self, sku: _Sku):
        """Move the oldest reserve pallet down to a pick face."""
        pallet = sku.reserve.popleft()
        src = pallet.loc
        dst = None
        for i in self._faces_by_dist:
            if self._occ[i] is None:
                dst = i
                break
        if dst is None:
            # No free face location: the reserve slot becomes the face in place
            sku.faces.append(pallet)
            sku.face_refill_pending = False
            self._units_changed(sku)
            return
        self._vacate(pallet)
        self._occupy(dst, pallet)
        yield from self._move("replenish", [src, dst], 1)
        sku.faces.append(pallet)
        sku.face_refill_pending = False
        self._units_changed(sku)
        self._request_face_refill(sku)  # more waiting demand → next pallet

    # ── inbound ───────────────────────────────────────────────────────

    def _sample_sku(self) -> Optional[_Sku]:
        skus = [s for s in self.skus.values() if s.demand_share > 0]
        if not skus:
            return None
        w = [s.demand_share for s in skus]
        tot = sum(w)
        r = self.rng.random() * tot
        acc = 0.0
        for s, wi in zip(skus, w):
            acc += wi
            if r <= acc:
                return s
        return skus[-1]

    def _truck(self, pallets: List[str], kind: str):
        """Truck at a dock door: unload pallets one by one, each goes to put-away."""
        t0 = self.env.now
        self.trucks_in += 1
        self.sim.log_event("wh_truck_arrival", self.id, {"pallets": len(pallets), "kind": kind})
        with self.doors.request() as req:
            yield req
            self.door_wait += self.env.now - t0
            door = self._door_free.pop(0) if self._door_free else 0
            start = self.env.now
            for sku_id in pallets:
                yield self.env.timeout(_pos(self.unload_per_pallet))
                sku = self.skus[sku_id]
                if kind == "replenishment":
                    sku.on_order -= 1
                sku.pallets_received += 1
                p = _Pallet(sku_id, sku.units_per_pallet, self.env.now)
                if self.crossdock and (sku.backorder > 0 or sku.waiting_demand > 0):
                    self._cross_dock(p, sku)
                else:
                    self.env.process(self._putaway(p))
            self.door_busy += self.env.now - start
            self._log_truck(start, self.env.now, door, 0, len(pallets))
            self._door_free.append(door)
            self._door_free.sort()

    def _log_truck(self, t_dock: float, t_leave: float, door: int, kind: int, load: int) -> None:
        """Truck log for the 3D replay: [docked, left, door, 0 inbound / 1 outbound, pallets or orders]."""
        if len(self._trucks) < 20_000:
            self._trucks.append([round(t_dock, 1), round(t_leave, 1), door, kind, load])

    def _cross_dock(self, p: _Pallet, sku: _Sku) -> None:
        """Pallet goes from the dock straight to waiting orders (no put-away)."""
        self.crossdock_pallets += 1
        sku.faces.append(p)              # available at the dock (no rack location)
        self._units_changed(sku)
        self.env.process(self._cross_dock_rest(p, sku))

    def _cross_dock_rest(self, p: _Pallet, sku: _Sku):
        """Keep the pallet staged at the dock while open orders still need the SKU
        (at most 30 min), then put the rest away."""
        units0 = p.units
        held = 0.0
        yield self.env.timeout(1.0)      # waiting orders claim their units first
        while p.units > 0 and sku.backorder > 0 and held < 1800:
            yield self.env.timeout(30.0)
            held += 30.0
        self.crossdock_units += units0 - p.units
        if p in sku.faces and p.visits == 0:
            sku.faces.remove(p)
            self._units_changed(sku)
            if p.units > 0:
                self.env.process(self._putaway(p))   # the rest is stored as usual

    def _replenishment_delivery(self, sku: _Sku, qty: int):
        yield self.env.timeout(_pos(sku.lead_time))
        yield from self._truck([sku.id] * qty, "replenishment")

    def _inbound_process(self):
        while True:
            yield self.env.timeout(_pos(self.truck_iat))
            n = max(1, int(round(_pos(self.pallets_per_truck))))
            ids = []
            for _ in range(n):
                s = self._sample_sku()
                if s:
                    ids.append(s.id)
            if ids:
                self.env.process(self._truck(ids, "scheduled"))

    # ── order picking ─────────────────────────────────────────────────

    def _order_process(self):
        n = 0
        while True:
            yield self.env.timeout(_pos(self.order_iat))
            n += 1
            self.env.process(self._order(f"{self.id}-O{n}"))

    def _pick_tour(self, locs: List[int]) -> float:
        aisles = sorted({self._locs[i][0] for i in locs})
        if not aisles:
            return 0.0
        xs = [self.aisle_x(a) for a in aisles]
        depth = self.front + self.bays * self.bay_w
        # Along the front cross-aisle from the dock (X = 0) to the outermost aisles and back
        dist = 2 * (max(0.0, max(xs)) - min(0.0, min(xs)))
        if len(aisles) % 2 == 0:
            dist += len(aisles) * depth
        else:
            # Traverse all but the last aisle; the last is in-and-out to its deepest pick
            deepest_last = max(self.front + (self._locs[i][2] + 0.5) * self.bay_w
                               for i in locs if self._locs[i][0] == aisles[-1])
            dist += (len(aisles) - 1) * depth + 2 * deepest_last
        return dist / self.walk_speed

    def _order(self, order_id: str):
        t_arrive = self.env.now
        n_lines = max(1, int(round(_pos(self.lines_per_order))))
        candidates = [s for s in self.skus.values() if s.demand_share > 0]
        lines: List[Tuple[_Sku, int]] = []
        chosen = set()
        for _ in range(min(n_lines, len(candidates))):
            s = self._sample_sku()
            tries = 0
            while s is not None and s.id in chosen and tries < 20:
                s = self._sample_sku()
                tries += 1
            if s is None or s.id in chosen:
                continue
            chosen.add(s.id)
            lines.append((s, max(1, int(round(_pos(self.units_per_line))))))
        if not lines:
            return
        self.orders_created += 1
        self.lines_created += len(lines)
        short: set = set()
        for s, q in lines:
            self.units_ordered += q
            # Fill rate (standard definition): the warehouse holds the quantity on
            # arrival. Waiting for a pick face to be refilled is a handling delay,
            # which shows in the order cycle time, not a stock-out.
            if s.units_on_hand() - s.waiting_demand - s.backorder >= q:  # not already promised
                self.lines_filled_on_arrival += 1
            else:
                s.backorder += q
                short.add(s.id)
        self.sim.log_event("wh_order_created", self.id, {"order": order_id, "lines": len(lines)})

        # Wait until every line can be picked from its pick face (backorders wait)
        visits: List[Any] = []
        for s, q in lines:
            if self._face_units(s) < q:
                s.waiting_demand += q
                while self._face_units(s) < q:
                    self._request_face_refill(s)
                    yield from self._wait_stock(s)
                s.waiting_demand -= q
            # Reserve the units now so concurrent orders don't double-count
            alloc = self._reserve(s, q)
            if s.id in short:
                s.backorder -= q
                self.backorder_waits.append(self.env.now - t_arrive)
            if self.mode == "asrs":
                visits.extend(self.env.process(self._g2p_visit(p, take, s)) for p, take in alloc)
            s.units_picked += q
            self._units_changed(s)
            self._request_face_refill(s)
            self._check_reorder(s)

        if self.mode == "asrs":
            # Goods-to-person: cranes bring each pallet to a pick station
            if visits:
                yield self.env.all_of(visits)
        else:
            # Pick tour (picker-to-goods, S-shape)
            locs = [p.loc for s, _ in lines for p in s.faces[:1] if p.loc is not None]
            if not locs:
                locs = [self._faces_by_dist[0]]
            with self.pickers.request() as req:
                yield req
                yield from self._wait_shift()
                if len(self._pick_starts) < 50_000:
                    self._pick_starts.append(self.env.now)
                t = self.t_setup + self._pick_tour(locs) + sum(self.t_line + q * self.t_unit for _, q in lines)
                yield self.env.timeout(t)
                self.picker_busy += t
                self.pick_times.append(t)
        # Pack
        with self.packers.request() as req:
            yield req
            yield from self._wait_shift()
            t = _pos(self.pack_time)
            yield self.env.timeout(t)
            self.pack_busy += t
        # Ship on the next outbound truck (it docks at a door and loads the packed orders)
        if self.departure_interval > 0:
            ev = simpy.Event(self.env)
            self._ship_queue.append(ev)
            yield ev
        self.orders_shipped += 1
        if t_arrive >= self.sim.config.warmup_period:
            self.order_cycle.append(self.env.now - t_arrive)
        self.sim.log_event("wh_order_shipped", self.id, {"order": order_id, "cycle_time": self.env.now - t_arrive})

    def _reserve(self, s: _Sku, q: int) -> List[Tuple[_Pallet, int]]:
        """Take q units from the SKU's pick faces (oldest first). Racks: an emptied
        face pallet is removed at once. AS/RS: the pallet still has to visit the
        pick station, so it is removed from the faces but leaves the rack later."""
        need = q
        alloc: List[Tuple[_Pallet, int]] = []
        for p in list(s.faces):
            take = min(need, p.units)
            if take <= 0:
                continue
            p.units -= take
            need -= take
            alloc.append((p, take))
            if self.mode == "asrs":
                p.visits += 1
            if p.units == 0:
                s.faces.remove(p)
                if self.mode != "asrs":
                    self._vacate(p)
            if need == 0:
                break
        return alloc

    def _g2p_visit(self, p: _Pallet, take: int, s: _Sku):
        """AS/RS pick: crane brings the pallet to a pick station, a picker takes the
        units, the pallet returns to its location (or leaves the rack when empty)."""
        if p.lock is None:
            p.lock = simpy.Resource(self.env, capacity=1)
        with p.lock.request() as r:
            yield r
            loc = p.loc
            if loc is not None:
                yield from self._crane("pick", loc, 1, False, True)
            with self.pickers.request() as req:
                yield req
                yield from self._wait_shift()
                if len(self._pick_starts) < 50_000:
                    self._pick_starts.append(self.env.now)
                t = self.t_line + take * self.t_unit
                yield self.env.timeout(t)
                self.picker_busy += t
                self.pick_times.append(t)
            p.visits -= 1
            if loc is not None:
                if p.units == 0 and p.visits == 0:
                    self._vacate(p)                    # empty pallet leaves at the station
                else:
                    yield from self._crane("putaway", loc, 1, True, False)

    def _outbound_trucks(self):
        k = 0
        while True:
            k += 1
            yield self.env.timeout(max(0.0, k * self.departure_interval - self.env.now))
            self.env.process(self._outbound_truck())

    def _outbound_truck(self):
        """Outbound truck: docks at a free door, loads every packed order, leaves."""
        t0 = self.env.now
        with self.doors.request() as req:
            yield req
            self.door_wait += self.env.now - t0
            door = self._door_free.pop(0) if self._door_free else 0
            start = self.env.now
            batch, self._ship_queue = self._ship_queue, []
            for _ in batch:
                yield self.env.timeout(_pos(self.load_per_order))
            self.door_busy += self.env.now - start
            self._log_truck(start, self.env.now, door, 1, len(batch))
            self._door_free.append(door)
            self._door_free.sort()
        self.outbound_trucks += 1
        self.outbound_orders += len(batch)
        for ev in batch:
            ev.succeed()

    # ── links to production lines ─────────────────────────────────────

    def _line_retrieval(self, sku: _Sku):
        """Forklift brings the oldest pallet of a SKU to the line."""
        while not sku.reserve and not sku.faces:
            yield from self._wait_stock_any(sku)
        if sku.reserve:
            pallet = sku.reserve.popleft()
        else:
            # Oldest stored pallet that is not out at a pick station
            pallet = next((p for p in sku.faces if p.visits == 0 and p.loc is not None), sku.faces[0])
            sku.faces.remove(pallet)
        loc = pallet.loc
        self._units_changed(sku)
        if loc is not None:
            yield from self._move("retrieve", loc, 0, conv_after=True)  # line supply has priority
        self._vacate(pallet)
        sku.line_side_units += pallet.units
        sku.line_retrieval_pending = False
        self._check_reorder(sku)
        if not sku.faces:
            self._request_face_refill(sku)
        self._line_ev_fire(sku)

    def _wait_stock_any(self, sku: _Sku):
        """Wait until the SKU has any pallet in storage."""
        ev = simpy.Event(self.env)
        waiters = getattr(sku, "_any_waiters", None)
        if waiters is None:
            waiters = sku._any_waiters = []  # type: ignore[attr-defined]
        waiters.append(ev)
        yield ev

    def _line_ev_fire(self, sku: _Sku) -> None:
        ev = getattr(sku, "_line_ev", None)
        if ev is not None:
            sku._line_ev = None  # type: ignore[attr-defined]
            ev.succeed()

    def _supply(self, product: "Product"):
        sku = self.sku_for(product.product_type, "supply")
        t0 = self.env.now
        while sku.line_side_units <= 0:
            if not sku.line_retrieval_pending:
                sku.line_retrieval_pending = True
                self.env.process(self._line_retrieval(sku))
            ev = getattr(sku, "_line_ev", None)
            if ev is None:
                ev = sku._line_ev = simpy.Event(self.env)  # type: ignore[attr-defined]
            yield ev
        sku.line_side_units -= 1
        sku.units_supplied += 1
        if (sku.line_side_units <= self.call_off_share * sku.units_per_pallet
                and not sku.line_retrieval_pending):
            sku.line_retrieval_pending = True
            self.env.process(self._line_retrieval(sku))
        self.parts_supplied += 1
        waited = self.env.now - t0
        if waited > 0:
            self.supply_waits += 1
            self.supply_wait_total += waited
            product.total_waiting_time += waited

    def _store_finished(self, product: "Product") -> None:
        sku = self.sku_for(product.product_type)
        sku.fg_open_units += 1
        self.fg_units += 1
        if sku.fg_open_units >= sku.units_per_pallet:
            sku.fg_open_units = 0
            sku.pallets_from_production += 1
            self.env.process(self._putaway(_Pallet(sku.id, sku.units_per_pallet, self.env.now)))

    def _wip(self, product: "Product"):
        sku = self.sku_for(product.product_type)
        pallet = _Pallet(sku.id, 1, self.env.now)
        sku.in_putaway += 1
        yield from self._wait_free_location()
        loc = self._pick_location(pallet, False)
        while loc is None:
            yield from self._wait_free_location()
            loc = self._pick_location(pallet, False)
        self._occupy(loc, pallet)
        yield from self._move("putaway", loc, 2, conv_before=True)
        sku.in_putaway -= 1
        yield self.env.timeout(_pos(self.dwell))
        yield from self._move("retrieve", loc, 0, conv_after=True)
        self._vacate(pallet)
        self.wip_items += 1

    def process(self, product: "Product"):
        """Role from the product's position in its routing (see module docstring)."""
        self.items_entered += 1
        if not product.routing or product.get_next_station() is None:
            self._store_finished(product)              # finished-goods store
        elif product.current_routing_index == 0 and not getattr(product, "station_times", None):
            yield from self._supply(product)          # raw-material supply
        else:
            yield from self._wip(product)             # WIP store
        self.items_processed += 1
        return product

    # ── lifecycle ─────────────────────────────────────────────────────

    def start(self) -> None:
        """Start the warehouse's own processes (called once after model build)."""
        if self._started:
            return
        self._started = True
        for s in self.skus.values():
            self._init_stock(s)
        if self.inbound_enabled:
            self.env.process(self._inbound_process())
        if self.orders_enabled:
            self.env.process(self._order_process())
            if self.departure_interval > 0:
                self.env.process(self._outbound_trucks())
        self.env.process(self._sampler())
        # Wake line retrievals that wait for "any pallet" whenever stock arrives
        self.env.process(self._any_stock_notifier())

    def _any_stock_notifier(self):
        while True:
            yield self.env.timeout(5.0)
            for s in self.skus.values():
                waiters = getattr(s, "_any_waiters", None)
                if waiters and (s.reserve or s.faces):
                    s._any_waiters = []  # type: ignore[attr-defined]
                    for ev in waiters:
                        ev.succeed()

    def _sampler(self):
        step = max(60.0, self.sim.config.duration / 120.0)
        top = sorted(self.skus.values(), key=lambda s: -s.demand_share)[:8]
        while True:
            self._series.append({
                "t": round(self.env.now, 1),
                "occupied": self.capacity - self._free_count,
                "sku": [{"id": s.id, "units": s.units_on_hand()} for s in top],  # list: ids survive key camelCasing
            })
            yield self.env.timeout(step)

    # ── statistics ────────────────────────────────────────────────────

    def get_statistics(self) -> Dict[str, Any]:
        stats = super().get_statistics()
        T = self.env.now or 1.0
        warm = self.sim.config.warmup_period
        eff = max(1.0, T - warm)
        oc = sorted(self.order_cycle)
        p95 = oc[min(len(oc) - 1, int(0.95 * len(oc)))] if oc else 0.0
        for s in self.skus.values():
            if s._stockout_since is not None:
                s.stockout_time += T - s._stockout_since
                s._stockout_since = T
        stats.update({
            "warehouse": True,
            "layout": {
                "aisles": self.aisles, "baysPerAisle": self.bays, "levels": self.levels,
                "palletsPerBay": self.per_bay, "locations": self.capacity,
            },
            "storage": {
                "occupied_end": self.capacity - self._free_count,
                "avg_occupied": round(self.occupancy.average(), 2),
                "max_occupied": self.occupancy.max,
                "avg_utilization": round(self.occupancy.average() / self.capacity, 4),
                "max_utilization": round(self.occupancy.max / self.capacity, 4),
                "full_waits": self.storage_full_waits,
            },
            "forklifts": {
                "count": self.n_forklifts,
                "utilization": round(self.fl_busy / (T * self.n_forklifts), 4),
                "tasks": dict(self.tasks),
                "avg_task_time": {k: round(self.task_time[k] / v, 1) if v else 0
                                  for k, v in self.tasks.items()},
                "avg_wait": round(self.fl_wait / max(1, sum(self.tasks.values())), 1),
            },
            "pickers": {
                "count": self.n_pickers,
                "utilization": round(self.picker_busy / (T * self.n_pickers), 4),
                "avg_pick_time": round(sum(self.pick_times) / len(self.pick_times), 1) if self.pick_times else 0,
            },
            "packing": {
                "stations": self.n_pack,
                "utilization": round(self.pack_busy / (T * self.n_pack), 4),
            },
            "docks": {
                "doors": self.n_doors,
                "utilization": round(self.door_busy / (T * self.n_doors), 4),
                "trucks": self.trucks_in,
                "outbound_trucks": self.outbound_trucks,
                "orders_per_outbound_truck": round(self.outbound_orders / self.outbound_trucks, 1) if self.outbound_trucks else 0,
                "avg_door_wait": round(self.door_wait / max(1, self.trucks_in + self.outbound_trucks), 1),
            },
            "storage_type": self.mode,
            "cranes": {
                "count": len(self.cranes),
                "utilization": round(sum(self.crane_busy) / (T * len(self.cranes)), 4) if self.cranes else 0,
                "by_aisle": [round(b / T, 4) for b in self.crane_busy],
                "avg_wait": round(self.crane_wait / max(1, sum(self.tasks.values())), 1) if self.cranes else 0,
            },
            "congestion": {
                "max_per_aisle": self.max_per_aisle,
                "waits": self.congestion_waits,
                "total_wait": round(self.congestion_wait, 1),
                "avg_wait": round(self.congestion_wait / self.congestion_waits, 1) if self.congestion_waits else 0,
            },
            "shifts": {
                "calendar": bool(self.shifts or self.breaks),
                "waits": self.off_shift_waits,
                "total_wait": round(self.off_shift_wait, 1),
            },
            "cross_dock": {
                "enabled": self.crossdock,
                "pallets": self.crossdock_pallets,
                "units": self.crossdock_units,
            },
            "backorders": {
                "lines": len(self.backorder_waits),
                "avg_wait": round(sum(self.backorder_waits) / len(self.backorder_waits), 1) if self.backorder_waits else 0,
            },
            "orders": {
                "created": self.orders_created,
                "shipped": self.orders_shipped,
                "open_end": self.orders_created - self.orders_shipped,
                "lines": self.lines_created,
                "units": self.units_ordered,
                "fill_rate": round(self.lines_filled_on_arrival / self.lines_created, 4) if self.lines_created else None,
                "cycle_time_mean": round(sum(oc) / len(oc), 1) if oc else 0,
                "cycle_time_p95": round(p95, 1),
                "orders_per_hour": round(len(oc) / eff * 3600, 2),
                "lines_per_hour": round(self.lines_created / T * 3600, 2),
            },
            "replenishment": {"orders": self.reorders},
            "line_supply": {
                "parts": self.parts_supplied,
                "starved_parts": self.supply_waits,
                "avg_wait": round(self.supply_wait_total / self.supply_waits, 1) if self.supply_waits else 0,
            },
            "finished_goods": {"units": self.fg_units},
            "wip_store": {"items": self.wip_items},
            "skus": [
                {
                    "id": s.id, "name": s.name, "class": s.abc,
                    "pallets_end": s.pallets_on_hand(),
                    "units_end": s.units_on_hand(),
                    "avg_units": round(s.level.average(), 1) if s.level else 0,
                    "units_picked": s.units_picked,
                    "units_supplied": s.units_supplied,
                    "pallets_received": s.pallets_received,
                    "pallets_from_production": s.pallets_from_production,
                    "stockout_share": round(s.stockout_time / T, 4),
                    "on_order": s.on_order,
                }
                for s in self.skus.values()
            ],
            "series": self._series,
            # Equipment trips and trucks for the 3D replay (see _log_trip / _log_truck)
            "trips": self._trips,
            "trucks": self._trucks,
            # Rack contents over time for the 3D view: [time, location index, SKU index | -1].
            # Location index = (((aisle*2 + side)*bays + bay)*levels + level)*palletsPerBay + slot
            "moves": [list(m) for m in self._moves],
        })
        return stats

    def warnings(self) -> List[Dict[str, Any]]:
        st = self.get_statistics()
        out: List[Dict[str, Any]] = []

        def w(code: str, msg: str) -> None:
            out.append({"severity": "warning", "code": code, "message": msg, "entity": self.name})

        if st["storage"]["full_waits"] > 0:
            w("WH_STORAGE_FULL", f"Warehouse '{self.name}' ran out of free rack locations "
              f"{st['storage']['full_waits']} times — put-away had to wait.")
        if st["congestion"]["waits"] > 0 and st["congestion"]["avg_wait"] > 30:
            w("WH_AISLE_CONGESTION", f"Forklifts in '{self.name}' queued at aisle entrances "
              f"{st['congestion']['waits']} times (avg {st['congestion']['avg_wait']:.0f} s) — "
              f"wider aisles or spreading fast movers over more aisles would help.")
        if self.cranes and max(st["cranes"]["by_aisle"] or [0]) > 0.9:
            w("WH_CRANE_BUSY", f"A stacker crane in '{self.name}' is busy "
              f"{max(st['cranes']['by_aisle']):.0%} of the time — that aisle limits throughput.")
        if st["forklifts"]["utilization"] > 0.9:
            w("WH_FORKLIFTS_BUSY", f"Forklifts in '{self.name}' are busy "
              f"{st['forklifts']['utilization']:.0%} of the time — tasks queue up.")
        if st["pickers"]["utilization"] > 0.9 and self.orders_enabled:
            w("WH_PICKERS_BUSY", f"Pickers in '{self.name}' are busy {st['pickers']['utilization']:.0%} "
              f"of the time — orders wait for a picker.")
        fr = st["orders"]["fill_rate"]
        if fr is not None and fr < 0.95:
            w("WH_FILL_RATE", f"Only {fr:.0%} of order lines in '{self.name}' could be picked "
              f"from stock on arrival — raise reorder points or order quantities.")
        if self.supply_waits > 1:  # the first part of a run always waits for the first pallet
            w("WH_LINE_STARVED", f"The line waited for material from '{self.name}' "
              f"{self.supply_waits} times (avg {st['line_supply']['avg_wait']:.0f} s).")
        return out
