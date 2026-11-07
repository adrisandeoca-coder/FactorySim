"""FactorySim model scripting API.

Build a FactorySim model in plain Python. The app runs the script, draws the
model it produces and can load it onto the canvas; the same script also runs
on its own with ``python my_line.py``.

    from factorysim.script import *

    m = Model("Bracket line")
    raw  = m.source("Raw material", every=45)
    cut  = m.station("Laser cut", cycle=normal(40, 4), mtbf=8, mttr=0.3)
    b1   = m.buffer("B1", capacity=10)
    weld = m.station("Weld", cycle=tri(50, 55, 70), scrap=0.02)
    out  = m.sink("Shipping")

    raw >> cut >> b1 >> weld >> out

Units follow the app: times in seconds, MTBF and MTTR in hours, rates as
fractions (0.02 = 2 %).
"""

from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional, Sequence, Union

from factorysim.script.node_fields import NODE_FIELDS

__all__ = [
    "Model", "Element",
    "const", "normal", "expo", "tri", "uniform", "lognormal", "weibull", "empirical",
    "NODE_TYPES", "TRANSPORTS",
]

NODE_TYPES = ["station", "buffer", *NODE_FIELDS.keys()]
TRANSPORTS = ("auto", "conveyor", "manual", "forklift", "agv", "direct")

# Every model a script creates registers here, so the runner can find it even
# when the script never names it ``model``.
_created: List["Model"] = []


class ScriptError(Exception):
    """A mistake in the model script (bad name, unknown field, …)."""


# ── Distributions ─────────────────────────────────────────────────

def const(value: float) -> Dict[str, Any]:
    return {"type": "constant", "parameters": {"value": float(value)}}


def normal(mean: float, std: float) -> Dict[str, Any]:
    return {"type": "normal", "parameters": {"mean": float(mean), "std": float(std)}}


def expo(mean: float) -> Dict[str, Any]:
    return {"type": "exponential", "parameters": {"mean": float(mean)}}


def tri(low: float, mode: float, high: float) -> Dict[str, Any]:
    if not low <= mode <= high:
        raise ScriptError(f"tri({low}, {mode}, {high}): needs low <= mode <= high")
    return {"type": "triangular", "parameters": {"min": float(low), "mode": float(mode), "max": float(high)}}


def uniform(low: float, high: float) -> Dict[str, Any]:
    if low > high:
        raise ScriptError(f"uniform({low}, {high}): low is above high")
    return {"type": "uniform", "parameters": {"min": float(low), "max": float(high)}}


def lognormal(mean: float, sigma: float) -> Dict[str, Any]:
    return {"type": "lognormal", "parameters": {"mean": float(mean), "sigma": float(sigma)}}


def weibull(shape: float, scale: float) -> Dict[str, Any]:
    return {"type": "weibull", "parameters": {"shape": float(shape), "scale": float(scale)}}


def empirical(data: Iterable[float]) -> Dict[str, Any]:
    values = [float(v) for v in data]
    if not values:
        raise ScriptError("empirical(): needs at least one value")
    return {"type": "empirical", "parameters": {"data": values}}


def _dist(value: Any, what: str) -> Dict[str, Any]:
    if isinstance(value, bool):
        raise ScriptError(f"{what}: expected seconds or a distribution, got {value!r}")
    if isinstance(value, (int, float)):
        if value < 0:
            raise ScriptError(f"{what}: time cannot be negative ({value})")
        return const(value)
    if isinstance(value, dict) and "type" in value and "parameters" in value:
        return value
    raise ScriptError(f"{what}: expected seconds or a distribution such as normal(40, 4), got {value!r}")


# ── Field names ───────────────────────────────────────────────────

STATION_FIELDS = [
    "cycleTime", "setupTime", "mtbf", "mttr", "scrapRate", "batchSize", "productCycleTimes",
    "shifts", "costPerHour", "costPerUnit", "scrapCostPerUnit", "energyIdleKw",
    "energyProcessingKw", "energySetupKw", "pmInterval", "pmDuration", "pmCostPerEvent",
    "reworkTarget", "reworkRate", "libraryModelId",
]
BUFFER_FIELDS = ["capacity", "queueRule", "kanbanEnabled", "kanbanCards", "libraryModelId"]

# Short names a script may use instead of the full field name.
ALIASES = {
    "station": {"cycle": "cycleTime", "setup": "setupTime", "scrap": "scrapRate", "batch": "batchSize",
                "model3d": "libraryModelId", "rework_to": "reworkTarget"},
    "buffer": {"rule": "queueRule", "kanban": "kanbanCards", "model3d": "libraryModelId"},
    "source": {"every": "arrivalRate", "product": "productFilter"},
}
_COMMON_ALIASES = {"cycle": "cycleTime", "setup": "setupTime", "scrap": "scrapRate", "batch": "batchSize",
                   "model3d": "libraryModelId"}

