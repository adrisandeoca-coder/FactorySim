#!/usr/bin/env python3
"""Debug Automotive Paint Shop low throughput."""
import sys, os, re
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from tests.test_all_templates import extract_templates, ts_obj_to_model
from factorysim.engine.simulation import Simulation, SimulationConfig

tsx_path = os.path.normpath(os.path.join(
    os.path.dirname(__file__), "..", "..", "src", "components",
    "factory-builder", "TemplateSelector.tsx"
))
raw = extract_templates(tsx_path)

for i, ts_text in enumerate(raw):
    name_match = re.search(r"name:\s*['\"]([^'\"]+)['\"]", ts_text)
    if name_match and "Automotive" in name_match.group(1):
        model = ts_obj_to_model(ts_text)
        print("Stations:")
        for s in model["stations"]:
            ct = s["cycleTime"]
            p = ct["parameters"]
            mean = p.get("mean", p.get("value", "?"))
            extras = ""
            if s.get("mtbf"):
                extras += f" mtbf={s['mtbf']}h mttr={s['mttr']}h"
            if s.get("scrapRate"):
                extras += f" scrap={s['scrapRate']}"
            print(f"  {s['id']}: {s['name']} ct={ct['type']}({mean}){extras}")

        print("\nProducts:")
        for p in model["products"]:
            print(f"  {p['id']}: arrivalRate={p.get('arrivalRate')}s routing={p.get('routing')}")

        # Run 8h sim
        config = SimulationConfig(duration=28800, seed=42)
        sim = Simulation(model, config)
        result = sim.run()

        k = result["kpis"]
        print(f"\n8h run: throughput={k['throughput']['total']}, OEE={k['oee']['overall']:.1%}")
        print("Utilization:")
        for sid, bd in k["utilization"]["by_station"].items():
            parts = ", ".join(f"{s}={v:.3f}" for s, v in bd.items() if v > 0.001)
            print(f"  {sid}: {parts}")
        print(f"Completed: {len(sim.completed_products)}")
        print(f"By hour: {k['throughput'].get('by_hour', [])}")
        break
