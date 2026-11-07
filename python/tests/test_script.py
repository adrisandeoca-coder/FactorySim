"""Model scripting API (factorysim.script): build, run, round trip."""

import json
import os
import re

import pytest

from factorysim.engine.simulation import Simulation, SimulationConfig
from factorysim.script import Model, ScriptError, normal, tri, _created
from factorysim.script.codegen import model_to_script
from factorysim.script.node_fields import NODE_FIELDS
from factorysim.script.runner import run_script


ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))


def build(code: str) -> dict:
    """Run a script in-process (fast) and return its model."""
    _created.clear()
    g: dict = {"__name__": "__test__"}
    exec(compile(code, "<script>", "exec"), g)
    m = g.get("model") if isinstance(g.get("model"), Model) else _created[-1]
    out = m.to_dict()
    out.pop("_unplaced", None)
    return out


def simulate(model: dict, hours: float = 8) -> dict:
    model = {k: v for k, v in model.items() if k != "_unplaced"}
    r = Simulation(model, SimulationConfig(duration=hours * 3600, seed=3)).run()
    assert r["status"] == "completed", r.get("error")
    return r


# ── building ───────────────────────────────────────────────────

def line_model() -> Model:
    m = Model("Line")
    src = m.source("Raw", every=45)
    cut = m.station("Cut", cycle=normal(40, 4), mtbf=8, mttr=0.3)
    b1 = m.buffer("B1", capacity=6)
    weld = m.station("Weld", cycle=tri(30, 35, 44), scrap=0.02)
    out = m.sink("Out")
    src >> cut >> b1 >> weld >> out
    return m


def test_line_builds_app_model():
    d = line_model().to_dict()
    assert [s["name"] for s in d["stations"]] == ["Cut", "Weld"]
    cut = d["stations"][0]
    assert cut["cycleTime"] == {"type": "normal", "parameters": {"mean": 40.0, "std": 4.0}}
    assert cut["mtbf"] == 8 and cut["mttr"] == 0.3
    assert d["stations"][1]["scrapRate"] == 0.02
    assert d["buffers"][0]["capacity"] == 6 and d["buffers"][0]["queueRule"] == "FIFO"
    pairs = [(c["source"], c["target"]) for c in d["connections"]]
    assert pairs == [("raw", "cut"), ("cut", "b1"), ("b1", "weld"), ("weld", "out")]
    assert d["products"] == [{"id": "p-part", "name": "Part", "routing": ["cut", "weld"]}]
    assert set(d["_unplaced"]) == {"raw", "cut", "b1", "weld", "out"}


def test_line_simulates_at_arrival_rate():
    r = simulate(line_model().to_dict())
    # one part every 45 s for 8 h ≈ 640, minus 2 % scrap at the weld
    assert 580 <= r["kpis"]["throughput"]["total"] <= 640


def test_parallel_stations_get_one_product_per_path():
    m = Model("Cell")
    src = m.source("In", every=30)
    buf = m.buffer("Infeed", capacity=10)
    robots = [m.station(f"Robot {i}", cycle=90) for i in (1, 2, 3)]
    out = m.sink("Out")
    src >> buf >> robots
    robots >> out
    d = m.to_dict()
    assert sorted(p["routing"][0] for p in d["products"]) == ["robot-1", "robot-2", "robot-3"]
    by = simulate(d)["kpis"]["throughput"]["by_station"]
    assert min(by.values()) > 0.8 * max(by.values())  # work spread over all three


def test_operators_transport_and_probability():
    m = Model("Opts")
    src = m.source("In", every=60)
    a = m.station("A", cycle=30)
    b = m.station("B", cycle=30)
    op = m.operator("Crew", count=1)
    out = m.sink("Out")
    src.to(a, transport="forklift")
    a.to(b, transport="manual", probability=0.9)
    b >> out
    op.serves(a, b)
    conns = {(c["source"], c["target"]): c for c in m.to_dict()["connections"]}
    assert conns[("in", "a")]["transport"] == "forklift"
    assert conns[("a", "b")]["transport"] == "manual" and conns[("a", "b")]["probability"] == 0.9
    assert ("crew", "a") in conns and ("crew", "b") in conns
    assert "transport" not in conns[("b", "out")]
    # operators are not part of product routes
    assert m.to_dict()["products"][0]["routing"] == ["a", "b"]


