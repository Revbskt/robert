// reader.js

/* ---------------  Global State  --------------- */
let lastNonNightTheme = "light";
let currentBookUrl    = "";
let bookmarks         = [];
let xDown = null, yDown = null, swipeInProgress = false;
const SWIPE_THRESHOLD = 20;

let book, rendition;
let currentFontSize = parseInt(localStorage.getItem("reader-font-size")) || 100;
let currentFlow    = localStorage.getItem("reading-mode")   || "swipe";

/* ---------------  Kindle‑style Chapter/Page Helper  --------------- */
function updatePageLocation(loc) {
  const el = document.getElementById("page-location");
  if (!loc?.start?.cfi || !book) {
    el.textContent = "";
    return;
  }

  // Chapter = spine index + 1
  const spineLength = book.spine.length || "?";
  const chapIndex   = (loc.start.index || 0) + 1;

  // Page = locationFromCfi + 1
  let pageNum  = "?";
  let pageTotal = "?";
  if (book.locations?.length) {
    const idx = book.locations.locationFromCfi(loc.start.cfi);
    if (idx != null) pageNum = idx + 1;
    pageTotal = book.locations.length;
  }

  el.textContent = `Ch ${chapIndex}/${spineLength} Pg ${pageNum}/${pageTotal}`;
}

/* ---------------  Bookmark Helpers  --------------- */
function getBookmarkKey()    { return "bookmarks_" + currentBookUrl; }
function loadBookmarks()     {
  const stored = localStorage.getItem(getBookmarkKey());
  bookmarks = stored ? JSON.parse(stored) : [];
  updateBookmarkUI();
}
function saveBookmarks()     {
  localStorage.setItem(getBookmarkKey(), JSON.stringify(bookmarks));
  updateBookmarkUI();
}
function updateBookmarkStar(){
  const btn = document.getElementById("bookmark-toggle");
  const cfi = rendition?.currentLocation()?.start?.cfi;
  if (!cfi) return btn.textContent = "☆";
  const exists = bookmarks.some(bm => bm.cfi === cfi);
  btn.textContent = exists ? "★" : "☆";
  btn.style.color   = exists ? "blue" : "inherit";
}
function updateBookmarkUI(){
  const container = document.getElementById("bookmark-panel");
  container.innerHTML = "";
  const frag = document.createDocumentFragment();
  if (!bookmarks.length) {
    const empty = document.createElement("div");
    empty.textContent = "No bookmarks yet.";
    frag.appendChild(empty);
  } else {
    bookmarks.forEach(bm => {
      const item = document.createElement("div");
      item.textContent = `Page ${bm.page||"?"} – ${bm.snippet}`;
      item.onclick = () => { rendition.display(bm.cfi); toggleBookmarkDropdown(); };
      frag.appendChild(item);
    });
  }
  container.appendChild(frag);
}
function toggleBookmark(){
  const loc = rendition.currentLocation();
  if (!loc?.start?.cfi) return;
  const cfi = loc.start.cfi;
  const idx = bookmarks.findIndex(bm => bm.cfi===cfi);
  if (idx>-1) bookmarks.splice(idx,1);
  else {
    let snippet="";
    rendition.getContents().forEach(c => {
      const t = c.document.body?.textContent?.trim();
      if (t && !snippet) snippet = t.slice(0,100)+"…";
    });
    const pageNum = loc.start.index||"?";
    bookmarks.push({ cfi, snippet, page: pageNum });
  }
  saveBookmarks();
  updateBookmarkStar();
}
function toggleBookmarkDropdown(){
  document.getElementById("bookmark-panel").classList.toggle("open");
}

/* ---------------  Cleanup Event Listeners  --------------- */
function cleanupReader(){
  const viewer = document.getElementById("viewer");
  viewer.removeEventListener("touchstart", handleTouchStart);
  viewer.removeEventListener("touchend", handleTouchEnd);
  ["gesture-left","gesture-right"].forEach(id => {
    const el = document.getElementById(id);
    el.removeEventListener("click", swipePrev);
    el.removeEventListener("click", swipeNext);
  });
  ["tap-left","tap-right"].forEach(id => {
    const el = document.getElementById(id);
    el.removeEventListener("click", tapLeftHandler);
    el.removeEventListener("click", tapRightHandler);
  });
}

