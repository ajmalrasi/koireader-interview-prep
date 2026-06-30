/* Runtime app — no markdown engine, all content is pre-rendered in DATA. */
const PAGES = DATA.pages;
const byPath = {};
PAGES.forEach(p => byPath[p.path] = p);
let currentPath = null;

function resolvePath(curPath, href){
  if(href.charAt(0)==="#") return null;
  if(/\/$/.test(href)) href += "README.md";
  const base = curPath.split("/").slice(0,-1);
  href.split("/").forEach(p=>{
    if(p==="."||p==="") return;
    if(p==="..") base.pop(); else base.push(p);
  });
  return base.join("/");
}

function buildNav(){
  const nav=document.getElementById("nav");
  DATA.nav.forEach(sec=>{
    const wrap=document.createElement("div"); wrap.className="sec";
    const h=document.createElement("div"); h.className="sec-h";
    h.innerHTML='<span class="sec-ic">'+(sec.icon||"")+'</span> '+sec.label;
    h.style.setProperty("--card", sec.accent);
    wrap.appendChild(h);
    sec.items.forEach(it=>{
      const a=document.createElement("a");
      a.className="item"+(/README\.md$/.test(it.path)&&it.path.indexOf("/")>=0?" sub":"");
      a.textContent=it.title; a.href="#"+encodeURI(it.path);
      a.dataset.path=it.path;
      wrap.appendChild(a);
    });
    nav.appendChild(wrap);
  });
}

function setActive(path){
  document.querySelectorAll("nav a.item").forEach(a=>a.classList.toggle("active", a.dataset.path===path));
  const pg=byPath[path];
  document.getElementById("tbTitle").textContent = pg ? pg.title : "KoiReader Prep";
}

function renderPageTools(pg){
  const host=document.getElementById("pagetools");
  let html="";
  if(pg.quiz){
    html += '<div class="quizbar">'+
      '<button class="qbtn" id="hideAll">Quiz me · hide answers</button>'+
      '<button class="qbtn" id="showAll">Show all</button>'+
      '<span class="hint">Tap a question to reveal its answer.</span></div>';
  }
  if(pg.toc && pg.toc.length>=3){
    html += '<details class="toc"><summary>On this page</summary><ul>'+
      pg.toc.map(t=>'<li><a class="lvl'+t.level+'" data-anchor="'+t.id+'" href="#">'+t.text+'</a></li>').join("")+
      '</ul></details>';
  }
  host.innerHTML=html;
  if(pg.quiz){
    const set=open=>document.querySelectorAll("#content details.qa").forEach(d=>d.open=open);
    const hb=document.getElementById("hideAll"), sb=document.getElementById("showAll");
    if(hb) hb.onclick=()=>set(false);
    if(sb) sb.onclick=()=>set(true);
  }
}

function renderPager(path){
  const idx=PAGES.findIndex(p=>p.path===path);
  const pager=document.getElementById("pager");
  if(idx<0){ pager.innerHTML=""; return; }
  const prev=PAGES[idx-1], next=PAGES[idx+1];
  let html="";
  if(prev) html+='<a href="#'+encodeURI(prev.path)+'"><div class="lbl">← Previous</div><div class="ttl">'+prev.title+'</div></a>';
  else html+='<div class="spacer"></div>';
  if(next) html+='<a class="next" href="#'+encodeURI(next.path)+'"><div class="lbl">Next →</div><div class="ttl">'+next.title+'</div></a>';
  else html+='<div class="spacer"></div>';
  pager.innerHTML=html;
}

function loadPage(path){
  const pg=byPath[path];
  const content=document.getElementById("content");
  if(!pg){ content.innerHTML='<div class="loading">Page not found: '+path+'</div>'; document.getElementById("pagetools").innerHTML=""; document.getElementById("pager").innerHTML=""; return; }
  currentPath=path;
  setActive(path);
  // tint the page to its section accent
  const root=document.documentElement.style;
  if(pg.accent){ root.setProperty("--sec-accent", pg.accent); root.setProperty("--sec-accent-soft", pg.soft||pg.accent); }
  else { root.removeProperty("--sec-accent"); root.removeProperty("--sec-accent-soft"); }
  content.innerHTML=pg.html;
  renderPageTools(pg);
  renderPager(path);
  window.scrollTo(0,0);
  closeSidebar();
}

