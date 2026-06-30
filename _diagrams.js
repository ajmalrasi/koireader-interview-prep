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
  box(28,46,168,54,"IP Cameras","emit RTSP")+
  '<text class="dg-accent-tx" x="248" y="62" text-anchor="middle">RTSP</text>'+
  arrow(196,73,300)+
  '<rect class="dg-box dg-hot" x="300" y="36" width="132" height="92" rx="12"/>'+
  '<text class="dg-label" x="366" y="65" text-anchor="middle">Your System</text>'+
  '<text class="dg-sub" x="366" y="89" text-anchor="middle">decode · infer</text>'+
  '<text class="dg-sub" x="366" y="107" text-anchor="middle">· serve live</text>'+
  '<text class="dg-accent-tx" x="486" y="62" text-anchor="middle">WebRTC</text>'+
  arrow(432,73,540)+
  box(540,46,168,54,"Browsers","in-browser")+
  '<text class="dg-sub" x="360" y="160" text-anchor="middle">RTSP in — pull from cameras, ~0.5–3s, rugged &amp; standard</text>'+
  '<text class="dg-sub" x="360" y="180" text-anchor="middle">WebRTC / FastRTC out — push to browsers, &lt;500ms, low-latency</text>'
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

// RTSP handshake (sequence: client ↔ camera)
D.rtspHandshake = (()=>{
  const cx=150, sx=570; let b="";
  b+=box(58,16,184,42,"Your pipeline","(client)");
  b+=box(478,16,184,42,"IP camera","(server)");
  b+='<line class="dg-strokeB" x1="'+cx+'" y1="58" x2="'+cx+'" y2="316"/>';
  b+='<line class="dg-strokeB" x1="'+sx+'" y1="58" x2="'+sx+'" y2="316"/>';
  const msgs=[["OPTIONS","what can you do?"],["DESCRIBE  → SDP","codec · resolution"],
    ["SETUP","pick UDP or TCP transport"],["PLAY","start sending"]];
  let y=92;
  msgs.forEach(m=>{
    b+='<line class="dg-line" x1="'+cx+'" y1="'+y+'" x2="'+(sx-7)+'" y2="'+y+'"/>';
    b+='<polygon class="dg-arrow" points="'+(sx-7)+','+(y-5)+' '+sx+','+y+' '+(sx-7)+','+(y+5)+'"/>';
    b+='<text class="dg-accent-tx" x="360" y="'+(y-9)+'" text-anchor="middle">'+m[0]+'</text>';
    b+='<text class="dg-sub" x="360" y="'+(y+15)+'" text-anchor="middle">'+m[1]+'</text>';
    y+=50;
  });
  b+='<rect class="dg-hot" x="'+cx+'" y="'+(y-4)+'" width="'+(sx-cx)+'" height="36" rx="9"/>';
  b+='<text class="dg-label" x="360" y="'+(y+19)+'" text-anchor="middle">◀  RTP media + RTCP stats flow</text>';
  return {h:330, body:b+
    '<text class="dg-sub" x="360" y="322" text-anchor="middle">RTSP sets up the session · RTP carries the actual video</text>'};
})();

// WebRTC connection: four phases (vertical)
D.webrtcFlow = (()=>{
  const steps=[["1 · SIGNALING","SDP offer / answer — through a server you build"],
    ["2 · ICE","gather host / STUN / TURN candidates, find a path through NAT"],
    ["3 · DTLS","handshake exchanges the encryption keys"],
    ["4 · SRTP","encrypted media flows · congestion control · NACK / FEC"]];
  const x=120,w=480,h=58,gap=22; let y=20,b="";
  steps.forEach((s,i)=>{
    b+='<rect class="'+(i===3?'dg-box dg-hot':'dg-box')+'" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="12"/>';
    b+='<text class="dg-label" x="'+(x+20)+'" y="'+(y+25)+'">'+s[0]+'</text>';
    b+='<text class="dg-sub" x="'+(x+20)+'" y="'+(y+45)+'">'+s[1]+'</text>';
    if(i<steps.length-1){ const a=y+h,a2=y+h+gap;
      b+='<line class="dg-line" x1="360" y1="'+a+'" x2="360" y2="'+(a2-7)+'"/>';
      b+='<polygon class="dg-arrow" points="354,'+(a2-7)+' 366,'+(a2-7)+' 360,'+a2+'"/>'; }
    y+=h+gap;
  });
  return {h:y+6, body:b};
})();

