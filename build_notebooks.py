#!/usr/bin/env python3
"""Generate self-contained Jupyter notebooks from the Section 10 markdown.

The markdown solution files are the single source of truth. This script turns
each into a runnable .ipynb (with synthetic sample images so every cell runs
out of the box, a show() helper for inline images, and a demo cell per problem).

    python build_notebooks.py

Re-run after editing the .md files.
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "10-coding-practice")
OUT = os.path.join(ROOT, "notebooks")
os.makedirs(OUT, exist_ok=True)

FILES = [
    ("00-warm-ups.md",                   "00_warm_ups.ipynb"),
    ("image-processing-and-geometry.md", "01_image_processing_and_geometry.ipynb"),
    ("detection-logic.md",               "02_detection_logic.ipynb"),
    ("video-and-streaming.md",           "03_video_and_streaming.ipynb"),
    ("python-and-numpy.md",              "04_python_and_numpy.ipynb"),
]

SETUP = r'''%matplotlib inline
import cv2, numpy as np, matplotlib.pyplot as plt, os
from collections import deque

def show(img, title=""):
    """Display a BGR or grayscale image inline."""
    if img is None:
        print("image is None"); return
    plt.figure(figsize=(5,5))
    if img.ndim == 2:
        plt.imshow(img, cmap="gray")
    else:
        plt.imshow(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    plt.title(title); plt.axis("off"); plt.show()

def make_sample_assets():
    """Create synthetic inputs so every cell runs without your own files.
    Swap input.jpg for a real photo any time to experiment."""
    doc = np.full((700,500,3), 30, np.uint8)
    quad = np.array([[120,90],[420,140],[400,560],[90,520]], np.int32)
    cv2.fillConvexPoly(doc, quad, (235,235,235))
    cv2.putText(doc, "LABEL 12345", (150,300), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (20,20,20), 2)
    cv2.imwrite("input.jpg", doc)
    cv2.imwrite("noisy.jpg", doc)
    cv2.imwrite("low.jpg", (doc*0.3 + 90).astype(np.uint8))
    os.makedirs("ind", exist_ok=True)
    cv2.imwrite("ind/a.png", doc); cv2.imwrite("ind/b.png", doc)
    open("ind/c.png","wb").write(b"corrupt-not-an-image")
    vw = cv2.VideoWriter("test.avi", cv2.VideoWriter_fourcc(*"MJPG"), 10, (320,240))
    for i in range(12):
        fr = np.zeros((240,320,3), np.uint8)
        cv2.rectangle(fr, (10+i*15,80), (50+i*15,140), (255,255,255), -1)
        vw.write(fr)
    vw.release()
    return doc

doc = make_sample_assets()
print("Sample assets ready: input.jpg, noisy.jpg, low.jpg, ind/, test.avi")
show(doc, "synthetic input.jpg  (replace with your own image!)")
'''

# function name -> demo snippet (shown/printed so each problem produces output)
DEMOS = {
    "preprocess":          'show(preprocess("input.jpg"), "Problem 1 - Otsu threshold")',
    "clean_scan":          'show(clean_scan("noisy.jpg"), "Problem 2 - adaptive + morphology")',
    "deskew":              'show(deskew("input.jpg"), "Problem 3 - deskewed")',
    "scan":                'show(scan("input.jpg"), "Problem 4 - perspective-corrected")',
    "crop_largest_rect":   'show(crop_largest_rect("input.jpg"), "Problem 5 - cropped")',
    "letterbox":           'show(letterbox("input.jpg", 640), "Problem 6 - letterboxed 640")',
    "enhance":             'show(enhance("low.jpg"), "Problem 7 - CLAHE")',
    "iou":                 'print("IoU =", iou((0,0,10,10), (5,5,15,15)))',
    "nms":                 'print("keep:", nms([(0,0,10,10),(1,1,11,11),(50,50,60,60)], [0.9,0.8,0.7]))',
    "nms_np":              'print("keep:", nms_np([(0,0,10,10),(1,1,11,11),(50,50,60,60)], np.array([0.9,0.8,0.7])))',
    "count_in_zone":       'print("in zone:", count_in_zone([(100,100,200,300),(400,400,450,450)], [(50,50),(350,50),(350,350),(50,350)]))',
    "count_crossings":     'print("(in, out) =", count_crossings({1:[(0,0),(0,10)], 2:[(0,10),(0,0)]}, (-5,5), (5,5)))',
    "reading_order":       'print("order:", reading_order([(100,10,140,30),(10,12,50,32),(10,80,60,100)]))',
    "sample_frames":       'print("saved", sample_frames("test.avi","frames",3), "frames"); show(cv2.imread("frames/frame_00000.jpg"), "a sampled frame")',
    "detect_motion":       'detect_motion("test.avi","motion.avi"); print("wrote motion.avi")',
    "annotate":            'print("frames annotated:", annotate("test.avi","annot.avi"))',
    "red_tint_bright_areas":'show(red_tint_bright_areas("input.jpg"), "Problem 16 - bright areas tinted")',
    "channel_means":       'print("BGR means:", channel_means(cv2.imread("input.jpg")))',
    "process_folder":      'print("(ok, failed) =", process_folder("ind","outd"))',
    "count_blobs":         'n, cent = count_blobs("input.jpg"); print("blobs:", n)',
    "count_islands":       'print("islands:", count_islands([[1,1,0,0],[0,1,0,1],[0,0,0,1]]))',
}

def md_cell(text):
    return {"cell_type": "markdown", "metadata": {}, "source": text}

def code_cell(text):
    return {"cell_type": "code", "metadata": {}, "execution_count": None,
            "outputs": [], "source": text}

# A ```python-solution block becomes an "active recall" pair: an empty cell for you
# to write your own answer, plus a collapsible cell holding the solution to check.
def your_turn_cells(solution_code):
    starter = ("# ✏️ Your turn — write your answer here, then run it (Shift+Enter).\n"
               "# Only expand \"Show solution\" below once you've given it a real try.\n")
    solution = ("<details>\n<summary>✅ Show solution</summary>\n\n"
                "```python\n" + solution_code + "\n```\n\n</details>")
    return [code_cell(starter), md_cell(solution)]

def defined_funcs(code):
    return re.findall(r"^def\s+(\w+)", code, re.M)

def build(md_path, is_warmup=False):
    txt = open(md_path, encoding="utf-8").read()
    lines = txt.split("\n")
    cells = []
    # intro: H1 + TL;DR (everything before the first '## ' or '---')
    intro = []
    i = 0
    while i < len(lines) and not lines[i].startswith("## "):
        if lines[i].strip() == "---":
            i += 1; continue
        intro.append(lines[i]); i += 1
    cells.append(md_cell("\n".join(intro).strip()))
    cells.append(code_cell(SETUP))
    if is_warmup:
        cells.append(md_cell("> **Tip:** run the setup cell above first (it creates "
                             "`input.jpg` for you). Then for each warm-up: run the "
                             "worked example, and **type the ✏️ Your turn yourself** in "
                             "the blank cell before peeking at the solution."))
    else:
        cells.append(md_cell("> **Tip:** run the setup cell above first. Each problem "
                             "below defines its solution and then runs a quick demo. "
                             "Edit and re-run any cell to experiment."))

    # walk the rest, splitting prose / code in order
    buf = []
    def flush_prose():
        text = "\n".join(buf).strip()
        # drop the in-page nav arrows
        text = "\n".join(l for l in text.split("\n") if not l.startswith("→"))
        if text.strip():
            cells.append(md_cell(text.strip()))
        buf.clear()

    while i < len(lines):
        line = lines[i]
        if line.startswith("```python-solution"):
            # "Your turn" exercise: emit a blank cell + a collapsible solution.
            flush_prose()
            i += 1
            code = []
            while i < len(lines) and not lines[i].startswith("```"):
                code.append(lines[i]); i += 1
            i += 1  # skip closing fence
            for cell in your_turn_cells("\n".join(code).rstrip()):
                cells.append(cell)
        elif line.startswith("```python"):
            flush_prose()
            i += 1
            code = []
            while i < len(lines) and not lines[i].startswith("```"):
                code.append(lines[i]); i += 1
            i += 1  # skip closing fence
            code_text = "\n".join(code)
            # strip a trailing `if __name__ == "__main__":` demo block (we add our own)
            code_text = re.sub(r'\nif __name__ == "__main__":[\s\S]*$', "", code_text).rstrip()
            cells.append(code_cell(code_text))
            for fn in defined_funcs(code_text):
                if fn in DEMOS:
                    cells.append(code_cell(DEMOS[fn]))
        elif line.startswith("```"):
            # non-python fence: pass through as prose/code text
            buf.append(line); i += 1
        else:
            buf.append(line); i += 1
    flush_prose()

    return {
        "cells": cells,
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "language_info": {"name": "python"},
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }

for src, out in FILES:
    nb = build(os.path.join(SRC, src), is_warmup=src.startswith("00-"))
    with open(os.path.join(OUT, out), "w", encoding="utf-8") as f:
        json.dump(nb, f, indent=1)
    print("wrote notebooks/%s  (%d cells)" % (out, len(nb["cells"])))

print("done")
