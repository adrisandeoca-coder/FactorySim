# Plugin Development Guide

FactorySim supports Python plugins that hook into the simulation lifecycle.

## Plugin Location

Place plugin files in the plugins directory:
- **Windows**: `%APPDATA%/factorysim/plugins/`
- **macOS**: `~/Library/Application Support/factorysim/plugins/`
- **Linux**: `~/.config/factorysim/plugins/`

You can open this folder from the **Plugins** page in the app.

## Creating a Plugin

Create a `.py` file with a class that extends `PluginBase`:

```python
from factorysim.engine.plugin import PluginBase

class MyPlugin(PluginBase):
    name = "My Custom Plugin"
    version = "1.0.0"
    description = "Does something useful during simulation."

    def pre_run(self, sim):
        print(f"Simulation starting with {len(sim.stations)} stations")

    def post_run(self, sim, results):
        # Return a dict to add custom KPIs
        return {"my_custom_metric": 42}

    def custom_kpi(self, sim):
        return {"another_metric": len(sim.completed_products)}
```

## Available Hooks

| Hook | When | Arguments | Return |
|------|------|-----------|--------|
| `on_load(sim)` | Plugin loaded into simulation | Simulation instance | None |
| `pre_run(sim)` | Before simulation starts | Simulation instance | None |
| `post_run(sim, results)` | After simulation completes | Simulation, result dict | Optional dict of custom KPIs |
| `on_event(sim, event)` | After each event is logged | Simulation, event dict | None |
| `custom_kpi(sim)` | During KPI calculation | Simulation instance | Optional dict of custom KPIs |

## Accessing Simulation Data

Inside any hook, the `sim` object provides:
- `sim.stations` — Dict of station objects
- `sim.buffers` — Dict of buffer objects
- `sim.product_types` — Dict of product type definitions
- `sim.active_products` — Currently in-progress products
- `sim.completed_products` — List of finished products
- `sim.env` — SimPy environment (access `sim.env.now` for current time)
- `sim.config` — Simulation configuration

## Custom KPIs

Return a dict from `post_run()` or `custom_kpi()` and the values will appear in the simulation results under `kpis.custom`. These are available in the dashboard and scenario comparisons.

## Managing Plugins

1. Open the **Plugins** page from the sidebar
2. Click **Open Plugins Folder** to access the directory
3. Drop your `.py` files there
4. Click **Reload** to discover new plugins
5. Toggle plugins on/off with the switch

## Example

See `python/factorysim/examples/example_plugin.py` for a complete working example.