/* ---------------  Library Loader & Book Selection  --------------- */
function loadLibrary(){
  const lib = document.getElementById("library");
  lib.textContent = "Loading books…";
  fetch("/ebooks/library.json")
    .then(r=>r.json())
    .then(books=>{
      lib.innerHTML = "";
      books.forEach(b=>{
        const d=document.createElement("div");
        d.className="book";
        d.innerHTML=`
          <img src="${b.cover}" alt="Cover of ${b.title}"/>
          <h3>${b.title}</h3><p>${b.author}</p>
          <button onclick="readBook('${b.fileUrl}')">Read</button>
        `;
        lib.appendChild(d);
      });
    })
    .catch(e=>{
      console.error("Library load failed",e);
      lib.textContent="Failed to load books.";
    });
}
loadLibrary();

function readBook(epubUrl){
  if(rendition && currentBookUrl){
    const loc = rendition.currentLocation();
    if(loc?.start?.cfi) localStorage.setItem("last-location-"+currentBookUrl,loc.start.cfi);
  }
  cleanupReader();
  rendition?.destroy();
  book?.destroy();
  document.getElementById("reader-container").style.display="block";
  document.getElementById("library-container").style.display="none";

  localStorage.setItem("last-book", epubUrl);
  const p=new URLSearchParams(location.search);
  p.set("book", epubUrl);
  history.replaceState({}, "", "?"+p);

  initBook(epubUrl);
}

/* ---------------  Tap/Swipe  --------------- */
function tapLeftHandler(){ if(currentFlow==="paginated") rendition.prev(); }
function tapRightHandler(){ if(currentFlow==="paginated") rendition.next(); }

function updateSwipeListeners(){
  const viewer = document.getElementById("viewer");
  if(currentFlow==="swipe"){
    ["tap-left","tap-right"].forEach(id=>document.getElementById(id).style.pointerEvents="none");
    viewer.addEventListener("touchstart", handleTouchStart);
    viewer.addEventListener("touchend", handleTouchEnd);
    ["gesture-left","gesture-right"].forEach(id=>{
      const el=document.getElementById(id);
      el.style.pointerEvents="auto";
      el.addEventListener("click", id==="gesture-left"?swipePrev:swipeNext);
    });
  } else {
    viewer.removeEventListener("touchstart", handleTouchStart);
    viewer.removeEventListener("touchend", handleTouchEnd);
    ["gesture-left","gesture-right"].forEach(id=>{
      const el=document.getElementById(id);
      el.removeEventListener("click", swipePrev);
      el.removeEventListener("click", swipeNext);
      el.style.pointerEvents="none";
    });
    ["tap-left","tap-right"].forEach(id=>document.getElementById(id).style.pointerEvents="auto");
  }
}
function handleTouchStart(e){
  if(currentFlow!=="swipe")return;
  xDown=e.touches[0].clientX; yDown=e.touches[0].clientY;
}
function handleTouchEnd(e){
  if(currentFlow!=="swipe"||xDown===null||yDown===null)return;
  const xUp=e.changedTouches[0].clientX, yUp=e.changedTouches[0].clientY;
  const xDiff=xDown-xUp, yDiff=yDown-yUp;
  if(Math.abs(xDiff)>Math.abs(yDiff)&&Math.abs(xDiff)>SWIPE_THRESHOLD){
    xDiff>0?swipeNext():swipePrev();
  }
  xDown=yDown=null;
}
function swipeNext(){
  if(swipeInProgress)return;
  swipeInProgress=true;
  const v=document.getElementById("viewer");
  v.classList.add("swipe-transition");
  v.style.transform="translateX(-100%)";
  setTimeout(()=>{
    rendition.next();
    v.classList.remove("swipe-transition");
    v.style.transform="";
    swipeInProgress=false;
  },300);
}
function swipePrev(){
  if(swipeInProgress)return;
  swipeInProgress=true;
  const v=document.getElementById("viewer");
  v.classList.add("swipe-transition");
  v.style.transform="translateX(100%)";
  setTimeout(()=>{
    rendition.prev();
    v.classList.remove("swipe-transition");
    v.style.transform="";
    swipeInProgress=false;
  },300);
}

