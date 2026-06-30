# RTSP vs WebRTC vs FastRTC

**TL;DR:** RTSP is how IP cameras stream (pull, RTP over UDP/TCP, ~0.5–3s latency).
WebRTC is how browsers stream peer-to-peer (push, sub-500ms, NAT-traversing,
encrypted by default). FastRTC is a thin Python wrapper that makes WebRTC easy to
wire to ML code. KoiReader ingests cameras (**RTSP in**) and serves live results to
browsers/operators/agents (**WebRTC/FastRTC out**). This page is the one to know
cold — the JD is "obsess over milliseconds," and these three protocols *are* the
millisecond budget at the edges of the pipeline. The middle (GStreamer + DeepStream)
is sections 02–03.

## The mental model

Think of it like plumbing. **RTSP** is the industrial pipe bolted to a factory
camera — rugged, standard, slightly slow. **WebRTC** is the flexible hose that
snakes through any firewall to reach a browser, designed for real-time calls.
**FastRTC** is the quick-connect fitting so you don't hand-thread the hose.

One sentence that frames the whole page: **all three carry media over RTP.** RTSP
*sets up* an RTP session and lets a camera push it to you; WebRTC *negotiates and
encrypts* an RTP session between peers across NAT; FastRTC *generates* the WebRTC
half in Python so your model sees numpy frames. Underneath, it's the same real-time
transport — they differ in **how the session is established, how it traverses the
network, and who's allowed to talk to whom.**

---

## RTSP (Real-Time Streaming Protocol)

**What it is.** A *control* protocol — the "VCR remote": `OPTIONS`, `DESCRIBE`,
`SETUP`, `PLAY`, `PAUSE`, `TEARDOWN`. RTSP itself carries **no video**. It
negotiates *how* the media will flow, then the actual frames ride on **RTP**, with
quality/timing feedback on **RTCP**. Think of RTSP as the phone call that arranges
the delivery, and RTP as the truck that shows up.

**The handshake (worth knowing line-by-line for interviews):**

```fig:rtspHandshake
RTSP handshake: the client sets up the session, then RTP delivers the video
```

After `PLAY`, media flows as RTP and stats as RTCP; periodic keepalives
(`GET_PARAMETER`/`OPTIONS`) hold the session open until `TEARDOWN`.

**Pattern:** *Pull.* Your pipeline dials out to
`rtsp://user:pass@cam-ip:554/stream`. Port **554** is the RTSP control channel.
Note the camera is the *server*; you are the *client*. That matters for firewalls:
**you** initiate, so outbound rules are usually enough.

**Transport choice (the classic interview fork):**

| Mode | How | Latency | Loss behavior | When |
|---|---|---|---|---|
| **RTP/UDP** | media on its own UDP ports | lowest | drops → tearing/artifacts, but never stalls | clean LAN, latency-critical |
| **RTP/TCP (interleaved)** | media multiplexed *inside* the RTSP TCP connection (`$` channel framing) | slightly higher | reliable, retransmits, survives loss | flaky factory WiFi, NAT/firewall, **most production multi-cam** |
| **RTP/UDP multicast** | one stream, many subscribers | low | shared | many viewers, controlled network |

In GStreamer you pin this with `protocols=tcp` on `rtspsrc`. Default behavior tries
UDP first and falls back to TCP — which you usually want to make *deterministic* in
production by forcing one.

**RTP — what's actually in the packets.** Each RTP packet has a header with a
**sequence number** (detect loss/reordering), a **timestamp** (drive playback
timing, derived from a 90 kHz clock for video), an **SSRC** (which source), and a
**payload type** (which codec). An H.264 keyframe is too big for one packet, so it's
**fragmented (FU-A)** across many RTP packets; the depayloader (`rtph264depay`)
reassembles them using the sequence numbers and the marker bit.

**RTCP — the feedback channel.** Sender Reports and Receiver Reports carry
packet-loss %, jitter, and round-trip estimates. This is also how a sender knows to
back off, and how clock sync (lip-sync between audio/video) is maintained.

**The jitter buffer.** Packets arrive unevenly. A small buffer (e.g.
`rtspsrc latency=200`) holds frames briefly to absorb jitter and reorder before
decode. **This knob is a direct latency-vs-smoothness trade** — lower = less delay
but more visible glitches under loss. Expect to be asked to reason about it.

**Latency:** ~500ms–3s end to end, dominated by camera-side encoder buffering, GOP
size, and your jitter buffer. (GOP/keyframe interval is covered in
[codecs-and-frames.md](codecs-and-frames.md) — long GOP = more latency + worse
recovery from loss.)

**Auth & discovery.** RTSP auth is usually **Digest** (sometimes Basic) over the
URL. Cameras are typically discovered/configured via **ONVIF** (a SOAP/WS standard)
which then hands you the RTSP URL. Good detail to drop: "I'd pull the RTSP URI via
ONVIF rather than hardcode vendor-specific paths."