_DIST_FIELDS = {"cycleTime", "setupTime"}


def _camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(p[:1].upper() + p[1:] for p in rest)


def _suggest(word: str, options: Sequence[str]) -> str:
    import difflib
    close = difflib.get_close_matches(word, list(options), n=1, cutoff=0.6)
    return f" Did you mean '{close[0]}'?" if close else ""


def slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "node"


# ── Elements ──────────────────────────────────────────────────────

Target = Union["Element", Sequence["Element"]]


class Element:
    """A node in the model. Connect nodes with ``a >> b`` or ``a.to(b, ...)``."""

    def __init__(self, model: "Model", kind: str, id: str, name: str, fields: Dict[str, Any],
                 at: Optional[Sequence[float]]):
        self.model = model
        self.kind = kind
        self.id = id
        self.name = name
        self.fields = fields
        self.position = {"x": float(at[0]), "y": float(at[1])} if at is not None else None

    def __repr__(self) -> str:
        return f"<{self.kind} {self.name!r}>"

    # a >> b, a >> [b, c]
    def __rshift__(self, other: Target) -> Target:
        for t in _targets(other):
            self.model.connect(self, t)
        return other

    # [a, b] >> c
    def __rrshift__(self, other: Sequence["Element"]) -> "Element":
        for s in _targets(other):
            self.model.connect(s, self)
        return self

    def to(self, other: Target, transport: Optional[str] = None,
           probability: Optional[float] = None) -> Target:
        """Connect with options: ``a.to(b, transport="forklift", probability=0.3)``."""
        for t in _targets(other):
            self.model.connect(self, t, transport=transport, probability=probability)
        return other

    def serves(self, *stations: "Element") -> "Element":
        """Assign an operator to stations: ``op.serves(cut, weld)``."""
        if self.kind not in ("operator", "humanoid"):
            raise ScriptError(f"{self.name}: only operators can serve stations")
        for st in stations:
            self.model.connect(self, st)
        return self

    def set(self, **fields: Any) -> "Element":
        """Change fields after creation: ``cut.set(mtbf=12)``."""
        self.fields.update(self.model._fields(self.kind, self.name, fields))
        return self


def _targets(value: Any) -> List[Element]:
    if isinstance(value, Element):
        return [value]
    if isinstance(value, (list, tuple)) and all(isinstance(v, Element) for v in value):
        return list(value)
    raise ScriptError(f"can only connect model elements, got {value!r}")


# ── Model ─────────────────────────────────────────────────────────