/* ---------------  Font Switcher  --------------- */
function applyFontSwitch(){
  const f=localStorage.getItem("reader-font")||"-apple-system";
  document.getElementById("font-switcher").value=f;
  if(!rendition)return;
  if(f==="OpenDyslexic"){
    const tpl=document.createElement("style");
    tpl.innerHTML=`
      @font-face{font-family:"OpenDyslexic";src:url("/fonts/OpenDyslexic-Regular.otf") format("opentype");}
      @font-face{font-family:"OpenDyslexic";src:url("/fonts/OpenDyslexic-Bold.otf") format("opentype");font-weight:bold;}
      body{font-family:"OpenDyslexic",sans-serif!important;}
    `;
    rendition.getContents().forEach(c=>{
      if(!c.document.getElementById("OpenDyslexicStyle")){
        const clone=tpl.cloneNode(true);
        clone.id="OpenDyslexicStyle";
        c.document.head.appendChild(clone);
      }
    });
  } else {
    rendition.themes.override("body",{"font-family":`${f},serif!important`});
    rendition.getContents().forEach(c=>{
      let st=c.document.getElementById("fontOverrideStyle");
      if(!st){
        st=c.document.createElement("style");
        st.id="fontOverrideStyle";
        c.document.head.appendChild(st);
      }
      st.textContent=`body{font-family:${f},serif!important;}`;
    });
  }
}
document.getElementById("font-switcher").addEventListener("change",e=>{
  localStorage.setItem("reader-font",e.target.value);
  applyFontSwitch();
});

/* ---------------  INIT & RENDITION  --------------- */
function initBook(url){
  if(!url)return;
  currentBookUrl=url;
  cleanupReader();
  rendition?.destroy();
  book?.destroy();
  bookmarks=[];
  book=ePub(url);
  registerReaderEvents();

  // generate locations first
  book.ready
    .then(()=>book.locations.generate(1600))
    .then(()=>{
      initRendition(currentFlow);

      // metadata
      book.loaded.metadata.then(m=>{
        document.getElementById("book-title").textContent=m.title||"Untitled";
        document.getElementById("book-author").textContent=m.creator||"";
      });
      // cover
      book.loaded.cover
        .then(src=>book.archive.createUrl(src,{base64:true}))
        .then(u=>document.getElementById("cover").src=u)
        .catch(()=>{});
      // TOC
      book.loaded.navigation.then(buildTOC);

      applyFontSwitch();
      loadBookmarks();
    });
}

function initRendition(flow){
  rendition=book.renderTo("viewer",{
    width:"100%",height:"100%",
    flow:flow==="scrolled-doc"?"scrolled":"paginated",
    snap:flow==="scrolled-doc"?false:true,
    spread:"always",direction:"ltr"
  });
  registerHooks();

  // display & then update location
  const saved=localStorage.getItem("last-location-"+currentBookUrl);
  const promise = saved?rendition.display(saved):rendition.display();
  promise.then(()=>{
    updatePageLocation(rendition.currentLocation());
  });

  // events
  rendition.on("relocated",loc=>{
    if(loc?.start?.cfi){
      localStorage.setItem("last-location-"+currentBookUrl,loc.start.cfi);
      updateBookmarkStar();
      updatePageLocation(loc);
    }
  });
  rendition.on("rendered",()=>{
    applyThemeStylesFromCurrent();
    applyFontSwitch();
    updateBookmarkStar();
    updatePageLocation(rendition.currentLocation());
  });

  updateSwipeListeners();
}

/* ---------------  Hooks & Events  --------------- */
function registerHooks(){
  rendition.hooks.content.register(c=>{
    const d=c.document;
    if(currentFlow==="scrolled-doc"){
      d.body.style.margin=d.documentElement.style.margin="0";
      d.body.style.padding=d.documentElement.style.padding="0";
      d.body.style.paddingBottom="30px";
      ["tap-left","tap-right"].forEach(id=>document.getElementById(id).style.pointerEvents="none");

      const sentinel=d.createElement("div");
      sentinel.style.width="100%";sentinel.style.height="1px";
      d.body.appendChild(sentinel);

      new IntersectionObserver(entries=>{
        const bar=document.getElementById("continue-bar");
        entries.forEach(e=>bar.style.display=e.isIntersecting?"block":"none");
      },{rootMargin:"0px 0px -30px 0px"}).observe(sentinel);
    } else {
      ["tap-left","tap-right"].forEach(id=>document.getElementById(id).style.pointerEvents="auto");
      d.body.style.paddingTop="20px";
      d.body.style.paddingBottom="30px";
    }
    rendition.themes.fontSize(currentFontSize+"%");
    document.getElementById("viewer").style.overflow="hidden";
    applyThemeStylesFromCurrent();
  });
}
function registerReaderEvents(){
  document.getElementById("tap-left").addEventListener("click",tapLeftHandler);
  document.getElementById("tap-right").addEventListener("click",tapRightHandler);
}