// KoiReader path: RTSP in → process → fan-out
D.koiPath = (()=>{
  let b="";
  b+=box(12,72,118,60,"Cameras","RTSP, pull");
  b+='<text class="dg-accent-tx" x="170" y="92" text-anchor="middle">RTSP</text>'+arrow(130,102,212);
  b+=box(212,72,128,60,"GStreamer","rtspsrc · NVDEC");
  b+=arrow(340,102,392);
  b+='<rect class="dg-box dg-hot" x="392" y="72" width="138" height="60" rx="12"/>';
  b+='<text class="dg-label" x="461" y="98" text-anchor="middle">DeepStream</text>';
  b+='<text class="dg-sub" x="461" y="117" text-anchor="middle">infer · track</text>';
  b+='<text class="dg-accent-tx" x="566" y="92" text-anchor="middle">WebRTC</text>'+arrow(530,102,604);
  b+='<rect class="dg-box" x="560" y="36" width="150" height="132" rx="12"/>';
  b+='<text class="dg-label" x="635" y="58" text-anchor="middle">Deliver</text>';
  b+='<text class="dg-sub" x="635" y="84" text-anchor="middle">WebRTC · SFU</text>';
  b+='<text class="dg-sub" x="635" y="104" text-anchor="middle">FastRTC UI</text>';
  b+='<text class="dg-sub" x="635" y="124" text-anchor="middle">HLS (broadcast</text>';
  b+='<text class="dg-sub" x="635" y="142" text-anchor="middle">only)</text>';
  return {h:200, body:b+
    '<text class="dg-sub" x="300" y="186" text-anchor="middle">RTSP in  ·  GStreamer + DeepStream in the middle  ·  WebRTC out</text>'};
})();

// GStreamer: the "!" links a source pad to a sink pad
D.gstPads = (()=>{
  let b="";
  b+='<rect class="dg-box" x="96" y="54" width="190" height="64" rx="12"/>';
  b+='<text class="dg-label" x="191" y="90" text-anchor="middle">h264parse</text>';
  b+='<rect class="dg-accent-soft" x="278" y="74" width="22" height="24" rx="4"/>';
  b+='<text class="dg-sub" x="289" y="48" text-anchor="middle">src pad</text>';
  b+='<rect class="dg-box" x="434" y="54" width="190" height="64" rx="12"/>';
  b+='<text class="dg-label" x="529" y="90" text-anchor="middle">nvv4l2decoder</text>';
  b+='<rect class="dg-accent-soft" x="420" y="74" width="22" height="24" rx="4"/>';
  b+='<text class="dg-sub" x="431" y="48" text-anchor="middle">sink pad</text>';
  b+='<text class="dg-accent-tx" x="360" y="80" text-anchor="middle">!</text>';
  b+=arrow(300,98,420);
  return {h:150, body:b+
    '<text class="dg-sub" x="360" y="138" text-anchor="middle">"!" links one element\'s source pad (out) to the next element\'s sink pad (in)</text>'};
})();

