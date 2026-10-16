"""Execute the study notebook and store stdout plus figures in the file."""

import base64
import io
import json
import os
import sys
import traceback
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

nb_path = Path("/home/marvelous/Desktop/Kuda/notebooks/cbz_churn_model_development.ipynb")
os.chdir(nb_path.parent)
nb = json.loads(nb_path.read_text())
namespace = {"__name__": "__main__"}
count = 0

for cell in nb["cells"]:
    if cell["cell_type"] != "code":
        continue
    count += 1
    source = "".join(cell["source"])
    stdout = io.StringIO()
    stderr = io.StringIO()
    plt.close("all")
    outputs = []
    try:
        with redirect_stdout(stdout), redirect_stderr(stderr):
            exec(compile(source, f"cell_{count}", "exec"), namespace, namespace)
    except Exception:
        traceback.print_exc()
        outputs.append({
            "output_type": "stream",
            "name": "stderr",
            "text": traceback.format_exc().splitlines(keepends=True),
        })
        cell["outputs"] = outputs
        cell["execution_count"] = count
        nb_path.write_text(json.dumps(nb, indent=1))
        sys.exit(1)

    text = stdout.getvalue()
    err = stderr.getvalue()
    if text:
        outputs.append({"output_type": "stream", "name": "stdout", "text": text.splitlines(keepends=True)})
    if err:
        outputs.append({"output_type": "stream", "name": "stderr", "text": err.splitlines(keepends=True)})
    for number in plt.get_fignums():
        figure = plt.figure(number)
        buffer = io.BytesIO()
        figure.savefig(buffer, format="png", dpi=120, bbox_inches="tight", facecolor="white")
        encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
        outputs.append({
            "output_type": "display_data",
            "data": {"image/png": encoded, "text/plain": ["<Figure>"]},
            "metadata": {},
        })
    plt.close("all")
    cell["outputs"] = outputs
    cell["execution_count"] = count
    print(f"cell {count} ok, outputs={len(outputs)}", flush=True)

nb_path.write_text(json.dumps(nb, indent=1))
print("NOTEBOOK_SAVED")