function go(path){ location.hash="#"+encodeURI(path); }
function onHash(){
  let raw=decodeURI(location.hash.replace(/^#/,""));
  loadPage(raw || "README.md");
}

// internal links + TOC anchors
document.addEventListener("click", e=>{
  const anchor=e.target.closest("a[data-anchor]");
  if(anchor){ e.preventDefault(); const el=document.getElementById(anchor.dataset.anchor); if(el) el.scrollIntoView({behavior:"smooth",block:"start"}); return; }
  const a=e.target.closest("a.mdlink");
  if(!a) return;
  e.preventDefault();
  const target=resolvePath(currentPath||"README.md", a.getAttribute("data-href"));
  if(target) go(target);
});

/* ---------------------------------- search --------------------------------- */
const searchBox=document.getElementById("search");
const panel=document.getElementById("searchpanel");
let selIndex=-1, results=[];

function escRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }
function snippet(text, q){
  const i=text.indexOf(q); if(i<0) return text.slice(0,120)+"…";
  const s=Math.max(0,i-50), e=Math.min(text.length,i+q.length+70);
  let frag=(s>0?"…":"")+text.slice(s,e)+(e<text.length?"…":"");
  return frag.replace(new RegExp(escRe(q),"ig"), m=>"<mark>"+m+"</mark>");
}
function runSearch(){
  const q=searchBox.value.trim().toLowerCase();
  if(q.length<2){ panel.classList.remove("show"); return; }
  results=PAGES.filter(p=>p.text.indexOf(q)>=0 || p.title.toLowerCase().indexOf(q)>=0).slice(0,40);
  selIndex=-1;
  if(!results.length){ panel.innerHTML='<div class="empty">No matches for “'+q+'”.</div>'; panel.classList.add("show"); return; }
  panel.innerHTML=results.map((p,k)=>
    '<a class="sr" data-k="'+k+'" data-path="'+p.path+'" href="#'+encodeURI(p.path)+'">'+
    '<div class="t">'+p.title+' <span style="color:var(--muted);font-weight:400">· '+p.section+'</span></div>'+
    '<div class="c">'+snippet(p.text,q)+'</div></a>').join("");
  panel.classList.add("show");
}
searchBox.addEventListener("input", runSearch);
searchBox.addEventListener("focus", ()=>{ if(searchBox.value.trim().length>=2) runSearch(); });
panel.addEventListener("click", e=>{ const r=e.target.closest(".sr"); if(r){ e.preventDefault(); go(r.dataset.path); closeSearch(); } });
function closeSearch(){ panel.classList.remove("show"); }
document.addEventListener("click", e=>{ if(!panel.contains(e.target) && e.target!==searchBox && !e.target.closest("#searchBtn")) closeSearch(); });
searchBox.addEventListener("keydown", e=>{
  if(!panel.classList.contains("show")) return;
  if(e.key==="ArrowDown"){ e.preventDefault(); selIndex=Math.min(results.length-1,selIndex+1); }
  else if(e.key==="ArrowUp"){ e.preventDefault(); selIndex=Math.max(0,selIndex-1); }
  else if(e.key==="Enter"){ e.preventDefault(); if(results[selIndex]){ go(results[selIndex].path); closeSearch(); searchBox.blur(); } return; }
  else if(e.key==="Escape"){ closeSearch(); searchBox.blur(); return; }
  panel.querySelectorAll(".sr").forEach((el,i)=>el.classList.toggle("sel", i===selIndex));
  const sel=panel.querySelector(".sr.sel"); if(sel) sel.scrollIntoView({block:"nearest"});
});

/* --------------------------------- theme ----------------------------------- */
function applyTheme(t){ document.documentElement.dataset.theme=t; try{localStorage.setItem("koi-theme",t);}catch(_){} }
function toggleTheme(){ applyTheme(document.documentElement.dataset.theme==="dark"?"light":"dark"); }
document.querySelectorAll(".theme-toggle").forEach(b=>b.addEventListener("click",toggleTheme));
(function(){ let t; try{t=localStorage.getItem("koi-theme");}catch(_){}
  if(!t) t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"; applyTheme(t); })();

/* ----------------------------- mobile drawer ------------------------------- */
const sidebar=document.getElementById("sidebar"), scrim=document.getElementById("scrim");
function openSidebar(){ sidebar.classList.add("open"); scrim.classList.add("show"); }
function closeSidebar(){ sidebar.classList.remove("open"); scrim.classList.remove("show"); }
document.getElementById("menu").addEventListener("click", openSidebar);
document.getElementById("searchBtn").addEventListener("click", ()=>{ openSidebar(); setTimeout(()=>searchBox.focus(),260); });
scrim.addEventListener("click", closeSidebar);
addEventListener("keydown", e=>{ if(e.key==="Escape") closeSidebar(); });

/* ----------------------------------- init ---------------------------------- */
buildNav();
window.addEventListener("hashchange", onHash);
onHash();
