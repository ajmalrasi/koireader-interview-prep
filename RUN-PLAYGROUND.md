# Run the Live Playground (Jupyter + Website)

**TL;DR:** One command spins up a Python venv, installs OpenCV/NumPy/Jupyter, and
serves **both** the study website and **live, editable notebooks** of every coding
problem. Run cells, tweak the code, see the output images — exactly the muscle you
need for the proctored round.

## One command

```bash
cd koireader-interview-prep
bash run.sh
```

First run takes a minute (it builds the venv and installs deps); later runs are
instant. You'll see:

```
Study website :  http://localhost:9000
                 http://<your-ip>:9000   (from your phone)
Jupyter        :  starting on port 8888 (URL + token printed below)
```

Jupyter starts with the fixed token **`koireader`**, so the website's **"Open live
notebooks"** button (top-left of the site) opens JupyterLab directly —
`http://<this-host>:8888/lab?token=koireader`. Press **Ctrl+C** in the terminal to
stop both. (Change the token with `JUPYTER_TOKEN=... bash run.sh`, but then update
the link's token in `_app.js` and rebuild.)

Custom ports: `SITE_PORT=9000 JUPYTER_PORT=8888 bash run.sh`

## Why a notebook (and is it "better"?)

- **Website** = best for *reading and memorizing*. The test bans AI and
  autocomplete, so you must recall the API — the site + cheat sheet are for that.
- **Notebooks** = best for *experimenting*: run a cell, change a threshold, swap in
  your own image, watch the output image update instantly.

Use both: read on the site, then drill in the notebook.

## What's in the notebooks

Auto-generated from the Section 10 markdown (single source of truth), so they never
drift. Four notebooks in `notebooks/`:

1. `01_image_processing_and_geometry.ipynb` — preprocessing, deskew, 4-point scan…
2. `02_detection_logic.ipynb` — IoU, NMS, zones, line-crossing, reading order
3. `03_video_and_streaming.ipynb` — robust capture, motion, annotate
4. `04_python_and_numpy.ipynb` — vectorization, fault-tolerant batch, blobs
5. `06_core_drills.ipynb` — hand-curated cut of the ~12 highest-yield problems
   from notebooks 00–04, ordered by likelihood for this role (not auto-generated
   from a `.md` — edit it directly)

Each notebook's **first code cell** creates synthetic sample images
(`input.jpg`, `test.avi`, …) so every cell runs out of the box. **Swap `input.jpg`
for a real photo** to experiment on your own data.

## Adding or editing notebook content

**Don't edit files in `notebooks/` directly** — they're generated, and any change
gets silently overwritten the next time someone runs `build_notebooks.py` (which
every deploy does). Edit the source instead:

```bash
# 1. Edit the matching .md in 10-coding-practice/ (e.g. image-processing-and-geometry.md)
# 2. Regenerate the notebooks from it:
python3 build_notebooks.py
# 3. Commit both the .md and the regenerated .ipynb, then push + redeploy.
```

The `.md` → `.ipynb` mapping is the `FILES` list at the top of `build_notebooks.py`.

## Practising for the proctored format

The test wants `.py` files, or `.ipynb` **converted to `.html`** (no zip). Convert
a notebook from the venv:

```bash
source .venv/bin/activate
jupyter nbconvert --to html notebooks/01_image_processing_and_geometry.ipynb
```

Rehearse that conversion now so it's automatic on test day. Remember: in the real
test, **disable AI code suggestions** in whatever editor you use.

## Running on the Raspberry Pi

`run.sh` works on the Pi too (`opencv-python-headless` needs no display). With
`--ip=0.0.0.0` you can open Jupyter from your laptop at `http://<pi-ip>:8888`.
Security note: that exposes Jupyter on your LAN — fine at home, and it's still
token-protected. Don't expose it to the public internet.

## Files

`run.sh` · `requirements.txt` · `build_notebooks.py` (regenerates notebooks from
the `.md`) · `notebooks/`.

→ Back to [Coding Practice overview](10-coding-practice/README.md).