// GStreamer: caps negotiation + capsfilter
D.gstCaps = (()=>{
  let b="";
  b+=box(34,58,150,58,"nvvidconv","");
  b+=arrow(184,87,250);
  b+='<rect class="dg-box dg-hot" x="250" y="62" width="220" height="50" rx="25"/>';
  b+='<text class="dg-label" x="360" y="92" text-anchor="middle">video/x-raw, format=BGR</text>';
  b+='<text class="dg-sub" x="360" y="48" text-anchor="middle">capsfilter — you pin the format</text>';
  b+=arrow(470,87,536);
  b+=box(536,58,150,58,"appsink","");
  return {h:150, body:b+
    '<text class="dg-sub" x="360" y="138" text-anchor="middle">pads negotiate a common format · empty intersection = "not-negotiated"</text>'};
})();

// GStreamer: tee branching
D.gstTee = (()=>{
  let b="";
  b+=box(14,86,150,52,"rtspsrc ! decode","");
  b+=arrow(164,112,214);
  b+='<rect class="dg-box dg-hot" x="214" y="86" width="64" height="52" rx="12"/>';
  b+='<text class="dg-label" x="246" y="117" text-anchor="middle">tee</text>';
  const branches=[["queue ! nvinfer","analytics",34],["queue ! splitmuxsink","record to disk",112],["queue ! webrtcbin","live to browser",190]];
  branches.forEach(br=>{
    const y=br[2]+18;
    b+='<path class="dg-line" d="M278 112 C 320 112 320 '+y+' 360 '+y+'"/>';
    b+='<polygon class="dg-arrow" points="353,'+(y-5)+' 360,'+y+' 353,'+(y+5)+'"/>';
    b+='<rect class="dg-box" x="364" y="'+br[2]+'" width="250" height="40" rx="10"/>';
    b+='<text class="dg-label" x="378" y="'+(br[2]+18)+'">'+br[0]+'</text>';
    b+='<text class="dg-sub" x="378" y="'+(br[2]+33)+'">'+br[1]+'</text>';
  });
  return {h:250, body:b+
    '<text class="dg-sub" x="300" y="242" text-anchor="middle">one stream → many consumers · a queue per branch so none stalls the others</text>'};
})();

// DeepStream full pipeline (cams → mux → infer → track → osd → out)
D.deepstreamFull = (()=>{
  let b="";
  for(let i=0;i<3;i++){ const y=34+i*42; b+='<rect class="dg-box" x="12" y="'+y+'" width="92" height="32" rx="8"/>';
    b+='<text class="dg-sub" x="58" y="'+(y+20)+'" text-anchor="middle">cam '+(i+1)+'</text>';
    b+=arrow(104,y+16,150); }
  b+='<rect class="dg-box dg-hot" x="150" y="44" width="96" height="84" rx="12"/>';
  b+='<text class="dg-label" x="198" y="80" text-anchor="middle">stream</text>';
  b+='<text class="dg-label" x="198" y="98" text-anchor="middle">mux</text>';
  b+='<text class="dg-sub" x="198" y="118" text-anchor="middle">batch=N</text>';
  const stages=[["nvinfer","TRT",256],["nvtracker","+ IDs",360],["nvdsosd","overlay",464]];
  stages.forEach(s=>{ b+=arrow(s[2]-10,86,s[2]);
    b+='<rect class="dg-box" x="'+s[2]+'" y="56" width="92" height="60" rx="11"/>';
    b+='<text class="dg-label" x="'+(s[2]+46)+'" y="82" text-anchor="middle">'+s[0]+'</text>';
    b+='<text class="dg-sub" x="'+(s[2]+46)+'" y="100" text-anchor="middle">'+s[1]+'</text>'; });
  b+=arrow(556,86,566);
  b+='<rect class="dg-box" x="566" y="56" width="140" height="60" rx="11"/>';
  b+='<text class="dg-label" x="636" y="82" text-anchor="middle">encode →</text>';
  b+='<text class="dg-sub" x="636" y="100" text-anchor="middle">RTSP / WebRTC out</text>';
  return {h:175, body:b+
    '<text class="dg-sub" x="360" y="160" text-anchor="middle">many cameras batched into ONE inference call = the multi-stream scaling trick</text>'};
})();

