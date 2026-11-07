"""
Multi-Model Hierarchy — sub-models, frames, and inheritance.

Supports:
  - Sub-models: embed one model inside another as a "frame"
  - Template inheritance: derive models from base templates
  - Interface ports: connect sub-model inputs/outputs to parent model
"""

from typing import Dict, Any, Optional, List
import copy
import uuid


class SubModel:
    """A sub-model (frame) that can be embedded in a parent model."""

    def __init__(self, config: Dict[str, Any]):
        self.id: str = config.get("id", str(uuid.uuid4())[:8])
        self.name: str = config.get("name", "SubModel")
        self.model: Dict[str, Any] = config.get("model", {})
        self.position: Dict[str, float] = config.get("position", {"x": 0, "y": 0})

        # Interface ports: how external connections map to internal nodes
        self.input_ports: List[Dict[str, str]] = config.get("inputPorts", [])
        # [{"portId": "in1", "internalNodeId": "station-1", "name": "Input"}]
        self.output_ports: List[Dict[str, str]] = config.get("outputPorts", [])
        # [{"portId": "out1", "internalNodeId": "station-3", "name": "Output"}]

        # Overrides: parameters that the parent model can customize
        self.parameter_overrides: Dict[str, Any] = config.get("parameterOverrides", {})

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "model": self.model,
            "position": self.position,
            "inputPorts": self.input_ports,
            "outputPorts": self.output_ports,
            "parameterOverrides": self.parameter_overrides,
        }


class ModelTemplate:
    """A base model template that other models can inherit from."""

    def __init__(self, config: Dict[str, Any]):
        self.id: str = config.get("id", str(uuid.uuid4())[:8])
        self.name: str = config.get("name", "Template")
        self.description: str = config.get("description", "")
        self.model: Dict[str, Any] = config.get("model", {})
        # Parameters that can be overridden by derived models
        self.parameters: List[Dict[str, Any]] = config.get("parameters", [])
        # [{"path": "stations.0.cycleTime.parameters.value", "name": "CT Station 1", "default": 60}]

    def instantiate(self, overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Create a model instance from this template with optional overrides."""
        model = copy.deepcopy(self.model)

        if overrides:
            for path, value in overrides.items():
                try:
                    _set_nested_safe(model, path, value)
                except (KeyError, IndexError, TypeError):
                    pass

        return model

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "model": self.model,
            "parameters": self.parameters,
        }


def flatten_hierarchy(model: Dict[str, Any]) -> Dict[str, Any]:
    """
    Flatten a hierarchical model into a single flat model for simulation.

    Processes all sub-models (frames), expands them inline with prefixed IDs,
    and rewires connections through interface ports.
    """
    sub_models = model.get("subModels", [])
    if not sub_models:
        return model  # no hierarchy — return as-is

    flat = copy.deepcopy(model)
    flat.pop("subModels", None)

    for sm_config in sub_models:
        sm = SubModel(sm_config)
        prefix = f"{sm.id}_"

        # Apply parameter overrides
        inner_model = copy.deepcopy(sm.model)
        for path, value in sm.parameter_overrides.items():
            try:
                _set_nested_safe(inner_model, path, value)
            except (KeyError, IndexError, TypeError):
                pass

        # Merge inner stations with prefixed IDs
        for station in inner_model.get("stations", []):
            station["id"] = prefix + station["id"]
            station["name"] = f"{sm.name}/{station['name']}"
            # Offset position
            station["position"] = {
                "x": station.get("position", {}).get("x", 0) + sm.position.get("x", 0),
                "y": station.get("position", {}).get("y", 0) + sm.position.get("y", 0),
            }
            flat["stations"].append(station)

        # Merge inner buffers
        for buffer in inner_model.get("buffers", []):
            buffer["id"] = prefix + buffer["id"]
            buffer["name"] = f"{sm.name}/{buffer['name']}"
            buffer["position"] = {
                "x": buffer.get("position", {}).get("x", 0) + sm.position.get("x", 0),
                "y": buffer.get("position", {}).get("y", 0) + sm.position.get("y", 0),
            }
            flat["buffers"].append(buffer)

        # Merge inner connections with prefixed IDs
        for conn in inner_model.get("connections", []):
            conn["id"] = prefix + conn.get("id", str(uuid.uuid4())[:8])
            conn["source"] = prefix + conn["source"]
            conn["target"] = prefix + conn["target"]
            flat["connections"].append(conn)

        # Merge inner extra nodes
        for en in inner_model.get("extraNodes", []):
            if "data" in en and "id" in en["data"]:
                en["data"]["id"] = prefix + en["data"]["id"]
            if "data" in en and "name" in en["data"]:
                en["data"]["name"] = f"{sm.name}/{en['data']['name']}"
            flat.setdefault("extraNodes", []).append(en)

        # Merge inner products (prefix routing IDs)
        for prod in inner_model.get("products", []):
            prod["id"] = prefix + prod["id"]
            prod["name"] = f"{sm.name}/{prod.get('name', prod['id'])}"
            if "routing" in prod:
                prod["routing"] = [prefix + r for r in prod["routing"]]
            flat["products"].append(prod)

        # Merge inner resources
        for res in inner_model.get("resources", []):
            res["id"] = prefix + res["id"]
            res["name"] = f"{sm.name}/{res['name']}"
            flat.setdefault("resources", []).append(res)

        # Rewire interface ports to parent connections
        # Input ports: parent connections targeting a port get rewired to internal node
        port_map = {}
        for port in sm.input_ports:
            port_map[f"{sm.id}:{port['portId']}"] = prefix + port["internalNodeId"]
        for port in sm.output_ports:
            port_map[f"{sm.id}:{port['portId']}"] = prefix + port["internalNodeId"]

        # Rewire parent connections that reference sub-model ports
        for conn in flat["connections"]:
            if conn["source"] in port_map:
                conn["source"] = port_map[conn["source"]]
            if conn["target"] in port_map:
                conn["target"] = port_map[conn["target"]]

    return flat


def _set_nested_safe(obj: Any, path: str, value: Any) -> None:
    """Set a value in a nested dict using dot notation."""
    parts = path.split(".")
    current = obj
    for part in parts[:-1]:
        if isinstance(current, (list, tuple)):
            current = current[int(part)]
        elif isinstance(current, dict):
            current = current[part]
    last = parts[-1]
    if isinstance(current, dict):
        current[last] = value
    elif isinstance(current, (list, tuple)):
        current[int(last)] = value
