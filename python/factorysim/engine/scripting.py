"""
Scripting Engine — user-defined logic scripts attached to simulation nodes.

Scripts are Python expressions/statements executed at specific hook points
(on_enter, on_exit, on_failure, on_setup, on_create, etc.).  A restricted
execution sandbox prevents dangerous operations while giving users access
to product attributes, station state, simulation clock, and random number
generation.
"""

from typing import Dict, Any, Optional, Callable, List
import math
import re

# Whitelist of safe builtins available inside scripts
_SAFE_BUILTINS = {
    "abs": abs, "min": min, "max": max, "round": round, "int": int,
    "float": float, "str": str, "bool": bool, "len": len,
    "range": range, "enumerate": enumerate, "zip": zip,
    "sum": sum, "sorted": sorted, "list": list, "dict": dict,
    "tuple": tuple, "set": set, "True": True, "False": False,
    "None": None, "print": print,  # prints go to sim log
    "math": math,
}

# Patterns that are never allowed in user scripts
_FORBIDDEN_PATTERNS = re.compile(
    r"__\w+__|import\s|exec\s*\(|eval\s*\(|compile\s*\(|open\s*\("
    r"|os\.|sys\.|subprocess|shutil|pathlib|glob\.",
    re.IGNORECASE,
)


class ScriptError:
    """Records a script execution error without crashing the simulation."""
    __slots__ = ("hook", "node_id", "time", "message")

    def __init__(self, hook: str, node_id: str, time: float, message: str):
        self.hook = hook
        self.node_id = node_id
        self.time = time
        self.message = message

    def to_dict(self) -> Dict[str, Any]:
        return {
            "hook": self.hook,
            "nodeId": self.node_id,
            "time": self.time,
            "message": self.message,
        }


class ScriptContext:
    """
    Execution context exposed to user scripts as local variables.

    Available variables inside a script:
      product   - current product (attrs, id, type, routing_index)
      station   - current station (id, name, state, items_processed)
      sim       - read-only simulation helpers (time, rng, log, set_attribute)
      env       - dict for persistent user variables across invocations
    """

    def __init__(self, sim: Any, node: Any = None, product: Any = None):
        self._sim = sim
        self._node = node
        self._product = product
        self._user_env: Dict[str, Any] = {}  # persistent across calls on same node
        self._log_messages: List[str] = []

    def _build_locals(self) -> Dict[str, Any]:
        """Build the local namespace for script execution."""
        locals_dict: Dict[str, Any] = dict(_SAFE_BUILTINS)

        # Product proxy
        if self._product:
            locals_dict["product"] = ProductProxy(self._product)
        else:
            locals_dict["product"] = None

        # Station/node proxy
        if self._node:
            locals_dict["station"] = NodeProxy(self._node)
            locals_dict["node"] = locals_dict["station"]
        else:
            locals_dict["station"] = None
            locals_dict["node"] = None

        # Simulation helpers
        locals_dict["sim"] = SimProxy(self._sim)

        # Persistent user environment
        locals_dict["env"] = self._user_env

        # Log helper
        locals_dict["log"] = lambda msg: self._log_messages.append(str(msg))

        return locals_dict


class ProductProxy:
    """Read/write proxy to a Product, exposing safe attributes."""

    def __init__(self, product: Any):
        self._p = product

    @property
    def id(self) -> str:
        return self._p.id

    @property
    def type(self) -> str:
        return self._p.product_type

    @property
    def routing_index(self) -> int:
        return self._p.current_routing_index

    @property
    def is_scrap(self) -> bool:
        return self._p.is_scrap

    @is_scrap.setter
    def is_scrap(self, val: bool):
        self._p.is_scrap = val

    @property
    def waiting_time(self) -> float:
        return self._p.total_waiting_time

    def get(self, key: str, default: Any = None) -> Any:
        return self._p.get_attribute(key, default)

    def set(self, key: str, value: Any):
        self._p.set_attribute(key, value)

    @property
    def priority(self) -> int:
        return getattr(self._p, "priority", 0)

    @priority.setter
    def priority(self, val: int):
        self._p.priority = val

    def __repr__(self):
        return f"Product({self.id}, type={self.type})"


