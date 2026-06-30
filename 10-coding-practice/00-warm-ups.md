# Warm-ups — start here

**TL;DR:** Tiny, friendly exercises to build muscle memory *before* the real
problems. Each one has a **worked example** you run to see what happens, then a
**✏️ Your turn** where you write it yourself in a blank cell and check against a
hidden solution.

> **Don't just run the cells — type them out.** Reading code you didn't write feels
> easy and teaches almost nothing. Re-typing a worked example from memory is what
> makes it stick. Re-run this notebook any time to practice again from scratch.

---

## Warm-up 1 — Read an image and look at it

An image in OpenCV is just a NumPy array of pixels. `cv2.imread` loads it; the
`show()` helper (from the setup cell) displays it inline.

```python
image = cv2.imread("input.jpg")
print("type:", type(image))
print("shape (height, width, channels):", image.shape)
show(image, "the image I just read")
```

**✏️ Your turn:** read `input.jpg` into a variable called `my_image` and display it
with the title `"my first read"`.

```python-solution
my_image = cv2.imread("input.jpg")
show(my_image, "my first read")
```

---

## Warm-up 2 — Dimensions and a single pixel

`image.shape` is `(height, width, channels)`. To read one pixel you index
`image[row, column]` — that's `[y, x]`, **not** `[x, y]`. Each pixel is `[B, G, R]`.

```python
image = cv2.imread("input.jpg")
height, width, channels = image.shape
print(f"height={height}, width={width}, channels={channels}")

center_pixel = image[height // 2, width // 2]
print("center pixel (Blue, Green, Red):", center_pixel)
```

**✏️ Your turn:** print the very top-left pixel (`image[0, 0]`) and, separately,
just the image width.

```python-solution
image = cv2.imread("input.jpg")
print("top-left pixel:", image[0, 0])
print("width:", image.shape[1])
```

---

## Warm-up 3 — Convert to grayscale

Most processing starts by dropping color. A grayscale image has **one** channel, so
its shape loses the last number.

```python
image = cv2.imread("input.jpg")
gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
print("color shape:", image.shape, "-> gray shape:", gray.shape)
show(gray, "grayscale")
```

**✏️ Your turn:** convert the image to grayscale and print its darkest and brightest
pixel values with `gray.min()` and `gray.max()`.

```python-solution
gray = cv2.cvtColor(cv2.imread("input.jpg"), cv2.COLOR_BGR2GRAY)
print("darkest:", gray.min(), "brightest:", gray.max())
show(gray, "grayscale")
```

---

## Warm-up 4 — Crop a region (array slicing)

Cropping is just slicing the array: `image[y1:y2, x1:x2]` — **rows first, then
columns**. This trips everyone up at least once.

```python
image = cv2.imread("input.jpg")
top_left_quarter = image[0:350, 0:250]      # rows 0..350, columns 0..250
show(top_left_quarter, "top-left quarter")
```

**✏️ Your turn:** crop a 200×200 square from the **center** of the image and show it.
(Hint: find the center with `height // 2`, `width // 2`, then slice 100 px each way.)

```python-solution
image = cv2.imread("input.jpg")
height, width = image.shape[:2]
center_y, center_x = height // 2, width // 2
center_crop = image[center_y - 100:center_y + 100, center_x - 100:center_x + 100]
show(center_crop, "center 200x200")
```

---

## Warm-up 5 — Resize

`cv2.resize` either scales by a factor (`fx`, `fy`) or to an exact `(width, height)`.

```python
image = cv2.imread("input.jpg")
half = cv2.resize(image, None, fx=0.5, fy=0.5)
print("from", image.shape[:2], "to", half.shape[:2])
show(half, "half size")
```

**✏️ Your turn:** resize the image to exactly 200×200 pixels. (Remember `cv2.resize`
takes the target size as `(width, height)`.)

```python-solution
image = cv2.imread("input.jpg")
square = cv2.resize(image, (200, 200))
show(square, "200x200")
```