class Model:
    """A FactorySim model built from Python."""

    def __init__(self, name: str = "Scripted model", description: str = ""):
        self.name = name
        self.description = description
        self.elements: List[Element] = []
        self.connections: List[Dict[str, Any]] = []
        self.products: List[Dict[str, Any]] = []
        self._ids: Dict[str, Element] = {}
        _created.append(self)

    # ── generic ──
    def add(self, kind: str, name: str, at: Optional[Sequence[float]] = None, **fields: Any) -> Element:
        """Add any element type: ``m.add("press", "Press 1", tonnage=300)``."""
        kind = kind.lower().replace("_", "").replace(" ", "")
        if kind not in NODE_TYPES:
            raise ScriptError(f"unknown element type '{kind}'.{_suggest(kind, NODE_TYPES)}")
        if not isinstance(name, str) or not name.strip():
            raise ScriptError(f"{kind}: give it a name, e.g. m.{kind}(\"My {kind}\")")
        if any(e.name == name for e in self.elements):
            raise ScriptError(f"two elements are called '{name}'; names must be unique")
        base = slug(name)
        nid, i = base, 2
        while nid in self._ids:
            nid, i = f"{base}-{i}", i + 1
        el = Element(self, kind, nid, name, self._fields(kind, name, fields), at)
        self.elements.append(el)
        self._ids[nid] = el
        return el

    def _fields(self, kind: str, name: str, fields: Dict[str, Any]) -> Dict[str, Any]:
        known = STATION_FIELDS if kind == "station" else BUFFER_FIELDS if kind == "buffer" else NODE_FIELDS[kind]
        aliases = {**_COMMON_ALIASES, **ALIASES.get(kind, {})}
        out: Dict[str, Any] = {}
        for key, value in fields.items():
            field = aliases.get(key) or _camel(key)
            if field not in known:
                options = sorted(set(known) | set(aliases))
                raise ScriptError(f"{name}: {kind} has no field '{key}'.{_suggest(key, options)}")
            if field in _DIST_FIELDS and kind == "station":
                value = _dist(value, f"{name}.{key}")
            elif field == "reworkTarget" and isinstance(value, Element):
                value = value.id
            elif field == "productCycleTimes" and isinstance(value, dict):
                value = {self._product_id(p): _dist(v, f"{name}.{key}") for p, v in value.items()}
            out[field] = value
        return out

    def _product_id(self, ref: Any) -> str:
        if isinstance(ref, dict) and "id" in ref:
            return ref["id"]
        for p in self.products:
            if p["name"] == ref or p["id"] == ref:
                return p["id"]
        raise ScriptError(f"no product called {ref!r}; define it with m.product() first")

    # ── common element types ──
    def station(self, name: str, cycle: Any = 60, at=None, **fields) -> Element:
        return self.add("station", name, at=at, cycle=cycle, **fields)

    def buffer(self, name: str, capacity: int = 10, at=None, **fields) -> Element:
        return self.add("buffer", name, at=at, capacity=capacity, **fields)

    def source(self, name: str = "Source", every: float = 120, at=None, **fields) -> Element:
        fields.setdefault("feed_mode", "interval")
        return self.add("source", name, at=at, every=every, **fields)

    def sink(self, name: str = "Sink", at=None) -> Element:
        return self.add("sink", name, at=at)

    def conveyor(self, name: str, length: float = 10, speed: float = 1, capacity: int = 10, at=None, **f) -> Element:
        return self.add("conveyor", name, at=at, length=length, speed=speed, capacity=capacity, **f)

    def operator(self, name: str, count: int = 1, at=None, **fields) -> Element:
        return self.add("operator", name, at=at, count=count, **fields)

    def __getattr__(self, kind: str):
        # m.press(...), m.weldingcell(...), m.warehouse(...) for every element type
        if kind.startswith("_"):
            raise AttributeError(kind)
        norm = kind.lower().replace("_", "")
        if norm in NODE_TYPES:
            return lambda name, at=None, **fields: self.add(norm, name, at=at, **fields)
        raise AttributeError(f"Model has no '{kind}'.{_suggest(norm, NODE_TYPES)}")

    # ── flow ──
    def connect(self, source: Element, target: Element, transport: Optional[str] = None,
                probability: Optional[float] = None) -> Element:
        for e in (source, target):
            if not isinstance(e, Element) or e.model is not self:
                raise ScriptError(f"connect(): {e!r} is not an element of this model")
        if source is target:
            raise ScriptError(f"{source.name}: cannot connect an element to itself")
        if target.kind == "source":
            raise ScriptError(f"{target.name}: nothing can flow into a source")
        if source.kind == "sink":
            raise ScriptError(f"{source.name}: nothing flows out of a sink")
        if any(c["source"] == source.id and c["target"] == target.id for c in self.connections):
            raise ScriptError(f"{source.name} → {target.name} is connected twice")
        conn: Dict[str, Any] = {"id": f"{source.id}--{target.id}", "source": source.id, "target": target.id}
        if transport is not None:
            if transport not in TRANSPORTS:
                raise ScriptError(f"transport '{transport}' is not one of {', '.join(TRANSPORTS)}")
            if transport != "auto":
                conn["transport"] = transport
        if probability is not None:
            if not 0 <= probability <= 1:
                raise ScriptError(f"{source.name} → {target.name}: probability must be 0..1")
            conn["probability"] = float(probability)
        self.connections.append(conn)
        return target

    def line(self, *elements: Element, transport: Optional[str] = None) -> Element:
        """Connect elements in order: ``m.line(src, cut, b1, weld, sink)``."""
        for a, b in zip(elements, elements[1:]):
            self.connect(a, b, transport=transport)
        return elements[-1]

    def product(self, name: str, route: Optional[Sequence[Element]] = None,
                every: Optional[float] = None, priority: Optional[int] = None,
                due: Optional[float] = None) -> Dict[str, Any]:
        """A product type with its own routing: ``m.product("Bracket", route=[cut, weld])``."""
        if any(p["name"] == name for p in self.products):
            raise ScriptError(f"two products are called '{name}'")
        steps = []
        for el in route or []:
            if not isinstance(el, Element):
                raise ScriptError(f"product {name}: route must list model elements, got {el!r}")
            steps.append(el.id)
        p: Dict[str, Any] = {"id": "p-" + slug(name), "name": name, "routing": steps}
        if every is not None:
            p["arrivalRate"] = float(every)
        if priority is not None:
            p["priority"] = int(priority)
        if due is not None:
            p["dueDate"] = float(due)
        self.products.append(p)
        return p

    def __getitem__(self, name: str) -> Element:
        for e in self.elements:
            if e.name == name:
                return e
        raise KeyError(name)

    # ── output ──
    def to_dict(self) -> Dict[str, Any]:
        """The model as the app stores it (FactoryModel JSON)."""
        stations, buffers, extra = [], [], []
        for e in self.elements:
            pos = e.position or {"x": 0.0, "y": 0.0}
            if e.kind == "station":
                stations.append({"id": e.id, "name": e.name, "cycleTime": const(60), **e.fields, "position": pos})
            elif e.kind == "buffer":
                buffers.append({"id": e.id, "name": e.name, "capacity": 10, "queueRule": "FIFO",
                                **e.fields, "position": pos})
            else:
                data = {"id": e.id, "name": e.name, **e.fields}
                if data.get("productFilter") is not None:
                    data["productFilter"] = self._product_id(data["productFilter"])
                node = {"id": e.id, "type": e.kind, "data": data, "position": pos}
                extra.append(node)
        products = self.products or self._default_products()
        return {
            "id": "script-" + slug(self.name),
            "name": self.name,
            "description": self.description,
            "stations": stations,
            "buffers": buffers,
            "connections": [dict(c) for c in self.connections],
            "products": [dict(p) for p in products],
            "resources": [],
            "extraNodes": extra,
            "layout": {"width": 1600, "height": 1000},
            # positions the script did not set; the app lays these out
            "_unplaced": [e.id for e in self.elements if e.position is None],
        }

    def _default_products(self) -> List[Dict[str, Any]]:
        """One product per distinct station path when the script defines none.

        The engine routes each product along a fixed list of stations, so
        parallel stations need a product (route) each, as the templates do.
        """
        if not any(e.kind == "station" for e in self.elements):
            return []
        succ: Dict[str, List[str]] = {}
        has_in = set()
        for c in self.connections:
            if self._ids[c["source"]].kind in ("operator", "humanoid"):
                continue
            succ.setdefault(c["source"], []).append(c["target"])
            has_in.add(c["target"])
        roots = [e.id for e in self.elements if e.kind == "source"] or \
                [e.id for e in self.elements if e.id not in has_in and e.kind not in ("operator", "humanoid")]
        paths: List[List[str]] = []

        def walk(nid: str, seen: List[str], stations: List[str]) -> None:
            if len(paths) >= 24:
                return
            if self._ids[nid].kind == "station":
                stations = stations + [nid]
            nxt = [t for t in succ.get(nid, []) if t not in seen]
            if not nxt:
                if stations and stations not in paths:
                    paths.append(stations)
                return
            for t in nxt:
                walk(t, seen + [t], stations)

        for r in roots:
            walk(r, [r], [])
        if not paths:
            return [{"id": "p-part", "name": "Part", "routing": [e.id for e in self.elements if e.kind == "station"]}]
        if len(paths) == 1:
            return [{"id": "p-part", "name": "Part", "routing": paths[0]}]
        out = []
        for i, route in enumerate(paths, 1):
            others = [set(p) for j, p in enumerate(paths) if j != i - 1]
            own = next((sid for sid in route if not any(sid in o for o in others)), None)
            label = self._ids[own].name if own else str(i)
            out.append({"id": f"p-part-{i}", "name": f"Part via {label}", "routing": route})
        return out

    def run(self, duration: float = 8 * 3600, seed: Optional[int] = 1, warmup: float = 0) -> Dict[str, Any]:
        """Run the model in the FactorySim engine and print the headline KPIs."""
        from factorysim.engine.simulation import Simulation, SimulationConfig
        model = self.to_dict()
        model.pop("_unplaced", None)
        result = Simulation(model, SimulationConfig(duration=duration, seed=seed, warmup_period=warmup)).run()
        if result.get("status") != "completed":
            print("Simulation failed:", result.get("error"))
            return result
        k = result.get("kpis", {})
        tp = k.get("throughput", {})
        print(f"{self.name}: {duration / 3600:g} h simulated")
        print(f"  throughput  {tp.get('total', 0)} parts ({tp.get('ratePerHour', tp.get('rate_per_hour', 0)):.1f}/h)")
        oee = k.get("oee", {})
        if isinstance(oee, dict) and "overall" in oee:
            print(f"  OEE         {oee['overall'] * 100:.1f} %")
        return result