**This is what ~95% of CCTV/industrial cameras speak.** KoiReader's "multiple RTSP
streams" requirement lives entirely here.

```bash
# Inspect any camera before you build a pipeline:
ffprobe -rtsp_transport tcp rtsp://user:pass@cam-ip:554/stream
# A GStreamer RTSP source (more in section 02):
rtspsrc location=rtsp://... protocols=tcp latency=200 ! rtph264depay ! h264parse ! ...
```

---

## WebRTC

**What it is.** A *full* real-time media stack built for **browsers and peers**.
Where RTSP just sets up RTP, WebRTC bundles everything you need to get encrypted
media across the hostile public internet with no plugins: NAT traversal, key
exchange, encryption, congestion control, and recovery. It's the only one of the
three a browser can speak natively (`RTCPeerConnection`).

**The four phases of a connection** (memorize this arc — it's the most common
WebRTC interview question):

```fig:webrtcFlow
The four phases of every WebRTC connection — signaling is the part you build
```

Signaling (the SDP offer/answer exchange) is the one piece WebRTC leaves to you —
a WebSocket is the usual choice. The rest (ICE, DTLS, SRTP) the stack handles.

**SDP offer/answer.** The offer is a text blob describing "here are my codecs
(H.264/VP8/VP9/AV1/Opus), resolutions, ICE credentials, DTLS fingerprint." The
answer says "here's what I'll accept." You shuttle these two blobs through your
**signaling server** — that's the part you own and the part WebRTC deliberately
leaves undefined (use a WebSocket).

**ICE / STUN / TURN — the NAT-traversal trio (know what each does):**

- **ICE** is the *framework* that tries connection candidates in priority order
  until one works.
- **STUN** is a cheap reflection service: "what's my public IP:port as seen from
  outside?" Lets two peers behind NAT find a *direct* path. Works for most networks.
- **TURN** is a *relay* of last resort: when both peers are behind symmetric NAT and
  can't connect directly, media bounces through the TURN server. It costs bandwidth
  and money, but it's why WebRTC "always connects." **In an enterprise/factory
  network, plan for TURN** — that's a senior-sounding point to raise.

**Congestion control.** WebRTC adapts bitrate in real time (Google Congestion
Control, driven by TWCC/REMB feedback). Under a bad link it lowers resolution/bitrate
to protect latency rather than buffering. This is the philosophical opposite of
HLS: WebRTC sacrifices quality to stay live; HLS buffers to stay pretty.

**One-to-many: you need a media server.** Raw WebRTC is peer-to-peer (1:1). To fan
one annotated feed out to many operators you put an **SFU** (Selective Forwarding
Unit — e.g. mediasoup, Janus, LiveKit, Pion) in the middle: each sender uploads
once, the SFU forwards to N viewers. Don't try to mesh N peers. Naming an SFU
signals you've actually shipped this.

**Data channels.** WebRTC also gives you `RTCDataChannel` (SCTP over DTLS) — handy
for shipping **detection metadata / bounding boxes alongside the video** to the same
browser with the same low latency. Nice for an annotated operator UI.

**Latency:** typically **100–500ms** — the lowest of the three, end to end.

**Why a vision team cares:** serving a live annotated feed to a dashboard, a
human-in-the-loop reviewer, a remote operator, or an agent — all in-browser, no
install, sub-second.

**Cost / honesty:** many moving parts (signaling server, STUN, TURN relays, possibly
an SFU). More to operate than "point ffmpeg at a URL." That's the trade for browser
reach + lowest latency.

---

## FastRTC

**What it is.** A Python library (from the Gradio / Hugging Face ecosystem) that
wraps WebRTC so you can stream audio/video **to and from Python ML code in a few
lines.** It stands up the signaling, builds the peer connection, runs the ICE/DTLS
dance for you, and hands your code **frames as numpy arrays** — then takes your
processed frame back and sends it out over WebRTC.

**The programming model** (this is the bit that makes it click):

```python
# Conceptually: you write a handler that gets a frame and returns a frame.
from fastrtc import Stream

def detect(frame):            # frame: HxWx3 numpy array (BGR/RGB)
    boxes = model(frame)      # your DeepStream/YOLO/whatever inference
    return draw(frame, boxes) # annotated frame goes back out over WebRTC

Stream(handler=detect, modality="video").ui.launch()
```

You never touch SDP, ICE, or SRTP. FastRTC is to WebRTC what `requests` is to raw
sockets — it collapses the boilerplate so the interesting code is the model loop.

**Under the hood** it builds on `aiortc` (the pure-Python WebRTC implementation) and
typically uses Hugging Face's infra for the STUN/TURN/signaling so it "just works"
from a notebook or a Spaces demo.