---

## Warm-up 6 — Draw a box and a label

Drawing happens **in place**, so copy first if you want to keep the original.
Coordinates are `(x, y)` and colors are `(B, G, R)`.

```python
canvas = cv2.imread("input.jpg").copy()
cv2.rectangle(canvas, (120, 90), (420, 560), (0, 255, 0), 3)        # green box
cv2.putText(canvas, "label", (130, 80),
            cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 255), 2)          # red text
show(canvas, "drawn on")
```

**✏️ Your turn:** draw a **blue** rectangle around the top half of the image.
(Blue is `(255, 0, 0)`; the top half is from `(0, 0)` to `(width, height // 2)`.)

```python-solution
canvas = cv2.imread("input.jpg").copy()
height, width = canvas.shape[:2]
cv2.rectangle(canvas, (0, 0), (width - 1, height // 2), (255, 0, 0), 3)
show(canvas, "top half boxed")
```

---

## Warm-up 7 — Split the color channels

`cv2.split` separates the image into its Blue, Green, and Red channels, each a
single-channel (gray) image.

```python
image = cv2.imread("input.jpg")
blue, green, red = cv2.split(image)
show(blue, "blue channel")
show(red, "red channel")
```

**✏️ Your turn:** make a copy of the image, set its **red** channel to 0, and show
the result. (In BGR, red is channel index 2: `copy[:, :, 2] = 0`.)

```python-solution
image = cv2.imread("input.jpg").copy()
image[:, :, 2] = 0          # zero out the Red channel
show(image, "red removed")
```

---

## Warm-up 8 — Your first mask (threshold)

Thresholding turns a gray image into pure black/white: every pixel becomes 0 or 255
depending on whether it's above a cutoff. This is the foundation of Problem 1.

```python
gray = cv2.cvtColor(cv2.imread("input.jpg"), cv2.COLOR_BGR2GRAY)
_, mask = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)
show(mask, "white where pixel > 127")
```

**✏️ Your turn:** do the same but with a cutoff of **100** instead of 127, and notice
how much more turns white.

```python-solution
gray = cv2.cvtColor(cv2.imread("input.jpg"), cv2.COLOR_BGR2GRAY)
_, mask = cv2.threshold(gray, 100, 255, cv2.THRESH_BINARY)
show(mask, "threshold at 100")
```

---

## Warm-up 9 — Blur

Blurring averages each pixel with its neighbours. Bigger kernel = blurrier. You'll
blur before thresholding and edge detection to kill noise.

```python
image = cv2.imread("input.jpg")
blurred = cv2.GaussianBlur(image, (15, 15), 0)
show(blurred, "blurred (15x15 kernel)")
```

**✏️ Your turn:** blur with a larger `(31, 31)` kernel and compare. (Kernel sizes
must be **odd** numbers.)

```python-solution
image = cv2.imread("input.jpg")
show(cv2.GaussianBlur(image, (31, 31), 0), "blurred (31x31 kernel)")
```

---

## Warm-up 10 — NumPy basics (no OpenCV)

Since every image *is* a NumPy array, the array tricks below — shape, `.mean()`,
boolean masks — are exactly what powers the "vectorize it" problems later.

```python
import numpy as np

values = np.array([[10, 20, 30],
                   [40, 50, 60]])
print("shape:", values.shape)
print("mean:", values.mean(), " max:", values.max())
print("boolean mask (which entries are > 25):")
print(values > 25)
```

**✏️ Your turn:** create a 3×3 array of zeros (`np.zeros((3, 3), dtype=np.uint8)`),
set the middle entry to 255, and print it.

```python-solution
import numpy as np
grid = np.zeros((3, 3), dtype=np.uint8)
grid[1, 1] = 255
print(grid)
```

→ Next, the real thing: **[image-processing-and-geometry.md](image-processing-and-geometry.md)**
