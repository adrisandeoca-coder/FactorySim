#!/usr/bin/env python3
"""Debug the Assembly & Disassembly template zero throughput issue."""
import sys, os, re, json
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
    if name_match and "Disassembly" in name_match.group(1):
        model = ts_obj_to_model(ts_text)
        print("Model:", json.dumps(model, indent=2))
        print()

        config = SimulationConfig(duration=7200, seed=42)
        sim = Simulation(model, config)
        result = sim.run()

        print("Status:", result["status"])
        k = result["kpis"]
        print("Throughput:", k["throughput"]["total"])
        print("OEE overall:", k["oee"]["overall"])
        print()

        print("Station utilization:")
        for sid, bd in k["utilization"]["by_station"].items():
            parts = ", ".join(f"{s}={v:.3f}" for s, v in bd.items() if v > 0.001)
            print(f"  {sid}: {parts}")

        print()
        print("WIP by buffer:")
        for bid, bdata in k["wip"]["by_buffer"].items():
            print(f"  {bid}: avg_wip={bdata['average_wip']:.2f}")

        print()
        print("Completed products:", len(sim.completed_products))

        # Check what stations exist in the sim
        print()
        print("Sim stations:", list(sim.stations.keys()))
        for sid, st in sim.stations.items():
            print(f"  {sid} ({st.name}): items_in={st.items_processed + st.items_scrapped}, "
                  f"processed={st.items_processed}, scrapped={st.items_scrapped}, "
                  f"input_buf={st.input_buffer.id if st.input_buffer else None}, "
                  f"output_buf={st.output_buffer.id if st.output_buffer else None}")

        print()
        print("Sim buffers:", list(sim.buffers.keys()))
        for bid, buf in sim.buffers.items():
            print(f"  {bid} ({buf.name}): level={buf.level()}, cap={buf.capacity}")

        break
