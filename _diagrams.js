/* Theme-aware SVG diagrams + section metadata, consumed by build.js.
 * SVGs use CSS classes (styled in _site.css) so they adapt to light/dark
 * and the per-section accent colour. No hard-coded colours here. */

/* ---- small helpers ---- */
function box(x, y, w, h, label, sub, cls){
  const r = 12;
  let t = '<rect class="'+(cls||'dg-box')+'" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+r+'"/>';
  const cx = x + w/2;
  if (sub){
    t += '<text class="dg-label" x="'+cx+'" y="'+(y+h/2-2)+'" text-anchor="middle">'+label+'</text>';
    t += '<text class="dg-sub" x="'+cx+'" y="'+(y+h/2+15)+'" text-anchor="middle">'+sub+'</text>';
  } else {
    t += '<text class="dg-label" x="'+cx+'" y="'+(y+h/2+5)+'" text-anchor="middle">'+label+'</text>';
  }
  return t;
}
function arrow(x1, y, x2){ // horizontal →
  return '<line class="dg-line" x1="'+x1+'" y1="'+y+'" x2="'+(x2-7)+'" y2="'+y+'"/>'+
         '<polygon class="dg-arrow" points="'+(x2-7)+','+(y-5)+' '+x2+','+y+' '+(x2-7)+','+(y+5)+'"/>';
}
function fig(svg, caption){
  return '<figure class="diagram"><svg viewBox="0 0 720 '+svg.h+'" role="img" aria-label="'+
    caption.replace(/"/g,"'")+'">'+svg.body+'</svg><figcaption>'+caption+'</figcaption></figure>';
}

/* ---- diagrams ---- */
const D = {};

// End-to-end pipeline (home + README)
D.pipeline = (()=>{
  const y=46,h=58; const labels=[
    ["Cameras","RTSP / WebRTC"],["Decode","NVDEC"],["Buffer","drop-oldest"],
    ["Inference","TensorRT"],["Logic","geometry"],["Output","events / DB"]];
  let b=""; const w=100, step=116, x0=18;
  labels.forEach((l,i)=>{ const x=x0+i*step; b+=box(x,y,w,h,l[0],l[1], i===3?'dg-box dg-hot':'dg-box');
    if(i<labels.length-1) b+=arrow(x+w, y+h/2, x+step); });
  return {h:140, body:b+
    '<text class="dg-sub" x="360" y="20" text-anchor="middle">the "last mile": a model running on live video, forever</text>'};
})();

// RTSP in / WebRTC out
D.protocols = {h:200, body:
  box(40,30,180,54,"IP Cameras","emit RTSP")+
  arrow(220,57,300)+
  box(300,20,120,140,"Your System","",'dg-box dg-hot')+
  '<text class="dg-sub" x="360" y="95" text-anchor="middle">decode ·</text>'+
  '<text class="dg-sub" x="360" y="112" text-anchor="middle">infer · serve</text>'+
  arrow(420,57,500)+
  box(500,30,180,54,"Browsers","via WebRTC")+
  '<text class="dg-sub" x="130" y="120" text-anchor="middle">pull · ~0.5–3s</text>'+
  '<text class="dg-sub" x="130" y="136" text-anchor="middle">rugged, standard</text>'+
  arrow(420,130,500)+
  '<text class="dg-sub" x="590" y="120" text-anchor="middle">push · &lt;500ms</text>'+
  '<text class="dg-sub" x="590" y="136" text-anchor="middle">low latency</text>'+
  box(500,150,180,30,"WebRTC out","",'dg-box')
};

// GOP: I P P B P ...
D.gop = (()=>{
  const types=["I","P","P","B","P","P","B","P","P","I"]; let b=""; const w=58,g=8,y=44,h=52,x0=18;
  types.forEach((t,i)=>{ const x=x0+i*(w+g);
    const cls = t==="I" ? 'dg-box dg-hot' : (t==="B" ? 'dg-box dg-soft' : 'dg-box');
    b+='<rect class="'+cls+'" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="10"/>';
    b+='<text class="dg-label" x="'+(x+w/2)+'" y="'+(y+h/2+6)+'" text-anchor="middle">'+t+'</text>'; });
  return {h:150, body:b+
    '<text class="dg-sub" x="18" y="28">one GOP →</text>'+
    '<text class="dg-sub" x="47" y="124" text-anchor="middle">keyframe</text>'+
    '<text class="dg-sub" x="360" y="124" text-anchor="middle">P = diff from previous</text>'+
    '<text class="dg-sub" x="640" y="124" text-anchor="middle">B = past+future</text>'+
    '<text class="dg-sub" x="360" y="142" text-anchor="middle">you can only START decoding at an I-frame</text>'};
})();

// Producer / bounded buffer / consumer
D.buffer = (()=>{
  let b="";
  b+=box(20,50,150,60,"Camera","30 fps");
  b+=arrow(170,80,250);
  // queue slots
  b+='<rect class="dg-box dg-hot" x="250" y="50" width="70" height="60" rx="10"/>';
  b+='<text class="dg-label" x="285" y="86" text-anchor="middle">▣</text>';
  b+='<rect class="dg-box dg-soft" x="324" y="50" width="70" height="60" rx="10"/>';
  b+='<text class="dg-sub" x="359" y="86" text-anchor="middle">dropped</text>';
  b+='<text class="dg-sub" x="322" y="38" text-anchor="middle">maxlen = 1 · keep latest</text>';
  b+=arrow(394,80,474);
  b+=box(474,50,150,60,"Model","22 fps",'dg-box');
  b+='<text class="dg-sub" x="549" y="135" text-anchor="middle">slower → would pile up</text>';
  b+='<text class="dg-sub" x="95" y="135" text-anchor="middle">producer</text>';
  return {h:160, body:b};
})();

// GStreamer pipeline of elements
D.gstreamer = (()=>{
  const els=[["rtspsrc","pull"],["depay","strip RTP"],["parse","frames"],["decoder","NVDEC"],["convert","NV12→BGR"],["appsink","→ Python"]];
  let b=""; const w=104,step=116,y=50,h=56,x0=14;
  els.forEach((e,i)=>{ const x=x0+i*step; b+=box(x,y,w,h,e[0],e[1], i===3?'dg-box dg-hot':'dg-box');
    if(i<els.length-1) b+='<text class="dg-accent-tx" x="'+(x+w+step-w)/1+'" y="0"></text>'+arrow(x+w,y+h/2,x+step); });
  return {h:140, body:b+
    '<text class="dg-sub" x="360" y="28" text-anchor="middle">elements linked by pads · each ! is a connection · queue = thread boundary</text>'};
})();

// DeepStream batching
D.deepstream = (()=>{
  let b="";
  for(let i=0;i<3;i++){ const y=30+i*44; b+=box(20,y,130,34,"cam "+(i+1),"",'dg-box');
    b+=arrow(150,y+17,210); }
  b+=box(210,40,110,80,"nvstreammux","batch=N",'dg-box dg-hot');
  b+=arrow(320,80,380);
  b+=box(380,40,120,80,"nvinfer","1 TRT call",'dg-box');
  b+=arrow(500,80,560);
  b+=box(560,40,140,80,"tracker","+ IDs",'dg-box');
  return {h:150, body:b+
    '<text class="dg-sub" x="360" y="142" text-anchor="middle">many cameras → ONE inference call = the multi-stream scaling trick</text>'};
})();

// Latency budget stacked bar
D.latency = (()=>{
  const segs=[["transport",150,'dg-fill1'],["decode",70,'dg-fill2'],["preprocess",90,'dg-fill3'],
    ["inference",260,'dg-fill4'],["post",60,'dg-fill2'],["logic",90,'dg-fill1']];
  const total=segs.reduce((a,s)=>a+s[1],0); const W=684, x0=18, y=60, h=46; let x=x0, b="";
  segs.forEach(s=>{ const w=W*s[1]/total;
    b+='<rect class="'+s[2]+'" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="4"/>';
    if(w>54) b+='<text class="dg-white-tx" x="'+(x+w/2)+'" y="'+(y+h/2+4)+'" text-anchor="middle">'+s[0]+'</text>';
    x+=w; });
  return {h:150, body:b+
    '<text class="dg-sub" x="18" y="44">latency = sum of every stage · attack the fattest slice</text>'+
    '<text class="dg-accent-tx" x="'+(x0+W*150/total+W*70/total+W*90/total+W*260/total/2)+'" y="135" text-anchor="middle">inference is usually the big one — measure p99, not average</text>'};
})();

// Fault-tolerance recovery loop
D.recovery = {h:210, body:
  box(250,20,220,46,"Stream running","",'dg-box dg-hot')+
  '<path class="dg-line" d="M470 43 C 600 43 620 120 470 150"/>'+
  '<polygon class="dg-arrow" points="478,145 466,152 470,138"/>'+
  box(250,150,220,44,"Detect failure","bus EOS / watchdog")+
  '<path class="dg-line" d="M250 172 C 110 172 100 90 230 50"/>'+
  '<polygon class="dg-arrow" points="222,44 236,46 226,58"/>'+
  '<text class="dg-sub" x="585" y="100" text-anchor="middle">camera drops /</text>'+
  '<text class="dg-sub" x="585" y="116" text-anchor="middle">freezes</text>'+
  '<text class="dg-sub" x="120" y="105" text-anchor="middle">reconnect:</text>'+
  '<text class="dg-sub" x="120" y="121" text-anchor="middle">backoff + jitter</text>'+
  '<text class="dg-sub" x="120" y="137" text-anchor="middle">wait for keyframe</text>'+
  '<text class="dg-sub" x="360" y="120" text-anchor="middle">isolated per camera · blast radius = 1</text>'
};

// GIL: threads / async / processes
D.gil = (()=>{
  let b=""; const cols=[
    ["Threads","decode + infer","GIL released in C\nnative parallelism",'dg-box dg-hot'],
    ["Async","many connections","one loop\ntiny overhead",'dg-box'],
    ["Processes","CPU-bound Python","true cores\nhard isolation",'dg-box']];
  const w=210,g=15,x0=20,y=40,h=110;
  cols.forEach((c,i)=>{ const x=x0+i*(w+g);
    b+='<rect class="'+c[3]+'" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="14"/>';
    b+='<text class="dg-label" x="'+(x+w/2)+'" y="'+(y+34)+'" text-anchor="middle">'+c[0]+'</text>';
    b+='<text class="dg-sub" x="'+(x+w/2)+'" y="'+(y+58)+'" text-anchor="middle">'+c[1]+'</text>';
    c[2].split("\n").forEach((ln,k)=> b+='<text class="dg-sub" x="'+(x+w/2)+'" y="'+(y+82+k*16)+'" text-anchor="middle">'+ln+'</text>'); });
  return {h:170, body:b+'<text class="dg-sub" x="360" y="24" text-anchor="middle">match the tool to where the time is spent</text>'};
})();

// IoU
D.iou = {h:210, body:
  '<rect class="dg-box" x="150" y="40" width="200" height="130" rx="8"/>'+
  '<rect class="dg-accent-soft" x="250" y="90" width="200" height="130" rx="8" stroke="none"/>'+
  '<rect class="dg-box dg-hot" x="250" y="90" width="100" height="80" rx="0" fill="none"/>'+
  '<rect x="150" y="40" width="200" height="130" rx="8" fill="none" class="dg-strokeA"/>'+
  '<rect x="250" y="90" width="200" height="130" rx="8" fill="none" class="dg-strokeB"/>'+
  '<text class="dg-sub" x="200" y="35" text-anchor="middle">box A</text>'+
  '<text class="dg-sub" x="500" y="235" text-anchor="middle">box B</text>'+
  '<text class="dg-label" x="300" y="135" text-anchor="middle">∩</text>'+
  '<text class="dg-sub" x="560" y="120">IoU =</text>'+
  '<text class="dg-sub" x="560" y="140">overlap</text>'+
  '<line class="dg-line" x1="558" y1="148" x2="640" y2="148"/>'+
  '<text class="dg-sub" x="560" y="166">union</text>'+
  '<text class="dg-sub" x="360" y="200" text-anchor="middle">drives NMS &amp; detection↔track matching</text>'
};

// Homography: square -> trapezoid
D.homography = {h:200, body:
  '<rect class="dg-box" x="60" y="50" width="120" height="120" rx="6"/>'+
  '<text class="dg-sub" x="120" y="40" text-anchor="middle">image plane</text>'+
  arrow(210,110,300)+
  '<text class="dg-accent-tx" x="255" y="98" text-anchor="middle">H</text>'+
  '<polygon class="dg-box" points="360,70 660,50 600,180 410,160"/>'+
  '<text class="dg-sub" x="520" y="40" text-anchor="middle">ground plane (bird\'s-eye)</text>'+
  '<text class="dg-sub" x="360" y="195" text-anchor="middle">4 point correspondences · maps detections to real-world floor coords</text>'
};

// Logic on detections: zone + line crossing
D.logic = {h:210, body:
  '<polygon class="dg-accent-soft" points="80,60 340,40 360,170 60,180" stroke="none"/>'+
  '<polygon points="80,60 340,40 360,170 60,180" fill="none" class="dg-strokeA"/>'+
  '<text class="dg-sub" x="200" y="110" text-anchor="middle">zone polygon</text>'+
  '<circle class="dg-accent" cx="210" cy="150" r="6"/>'+
  '<text class="dg-sub" x="210" y="180" text-anchor="middle">foot point</text>'+
  '<line class="dg-strokeB" x1="470" y1="30" x2="470" y2="180"/>'+
  '<text class="dg-sub" x="470" y="22" text-anchor="middle">count line</text>'+
  arrow(420,105,540)+
  '<text class="dg-sub" x="600" y="100" text-anchor="middle">cross →</text>'+
  '<text class="dg-sub" x="600" y="118" text-anchor="middle">count once per ID</text>'+
  '<text class="dg-sub" x="360" y="202" text-anchor="middle">geometry + stats on top of boxes = the JD\'s logic layer</text>'
};

const DIAGRAMS = {
  "README.md": ["pipeline","The journey of every frame, end to end"],
  "01-video-streaming/protocols-rtsp-webrtc.md": ["protocols","RTSP in from cameras, WebRTC out to browsers"],
  "01-video-streaming/codecs-and-frames.md": ["gop","A GOP: one keyframe (I) then diffs (P/B)"],
  "01-video-streaming/frame-buffers-backpressure.md": ["buffer","Bounded buffer: keep the newest frame, drop the rest"],
  "02-gstreamer/pipeline-model.md": ["gstreamer","A GStreamer pipeline: elements linked by pads"],
  "02-gstreamer/deepstream.md": ["deepstream","DeepStream batches many streams into one inference"],
  "03-low-latency-inference/latency-budget.md": ["latency","The latency budget — where the milliseconds go"],
  "04-fault-tolerance/recovery-patterns.md": ["recovery","The self-healing loop: detect → reconnect → resume"],
  "05-production-python/gil-threads-async-processes.md": ["gil","Three concurrency tools, three jobs"],
  "09-computer-vision-fundamentals/detection-tracking-math.md": ["iou","Intersection over Union"],
  "09-computer-vision-fundamentals/geometry-and-transforms.md": ["homography","A homography warps one plane onto another"],
  "09-computer-vision-fundamentals/logic-on-detections.md": ["logic","Turning boxes into business meaning"],
};

/* section metadata: icon (emoji), accent, soft tint, tagline */
const SECTIONS = {
  "Start here":               { icon:"🧭", accent:"#c45f3c", soft:"#f6e7df", tag:"Map your fit and how to use this pack" },
  "1 · Video Streaming":      { icon:"📡", accent:"#0e8f8f", soft:"#dcefee", tag:"RTSP, WebRTC, codecs, frame buffers" },
  "2 · GStreamer":            { icon:"🎬", accent:"#7c5cff", soft:"#e9e4ff", tag:"Pipelines, appsink, DeepStream" },
  "3 · Low-Latency Inference":{ icon:"⚡", accent:"#c98a00", soft:"#f7ecd0", tag:"TensorRT, quantization, batching" },
  "4 · Fault Tolerance":      { icon:"🛡️", accent:"#c4453c", soft:"#f7ddda", tag:"Crash-proof, self-healing systems" },
  "5 · Production Python":    { icon:"🐍", accent:"#2f6fb0", soft:"#dbe9f6", tag:"GIL, threads, async, memory" },
  "6 · System Design":        { icon:"🏗️", accent:"#2f9e6f", soft:"#d8f1e6", tag:"Design a crash-proof camera fleet" },
  "7 · Q&A Drill Bank":       { icon:"🎯", accent:"#b5468f", soft:"#f6dcef", tag:"Every \"why X over Y\", quiz-ready" },
  "8 · Mock Interview":       { icon:"🎤", accent:"#5a5fd0", soft:"#e1e2f7", tag:"Questions, model answers, rubric" },
  "9 · CV Fundamentals":      { icon:"👁️", accent:"#0d86b0", soft:"#d6edf6", tag:"OpenCV, geometry, detection math" },
};

module.exports = { D, DIAGRAMS, SECTIONS, fig };
