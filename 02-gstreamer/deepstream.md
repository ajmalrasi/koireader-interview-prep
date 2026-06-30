# DeepStream: Inference Inside the Pipeline

**TL;DR:** DeepStream is NVIDIA's set of GStreamer plugins that put inference,
tracking, and analytics *inside* the video pipeline, keeping frames on the GPU end
to end. Its superpower is `nvstreammux`: it **batches many camera streams into one
inference call**, which is how you serve dozens of cameras on one GPU. You've
shipped this on Jetson Nano — own it.

## The canonical DeepStream pipeline

```fig:deepstreamFull
The canonical DeepStream pipeline — N cameras batched into one inference call
```

Key plugins:

- **`nvstreammux`** — batches frames from N sources into a single batched buffer.
  *This is the scaling trick:* one `nvinfer` call processes all cameras together,
  amortizing GPU launch overhead. Set `batch-size = number of streams`.
- **`nvinfer`** — runs a **TensorRT** engine. Configured via a text file
  (`config_infer.txt`) pointing at the model, precision (INT8/FP16), and
  pre/post-processing. Operates as **primary** (detector) or **secondary**
  (classifier on detected crops).
- **`nvtracker`** — multi-object tracking (NvDCF, KLT, or DeepSORT-style),
  assigning persistent IDs across frames. Critical for counting/dwell-time.
- **`nvdsosd`** — on-screen display: draws boxes/labels on GPU.
- **`nvvideoconvert`** — GPU color/format conversion + scaling.
- **Metadata (`NvDsBatchMeta`)** — detections travel *alongside* frames as
  structured metadata you read in a `pad probe` (Python via pyds) to push results
  to a DB/analytics — no full-frame copy needed.

## nvstreammux — the knobs that actually matter

`nvstreammux` is the heart of multi-stream, and its config is a frequent
follow-up question:

- **`batch-size`** — how many frames per batched buffer. Rule of thumb: **set it to
  the number of streams** (or a multiple). This must match `nvinfer`'s batch-size or
  you under/over-fill the GPU.
- **`batched-push-timeout`** — the max microseconds the mux waits to fill a batch
  before pushing what it has. **This is a latency-vs-efficiency dial**: too long and
  a slow/dead camera holds up everyone; set it to roughly one frame interval
  (~33000 µs at 30fps) so a missing stream can't stall the batch.
