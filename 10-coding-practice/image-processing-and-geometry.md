# Image Processing & Geometry

**TL;DR:** This is the heart of the test. Master the **preprocessing chain**
(gray → blur → threshold → morphology) and the **4-point perspective transform**
(detect a document/label quad and warp it flat). Everything here runs on a single
image and saves an output image — exactly what the test asks for.

Every solution is complete and runnable. Practice typing each from a blank file.

---

## Problem 1 — Preprocess for OCR (gray → blur → Otsu → save)

**Tests:** the fundamental chain, color conversion, thresholding, saving output.

```python
import cv2

def preprocess(path, out="p1_out.png"):
    img = cv2.imread(path)
    if img is None:
        raise FileNotFoundError(path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)     # denoise before threshold
    # Otsu auto-picks the threshold; THRESH_BINARY_INV makes text white on black
    _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    cv2.imwrite(out, binary)
    return binary

if __name__ == "__main__":
    preprocess("input.jpg")
```

**Watch out:** Otsu needs a *single-channel* image and `thresh=0`. Blur first or
threshold gets speckly.

---

## Problem 2 — Clean a noisy scanned document (adaptive threshold + morphology)

**Tests:** adaptive thresholding (uneven lighting) and morphology to remove specks.

```python
import cv2
import numpy as np

def clean_scan(path, out="p2_out.png"):
    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise FileNotFoundError(path)
    # adaptive: threshold computed per-region → robust to shadows/gradients
    binary = cv2.adaptiveThreshold(img, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                   cv2.THRESH_BINARY, blockSize=31, C=10)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    opened = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)   # remove small noise
    cv2.imwrite(out, opened)
    return opened
```

**Watch out:** `blockSize` must be **odd**. Opening removes specks; closing fills
holes — pick by whether your noise is dots (open) or gaps (close).

---

## Problem 3 — Deskew a rotated document

**Tests:** geometry from foreground pixels, rotation matrix, warpAffine.

```python
import cv2
import numpy as np

def deskew(path, out="p3_out.png"):
    img = cv2.imread(path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    foreground_pixels = np.column_stack(np.where(binary > 0))  # (row, col) of text
    angle = cv2.minAreaRect(foreground_pixels)[-1]  # angle of tightest box
    if angle < -45:
        angle = 90 + angle
    (height, width) = img.shape[:2]
    rotation_matrix = cv2.getRotationMatrix2D((width / 2, height / 2), angle, 1.0)
    rotated = cv2.warpAffine(img, rotation_matrix, (width, height),
                             flags=cv2.INTER_CUBIC,
                             borderMode=cv2.BORDER_REPLICATE)
    cv2.imwrite(out, rotated)
    return rotated
```

**Watch out:** `minAreaRect` angle conventions changed across OpenCV versions —
know the `< -45` correction and be ready to explain it.

---

## Problem 4 — 4-point perspective transform ("scan this label") ⭐

**Tests:** the single most likely task. Detect the document's 4 corners and warp
it to a flat top-down view. Memorize the `order_points` + `four_point_transform`
pair cold.

```python
import cv2
import numpy as np

def order_points(points):
    """Return corners as [top-left, top-right, bottom-right, bottom-left]."""
    ordered = np.zeros((4, 2), dtype="float32")
    coord_sum = points.sum(axis=1)
    ordered[0] = points[np.argmin(coord_sum)]    # top-left has smallest x+y
    ordered[2] = points[np.argmax(coord_sum)]    # bottom-right has largest x+y
    coord_diff = np.diff(points, axis=1)
    ordered[1] = points[np.argmin(coord_diff)]   # top-right has smallest y-x
    ordered[3] = points[np.argmax(coord_diff)]   # bottom-left has largest y-x
    return ordered

def four_point_transform(image, points):
    ordered = order_points(points)
    (top_left, top_right, bottom_right, bottom_left) = ordered
    width_bottom = np.linalg.norm(bottom_right - bottom_left)
    width_top = np.linalg.norm(top_right - top_left)
    out_width = int(max(width_bottom, width_top))
    height_right = np.linalg.norm(top_right - bottom_right)
    height_left = np.linalg.norm(top_left - bottom_left)
    out_height = int(max(height_right, height_left))
    destination = np.array([[0, 0], [out_width - 1, 0],
                            [out_width - 1, out_height - 1], [0, out_height - 1]],
                           dtype="float32")
    perspective_matrix = cv2.getPerspectiveTransform(ordered, destination)
    return cv2.warpPerspective(image, perspective_matrix, (out_width, out_height))

def scan(path, out="p4_out.png"):
    img = cv2.imread(path)
    ratio = img.shape[0] / 500.0
    resized = cv2.resize(img, (int(img.shape[1] / ratio), 500))
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 75, 200)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]
    document_corners = None
    for contour in contours:
        perimeter = cv2.arcLength(contour, True)
        corners = cv2.approxPolyDP(contour, 0.02 * perimeter, True)  # simplify
        if len(corners) == 4:                              # found a quadrilateral
            document_corners = corners.reshape(4, 2) * ratio  # scale to full res
            break
    if document_corners is None:
        raise RuntimeError("no 4-corner document found")
    warped = four_point_transform(img, document_corners.astype("float32"))
    cv2.imwrite(out, warped)
    return warped
```

**Watch out:** `getPerspectiveTransform` needs **float32** points in a consistent
order — that's why `order_points` exists. Scale corners back up if you detected on
a resized copy.

---

## Problem 5 — Find and crop the largest rectangle (document boundary)

**Tests:** Canny + contours + `approxPolyDP` + bounding-box crop.

```python
import cv2

def crop_largest_rect(path, out="p5_out.png"):
    img = cv2.imread(path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 50, 150)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        raise RuntimeError("no contours")
    largest = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(largest)
    crop = img[y:y + h, x:x + w]
    cv2.imwrite(out, crop)
    return crop
```

**Watch out:** `img[y:y+h, x:x+w]` — rows first (y), then cols (x). A frequent slip.

---

## Problem 6 — Resize keeping aspect ratio, pad to square (letterbox)

**Tests:** the standard model-input preprocessing; aspect-ratio math, padding.

```python
import cv2
import numpy as np

def letterbox(path, size=640, out="p6_out.png"):
    img = cv2.imread(path)
    h, w = img.shape[:2]
    scale = size / max(h, w)
    new_w, new_h = int(w * scale), int(h * scale)
    resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
    canvas = np.full((size, size, 3), 114, dtype=np.uint8)   # gray pad
    top, left = (size - new_h) // 2, (size - new_w) // 2
    canvas[top:top + new_h, left:left + new_w] = resized
    cv2.imwrite(out, canvas)
    return canvas
```

**Watch out:** `INTER_AREA` for shrinking, `INTER_LINEAR/CUBIC` for enlarging.
Keep the scale + padding offsets if you later need to map detections back.

---

## Problem 7 — Boost contrast on a dark image (CLAHE)

**Tests:** histogram equalization done right (local, on luminance only).

```python
import cv2

def enhance(path, out="p7_out.png"):
    img = cv2.imread(path)
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)       # equalize L, keep color
    lightness, green_red, blue_yellow = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    equalized_lightness = clahe.apply(lightness)
    merged = cv2.merge((equalized_lightness, green_red, blue_yellow))
    out_img = cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)
    cv2.imwrite(out, out_img)
    return out_img
```

**Watch out:** equalize the **L** channel in LAB (or V in HSV), never the raw BGR
channels — that wrecks color. CLAHE (local) beats global `equalizeHist` for uneven
lighting.

→ Next: **[detection-logic.md](detection-logic.md)**
