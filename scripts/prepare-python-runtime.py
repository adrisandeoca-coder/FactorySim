"""
Build the self-contained Windows Python runtime that ships inside the installer.

Creates  python-runtime/  in the repo root:
  - official CPython embeddable distribution (no installer, no registry)
  - engine dependencies installed into python-runtime/Lib/site-packages
  - python312._pth that also puts ../python (the engine) on sys.path

End users then need no Python of their own. Run before `npm run package:win`:

    python scripts/prepare-python-runtime.py

Works on Windows, macOS or Linux (it downloads Windows wheels explicitly),
so the Windows installer can be built from any OS.
"""

import io
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

PY_VERSION = "3.12.7"
PY_TAG = "312"
EMBED_URL = f"https://www.python.org/ftp/python/{PY_VERSION}/python-{PY_VERSION}-embed-amd64.zip"

# Pinned to the versions the engine's test suite was verified against.
WHEELS = [
    "simpy==4.1.2",
    "numpy==2.5.4",
    "scipy==1.18.1",
    # Optional connectors (Excel import, MQTT, OPC UA) — imported on demand
    "openpyxl==3.1.5",
    "et-xmlfile==2.0.0",
    "paho-mqtt==2.1.0",
    "lxml",
    "python-dateutil",
    "pytz",
    "six",
]
SDIST_PURE = ["opcua==0.98.13"]  # pure Python, published as source only

PTH = (
    f"python{PY_TAG}.zip\r\n"
    ".\r\n"
    "Lib\\site-packages\r\n"
    "..\\python\r\n"
    "\r\n"
    "# site: needed so packages installed in Lib\\site-packages work normally\r\n"
    "import site\r\n"
)


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    out = root / "python-runtime"
    site = out / "Lib" / "site-packages"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir()

    print(f"Downloading {EMBED_URL}")
    with urllib.request.urlopen(EMBED_URL) as r:
        zipfile.ZipFile(io.BytesIO(r.read())).extractall(out)

    pip = [sys.executable, "-m", "pip", "install", "--quiet", "--target", str(site)]
    print("Installing Windows wheels:", ", ".join(WHEELS))
    subprocess.check_call(pip + [
        "--platform", "win_amd64", "--python-version", PY_VERSION.rsplit(".", 1)[0],
        "--implementation", "cp", "--only-binary=:all:", "--no-deps", *WHEELS,
    ])
    print("Installing pure-Python packages:", ", ".join(SDIST_PURE))
    subprocess.check_call(pip + ["--no-deps", *SDIST_PURE])

    # Trim: console scripts, bytecode caches, and the scipy/numpy test suites
    shutil.rmtree(site / "bin", ignore_errors=True)
    for whl in site.glob("*.whl"):  # pip occasionally leaves the downloaded wheel behind
        whl.unlink()
    for p in list(site.rglob("__pycache__")):
        shutil.rmtree(p, ignore_errors=True)
    for pkg in ("scipy", "numpy"):
        for p in list((site / pkg).rglob("tests")):
            if p.is_dir():
                shutil.rmtree(p, ignore_errors=True)

    (out / f"python{PY_TAG}._pth").write_bytes(PTH.encode())
    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file()) / 1e6
    print(f"Done: {out} ({size:.0f} MB)")


if __name__ == "__main__":
    main()
