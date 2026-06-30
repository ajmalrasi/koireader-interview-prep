# The GStreamer Pipeline Model

**TL;DR:** Elements are LEGO bricks. Pads are the studs that connect them. Caps
are the rule that says "these two bricks fit." Buffers are the data flowing
through. The bus is the intercom that tells your app about errors and end-of-stream.

## The pieces

- **Element** — one processing unit: `rtspsrc`, `h264parse`, `nvv4l2decoder`,
  `nvvidconv`, `appsink`. Has a state (NULL → READY → PAUSED → PLAYING).
- **Pad** — an element's input (**sink pad**) or output (**source pad**). Data
  enters sink pads, leaves source pads. (Confusingly, a "sink *element*" is the
  final consumer, while a "sink *pad*" is any input port.)
- **Caps (capabilities)** — the format contract negotiated between pads, e.g.
  `video/x-raw,format=NV12,width=1920,height=1080,framerate=30/1`. Mismatched caps
  = pipeline won't link.
- **Buffer** — a chunk of data (usually one frame) flowing downstream, with a
  timestamp (PTS).
- **Bin / Pipeline** — a container of elements. The top-level `Pipeline` is a bin
  that also owns the clock and bus.
- **Bus** — the message channel from pipeline → your app: `EOS` (end of stream),
  `ERROR`, `WARNING`, state changes. **You watch the bus to detect a dead camera.**

## A pipeline in words

The `!` is shorthand for "link the source pad of the left element to the sink pad
of the right element":

```fig:gstPads
Each "!" connects an output (source) pad to the next element's input (sink) pad
```

## Dynamic pads (the gotcha interviewers love)

`rtspsrc` doesn't know the stream's format until it connects, so its source pad
appears **at runtime** ("sometimes pad"). You can't link it statically — you
connect a `pad-added` callback and link then. Knowing this signals real GStreamer
experience.

```python
def on_pad_added(src, new_pad, depay):
    new_pad.link(depay.get_static_pad("sink"))
rtspsrc.connect("pad-added", on_pad_added, depay)
```

## queue = thread boundary

Inserting a `queue` element decouples upstream and downstream onto **separate
threads**, with a bounded buffer. This is how you parallelize decode vs inference
and apply backpressure (`max-size-buffers`, `leaky`). No `queue` = everything runs
in one thread, serially.

## States and why PAUSED matters

NULL (no resources) → READY (resources allocated) → PAUSED (data prerolled, clock
stopped) → PLAYING (clock running, data flows). Live sources can't fully preroll,
which is why live pipelines behave slightly differently and why you handle
`async-done`/`no-preroll`.

## Caps negotiation — how two pads actually agree

Linking isn't "plug A into B." When you set the pipeline to PLAYING, pads
**negotiate caps**: the downstream pad advertises what it can accept, the upstream
what it can produce, and GStreamer intersects the two. If the intersection is empty
you get the classic `not-negotiated (-4)` error. A **capsfilter** (the
`video/x-raw,format=BGR` you see between elements) *forces* a specific format —
that's you pinning the contract rather than letting it auto-pick.

```fig:gstCaps
A capsfilter between two elements pins the exact format they exchange
```

Three failure signatures worth recognizing instantly in an interview:
- **`not-negotiated`** → caps don't intersect (e.g. you forgot a `videoconvert`,
  or asked for a format the decoder can't emit).
- **`internal data stream error`** → almost always a *dynamic pad never linked*
  (the `rtspsrc` pad-added gotcha below) or a missing element.
- **pipeline hangs in PAUSED** → a live source not prerolling, or a queue with
  nothing feeding it.

## Buffers carry more than pixels: PTS, DTS, metadata

A `GstBuffer` has two timestamps: **PTS** (presentation — when to show it) and
**DTS** (decode — when to decode it). They differ when **B-frames** reorder decode
vs display order; that reordering is also why B-frames add latency (section 01).
Buffers also carry **`GstMeta`** — sidecar info (e.g. DeepStream hangs its
`NvDsBatchMeta` here) so detections ride *with* the frame without copying pixels.

## The pipeline clock and live sources

