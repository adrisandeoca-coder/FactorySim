"""
Example FactorySim Plugin

Copy this file to your plugins folder:
  Windows: %APPDATA%/factorysim/plugins/
  macOS:   ~/Library/Application Support/factorysim/plugins/
  Linux:   ~/.config/factorysim/plugins/

Then enable it in the Plugins page of FactorySim.
"""

from factorysim.engine.plugin import PluginBase


class ExamplePlugin(PluginBase):
    name = "Example Plugin"
    version = "1.0.0"
    description = "Demonstrates all plugin hook points with logging."

    def __init__(self):
        self._event_count = 0

    def on_load(self, sim):
        """Called when the simulation is initialized."""
        station_count = len(sim.stations)
        print(f"[ExamplePlugin] Loaded. Model has {station_count} stations.")

    def pre_run(self, sim):
        """Called before the simulation starts."""
        print(f"[ExamplePlugin] Simulation starting. Duration: {sim.config.duration}s")
        self._event_count = 0

    def post_run(self, sim, results):
        """Called after the simulation completes. Return a dict to add custom KPIs."""
        completed = len(sim.completed_products)
        print(f"[ExamplePlugin] Simulation done. {completed} products completed. {self._event_count} events tracked.")
        return {
            "example_completed_count": completed,
            "example_event_count": self._event_count,
        }

    def on_event(self, sim, event):
        """Called after each simulation event is logged."""
        self._event_count += 1

    def custom_kpi(self, sim):
        """Called during KPI calculation. Return a dict of custom KPIs."""
        # Calculate average buffer utilization as an example custom KPI
        buffer_utils = []
        for buf in sim.buffers.values():
            if buf.capacity > 0:
                buffer_utils.append(buf.level() / buf.capacity)
        avg_buf_util = sum(buffer_utils) / len(buffer_utils) if buffer_utils else 0

        return {
            "example_avg_buffer_utilization": round(avg_buf_util, 4),
        }
