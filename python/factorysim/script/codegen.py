"""Write a FactoryModel (app JSON) as a model script."""

import keyword
import re
from typing import Any, Dict, List

from factorysim.script import NODE_FIELDS, STATION_FIELDS, BUFFER_FIELDS, __all__ as API_NAMES

_SHORT = {
    "station": {"cycleTime": "cycle", "setupTime": "setup", "scrapRate": "scrap", "batchSize": "batch",
                "libraryModelId": "model3d"},
    "buffer": {"queueRule": "rule", "libraryModelId": "model3d"},
    "source": {"arrivalRate": "every", "productFilter": "product"},
}
_RESERVED = set(API_NAMES) | {"m", "model", "math", "random"}


def _snake(name: str) -> str:
    return re.sub(r"(?<=[a-z0-9])([A-Z])", r"_\1", name).lower()


def _num(v: Any) -> str:
    if isinstance(v, bool) or v is None:
        return repr(v)
    if isinstance(v, float) and v.is_integer() and abs(v) < 1e15:
        return str(int(v))
    if isinstance(v, (int, float)):
        return repr(v)
    return repr(v)


def _lit(v: Any) -> str:
    if isinstance(v, dict):
        return "{" + ", ".join(f"{_lit(k)}: {_lit(x)}" for k, x in v.items()) + "}"
    if isinstance(v, list):
        return "[" + ", ".join(_lit(x) for x in v) + "]"
    return _num(v)


def _dist(d: Any) -> str:
    if isinstance(d, (int, float)):
        return _num(d)
    if not isinstance(d, dict):
        return _lit(d)
    t, p = d.get("type"), d.get("parameters", {})
    try:
        if t == "constant":
            return _num(p["value"])
        if t == "normal":
            return f"normal({_num(p['mean'])}, {_num(p['std'])})"
        if t == "exponential":
            return f"expo({_num(p['mean'])})"
        if t == "triangular":
            return f"tri({_num(p['min'])}, {_num(p['mode'])}, {_num(p['max'])})"
        if t == "uniform":
            return f"uniform({_num(p['min'])}, {_num(p['max'])})"
        if t == "lognormal":
            return f"lognormal({_num(p['mean'])}, {_num(p.get('sigma', p.get('std', 0.5)))})"
        if t == "weibull":
            return f"weibull({_num(p['shape'])}, {_num(p['scale'])})"
        if t == "empirical":
            return f"empirical({_lit(list(p['data']))})"
    except KeyError:
        pass
    return _lit(d)


