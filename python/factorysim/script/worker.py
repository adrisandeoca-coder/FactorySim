"""Runs one model script in a separate process and prints the result as JSON.

Started by factorysim.script.runner as
``python -I worker.py <path containing the factorysim package>`` with a JSON
request on stdin: {"code": "...", "mode": "model" | "run"}.

"model" mode builds the model and returns it; imports are limited to a short
list and file, eval and exec builtins are removed. This guards against
mistakes, not against hostile code: only run scripts you trust.
"run" mode executes the script as normal Python and returns what it printed.
"""

import builtins
import io
import json
import sys
import traceback

MARKER = "\x1e@@FACTORYSIM_RESULT@@"
MAX_OUTPUT = 20000

ALLOWED_IMPORTS = {
    "math", "random", "statistics", "itertools", "functools", "collections", "string",
    "re", "json", "datetime", "dataclasses", "typing", "numpy", "factorysim", "factorysim.script",
}
BLOCKED_BUILTINS = {"open", "exec", "eval", "compile", "input", "breakpoint", "exit", "quit",
                    "help", "memoryview", "globals", "vars"}


class _Capped(io.StringIO):
    def write(self, s):
        if self.tell() < MAX_OUTPUT:
            super().write(s[: MAX_OUTPUT - self.tell()])
        return len(s)


def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    ok = level == 0 and (name in ALLOWED_IMPORTS or name.startswith(("numpy.", "factorysim.script.")))
    if not ok:
        raise ImportError(f"import '{name}' is not available in model scripts "
                          f"(allowed: {', '.join(sorted(ALLOWED_IMPORTS - {'factorysim'}))})")
    return builtins.__import__(name, globals, locals, fromlist, level)


def _error_line(tb) -> int:
    line = 0
    for frame in traceback.extract_tb(tb):
        if frame.filename == "<script>":
            line = frame.lineno or 0
    return line


def _json_default(o):
    if hasattr(o, "item"):
        return o.item()
    if hasattr(o, "tolist"):
        return o.tolist()
    return str(o)


def main() -> None:
    sys.path.insert(0, sys.argv[1])
    req = json.loads(sys.stdin.read())
    code, mode = req.get("code", ""), req.get("mode", "model")

    import factorysim.script as api

    out = _Capped()
    real_stdout = sys.stdout
    sys.stdout = sys.stderr = out
    result = {"ok": False, "output": ""}
    try:
        compiled = compile(code, "<script>", "exec")
        g = {"__name__": "__factorysim__" if mode == "model" else "__main__"}
        if mode == "model":
            safe = {k: v for k, v in vars(builtins).items() if k not in BLOCKED_BUILTINS}
            safe["__import__"] = _safe_import
            g["__builtins__"] = safe
            api.Model.run = _no_run
        g.update({k: getattr(api, k) for k in api.__all__})
        api._created.clear()
        exec(compiled, g)
        result["ok"] = True
        if mode == "model":
            model = g.get("model")
            if not isinstance(model, api.Model):
                model = api._created[-1] if api._created else None
            if model is None:
                raise api.ScriptError("the script made no model; start with  m = Model(\"My line\")")
            result["model"] = model.to_dict()
    except SyntaxError as e:
        result.update(ok=False, error=f"SyntaxError: {e.msg}", line=e.lineno or 0)
    except Exception as e:  # noqa: BLE001 — every script error goes back to the editor
        msg = str(e) if isinstance(e, api.ScriptError) else f"{type(e).__name__}: {e}"
        result.update(ok=False, error=msg, line=_error_line(e.__traceback__))
        if not isinstance(e, api.ScriptError):
            result["traceback"] = "".join(traceback.format_exception(type(e), e, e.__traceback__)[-6:])
    finally:
        sys.stdout = real_stdout
    result["output"] = out.getvalue()
    real_stdout.write(MARKER + json.dumps(result, default=_json_default))
    real_stdout.flush()


def _no_run(self, *a, **k):
    print("m.run() is skipped in the preview. Run the model from the app, or run the script with Python.")
    return {}


if __name__ == "__main__":
    main()
