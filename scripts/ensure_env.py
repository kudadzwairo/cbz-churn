"""Repair the virtual environment so it matches this operating system.

The start scripts call this before launching the app. A missing environment
is created. An environment that cannot run here, or that cannot import the
study packages, is deleted and created again.
"""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VENV = ROOT / ".venv"
REQUIREMENTS = ROOT / "requirements.txt"
IMPORTS = (
    "fastapi",
    "uvicorn",
    "pandas",
    "sklearn",
    "xgboost",
    "joblib",
    "pydantic",
    "multipart",
)


def venv_python() -> Path:
    if os.name == "nt":
        return VENV / "Scripts" / "python.exe"
    return VENV / "bin" / "python"


def log(message: str) -> None:
    print(message, flush=True)


def run(command: list[str]) -> int:
    log("+ " + " ".join(command))
    return subprocess.run(command, cwd=ROOT).returncode


def find_base_python() -> list[str]:
    options = [["py", "-3"], ["python"], ["python3"]] if os.name == "nt" else [["python3"], ["python"]]
    probe = "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)"
    for command in options:
        if shutil.which(command[0]) is None:
            continue
        if subprocess.run(command + ["-c", probe], cwd=ROOT).returncode == 0:
            return command
    log("Python 3.11 or newer is required for these packages and was not found on this machine.")
    sys.exit(1)


def python_runs(executable: Path) -> bool:
    if not executable.exists():
        return False
    code = (
        "import platform, sys\n"
        "if sys.version_info < (3, 11):\n"
        "    raise SystemExit('Python is older than 3.11')\n"
        "print(sys.platform, platform.machine(), platform.python_version())\n"
    )
    return subprocess.run([str(executable), "-c", code], cwd=ROOT).returncode == 0


def imports_run(executable: Path) -> bool:
    code = (
        "mods = %r\n"
        "failed = []\n"
        "for name in mods:\n"
        "    try:\n"
        "        __import__(name)\n"
        "    except Exception as exc:\n"
        "        failed.append(f'{name}: {exc}')\n"
        "if failed:\n"
        "    print('\\n'.join(failed))\n"
        "    raise SystemExit(1)\n"
        "print('runtime packages import on this machine')\n"
    ) % (IMPORTS,)
    return subprocess.run([str(executable), "-c", code], cwd=ROOT).returncode == 0


def remove_venv(reason: str) -> None:
    if VENV.exists():
        log(reason)
        shutil.rmtree(VENV)


def install_requirements(executable: Path) -> bool:
    lines = []
    xgboost_spec = None
    for raw in REQUIREMENTS.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.lower().startswith("xgboost"):
            xgboost_spec = line
        else:
            lines.append(line)

    if run([str(executable), "-m", "pip", "install", "--upgrade", "pip"]) != 0:
        return False
    if lines and run([str(executable), "-m", "pip", "install", "--timeout", "180", *lines]) != 0:
        return False
    if not xgboost_spec:
        return imports_run(executable)

    if run([str(executable), "-m", "pip", "install", "--timeout", "180", xgboost_spec]) != 0:
        log("The full XGBoost package does not fit this operating system. Installing the CPU build.")
        if run([str(executable), "-m", "pip", "install", "--timeout", "180", "--no-deps", xgboost_spec]) != 0:
            return False
    return imports_run(executable)


def build_environment(base: list[str]) -> bool:
    if run(base + ["-m", "venv", str(VENV)]) != 0:
        log("The virtual environment could not be created.")
        return False
    return install_requirements(venv_python())


def main() -> None:
    system = platform.system()
    machine = platform.machine()
    log(f"Checking requirements for {system} {machine}.")
    base = find_base_python()
    executable = venv_python()

    if executable.exists() and python_runs(executable) and imports_run(executable):
        log("The existing environment matches this operating system.")
        return

    if VENV.exists():
        remove_venv("The existing environment does not run on this operating system. Removing it.")
    if not build_environment(base) or not imports_run(venv_python()):
        remove_venv("Installation did not produce a working environment. Removing it and trying once more.")
        if not build_environment(base) or not imports_run(venv_python()):
            log("Requirements still do not run after a clean environment was created.")
            sys.exit(1)
    log("Environment is ready.")


if __name__ == "__main__":
    main()
