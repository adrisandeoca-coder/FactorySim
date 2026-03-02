#!/usr/bin/env python3
"""
Comprehensive simulation test harness.

Runs ALL 26 UI templates + ALL 10 quick scenario variants on the Flow Line
base model + ALL 8 Python test fixtures. Captures full KPI results and
logs any errors, warnings, or anomalies for analysis.
"""

import copy
import json
import math
import os
import re
import sys
import time
import traceback

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from factorysim.engine.simulation import Simulation, SimulationConfig

# Re-use existing template parser
from test_all_templates import extract_templates, ts_obj_to_model
from test_scenarios import (
    SCENARIO_TWO_STATION_BALANCED,
    SCENARIO_THREE_STATION_BOTTLENECK,
    SCENARIO_FAILURES,
    SCENARIO_SCRAP,
    SCENARIO_MULTI_PRODUCT,
    SCENARIO_VARIABLE_TIMES,
    SCENARIO_SINGLE_STATION,
    SCENARIO_FIVE_STATION_LINE,
)


# ──────────────────────────────────────────────────────────────────
# Quick scenario overrides (Python port of ScenarioManager logic)
# ──────────────────────────────────────────────────────────────────

def apply_machine_failure(model):
    """MTBF=0.1h, MTTR=0.05h on first station."""
    m = copy.deepcopy(model)
    if m["stations"]:
        m["stations"][0]["mtbf"] = 0.1
        m["stations"][0]["mttr"] = 0.05
    return m, "machine-failure"


def apply_demand_increase(model):
    """20% faster arrivals on all products + sources."""
    m = copy.deepcopy(model)
    for p in m.get("products", []):
        rate = p.get("arrivalRate", 120)
        p["arrivalRate"] = round(rate * 0.8)
    for n in m.get("extraNodes", []):
        if n.get("type") == "source":
            data = n.get("data", {})
            rate = data.get("arrivalRate", 120)
            data["arrivalRate"] = round(rate * 0.8)
    return m, "demand-increase"


def apply_add_shift(model):
    """Add Day+Evening shifts to all stations."""
    m = copy.deepcopy(model)
    for s in m["stations"]:
        existing = s.get("shifts", [])
        if len(existing) >= 2:
            continue
        if len(existing) == 0:
            s["shifts"] = [
                {"name": "Day Shift", "startHour": 6, "endHour": 14, "days": [0, 1, 2, 3, 4]},
                {"name": "Evening Shift", "startHour": 14, "endHour": 22, "days": [0, 1, 2, 3, 4]},
            ]
        else:
            e = existing[0]
            ns = e["endHour"]
            ne = min(ns + 8, 24)
            s["shifts"] = existing + [
                {"name": "Added Shift", "startHour": ns, "endHour": ne, "days": e.get("days", [0,1,2,3,4])}
            ]
    return m, "add-shift"