- **`width`/`height`** — the mux scales every input to a common resolution before
  batching (the model's input size). Mismatch here silently wrecks aspect ratio /
  accuracy.
- **`live-source=1`** — tells the mux the inputs are live (camera) so it times
  correctly.

> Interview gold: *"The dangerous default is an unbounded batch wait — one dead
> RTSP camera can stall the whole batched pipeline. I cap `batched-push-timeout` to
> ~a frame interval so the batch flushes with N-1 streams and the dead one gets
> reconnected independently."* This ties multi-stream batching to
> [fault tolerance](../04-fault-tolerance/README.md).

## nvinfer config — what's in that text file

`nvinfer` is configured by a `config_infer.txt` of key groups, not code. The ones
to be able to name:

- **`[property]`** — `model-engine-file` (the built TensorRT engine),
  `onnx-file`/`model-file` (source to build from), `network-mode` (0=FP32, 1=INT8,
  2=FP16), `batch-size`, `num-detected-classes`.
- **`gie-unique-id`** — the inference instance's ID, so metadata is tagged with
  *which* model produced it (matters when chaining primary + secondary).
- **`process-mode`** — 1=primary (whole frame), 2=secondary (on crops from upstream).
- **`interval`** — **skip inference on N frames between runs** (e.g. infer every 3rd
  frame, track in between). A cheap, big latency/throughput lever when objects don't
  move much frame-to-frame.
- **`operate-on-gie-id` / `operate-on-class-ids`** — a secondary GIE saying "only
  run me on *vehicles* detected by primary GIE 1." This is how cascades stay cheap.

First run builds the `.engine` from ONNX (slow, minutes); subsequent runs load the
cached engine. **Build on the target hardware** (TensorRT tunes per GPU arch) — same
point as section 03.

## The metadata hierarchy (read this in a probe)

Detections don't come back as pixels — they're a nested C structure you walk via
`pyds`:

```fig:dsMeta
The metadata nests batch → frame → object → classifier; you walk it in a probe
```

You attach a **pad probe** (from [pipeline-model.md](pipeline-model.md)) on
`nvdsosd`'s sink or `nvinfer`'s src, walk `frame_meta_list → obj_meta_list`, and
push results out — **no frame copy**. `source_id` is what tells you *which camera* a
detection came from inside the batched buffer.

## Getting results OUT: msgbroker → Kafka

For analytics you rarely draw boxes — you emit events. DeepStream's
**`nvmsgconv`** turns metadata into a schema (JSON) and **`nvmsgbroker`** ships it to
**Kafka / MQTT / AMQP / Azure IoT**. That's the "detections → message bus → DB /
dashboard" path, and it connects straight to your Kafka/Celery background — worth
volunteering: *"DeepStream metadata out via nvmsgbroker to Kafka, consumed by the
analytics service — same decoupled pattern as my data-platform work."*

## Getting video OUT: tiler, OSD, and RTSP/WebRTC

- **`nvmultistreamtiler`** composites N streams into one MxN grid for a single
  monitor view (one decode of operator attention, many cameras).
- **`nvdsosd`** burns boxes/labels onto the frame on the GPU.
- **Out to the network**: encode (`nvv4l2h264enc`) then an RTSP server
  (`nvrtspoutsinkbin` / a GstRtspServer mount) or `webrtcbin` for the
  sub-500ms browser path from [section 01](../01-video-streaming/protocols-rtsp-webrtc.md).
  This closes the **RTSP in → infer → WebRTC out** loop.

## Jetson vs dGPU (you've shipped Jetson — own the nuance)

On **Jetson** (Nano/Orin) CPU and GPU share physical memory, so NVMM transfers are
near-free, but you're compute/power constrained — INT8 + frame `interval` skipping
matter more. On **dGPU** (datacenter) memory is separate, so avoiding host↔device
copies is the bigger win. The plugin names differ slightly by version
(`nvv4l2decoder` vs `nvdec`); naming that you've hit version-specific plugin
differences across DeepStream 5/6/7 reads as real field experience.

## Why batching matters (the number that impresses)

A GPU launching inference per-frame, per-camera wastes most of its time on
overhead. Batching N frames into one call can lift throughput several-fold for the
same latency budget — the difference between 4 cameras and 40 on one box. Tie this
to your TensorRT/INT8 experience: *"batch at the mux, run an INT8 TRT engine, keep
buffers in NVMM (GPU) memory — that's the multi-stream low-latency recipe."*

## Pad probes (reading results in Python)

```python
def osd_sink_probe(pad, info, u_data):
    batch_meta = pyds.gst_buffer_get_nvds_batch_meta(hash(info.get_buffer()))
    l_frame = batch_meta.frame_meta_list
    while l_frame is not None:
        frame_meta = pyds.NvDsFrameMeta.cast(l_frame.data)
        # iterate frame_meta.obj_meta_list → boxes, classes, track ids
        l_frame = l_frame.next
    return Gst.PadProbeReturn.OK
```

You don't pull pixels to Python — you read *metadata*. That's the zero-copy
philosophy in action.

## DeepStream vs rolling your own (GStreamer + appsink + PyTorch)

| | DeepStream | DIY appsink + framework |
|---|---|---|
| Multi-stream batching | Built-in (`nvstreammux`) | You build it |
| Memory | Stays on GPU (NVMM) | Easy to accidentally copy to CPU |
| Flexibility | NVIDIA-opinionated, config-driven | Total freedom, more code |
| Best for | Many cameras, NVIDIA HW, standard detect/track | Custom logic, non-NVIDIA, research |

## Triton vs nvinfer (within DeepStream)

`nvinfer` runs TensorRT engines in-process. `nvinferserver` offloads to a **Triton
Inference Server** — useful when you want a model server shared across pipelines,
multiple frameworks, or dynamic model management. (More in
[03-low-latency-inference](../03-low-latency-inference/triton.md).)

## Why X over Y

**DeepStream vs plain GStreamer + your own inference?**
DeepStream gives multi-stream batching, GPU-resident buffers, and tracking for
free on NVIDIA HW — fastest path to many cameras. Roll your own when you need
custom pipeline logic, non-NVIDIA hardware, or research flexibility. KoiReader is
NVIDIA-heavy ("latest NVIDIA Hardware"), so DeepStream is a natural fit and a
strong thing to volunteer.

**Why batch at nvstreammux instead of per-camera inference?**
Per-camera inference pays GPU launch/overhead N times and underuses the GPU.
Batching fills the GPU, amortizing overhead → higher throughput at the same
latency. It's the single biggest multi-stream scaling lever.

**Primary vs secondary nvinfer?**
Primary detects objects on full frames; secondary classifies the *crops* the
primary found (e.g., detect vehicle → classify make/color). Chaining them is how
DeepStream does cascaded inference efficiently on GPU.

→ Back to [section README](README.md) · Next section: **[03-low-latency-inference/](../03-low-latency-inference/README.md)**
