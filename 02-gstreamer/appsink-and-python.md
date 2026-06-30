# Getting Frames into Python: appsink

**TL;DR:** `appsink` is the element that hands buffers *out of* the pipeline into
your Python code; `appsrc` pushes frames *in*. The trick is to pull frames without
copying more than necessary and without letting the buffer grow. Configure
`appsink` with `max-buffers=1 drop=true` and you have a "latest frame only" tap.

```fig:appsink
appsink is the pipeline's exit into Python — a "latest frame only" tap
```

## Two ways to consume

**A) Via OpenCV (quick):**
```python
pipeline = (
    "rtspsrc location=rtsp://cam latency=100 protocols=tcp ! "
    "rtph264depay ! h264parse ! nvv4l2decoder ! "
    "nvvidconv ! video/x-raw,format=BGRx ! videoconvert ! "
    "video/x-raw,format=BGR ! appsink drop=1 max-buffers=1 sync=false"
)
cap = cv2.VideoCapture(pipeline, cv2.CAP_GSTREAMER)
while True:
    ok, frame = cap.read()   # frame is a BGR numpy array
    if not ok:
        break                # → trigger reconnect logic
```

**B) Via GObject/Gst directly (full control):**
```python
import gi; gi.require_version("Gst", "1.0")
from gi.repository import Gst
Gst.init(None)

appsink = pipeline.get_by_name("sink")
appsink.set_property("emit-signals", True)
appsink.set_property("max-buffers", 1)
appsink.set_property("drop", True)

def on_new_sample(sink):
    sample = sink.emit("pull-sample")
    buf = sample.get_buffer()
    caps = sample.get_caps()
    ok, mapinfo = buf.map(Gst.MapFlags.READ)
    try:
        frame = np.ndarray(
            (height, width, 3), buffer=mapinfo.data, dtype=np.uint8
        )
        handle(frame.copy())   # copy if you keep it past this callback
    finally:
        buf.unmap(mapinfo)     # ALWAYS unmap — else you leak buffers
    return Gst.FlowReturn.OK

appsink.connect("new-sample", on_new_sample)
```

The `buf.unmap()` in a `finally` is the kind of detail that separates "used it
once" from "ran it in production." Forgetting it is a textbook leak.

## sync=false (the latency knob)

By default a sink waits for each buffer's presentation time (`sync=true`) to play
at real-time speed. For inference you usually want frames **as fast as available**
→ `sync=false`. Combined with `drop=true max-buffers=1`, you always process the
newest frame with minimal lag.

## The GLib main loop (the part tutorials skip)

The signal-based appsink (`emit-signals=True`, `new-sample`) only fires while a
**GLib main loop** is running — that's the event loop that dispatches GStreamer
callbacks and bus messages. A real app structure:

```python
loop = GLib.MainLoop()
bus = pipeline.get_bus()
bus.add_signal_watch()
bus.connect("message", on_bus_message, loop)   # handle ERROR/EOS → loop.quit()
pipeline.set_state(Gst.State.PLAYING)
try:
    loop.run()                                  # blocks; callbacks fire here
finally:
    pipeline.set_state(Gst.State.NULL)          # ALWAYS tear down to free NVDEC/GPU
```

Two things interviewers probe: (1) the main loop runs on its own thread so your
inference can run elsewhere, and (2) you **must** set state to NULL on exit or you
leak the hardware decoder session — on Jetson that means the next run fails to open
NVDEC.

## Zero-copy and NVMM memory (the senior-level detail)

On Jetson/dGPU the decoder (`nvv4l2decoder`) outputs **NVMM** buffers — memory that
lives on the GPU. Pull those straight to `appsink` and the numpy `frame` you get is
**already a CPU copy** the moment you map it, because numpy/OpenCV are CPU. The
expensive mistake is bouncing GPU→CPU→GPU around inference.

Two ways to stay fast:
- **Keep it on the GPU**: do conversion/scaling with `nvvideoconvert` and run
  inference (TensorRT/DeepStream) on the NVMM buffer — never pull pixels to Python
  at all; read *metadata* via a pad probe instead ([deepstream.md](deepstream.md)).
- **If you must touch pixels in Python**, map once, `.copy()` once, and push the
  result back through a single `appsrc` — don't ping-pong.

> One-liner for the interview: *"appsink is a CPU exit. If the work can stay on the
> GPU, I keep buffers in NVMM and read DeepStream metadata in a probe rather than
> pulling frames to numpy — that's the zero-copy path. I only use appsink when I
> genuinely need pixels in Python."*

## appsrc (pushing frames back in)

When you've annotated a frame and want to encode/stream it out, push it into an
`appsrc` feeding `nvv4l2h264enc ! rtspclientsink`/`webrtcbin`. You must set caps and
timestamps (PTS) correctly or downstream stalls or runs at the wrong speed.

```python
appsrc.set_property("format", Gst.Format.TIME)       # timestamps are in nanoseconds
appsrc.set_property("is-live", True)                 # live source semantics
appsrc.set_property("do-timestamp", True)            # let it stamp arrival time
caps = Gst.Caps.from_string("video/x-raw,format=BGR,width=1920,height=1080,framerate=30/1")
appsrc.set_property("caps", caps)

buf = Gst.Buffer.new_wrapped(frame.tobytes())
buf.pts = frame_index * Gst.SECOND // 30             # explicit PTS if not auto
buf.duration = Gst.SECOND // 30
appsrc.emit("push-buffer", buf)
```

Get PTS wrong and the downstream encoder either stalls (waiting for "future"
timestamps) or sprints (timestamps in the past). Honoring **`need-data`/`enough-data`**
signals from appsrc is how you respect downstream backpressure instead of
overrunning the encoder.

## Why X over Y

**appsink vs cv2.VideoCapture?**
`VideoCapture` *uses* an appsink internally but hides it. Direct appsink gives you
the callback, GPU buffer access, explicit unmap, and zero-copy options. Prototype
with VideoCapture; use direct appsink when you need control or zero-copy.

**Why `.copy()` the numpy frame in the callback?**
The numpy array points into GStreamer's mapped buffer memory. Once you `unmap`/
return, that memory is recycled — keeping the array without copying = corruption.
Copy if the frame outlives the callback (e.g., goes into a queue).

**Why `max-buffers=1 drop=true`?**
It makes appsink a "latest frame" tap: if your consumer lags, GStreamer drops
stale frames instead of queuing them → bounded memory, minimal latency. This is
the backpressure policy from section 01 expressed in one line.

→ Next: **[deepstream.md](deepstream.md)**