**Why it's in the JD.** It signals they want someone who can stand up a real-time
**WebRTC ↔ model** loop *quickly* — for browser-facing demos, operator UIs, and
agent-in-the-loop review — without hand-rolling the WebRTC stack. It's the modern
Python-native path to the same place a custom `webrtcbin` pipeline would get you.

**Honest, senior framing for the interview:**
> "I've built real-time inference serving with Gunicorn/Celery/Kafka and
> GStreamer/DeepStream pipelines. FastRTC is the Python-native way to wire a live
> WebRTC feed straight into a model and get numpy frames — I'd reach for it for
> browser-facing low-latency demos and operator UIs. For high-density,
> hardware-accelerated production fan-out I'd still drop to GStreamer `webrtcbin`
> or an SFU, but FastRTC gets a working loop up in an afternoon."

**Limits to be aware of (so you're not oversold):** it's pure-Python WebRTC
(`aiortc`), so it's great for prototypes, demos, and modest concurrency, but it's
**not** the path for hundreds of hardware-decoded streams — that's GStreamer +
NVDEC + DeepStream territory. Know which side of that line a given problem is on.

---

## How they fit together — the KoiReader path

```fig:koiPath
RTSP in from cameras, GStreamer + DeepStream in the middle, WebRTC out to people
```

**RTSP in, WebRTC out** is the headline. The same RTP machinery runs end to end;
GStreamer is the universal adapter in the middle — `rtspsrc` on the ingress,
`webrtcbin` on the egress — which is exactly why GStreamer + DeepStream are the
*core* job and these protocols are the edges of it.

---

## Why X over Y (interview gold)

**RTSP vs WebRTC — when each?**
RTSP to *ingest from cameras* (that's what they emit; you're the client pulling).
WebRTC to *deliver to browsers/peers/agents* with the lowest latency. A real system
uses **both**: RTSP in, WebRTC out. They are not competitors — they live at opposite
ends of the pipe.

**Why not just HTTP (HLS/DASH) for delivery?**
HLS/DASH chunk video into segments (and a playlist) → typically **6–30s** latency
(low-latency HLS claws it down to ~2–5s but still loses to WebRTC). Brilliant for
Netflix-style scale and CDN caching, **wrong for interactive/real-time**. Rule of
thumb: **HLS = broadcast, WebRTC = conversation.** If a human needs to *act* on what
they see, WebRTC.

**UDP vs TCP for RTSP?**
UDP = lowest latency, tolerates loss (rather skip a frame than wait). TCP = reliable,
survives bad networks, what you pick when stability > a few ms. Many cameras over
flaky factory WiFi → **force TCP** for determinism.

**Why does RTSP need a keepalive?**
RTSP sessions time out. You send periodic `GET_PARAMETER`/`OPTIONS` (or rely on RTCP)
to keep the session alive, else the camera tears it down and you must reconnect —
which ties directly into [fault tolerance](../04-fault-tolerance/README.md)
(reconnect with backoff, watchdog on the stream).

**What actually drives the latency number?**
Camera encoder buffer + **GOP/keyframe interval** + network + **jitter buffer** +
decode + your processing. You rarely change the camera; the levers you own are the
jitter buffer size, forcing TCP vs UDP, GOP request (if the camera honors it), and
not stacking redundant queues in your own pipeline.

**WebRTC connection fails — what do you check?**
Signaling reachable? STUN returning a reflexive candidate? Is a **TURN** server
configured for symmetric-NAT cases? DTLS handshake completing? This sequence (the
four phases above) is the debugging map.

**Why is WebRTC encrypted and RTSP often not?**
WebRTC mandates DTLS-SRTP — encryption is non-optional. RTSP/RTP is frequently
plaintext on a trusted camera LAN (RTSPS/SRTP exist but are less common). Security
posture differs because their threat models differ: WebRTC crosses the public
internet to a browser; camera RTSP usually doesn't leave the VLAN.

---

## 30-second whiteboard summary

> Cameras speak **RTSP** — a control protocol that sets up an **RTP** media session;
> I pull it over **TCP** in production for stability, with a small jitter buffer,
> ~1s latency. To deliver live annotated results to a browser I use **WebRTC**:
> SDP offer/answer over my own signaling server, **ICE/STUN/TURN** to cross NAT,
> **DTLS-SRTP** for encryption, ~200ms. For one-to-many I put an **SFU** in front.
> **FastRTC** is the fast Python path to that WebRTC loop when I want numpy frames
> into a model without writing the stack. The whole thing is **RTSP in, WebRTC out**,
> with GStreamer/DeepStream doing the work in the middle.

→ Next: **[codecs-and-frames.md](codecs-and-frames.md)**