def apply_reduce_batch(model):
    """Halve all buffer capacities."""
    m = copy.deepcopy(model)
    for b in m.get("buffers", []):
        b["capacity"] = max(1, b.get("capacity", 10) // 2)
    return m, "reduce-batch"


def apply_quality_drop(model):
    """+10% scrap rate on all stations."""
    m = copy.deepcopy(model)
    for s in m["stations"]:
        current = s.get("scrapRate", 0)
        s["scrapRate"] = min(1.0, current + 0.1)
    return m, "quality-drop"


def apply_slower_cycle(model):
    """30% slower cycle times."""
    m = copy.deepcopy(model)
    for s in m["stations"]:
        dist = s.get("cycleTime", {})
        params = dict(dist.get("parameters", {}))
        for k in ("mean", "value", "min", "max", "mode"):
            if k in params and isinstance(params[k], (int, float)):
                params[k] = round(params[k] * 1.3, 2)
        s["cycleTime"] = {**dist, "parameters": params}
    return m, "slower-cycle"


def apply_bigger_buffers(model):
    """Double all buffer capacities."""
    m = copy.deepcopy(model)
    for b in m.get("buffers", []):
        b["capacity"] = b.get("capacity", 10) * 2
    return m, "bigger-buffers"


def apply_supply_disruption(model):
    """50% slower arrivals."""
    m = copy.deepcopy(model)
    for p in m.get("products", []):
        rate = p.get("arrivalRate", 120)
        p["arrivalRate"] = round(rate * 2)
    for n in m.get("extraNodes", []):
        if n.get("type") == "source":
            data = n.get("data", {})
            rate = data.get("arrivalRate", 120)
            data["arrivalRate"] = round(rate * 2)
    return m, "supply-disruption"


def apply_preventive_maintenance(model):
    """3x MTBF, 0.5x MTTR on all stations."""
    m = copy.deepcopy(model)
    for s in m["stations"]:
        mtbf = s.get("mtbf", 100)
        mttr = s.get("mttr", 1)
        s["mtbf"] = round(mtbf * 3, 1)
        s["mttr"] = round(mttr * 0.5, 2)
    return m, "preventive-maintenance"


def apply_speed_boost(model):
    """25% faster cycle time on bottleneck station."""
    m = copy.deepcopy(model)
    if not m["stations"]:
        return m, "speed-boost"
    # Find bottleneck (longest mean CT)
    def get_mean(s):
        p = s.get("cycleTime", {}).get("parameters", {})
        return p.get("mean", p.get("value", p.get("mode", 0)))
    bottleneck = max(m["stations"], key=get_mean)
    dist = bottleneck.get("cycleTime", {})
    params = dict(dist.get("parameters", {}))
    for k in ("mean", "value", "min", "max", "mode"):
        if k in params and isinstance(params[k], (int, float)):
            params[k] = round(params[k] * 0.75, 2)
    bottleneck["cycleTime"] = {**dist, "parameters": params}
    return m, "speed-boost"


QUICK_SCENARIO_FUNCS = [
    apply_machine_failure,
    apply_demand_increase,
    apply_add_shift,
    apply_reduce_batch,
    apply_quality_drop,
    apply_slower_cycle,
    apply_bigger_buffers,
    apply_supply_disruption,
    apply_preventive_maintenance,
    apply_speed_boost,
]


# ──────────────────────────────────────────────────────────────────
# Anomaly detection
# ──────────────────────────────────────────────────────────────────

def check_anomalies(name, result):
    """Return list of warning strings for suspicious KPI values."""
    warnings = []
    k = result.get("kpis", {})

    oee = k.get("oee", {})
    overall = oee.get("overall", -1)
    avail = oee.get("availability", -1)
    perf = oee.get("performance", -1)
    qual = oee.get("quality", -1)

    if overall < 0 or overall > 1.001:
        warnings.append(f"OEE overall out of range: {overall}")
    if avail < 0 or avail > 1.001:
        warnings.append(f"OEE availability out of range: {avail}")
    if perf < 0 or perf > 1.001:
        warnings.append(f"OEE performance out of range: {perf}")
    if qual < 0 or qual > 1.001:
        warnings.append(f"OEE quality out of range: {qual}")

    tp = k.get("throughput", {})
    total = tp.get("total", 0)
    if total == 0:
        warnings.append("Zero throughput — no parts completed")

    # Check utilization fractions sum to ~1
    util = k.get("utilization", {})
    for sid, breakdown in util.get("by_station", {}).items():
        s = sum(v for v in breakdown.values() if isinstance(v, (int, float)))
        if abs(s - 1.0) > 0.05:
            warnings.append(f"Station {sid} utilization sums to {s:.4f} (expected ~1.0)")

    # Negative cycle times
    ct = k.get("cycle_time", {})
    if ct.get("mean", 0) < 0:
        warnings.append(f"Negative mean cycle time: {ct['mean']}")
    if ct.get("min", 0) < 0:
        warnings.append(f"Negative min cycle time: {ct['min']}")

    # NaN checks
    def check_nan(obj, path="kpis"):
        if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
            warnings.append(f"NaN/Inf detected at {path}")
        elif isinstance(obj, dict):
            for key, val in obj.items():
                check_nan(val, f"{path}.{key}")
        elif isinstance(obj, list):
            for i, val in enumerate(obj):
                check_nan(val, f"{path}[{i}]")

    check_nan(k)

    return warnings


# ──────────────────────────────────────────────────────────────────
# Run simulation
# ──────────────────────────────────────────────────────────────────

def run_sim(model, duration=3600, seed=42, label="test"):
    """Run simulation, return (result, wall_time, error_msg)."""
    t0 = time.time()
    try:
        config = SimulationConfig(duration=duration, seed=seed)
        sim = Simulation(model, config)
        result = sim.run()
        wall = time.time() - t0
        return result, wall, None
    except Exception as e:
        wall = time.time() - t0
        return None, wall, f"{type(e).__name__}: {e}\n{traceback.format_exc()}"


# ──────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────

def main():
    results_log = []  # (category, name, status, throughput, oee, wall_time, warnings, error)

    def record(cat, name, result, wall, error):
        if error:
            results_log.append((cat, name, "ERROR", 0, 0, wall, [], error))
            print(f"  ERROR  [{cat}] {name}")
            print(f"         {error.split(chr(10))[0]}")
            return

        status = result.get("status", "unknown")
        k = result.get("kpis", {})
        tp = k.get("throughput", {}).get("total", 0)
        oee_val = k.get("oee", {}).get("overall", 0)
        warns = check_anomalies(name, result)

        tag = "PASS " if status == "completed" and not warns else "WARN " if status == "completed" else "FAIL "
        results_log.append((cat, name, tag.strip(), tp, oee_val, wall, warns, None))

        flag = ""
        if warns:
            flag = f"  !! {len(warns)} warning(s)"
        print(f"  {tag} [{cat}] {name}  |  throughput={tp}  OEE={oee_val:.1%}  ({wall:.1f}s){flag}")
        for w in warns:
            print(f"         -> {w}")

    # ── PART 1: UI Templates ──
    tsx_path = os.path.normpath(os.path.join(
        os.path.dirname(__file__), "..", "..", "src", "components",
        "factory-builder", "TemplateSelector.tsx"
    ))
    print(f"\n{'='*80}")
    print(f"  PART 1: UI Templates from TemplateSelector.tsx")
    print(f"{'='*80}\n")

    raw_templates = extract_templates(tsx_path)
    print(f"  Found {len(raw_templates)} templates\n")

    ui_models = []  # store for quick scenario reuse
    for i, ts_text in enumerate(raw_templates):
        name_match = re.search(r"name:\s*['\"]([^'\"]+)['\"]", ts_text)
        tname = name_match.group(1) if name_match else f"Template #{i+1}"
        try:
            model = ts_obj_to_model(ts_text)
            ui_models.append((tname, model))
            result, wall, err = run_sim(model, duration=3600, seed=42, label=tname)
            record("template", tname, result, wall, err)
        except Exception as e:
            record("template", tname, None, 0, f"Parse error: {e}")

    # ── PART 2: Python Test Fixtures ──
    print(f"\n{'='*80}")
    print(f"  PART 2: Python Test Fixtures (8 scenarios)")
    print(f"{'='*80}\n")

    py_scenarios = [
        ("Two Station Balanced", SCENARIO_TWO_STATION_BALANCED),
        ("Three Station Bottleneck", SCENARIO_THREE_STATION_BOTTLENECK),
        ("Station Failures", SCENARIO_FAILURES),
        ("Quality Scrap", SCENARIO_SCRAP),
        ("Multi Product", SCENARIO_MULTI_PRODUCT),
        ("Variable Times", SCENARIO_VARIABLE_TIMES),
        ("Single Station", SCENARIO_SINGLE_STATION),
        ("Five Station Line", SCENARIO_FIVE_STATION_LINE),
    ]

    for name, model in py_scenarios:
        result, wall, err = run_sim(model, duration=7200, seed=42, label=name)
        record("py-fixture", name, result, wall, err)

    # ── PART 3: Quick Scenarios ──
    # Apply each of the 10 quick scenarios on the first 5 base UI templates
    print(f"\n{'='*80}")
    print(f"  PART 3: Quick Scenarios (10 scenarios x 5 base templates = 50 runs)")
    print(f"{'='*80}\n")

    # Use first 5 UI templates (basic set) as base models
    base_models = ui_models[:5] if len(ui_models) >= 5 else ui_models
    for base_name, base_model in base_models:
        for scenario_func in QUICK_SCENARIO_FUNCS:
            try:
                modified, scenario_id = scenario_func(base_model)
                label = f"{base_name} + {scenario_id}"
                duration = 86400 if scenario_id == "add-shift" else 28800
                result, wall, err = run_sim(modified, duration=duration, seed=42, label=label)
                record("quick-scenario", label, result, wall, err)
            except Exception as e:
                record("quick-scenario", f"{base_name} + {scenario_func.__name__}", None, 0, str(e))

    # ── PART 4: Stress tests — longer durations on complex models ──
    print(f"\n{'='*80}")
    print(f"  PART 4: Stress Tests (24h simulations)")
    print(f"{'='*80}\n")

    stress_models = [m for n, m in ui_models if "Stress" in n or "Bottleneck" in n or "Automotive" in n or "SMT" in n]
    if not stress_models and len(ui_models) > 10:
        # Fallback: use some complex templates by index
        stress_models = [ui_models[i][1] for i in [10, 11, 15] if i < len(ui_models)]

    for model in stress_models:
        name = model.get("name", "Unknown") + " (24h)"
        result, wall, err = run_sim(model, duration=86400, seed=42, label=name)
        record("stress", name, result, wall, err)

    # ── Summary ──
    print(f"\n{'='*80}")
    print(f"  SUMMARY")
    print(f"{'='*80}\n")

    total = len(results_log)
    passes = sum(1 for r in results_log if r[2] == "PASS")
    warns = sum(1 for r in results_log if r[2] == "WARN")
    errors = sum(1 for r in results_log if r[2] == "ERROR")
    fails = sum(1 for r in results_log if r[2] == "FAIL")

    print(f"  Total runs:  {total}")
    print(f"  PASS:        {passes}")
    print(f"  WARN:        {warns}")
    print(f"  ERROR:       {errors}")
    print(f"  FAIL:        {fails}")

    if warns > 0 or errors > 0 or fails > 0:
        print(f"\n  {'-'*70}")
        print(f"  Issues requiring attention:\n")
        for cat, name, status, tp, oee, wall, w, err in results_log:
            if status in ("WARN", "ERROR", "FAIL"):
                print(f"  [{status}] {cat} / {name}")
                if err:
                    for line in err.strip().split("\n")[:3]:
                        print(f"    {line}")
                for warning in w:
                    print(f"    -> {warning}")
                print()

    # Write full log to file
    log_path = os.path.join(os.path.dirname(__file__), "comprehensive_results.json")
    log_data = []
    for cat, name, status, tp, oee, wall, w, err in results_log:
        log_data.append({
            "category": cat,
            "name": name,
            "status": status,
            "throughput": tp,
            "oee": oee,
            "wall_time_s": round(wall, 2),
            "warnings": w,
            "error": err,
        })
    with open(log_path, "w") as f:
        json.dump(log_data, f, indent=2)
    print(f"\n  Full results saved to: {log_path}")

    return 0 if (errors == 0 and fails == 0) else 1


if __name__ == "__main__":
    sys.exit(main())