class NodeProxy:
    """Read-only proxy to a Station or ExtraNode."""

    def __init__(self, node: Any):
        self._n = node

    @property
    def id(self) -> str:
        return self._n.id

    @property
    def name(self) -> str:
        return self._n.name

    @property
    def state(self) -> str:
        if hasattr(self._n, "state"):
            return self._n.state.value if hasattr(self._n.state, "value") else str(self._n.state)
        return "unknown"

    @property
    def items_processed(self) -> int:
        return getattr(self._n, "items_processed", 0)

    @property
    def items_scrapped(self) -> int:
        return getattr(self._n, "items_scrapped", 0)

    @property
    def utilization(self) -> float:
        if hasattr(self._n, "get_utilization"):
            return self._n.get_utilization()
        return 0.0

    @property
    def total_energy_kwh(self) -> float:
        return getattr(self._n, "total_energy_kwh", 0.0)

    def __repr__(self):
        return f"Node({self.id}, name={self.name})"


class SimProxy:
    """Read-only simulation context."""

    def __init__(self, sim: Any):
        self._s = sim

    @property
    def time(self) -> float:
        return self._s.env.now

    @property
    def time_hours(self) -> float:
        return self._s.env.now / 3600.0

    def random(self) -> float:
        return self._s.rng.random()

    def randint(self, a: int, b: int) -> int:
        return self._s.rng.randint(a, b)

    def uniform(self, a: float, b: float) -> float:
        return self._s.rng.uniform(a, b)

    def log(self, msg: str):
        self._s.log_event("script_log", "", {"message": str(msg)})

    def __repr__(self):
        return f"Sim(time={self.time:.1f})"


class ScriptEngine:
    """
    Manages user scripts and their execution during simulation.

    Scripts are stored per node+hook combination.  The engine compiles
    scripts once at setup time and caches the code objects for fast
    repeated execution.
    """

    def __init__(self, sim: Any):
        self.sim = sim
        self._compiled: Dict[str, Any] = {}  # (node_id, hook) -> code object
        self._contexts: Dict[str, ScriptContext] = {}  # node_id -> context
        self.errors: List[ScriptError] = []
        self._scripts: Dict[str, Dict[str, str]] = {}  # node_id -> {hook: source}

    def load_scripts(self, scripts_config: List[Dict[str, Any]]) -> None:
        """Load scripts from the model configuration.

        Expected format:
        [
            {
                "nodeId": "station-1",
                "hook": "on_enter",
                "code": "product.set('color', 'red')"
            },
            ...
        ]
        """
        for entry in scripts_config:
            node_id = entry.get("nodeId", "")
            hook = entry.get("hook", "")
            code = entry.get("code", "")
            if not node_id or not hook or not code:
                continue

            # Safety check
            if _FORBIDDEN_PATTERNS.search(code):
                self.errors.append(ScriptError(
                    hook, node_id, 0,
                    "Script contains forbidden patterns (import, exec, eval, os, etc.)"
                ))
                continue

            try:
                compiled = compile(code, f"<script:{node_id}:{hook}>", "exec")
                key = f"{node_id}:{hook}"
                self._compiled[key] = compiled
                self._scripts.setdefault(node_id, {})[hook] = code
            except SyntaxError as e:
                self.errors.append(ScriptError(hook, node_id, 0, f"Syntax error: {e}"))

    def execute(self, node_id: str, hook: str, node: Any = None,
                product: Any = None) -> Optional[Dict[str, Any]]:
        """Execute a script for a specific node and hook.

        Returns dict of changes made (for logging), or None if no script.
        """
        key = f"{node_id}:{hook}"
        code = self._compiled.get(key)
        if code is None:
            return None

        # Get or create context for this node
        if node_id not in self._contexts:
            self._contexts[node_id] = ScriptContext(self.sim, node, product)
        ctx = self._contexts[node_id]
        ctx._node = node
        ctx._product = product
        ctx._log_messages = []

        try:
            locals_dict = ctx._build_locals()
            exec(code, {"__builtins__": {}}, locals_dict)

            # Log any messages
            for msg in ctx._log_messages:
                self.sim.log_event("script_log", node_id, {
                    "hook": hook,
                    "message": msg,
                })

            return {"executed": True, "hook": hook, "logs": len(ctx._log_messages)}

        except Exception as e:
            err = ScriptError(hook, node_id, self.sim.env.now, str(e))
            self.errors.append(err)
            self.sim.log_event("script_error", node_id, {
                "hook": hook,
                "error": str(e),
            })
            return None

    def has_script(self, node_id: str, hook: str) -> bool:
        return f"{node_id}:{hook}" in self._compiled

    def get_errors(self) -> List[Dict[str, Any]]:
        return [e.to_dict() for e in self.errors]

    def get_script_summary(self) -> Dict[str, Any]:
        return {
            "total_scripts": len(self._compiled),
            "nodes_with_scripts": len(self._scripts),
            "errors": len(self.errors),
            "error_details": self.get_errors()[:20],  # cap at 20
        }