def model_to_script(model: Dict[str, Any], positions: bool = True) -> str:
    stations = model.get("stations") or []
    buffers = model.get("buffers") or []
    extra = model.get("extraNodes") or []
    products = model.get("products") or []
    conns = model.get("connections") or []

    # variable names
    var: Dict[str, str] = {}
    used = set(_RESERVED)

    def name_var(nid: str, name: str) -> str:
        base = re.sub(r"\W+", "_", name.lower()).strip("_") or "node"
        if base[0].isdigit():
            base = "n_" + base
        if keyword.iskeyword(base) or base in used:
            i = 2
            while f"{base}_{i}" in used:
                i += 1
            base = f"{base}_{i}"
        used.add(base)
        var[nid] = base
        return base

    prod_var: Dict[str, str] = {}
    prod_name = {p["id"]: repr(p.get("name", p["id"])) for p in products}
    for p in products:
        v = re.sub(r"\W+", "_", str(p.get("name", "product")).lower()).strip("_") or "product"
        v = "p_" + v
        while v in used:
            v += "_"
        used.add(v)
        prod_var[p["id"]] = v

    nodes: List[Dict[str, Any]] = (
        [{"kind": "station", "id": s["id"], "name": s.get("name", s["id"]), "fields": s, "pos": s.get("position")}
         for s in stations]
        + [{"kind": "buffer", "id": b["id"], "name": b.get("name", b["id"]), "fields": b, "pos": b.get("position")}
           for b in buffers]
        + [{"kind": n.get("type"), "id": n["id"], "name": (n.get("data") or {}).get("name", n["id"]),
            "fields": n.get("data") or {}, "pos": n.get("position")} for n in extra]
    )
    # unique display names (the script API needs them)
    seen_names: Dict[str, int] = {}
    for n in nodes:
        nm = str(n["name"]) or n["id"]
        if nm in seen_names:
            seen_names[nm] += 1
            nm = f"{nm} ({seen_names[nm]})"
        else:
            seen_names[nm] = 1
        n["name"] = nm

    L = [
        f"# {model.get('name') or 'Model'} — FactorySim model script",
        "# Times in seconds, MTBF/MTTR in hours. Connect elements with  a >> b",
        "# or  a.to(b, transport=\"forklift\")  (auto, conveyor, manual, forklift, agv, direct).",
        "from factorysim.script import *",
        "",
        f"m = Model({model.get('name') or 'Scripted model'!r})",
        "",
    ]
    order = {"source": 0, "station": 1, "buffer": 1}
    nodes.sort(key=lambda n: order.get(n["kind"], 1 if n["kind"] != "sink" else 3))
    later: List[str] = []
    for n in nodes:
        kind = n["kind"]
        if kind not in NODE_FIELDS and kind not in ("station", "buffer"):
            L.append(f"# skipped unknown element type {kind!r}: {n['name']}")
            continue
        v = name_var(n["id"], n["name"])
        known = STATION_FIELDS if kind == "station" else BUFFER_FIELDS if kind == "buffer" else NODE_FIELDS[kind]
        short = _SHORT.get(kind, {})
        args = [repr(n["name"])]
        for field in known:
            if field not in n["fields"] or n["fields"][field] is None:
                continue
            val = n["fields"][field]
            key = short.get(field, _snake(field))
            if kind == "station" and field in ("cycleTime", "setupTime"):
                args.append(f"{key}={_dist(val)}")
            elif field == "reworkTarget":
                later.append(f"{v}.set(rework_to={val!r})")
            elif field == "productCycleTimes" and isinstance(val, dict):
                later.append(f"{v}.set(product_cycle_times={{"
                             + ", ".join(f"{prod_name.get(k, repr(k))}: {_dist(x)}" for k, x in val.items())
                             + "})")
            elif field == "productFilter":
                later.append(f"{v}.set(product={prod_var.get(val, repr(val))})")
            elif kind == "source" and field == "feedMode" and val == "interval":
                continue
            else:
                args.append(f"{key}={_lit(val)}")
        if positions and isinstance(n.get("pos"), dict):
            args.append(f"at=({_num(round(float(n['pos'].get('x', 0)), 1))}, "
                        f"{_num(round(float(n['pos'].get('y', 0)), 1))})")
        L.append(f"{v} = m.{kind}({', '.join(args)})")

    # rework targets point at other elements
    fixed = []
    for ln in later:
        mt = re.match(r"(\w+)\.set\(rework_to='(.+)'\)", ln)
        if mt:
            tgt = var.get(mt.group(2))
            fixed.append(f"{mt.group(1)}.set(rework_to={tgt})" if tgt else f"# {ln}  (target not found)")
        else:
            fixed.append(ln)

    # flow
    kind_of = {n["id"]: n["kind"] for n in nodes}
    plain, special, serve = [], [], {}
    for c in conns:
        s, t = c.get("source"), c.get("target")
        if s not in var or t not in var:
            continue
        if kind_of.get(s) in ("operator", "humanoid"):
            serve.setdefault(s, []).append(t)
        elif c.get("transport") not in (None, "auto") or c.get("probability") is not None:
            special.append(c)
        else:
            plain.append((s, t))

    L += ["", "# Flow"]
    L += _chains(plain, var)
    for c in special:
        opts = []
        if c.get("transport") not in (None, "auto"):
            opts.append(f"transport={c['transport']!r}")
        if c.get("probability") is not None:
            opts.append(f"probability={_num(c['probability'])}")
        L.append(f"{var[c['source']]}.to({var[c['target']]}, {', '.join(opts)})")
    for op, sts in serve.items():
        L.append(f"{var[op]}.serves({', '.join(var[s] for s in sts)})")

    if products:
        L += ["", "# Products"]
        for p in products:
            args = [repr(p.get("name", "Product"))]
            route = [var[r] for r in p.get("routing") or [] if r in var]
            args.append(f"route=[{', '.join(route)}]")
            if p.get("arrivalRate") is not None:
                args.append(f"every={_num(p['arrivalRate'])}")
            if p.get("priority") is not None:
                args.append(f"priority={_num(p['priority'])}")
            if p.get("dueDate") is not None:
                args.append(f"due={_num(p['dueDate'])}")
            L.append(f"{prod_var[p['id']]} = m.product({', '.join(args)})")
    if fixed:
        L += [""] + fixed

    dropped = [label for key, label in (("orders", "orders"), ("transportNetwork", "transport network"),
                                         ("subModels", "sub-models"), ("scripts", "node scripts"))
               if model.get(key)]
    if dropped:
        L += ["", f"# Not part of the script: {', '.join(dropped)}. Loading the script replaces the model without them."]
    L += ["", "if __name__ == \"__main__\":", "    m.run(duration=8 * 3600)", ""]
    return "\n".join(L)


def _chains(edges: List[tuple], var: Dict[str, str]) -> List[str]:
    """Write plain connections as  a >> b >> c  chains."""
    outs: Dict[str, List[str]] = {}
    ins: Dict[str, List[str]] = {}
    for s, t in edges:
        outs.setdefault(s, []).append(t)
        ins.setdefault(t, []).append(s)
    used = set()
    lines = []

    def extendable(node: str) -> bool:
        return len(outs.get(node, [])) == 1 and len(ins.get(outs[node][0], [])) == 1

    starts = [s for s, _ in edges if not (len(ins.get(s, [])) == 1 and extendable(ins[s][0]))]
    for start in list(dict.fromkeys(starts)) + [s for s, _ in edges]:
        for t in outs.get(start, []):
            if (start, t) in used:
                continue
            chain = [start, t]
            used.add((start, t))
            cur = t
            while extendable(cur) and (cur, outs[cur][0]) not in used:
                nxt = outs[cur][0]
                used.add((cur, nxt))
                chain.append(nxt)
                cur = nxt
            lines.append(" >> ".join(var[n] for n in chain))
    return lines
