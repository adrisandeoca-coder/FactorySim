"""
Plugin system for FactorySim.

Allows users to extend the simulation with custom Python logic
via hook points in the simulation lifecycle.
"""

import os
import sys
import json
import importlib
import importlib.util
import traceback
from typing import Dict, Any, Optional, List, Set, Callable
from pathlib import Path


class PluginBase:
    """Base class for all FactorySim plugins.

    Subclass this and override any hook methods you need.
    Place your plugin file in the plugins/ directory.
    """
    name: str = "Unnamed Plugin"
    version: str = "0.0.1"
    description: str = ""

    def on_load(self, sim: Any) -> None:
        """Called when the plugin is loaded into a simulation."""
        pass

    def pre_run(self, sim: Any) -> None:
        """Called before the simulation starts running."""
        pass

    def post_run(self, sim: Any, results: dict) -> Optional[dict]:
        """Called after the simulation completes.

        Return a dict to merge custom KPIs into results['kpis']['custom'].
        """
        pass

    def on_event(self, sim: Any, event: dict) -> None:
        """Called after each event is logged."""
        pass

    def custom_kpi(self, sim: Any) -> Optional[dict]:
        """Called during KPI calculation. Return custom KPI dict."""
        pass


class PluginManager:
    """Discovers, loads, and manages simulation plugins."""

    def __init__(self, plugins_dir: str):
        self.plugins_dir = plugins_dir
        self.loaded_plugins: Dict[str, PluginBase] = {}
        self.enabled_plugins: Set[str] = set()
        self.plugin_logs: Dict[str, List[str]] = {}
        self._config_path = os.path.join(plugins_dir, 'plugins.json')
        self._ensure_dir()
        self._load_config()

    def _ensure_dir(self) -> None:
        os.makedirs(self.plugins_dir, exist_ok=True)

    def _load_config(self) -> None:
        """Load enabled plugins from config file."""
        if os.path.exists(self._config_path):
            try:
                with open(self._config_path, 'r') as f:
                    data = json.load(f)
                self.enabled_plugins = set(data.get('enabled', []))
            except Exception:
                self.enabled_plugins = set()

    def _save_config(self) -> None:
        """Persist enabled plugins to config file."""
        with open(self._config_path, 'w') as f:
            json.dump({'enabled': list(self.enabled_plugins)}, f, indent=2)

    def discover(self) -> List[dict]:
        """Scan plugins directory for valid plugins."""
        results = []
        if not os.path.exists(self.plugins_dir):
            return results

        for entry in os.listdir(self.plugins_dir):
            if entry.startswith('_') or entry == 'plugins.json':
                continue

            full_path = os.path.join(self.plugins_dir, entry)
            plugin_info = {
                'name': entry,
                'version': '0.0.1',
                'description': '',
                'enabled': entry in self.enabled_plugins,
                'hooks': [],
                'errors': [],
            }

            try:
                plugin_cls = self._find_plugin_class(full_path, entry)
                if plugin_cls:
                    instance = plugin_cls()
                    plugin_info['name'] = getattr(instance, 'name', entry)
                    plugin_info['version'] = getattr(instance, 'version', '0.0.1')
                    plugin_info['description'] = getattr(instance, 'description', '')
                    plugin_info['hooks'] = self._detect_hooks(plugin_cls)
                    plugin_info['enabled'] = instance.name in self.enabled_plugins or entry in self.enabled_plugins
                else:
                    plugin_info['errors'].append('No PluginBase subclass found')
            except Exception as e:
                plugin_info['errors'].append(str(e))

            results.append(plugin_info)

        return results

    def _find_plugin_class(self, path: str, module_name: str):
        """Find a PluginBase subclass in a file or package."""
        if os.path.isfile(path) and path.endswith('.py'):
            spec = importlib.util.spec_from_file_location(
                f"factorysim_plugin_{module_name}", path
            )
            if not spec or not spec.loader:
                return None
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return self._extract_plugin_class(module)
        elif os.path.isdir(path):
            init_path = os.path.join(path, '__init__.py')
            if os.path.exists(init_path):
                spec = importlib.util.spec_from_file_location(
                    f"factorysim_plugin_{module_name}", init_path,
                    submodule_search_locations=[path]
                )
                if not spec or not spec.loader:
                    return None
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                return self._extract_plugin_class(module)
        return None

    def _extract_plugin_class(self, module):
        """Find the first PluginBase subclass in a module."""
        for attr_name in dir(module):
            attr = getattr(module, attr_name)
            if (isinstance(attr, type) and issubclass(attr, PluginBase)
                    and attr is not PluginBase):
                return attr
        return None

    def _detect_hooks(self, cls) -> List[str]:
        """Detect which hooks a plugin class overrides."""
        hooks = []
        for method_name in ['on_load', 'pre_run', 'post_run', 'on_event', 'custom_kpi']:
            method = getattr(cls, method_name, None)
            base_method = getattr(PluginBase, method_name, None)
            if method and method is not base_method:
                hooks.append(method_name)
        return hooks

    def load(self, plugin_name: str) -> None:
        """Load and instantiate a plugin by file/dir name."""
        full_path = os.path.join(self.plugins_dir, plugin_name)
        if not os.path.exists(full_path):
            # Try matching by plugin name attribute
            for entry in os.listdir(self.plugins_dir):
                entry_path = os.path.join(self.plugins_dir, entry)
                try:
                    cls = self._find_plugin_class(entry_path, entry.replace('.py', ''))
                    if cls and getattr(cls, 'name', '') == plugin_name:
                        full_path = entry_path
                        plugin_name = entry
                        break
                except Exception:
                    continue

        try:
            mod_name = plugin_name.replace('.py', '')
            cls = self._find_plugin_class(full_path, mod_name)
            if cls:
                instance = cls()
                key = getattr(instance, 'name', plugin_name)
                self.loaded_plugins[key] = instance
                self.plugin_logs.setdefault(key, [])
                self._log(key, f"Plugin loaded: {key} v{instance.version}")
            else:
                raise ValueError(f"No PluginBase subclass found in {plugin_name}")
        except Exception as e:
            self._log(plugin_name, f"Failed to load: {e}")
            raise

    def enable(self, name: str) -> None:
        """Enable a plugin."""
        self.enabled_plugins.add(name)
        self._save_config()
        if name not in self.loaded_plugins:
            try:
                self.load(name)
            except Exception:
                pass

    def disable(self, name: str) -> None:
        """Disable a plugin."""
        self.enabled_plugins.discard(name)
        self._save_config()

    def reload_all(self) -> None:
        """Reload all enabled plugins."""
        self.loaded_plugins.clear()
        for info in self.discover():
            if info['enabled'] and not info['errors']:
                try:
                    self.load(info['name'])
                except Exception:
                    pass

    def fire_hook(self, hook_name: str, *args, **kwargs) -> List[Any]:
        """Call a hook on all enabled plugins, collecting non-None results."""
        results = []
        for name, plugin in self.loaded_plugins.items():
            if name not in self.enabled_plugins and plugin.name not in self.enabled_plugins:
                continue
            method = getattr(plugin, hook_name, None)
            if method is None:
                continue
            try:
                result = method(*args, **kwargs)
                if result is not None:
                    results.append(result)
            except Exception as e:
                self._log(name, f"Error in {hook_name}: {e}\n{traceback.format_exc()}")
        return results

    def get_logs(self, name: str) -> List[str]:
        return self.plugin_logs.get(name, [])

    def _log(self, name: str, message: str) -> None:
        self.plugin_logs.setdefault(name, []).append(message)
        # Keep last 200 log entries per plugin
        if len(self.plugin_logs[name]) > 200:
            self.plugin_logs[name] = self.plugin_logs[name][-200:]
