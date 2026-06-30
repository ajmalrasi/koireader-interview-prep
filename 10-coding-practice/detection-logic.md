# Detection Logic

**TL;DR:** The JD's "complex logic layers on top of model detections." You'll get
boxes (or points) and be asked to compute something: **IoU**, **NMS**, who's
**inside a zone**, who **crossed a line**, or the **reading order** of OCR boxes.
Pure Python + NumPy — no model needed. These are classic, so know them cold.

---

## Problem 8 — IoU of two boxes

**Tests:** the fundamental box metric; coordinate math; the empty-overlap edge case.

```python
def iou(a, b):
    """Boxes as (x1, y1, x2, y2). Returns intersection-over-union in [0,1]."""
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)   # clamp at 0 → no overlap
    inter = iw * ih
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0

if __name__ == "__main__":
    print(iou((0, 0, 10, 10), (5, 5, 15, 15)))   # 25 / 175 = 0.142...
```

**Watch out:** the `max(0, ...)` clamp — without it, non-overlapping boxes give a
bogus positive area.

---

## Problem 9 — Non-Maximum Suppression (from scratch)

**Tests:** the dedup algorithm every detector needs. Sort by score, greedily keep
the best, drop high-IoU neighbours.

```python
def nms(boxes, scores, iou_thresh=0.5):
    """boxes: list of (x1,y1,x2,y2); scores: list of floats. Returns kept indices."""
    candidates = sorted(range(len(boxes)), key=lambda i: scores[i], reverse=True)
    keep = []
    while candidates:
        best = candidates.pop(0)        # highest score still in play
        keep.append(best)
        candidates = [i for i in candidates
                      if iou(boxes[best], boxes[i]) < iou_thresh]
    return keep
```

NumPy/vectorized version (worth knowing for "make it fast"):

```python
import numpy as np

def nms_np(boxes, scores, iou_thresh=0.5):
    boxes = np.asarray(boxes, dtype=float)
    x1, y1, x2, y2 = boxes.T
    areas = (x2 - x1) * (y2 - y1)
    order = scores.argsort()[::-1]          # indices, highest score first
    keep = []
    while order.size > 0:
        best = order[0]; keep.append(best)
        others = order[1:]
        inter_x1 = np.maximum(x1[best], x1[others])
        inter_y1 = np.maximum(y1[best], y1[others])
        inter_x2 = np.minimum(x2[best], x2[others])
        inter_y2 = np.minimum(y2[best], y2[others])
        inter_w = np.maximum(0, inter_x2 - inter_x1)
        inter_h = np.maximum(0, inter_y2 - inter_y1)
        intersection = inter_w * inter_h
        overlaps = intersection / (areas[best] + areas[others] - intersection)
        order = others[overlaps < iou_thresh]
    return keep
```

**Watch out:** reuse `iou` from Problem 8 — interviewers love when you compose.
Soft-NMS (decay scores instead of dropping) is the follow-up for crowded scenes.

---

## Problem 10 — Count detections inside a zone (point-in-polygon)

**Tests:** geometry on detections; using the **bottom-center** (foot) point, not
the box center.

```python
import cv2
import numpy as np

def count_in_zone(boxes, polygon):
    """polygon: list of (x,y). Counts boxes whose foot point is inside."""
    polygon_pts = np.array(polygon, dtype=np.int32)
    count = 0
    for (x1, y1, x2, y2) in boxes:
        foot = (int((x1 + x2) / 2), int(y2))            # bottom-center point
        if cv2.pointPolygonTest(polygon_pts, foot, False) >= 0:  # >=0 = inside/on
            count += 1
    return count
```

**Watch out:** use the **foot point** (where the object meets the floor), not the
geometric center — the standard gotcha for tall objects / oblique cameras.

---

## Problem 11 — Line-crossing counter (direction-aware)

**Tests:** tracking-style logic; cross-product sign to detect a crossing and its
direction between consecutive frames.

```python
def side(line_a, line_b, p):
    """Sign of which side of line (a->b) point p is on (cross product z)."""
    return ((line_b[0] - line_a[0]) * (p[1] - line_a[1]) -
            (line_b[1] - line_a[1]) * (p[0] - line_a[0]))

def count_crossings(tracks, line_a, line_b):
    """tracks: {id: [(x,y) per frame]}. Returns (in_count, out_count)."""
    entering = leaving = 0
    for path in tracks.values():
        for prev_point, cur_point in zip(path, path[1:]):
            side_prev = side(line_a, line_b, prev_point)
            side_cur = side(line_a, line_b, cur_point)
            if side_prev == 0 or side_cur == 0:
                continue
            if (side_prev > 0) != (side_cur > 0):   # sign flipped → crossed
                if side_cur > 0: entering += 1
                else: leaving += 1
    return entering, leaving
```

**Watch out:** count **per track id** so one object is counted once per crossing,
not once per frame. Debounce flicker in real systems (K-of-N frames).

---

## Problem 12 — Sort OCR boxes into reading order

**Tests:** turning detections into text order — group into rows, then left-to-right.

```python
def reading_order(boxes, row_tol=15):
    """boxes: list of (x1,y1,x2,y2). Returns indices in reading order."""
    order = list(range(len(boxes)))
    order.sort(key=lambda i: boxes[i][1])         # by top y first
    rows, current_row, current_row_y = [], [], None
    for i in order:
        box_center_y = (boxes[i][1] + boxes[i][3]) / 2
        if current_row_y is None or abs(box_center_y - current_row_y) <= row_tol:
            current_row.append(i)
            current_row_y = (box_center_y if current_row_y is None
                             else (current_row_y + box_center_y) / 2)
        else:
            rows.append(current_row)
            current_row, current_row_y = [i], box_center_y
    if current_row:
        rows.append(current_row)
    result = []
    for row in rows:
        row.sort(key=lambda i: boxes[i][0])       # within a row, left to right
        result.extend(row)
    return result
```

**Watch out:** `row_tol` groups boxes into the same line; tune to text height.
This is exactly the kind of "logic on top of an OCR model" KoiReader builds.

→ Next: **[video-and-streaming.md](video-and-streaming.md)**
