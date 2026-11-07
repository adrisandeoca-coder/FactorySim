"""Run model scripts in a child process, with a time limit."""

import json
import os
import subprocess
import sys
from typing import Any, Dict

from factorysim.script.worker import MARKER

_PKG_PARENT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_WORKER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "worker.py")

MAX_CODE = 200_000


def run_script(code: str, mode: str = "model", timeout: float = 10.0) -> Dict[str, Any]:
    """Run a script and return {"ok", "model"?, "output", "error"?, "line"?}.

    mode "model" builds the model (restricted, short time limit);
    mode "run" executes the script as ordinary Python and returns its output.
    """
    if len(code) > MAX_CODE:
        return {"ok": False, "error": "the script is too long (over 200 000 characters)", "line": 0, "output": ""}
    env = {k: v for k, v in os.environ.items() if not k.startswith("PYTHON")}
    env["PYTHONIOENCODING"] = "utf-8"
    try:
        proc = subprocess.run(
            [sys.executable, "-I", _WORKER, _PKG_PARENT],
            input=json.dumps({"code": code, "mode": mode}),
            capture_output=True, text=True, encoding="utf-8", timeout=timeout, env=env,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except subprocess.TimeoutExpired as e:
        partial = e.stdout.decode("utf-8", "replace") if isinstance(e.stdout, bytes) else (e.stdout or "")
        return {"ok": False, "line": 0, "output": partial.split(MARKER)[0][-4000:],
                "error": f"the script did not finish within {timeout:g} s (endless loop?)"}
    out = proc.stdout or ""
    if MARKER not in out:
        err = (proc.stderr or out or "").strip()[-2000:]
        return {"ok": False, "line": 0, "output": "", "error": f"the script process stopped: {err or 'no output'}"}
    head, _, payload = out.rpartition(MARKER)
    result = json.loads(payload)
    if head:
        result["output"] = head + result.get("output", "")
    return result
