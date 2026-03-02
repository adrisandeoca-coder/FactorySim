"""
Test all UI templates by running them through the simulation engine.

Parses the TypeScript TemplateSelector.tsx file, extracts each template's
model data, and runs a short simulation to verify no errors occur.
"""

import re
import json
import sys
import os
import traceback

# Ensure factorysim is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from factorysim.engine.simulation import Simulation, SimulationConfig


def parse_ts_object(text: str) -> str:
    """Convert TypeScript object literal to valid JSON string."""
    s = text

    # Remove single-line JS comments (// ... to end of line)
    s = re.sub(r'//[^\n]*', '', s)

    # Remove trailing commas before } or ]
    s = re.sub(r',(\s*[}\]])', r'\1', s)

    # Quote unquoted keys:  word: -> "word":
    s = re.sub(r'(?<=[{,\n])\s*(\w+)\s*:', r' "\1":', s)

    # Replace single-quoted strings with double-quoted
    s = re.sub(r"'([^']*)'", r'"\1"', s)

    return s


def extract_templates(tsx_path: str) -> list:
    """Extract template objects from TemplateSelector.tsx."""
    with open(tsx_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Find the templates array
    start = content.find("const templates: Template[] = [")
    if start == -1:
        start = content.find("const templates:")
    if start == -1:
        raise ValueError("Could not find templates array")

    # Find the matching closing bracket — skip the [] in Template[]
    eq_sign = content.index("= [", start)
    bracket_start = eq_sign + 2  # points at the '['
    depth = 0
    end = bracket_start
    for i in range(bracket_start, len(content)):
        if content[i] == "[":
            depth += 1
        elif content[i] == "]":
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    array_text = content[bracket_start:end]

    # Split into individual template objects
    # depth counts all brackets: [ ] { }
    templates = []
    depth = 0
    current_start = None
    in_string = False
    escape_next = False

    for i, ch in enumerate(array_text):
        if escape_next:
            escape_next = False
            continue
        if ch == "\\":
            escape_next = True
            continue
        if ch in ("'", '"'):
            in_string = not in_string
            continue
        if in_string:
            continue

        if ch in ("{", "["):
            depth += 1
            if ch == "{" and depth == 2:  # depth 1 = outer array, depth 2 = template object
                current_start = i
        elif ch in ("}", "]"):
            if ch == "}" and depth == 2 and current_start is not None:
                obj_text = array_text[current_start:i + 1]
                templates.append(obj_text)
                current_start = None
            depth -= 1

    return templates


def ts_obj_to_model(ts_text: str) -> dict:
    """Convert a single template TS object to a Python dict model."""
    json_text = parse_ts_object(ts_text)

    try:
        obj = json.loads(json_text)
    except json.JSONDecodeError as e:
        # Try to fix common issues
        # Handle undefined/null
        json_text = json_text.replace("undefined", "null")
        obj = json.loads(json_text)

    template_data = obj.get("template", {})

    # Build a complete model from the template
    model = {
        "id": obj.get("id", "test"),
        "name": obj.get("name", "Test Template"),
        "stations": template_data.get("stations", []),
        "buffers": template_data.get("buffers", []),
        "connections": template_data.get("connections", []),
        "products": template_data.get("products", []),
        "resources": template_data.get("resources", []),
        "extraNodes": template_data.get("extraNodes", []),
        "layout": template_data.get("layout", {"width": 1200, "height": 600}),
    }

    return model


def run_template(model: dict, duration: int = 3600) -> dict:
    """Run a simulation with the given model and return results."""
    config = SimulationConfig(duration=duration, seed=42)
    sim = Simulation(model, config)
    result = sim.run()
    return result


def main():
    tsx_path = os.path.join(
        os.path.dirname(__file__),
        "..", "..", "src", "components", "factory-builder", "TemplateSelector.tsx"
    )
    tsx_path = os.path.normpath(tsx_path)

    if not os.path.exists(tsx_path):
        print(f"ERROR: Cannot find {tsx_path}")
        sys.exit(1)

    print(f"Parsing templates from: {tsx_path}")
    print("=" * 70)

    raw_templates = extract_templates(tsx_path)
    print(f"Found {len(raw_templates)} templates\n")

    passed = 0
    failed = 0
    errors = []

    for i, ts_text in enumerate(raw_templates):
        # Extract template name for display
        name_match = re.search(r"name:\s*['\"]([^'\"]+)['\"]", ts_text)
        template_name = name_match.group(1) if name_match else f"Template #{i+1}"

        id_match = re.search(r"id:\s*['\"]([^'\"]+)['\"]", ts_text)
        template_id = id_match.group(1) if id_match else f"unknown-{i}"

        try:
            model = ts_obj_to_model(ts_text)

            n_stations = len(model.get("stations", []))
            n_buffers = len(model.get("buffers", []))
            n_products = len(model.get("products", []))
            n_extra = len(model.get("extraNodes", []))

            result = run_template(model)
            status = result.get("status", "unknown")

            if status == "completed":
                kpis = result.get("kpis", {})
                throughput = kpis.get("throughput", {}).get("total", 0)
                oee = kpis.get("oee", {}).get("overall", 0)
                print(f"  PASS  [{template_id}] {template_name}")
                print(f"        {n_stations}S/{n_buffers}B/{n_products}P/{n_extra}X  |  "
                      f"Throughput={throughput}  OEE={oee:.1%}")
                passed += 1
            else:
                error_msg = result.get("error", "unknown error")
                print(f"  FAIL  [{template_id}] {template_name}")
                print(f"        Status: {status}, Error: {error_msg}")
                failed += 1
                errors.append((template_name, error_msg))

        except json.JSONDecodeError as e:
            print(f"  FAIL  [{template_id}] {template_name}")
            print(f"        JSON parse error: {e}")
            failed += 1
            errors.append((template_name, f"JSON parse: {e}"))
        except Exception as e:
            print(f"  FAIL  [{template_id}] {template_name}")
            print(f"        {type(e).__name__}: {e}")
            traceback.print_exc()
            failed += 1
            errors.append((template_name, str(e)))

    print("\n" + "=" * 70)
    print(f"Results: {passed} passed, {failed} failed, {len(raw_templates)} total")

    if errors:
        print("\nFailed templates:")
        for name, err in errors:
            print(f"  - {name}: {err}")

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