def test_any_element_type_and_fields():
    m = Model("Types")
    p = m.press("Press 1", tonnage=300, cycle_time=12)
    w = m.add("weldingcell", "Weld cell", weld_type="TIG")
    d = {n["id"]: n for n in m.to_dict()["extraNodes"]}
    assert d[p.id]["type"] == "press" and d[p.id]["data"]["tonnage"] == 300
    assert d[p.id]["data"]["cycleTime"] == 12
    assert d[w.id]["data"]["weldType"] == "TIG"


def test_products_and_product_cycle_times():
    m = Model("Mix")
    saw = m.station("Saw", cycle=20)
    mill = m.station("Mill", cycle=50)
    shaft = m.product("Shaft", route=[saw], every=90)
    m.product("Flange", route=[saw, mill])
    mill.set(product_cycle_times={"Flange": normal(60, 5)})
    src = m.source("Orders", every=60, product=shaft)
    d = m.to_dict()
    assert d["products"][0] == {"id": "p-shaft", "name": "Shaft", "routing": ["saw"], "arrivalRate": 90.0}
    assert d["stations"][1]["productCycleTimes"] == {"p-flange": normal(60, 5)}
    src_node = next(n for n in d["extraNodes"] if n["id"] == src.id)
    assert src_node["data"]["productFilter"] == "p-shaft"


@pytest.mark.parametrize("make, message", [
    (lambda m: m.station("S", cycel=10), "Did you mean 'cycle'?"),
    (lambda m: m.statoin("S"), "Did you mean 'station'?"),
    (lambda m: (m.station("S"), m.station("S")), "names must be unique"),
    (lambda m: m.source("A") >> m.source("B"), "nothing can flow into a source"),
    (lambda m: m.station("S", cycle=-4), "cannot be negative"),
    (lambda m: m.station("S").to(m.sink("K"), transport="truck"), "is not one of"),
    (lambda m: tri(5, 1, 3), "low <= mode <= high"),
])
def test_mistakes_explain_themselves(make, message):
    with pytest.raises((ScriptError, AttributeError), match=re.escape(message)):
        make(Model("Bad"))


# ── runner (separate process) ──────────────────────────────────

def test_runner_returns_model_and_output():
    r = run_script('m = Model("X")\nm.source("S") >> m.station("A") >> m.sink("K")\nprint("hello")\n')
    assert r["ok"], r
    assert r["output"].strip() == "hello"
    assert [s["id"] for s in r["model"]["stations"]] == ["a"]


def test_runner_reports_error_line():
    r = run_script('m = Model("X")\n\nm.station("A", cycel=3)\n')
    assert not r["ok"] and r["line"] == 3 and "cycle" in r["error"]
    r = run_script('m = Model("X"\n')
    assert not r["ok"] and r["error"].startswith("SyntaxError")


def test_runner_blocks_files_and_imports():
    r = run_script('import os\nm = Model("X")\n')
    assert not r["ok"] and "not available" in r["error"]
    r = run_script('open("x.txt", "w")\n')
    assert not r["ok"] and "open" in r["error"]
    r = run_script('import math, random\nm = Model("X")\nm.station("A", cycle=math.sqrt(16))\n')
    assert r["ok"], r


def test_runner_stops_endless_loop():
    r = run_script("while True:\n    pass\n", timeout=2)
    assert not r["ok"] and "did not finish" in r["error"]


def test_runner_needs_a_model():
    r = run_script("x = 1\n")
    assert not r["ok"] and "made no model" in r["error"]


def test_preview_skips_run_but_run_mode_runs():
    code = 'm = Model("X")\nm.source("S", every=60) >> m.station("A", cycle=30) >> m.sink("K")\nm.run(duration=3600)\n'
    r = run_script(code)
    assert r["ok"] and "skipped in the preview" in r["output"]
    r = run_script(code, mode="run", timeout=60)
    assert r["ok"] and "throughput" in r["output"], r


# ── code generation and round trip ─────────────────────────────