// DeepStream metadata hierarchy (nested boxes)
D.dsMeta = (()=>{
  let b="";
  const layers=[["NvDsBatchMeta","the whole batch",40,18,560,200,"dg-box"],
    ["NvDsFrameMeta","one frame · source_id, frame_num",72,56,496,150,"dg-box"],
    ["NvDsObjectMeta","one detection · bbox, class, conf, track id",104,94,432,100,"dg-box dg-hot"],
    ["NvDsClassifierMeta","secondary-GIE labels on that object",136,132,368,48,"dg-box"]];
  layers.forEach(l=>{
    b+='<rect class="'+l[6]+'" x="'+l[2]+'" y="'+l[3]+'" width="'+l[4]+'" height="'+l[5]+'" rx="11"/>';
    b+='<text class="dg-label" x="'+(l[2]+16)+'" y="'+(l[3]+22)+'">'+l[0]+'</text>';
    b+='<text class="dg-sub" x="'+(l[2]+16)+'" y="'+(l[3]+40)+'">'+l[1]+'</text>';
  });
  return {h:236, body:b+
    '<text class="dg-sub" x="360" y="230" text-anchor="middle">walk this in a pad probe — read metadata, never copy the pixels</text>'};
})();

// appsink: the "latest frame" tap into Python
D.appsink = (()=>{
  let b="";
  b+=box(12,60,150,58,"… decode ! convert","");
  b+=arrow(162,89,224);
  b+='<rect class="dg-box dg-hot" x="224" y="60" width="160" height="58" rx="12"/>';
  b+='<text class="dg-label" x="304" y="84" text-anchor="middle">appsink</text>';
  b+='<text class="dg-sub" x="304" y="103" text-anchor="middle">max-buffers=1 drop=true</text>';
  b+='<text class="dg-accent-tx" x="446" y="82" text-anchor="middle">numpy</text>';
  b+=arrow(384,89,508);
  b+=box(508,60,150,58,"your model","infer");
  b+='<text class="dg-sub" x="304" y="142" text-anchor="middle">drops stale frames under load → bounded memory, minimal lag</text>';
  return {h:160, body:b};
})();

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

/* section metadata: icon (emoji), accent, tagline.
 * Accents are mid-tones chosen to read on BOTH the cream light bg and the dark bg.
 * Tinted backgrounds are generated translucently at runtime (see _app.js), so they
 * never become white-on-white in dark mode. */
const SECTIONS = {
  "Start here":               { icon:"🧭", accent:"#d4663f", tag:"Map your fit and how to use this pack" },
  "1 · Video Streaming":      { icon:"📡", accent:"#14a3a3", tag:"RTSP, WebRTC, codecs, frame buffers" },
  "2 · GStreamer":            { icon:"🎬", accent:"#8b6dff", tag:"Pipelines, appsink, DeepStream" },
  "3 · Low-Latency Inference":{ icon:"⚡", accent:"#d39a1f", tag:"TensorRT, quantization, batching" },
  "4 · Fault Tolerance":      { icon:"🛡️", accent:"#dd5b54", tag:"Crash-proof, self-healing systems" },
  "5 · Production Python":    { icon:"🐍", accent:"#4a8bd1", tag:"GIL, threads, async, memory" },
  "6 · System Design":        { icon:"🏗️", accent:"#34ad7c", tag:"Design a crash-proof camera fleet" },
  "7 · Q&A Drill Bank":       { icon:"🎯", accent:"#cc5fab", tag:"Every \"why X over Y\", quiz-ready" },
  "8 · Mock Interview":       { icon:"🎤", accent:"#7479e6", tag:"Questions, model answers, rubric" },
  "9 · CV Fundamentals":      { icon:"👁️", accent:"#19a4d1", tag:"OpenCV, geometry, detection math" },
  "10 · Coding Practice":     { icon:"💻", accent:"#b5651d", tag:"Runnable OpenCV problems for the proctored round" },
};

module.exports = { D, DIAGRAMS, SECTIONS, fig };