/* ---------------  Menus & Theme Switch  --------------- */
let openMenuType=null;
function toggleMenu(t){
  if(openMenuType===t){ closeMenus(); return; }
  closeMenus();
  if(t==="menu"){
    document.getElementById("expanded-menu").classList.add("open");
    document.getElementById("menu-backdrop").style.display="block";
  } else if(t==="settings"){
    document.getElementById("settings-modal").classList.add("open");
  }
  openMenuType=t;
}
function closeMenus(){
  document.getElementById("expanded-menu").classList.remove("open");
  document.getElementById("settings-modal").classList.remove("open");
  document.getElementById("menu-backdrop").style.display="none";
  openMenuType=null;
}

function applyThemeStylesFromCurrent(){
  if(!rendition)return;
  let bg="#fff",col="#000";
  if(document.body.classList.contains("night-mode")){ bg="#111";col="#eee"; }
  else if(document.body.classList.contains("sepia-mode")) bg="#f4ecd8";
  else if(document.body.classList.contains("matcha-mode")) bg="#C3D8B6";

  rendition.getContents().forEach(c=>{
    c.document.documentElement.style.background=bg;
    c.document.body.style.background=bg;
    c.document.body.style.color=col;
  });
}

/* ---------------  Toolbar Buttons  --------------- */
document.getElementById("menu-toggle").onclick   = ()=>{ closeMenus(); toggleMenu("menu"); };
document.getElementById("toc-toggle").onclick    = ()=>{ document.getElementById("toc-panel").classList.toggle("open"); };
document.getElementById("settings-toggle").onclick=()=>{ closeMenus(); toggleMenu("settings"); };
document.getElementById("theme-toggle").onclick  =()=>{ 
  closeMenus();
  if(document.body.classList.contains("night-mode")) changeTheme(lastNonNightTheme);
  else {
    lastNonNightTheme=document.getElementById("theme-select").value;
    changeTheme("night");
  }
};

document.getElementById("bookmark-toggle").onclick   = toggleBookmark;
document.getElementById("bookmark-dropdown").onclick = toggleBookmarkDropdown;

document.getElementById("reading-mode").onchange = e=>{
  const nm=e.target.value;
  localStorage.setItem("reading-mode",nm);
  currentFlow=nm;
  if(!rendition)return;
  const loc=localStorage.getItem("last-location-"+currentBookUrl);
  rendition.destroy();
  setTimeout(()=>initRendition(currentFlow,loc),50);
};
document.getElementById("theme-select").onchange = e=> changeTheme(e.target.value);

function changeFontSize(delta){
  currentFontSize=Math.max(60,Math.min(200,currentFontSize+delta*10));
  localStorage.setItem("reader-font-size",currentFontSize);
  rendition?.themes.fontSize(currentFontSize+"%");
}

function changeTheme(theme){
  document.body.className="";
  if(theme==="night")      document.body.classList.add("night-mode");
  else if(theme==="sepia") document.body.classList.add("sepia-mode");
  else if(theme==="matcha")document.body.classList.add("matcha-mode");
  else                      document.body.classList.add("light-mode");

  document.getElementById("theme-toggle").textContent = 
    document.body.classList.contains("night-mode") ? "☀️" : "🌙";
  localStorage.setItem("reader-theme",theme);
  document.getElementById("theme-select").value=theme;
  applyThemeStylesFromCurrent();
}

document.getElementById("continue-bar").onclick = ()=>{
  if(currentFlow!=="scrolled-doc"){
    rendition?.next(); return;
  }
  const loc=rendition.currentLocation();
  const idx=loc?.start?.index;
  if(idx!=null){
    const next=book.spine.get(idx+1);
    if(next) rendition.display(next.href);
  }
};

/* ---------------  Initial Boot  --------------- */
function toggleLibrary(force){
  const lib=document.getElementById("library-container");
  const rdr=document.getElementById("reader-container");
  const showLib = typeof force==="boolean" ? force : lib.style.display==="none";
  lib.style.display = showLib ? "block" : "none";
  rdr.style.display = showLib ? "none" : "block";
  closeMenus();
}

const params = new URLSearchParams(location.search);
const bp     = params.get("book");
const lb     = localStorage.getItem("last-book");
const start  = bp?decodeURIComponent(bp):lb;

toggleLibrary(!start);
if(start) initBook(start);

const savedTheme = localStorage.getItem("reader-theme")||"light";
changeTheme(savedTheme);