def _signature(model: dict) -> dict:
    """Model content by element name, independent of ids and positions."""
    names = {}
    for s in model["stations"]:
        names[s["id"]] = s["name"]
    for b in model["buffers"]:
        names[b["id"]] = b["name"]
    for n in model["extraNodes"]:
        names[n["id"]] = n["data"]["name"]
    prods = {p["id"]: p["name"] for p in model["products"]}

    def strip(d, *drop):
        return {k: v for k, v in d.items() if k not in ("id", "name", "position", *drop) and v is not None}

    def num(v):
        def hook(d):
            # the engine reads a lognormal "std" as "sigma"; scripts write sigma
            if d.get("type") == "lognormal" and "std" in d.get("parameters", {}) \
                    and "sigma" not in d["parameters"]:
                d["parameters"] = {"mean": d["parameters"]["mean"], "sigma": d["parameters"]["std"]}
            return d
        return json.loads(json.dumps(v), parse_float=float, parse_int=float, object_hook=hook)

    sig = {
        "stations": {s["name"]: num(strip({**s, "reworkTarget": names.get(s.get("reworkTarget"))},
                                           "productCycleTimes")) for s in model["stations"]},
        "buffers": {b["name"]: num(strip({"queueRule": "FIFO", **b})) for b in model["buffers"]},
        "nodes": {n["data"]["name"]: (n["type"], num(strip({**n["data"], "productFilter": prods.get(
            n["data"].get("productFilter"), n["data"].get("productFilter"))}))) for n in model["extraNodes"]},
        "links": sorted((names[c["source"]], names[c["target"]], c.get("transport") or "auto",
                         c.get("probability")) for c in model["connections"]
                        if c["source"] in names and c["target"] in names),
        "products": sorted((p["name"], tuple(names[r] for r in p["routing"] if r in names),
                            p.get("arrivalRate")) for p in model["products"]),
    }
    return sig


def _templates():
    """The app's templates (fixture written by src/__tests__/templatesFixture.test.ts)."""
    with open(os.path.join(os.path.dirname(__file__), "fixtures", "templates.json"), encoding="utf-8") as f:
        raw = json.load(f)
    out = []
    for t in raw:
        tpl = t["template"]
        out.append({"id": t["id"], "name": t["name"], "stations": tpl.get("stations", []),
                    "buffers": tpl.get("buffers", []), "connections": tpl.get("connections", []),
                    "products": tpl.get("products", []), "resources": tpl.get("resources", []),
                    "extraNodes": tpl.get("extraNodes", []), "orders": tpl.get("orders", []),
                    "layout": tpl.get("layout", {"width": 1200, "height": 800})})
    return out


@pytest.mark.parametrize("model", _templates(), ids=lambda m: m["id"])
def test_every_template_round_trips(model):
    names = [s["name"] for s in model["stations"]] + [b["name"] for b in model["buffers"]] \
        + [n["data"]["name"] for n in model["extraNodes"]]
    if len(names) != len(set(names)):
        pytest.skip("template repeats an element name")
    code = model_to_script(model)
    rebuilt = build(code)
    assert _signature(rebuilt) == _signature(model)
    # positions survive too
    pos = {s["name"]: s["position"] for s in model["stations"]}
    for s in rebuilt["stations"]:
        assert abs(s["position"]["x"] - pos[s["name"]]["x"]) < 0.11


def test_generated_script_runs_standalone():
    model = _templates()[0]
    r = run_script(model_to_script(model), mode="run", timeout=90)
    assert r["ok"] and "throughput" in r["output"], r


def test_node_fields_match_typescript():
    ts = open(os.path.join(ROOT, "src", "types", "index.ts"), encoding="utf-8").read()
    ifaces = {}
    for m in re.finditer(r"export interface (\w+)NodeData\s*(?:extends [^{]*)?\{(.*?)\n\}", ts, re.S):
        keys = re.findall(r"^\s{2}(\w+)\??:", m.group(2), re.M)
        ifaces[m.group(1).lower()] = [k for k in keys if k not in ("id", "name")]
    types = re.findall(r"'(\w+)'", re.search(r"export type NodeType = ([^;]*);", ts).group(1))
    expected = {t: ifaces[t] for t in types if t not in ("station", "buffer")}
    assert NODE_FIELDS == expected, "regenerate python/factorysim/script/node_fields.py"