The pipeline picks one **clock**; every sink times playback against it. A **live**
source (camera) is itself the clock master — frames arrive when they arrive, you
can't "pause and resume" the world. This is why a live pipeline returns
`NO_PREROLL` from the state change and why `sync=false` on a sink means "don't wait
for the clock, hand me the frame now" (the latency knob from
[appsink](appsink-and-python.md)).

## State changes return a *status*, and it matters

`set_state(PLAYING)` doesn't return success/failure — it returns one of:
`SUCCESS`, `ASYNC` (will finish later, watch the bus for `async-done`),
`NO_PREROLL` (live source, normal), or `FAILURE`. Treating `ASYNC` as failure is a
common bug; you wait for the bus to confirm before assuming the camera is up.

## Events vs messages (two different channels)

- **Messages** flow pipeline → app on the **bus** (`ERROR`, `EOS`, `STATE_CHANGED`,
  `QOS`). This is what *your code* listens to.
- **Events** flow *between elements* in-band with the data: `EOS`, `FLUSH`,
  `SEGMENT`, `QOS` (quality-of-service: a downstream sink telling upstream "I'm
  dropping late frames, slow down"). You usually don't handle these directly but
  knowing they exist explains how backpressure/QoS propagates.

## Pad probes — inspect or modify the stream in flight

A **pad probe** is a callback you attach to a pad to watch buffers/events passing
through — without adding an element. This is exactly how you read DeepStream
metadata ([deepstream.md](deepstream.md)), drop frames conditionally, or measure
per-stage latency. Buffer probes for data, event probes for EOS/flush.

```python
pad = element.get_static_pad("src")
pad.add_probe(Gst.PadProbeType.BUFFER, my_probe, user_data)
```

## tee + queue = branching (record AND infer AND stream)

To send one stream to multiple consumers — infer on it *and* record it *and* push
it to WebRTC — use **`tee`**, and put a **`queue` after every branch**. Without the
per-branch queue the slowest branch stalls all of them (they'd share one thread).

```fig:gstTee
tee fans one stream to many branches — give every branch its own queue
```

## queue tuning: leaky for live, blocking for recorded

`queue max-size-buffers=2 leaky=downstream` = "keep at most 2, drop the *oldest*
when full" — the live-video default (latest frame wins). `leaky=no` (block) is for
recorded/offline where you must not lose a frame. This is the backpressure policy
from section 01 expressed as element properties. `max-size-time` and
`max-size-bytes` are alternative bound dimensions (set unused ones to 0).

## Debugging: the two commands you'll name in the interview

```bash
# 1) Verbose internals — caps negotiated, state changes, the actual error:
GST_DEBUG=3 gst-launch-1.0 rtspsrc location=... ! ...        # bump to 4–5 for more
# 2) Dump the pipeline graph to a .dot (visualize what linked to what):
GST_DEBUG_DUMP_DOT_DIR=/tmp gst-launch-1.0 ...   # then: dot -Tpng pipeline.dot
```

Mentioning `GST_DEBUG` levels and the `.dot` graph dump is a strong "I've actually
debugged these" signal. `gst-inspect-1.0 <element>` (list an element's pads,
caps, and properties) is the third one to name.

## Why X over Y

**GStreamer vs FFmpeg (the CLI/lib)?**
FFmpeg is a swiss-army transcoder — unbeatable for "convert/clip this file" and
great as a decode library. GStreamer is a *pipeline framework* for **live,
branching, multi-stream, plugin-extensible** apps with fine threading control.
KoiReader wants live multi-stream graphs with inference inside → GStreamer (and
DeepStream is built on it). Many shops use FFmpeg for ingest/clip and GStreamer
for the live serving graph.

**Why use `queue` elements at all?**
Without them the whole pipeline is one thread: a slow decoder stalls the source.
`queue` puts a thread boundary + bounded buffer between stages so they run
concurrently and you control drop policy.

**How do you detect a camera went down?**
Watch the **bus** for `ERROR`/`EOS`, and/or run a watchdog on frame timestamps. On
failure, tear the pipeline to NULL and rebuild (reconnect) — see
[fault tolerance](../04-fault-tolerance/README.md).

→ Next: **[appsink-and-python.md](appsink-and-python.md)**
