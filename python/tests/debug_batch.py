#!/usr/bin/env python3
"""Debug Batch Processing template zero throughput at 1h."""
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
    if name_match and "Batch" in name_match.group(1):
        model = ts_obj_to_model(ts_text)
        print("Stations:")
        for s in model["stations"]:
            ct = s["cycleTime"]
            p = ct["parameters"]
            mean = p.get("mean", p.get("value", "?"))
            batch = s.get("batchSize", 1)
            setup = s.get("setupTime")
            print(f"  {s['id']}: {s['name']} ct={ct['type']}({mean}) batch={batch} setup={setup}")
        print("Products:")
        for p in model["products"]:
            print(f"  {p['id']}: arrivalRate={p.get('arrivalRate')} routing={p.get('routing')}")

        for dur in [3600, 7200, 28800]:
            config = SimulationConfig(duration=dur, seed=42)
            sim = Simulation(model, config)
            result = sim.run()
            k = result["kpis"]
            print(f"\n{dur//3600}h run: throughput={k['throughput']['total']}, completed={len(sim.completed_products)}")
            print(f"  OEE={k['oee']['overall']:.1%}")
            for sid, bd in k["utilization"]["by_station"].items():
                parts = ", ".join(f"{s}={v:.3f}" for s, v in bd.items() if v > 0.001)
                print(f"  {sid}: {parts}")
        break
