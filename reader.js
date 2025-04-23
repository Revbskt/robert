// reader.js

// === START GLOBAL VARIABLES ===
let lastNonNightTheme = "light";
let currentBookUrl = "";
let bookmarks = [];
let xDown = null;
let yDown = null;
const SWIPE_THRESHOLD = 20;  // swipe threshold in pixels
let swipeInProgress = false;
let book, rendition;
let currentFontSize = parseInt(localStorage.getItem("reader-font-size")) || 100;
let currentFlow = localStorage.getItem("reading-mode") || "swipe";
// === END GLOBAL VARIABLES ===

// === START TAP HANDLERS & CLEANUP ===
function tapLeftHandler() {
  if (currentFlow === "paginated" && rendition) rendition.prev();
}
function tapRightHandler() {
  if (currentFlow === "paginated" && rendition) rendition.next();
}
function cleanupReader() {
  const viewer = document.getElementById("viewer");
  if (viewer) {
    viewer.removeEventListener("touchstart", handleTouchStart, false);
    viewer.removeEventListener("touchend", handleTouchEnd, false);
  }
  ["gesture-left","gesture-right"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.removeEventListener("click", id==="gesture-left" ? swipePrev : swipeNext);
  });
  ["tap-left","tap-right"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.removeEventListener("click", id==="tap-left" ? tapLeftHandler : tapRightHandler);
  });
}
// === END TAP HANDLERS & CLEANUP ===

// === START READER EVENTS ===
function registerReaderEvents() {
  document.getElementById("tap-left").addEventListener("click", tapLeftHandler);
  document.getElementById("tap-right").addEventListener("click", tapRightHandler);
}
// === END READER EVENTS ===

// === START BOOKMARK HELPERS ===
function getBookmarkKey() { return "bookmarks_" + currentBookUrl; }
function loadBookmarks() {
  const stored = localStorage.getItem(getBookmarkKey());
  bookmarks = stored ? JSON.parse(stored) : [];
  updateBookmarkUI();
}
function saveBookmarks() {
  localStorage.setItem(getBookmarkKey(), JSON.stringify(bookmarks));
  updateBookmarkUI();
}
function updateBookmarkStar() {
  const btn = document.getElementById("bookmark-toggle");
  const cfi = rendition && rendition.currentLocation()?.start?.cfi;
  if (!cfi) { btn.textContent = "☆"; return; }
  const exists = bookmarks.some(bm => bm.cfi === cfi);
  btn.textContent = exists ? "★" : "☆";
  btn.style.color = exists ? "blue" : "inherit";
}
function updateBookmarkUI() {
  const container = document.getElementById("bookmark-panel");
  container.innerHTML = "";
  const frag = document.createDocumentFragment();
  if (bookmarks.length === 0) {
    const div = document.createElement("div");
    div.textContent = "No bookmarks yet.";
    frag.appendChild(div);
  } else {
    bookmarks.forEach(bm => {
      const div = document.createElement("div");
      div.textContent = `Page ${bm.page || "?"} - ${bm.snippet}`;
      div.addEventListener("click", () => {
        rendition.display(bm.cfi);
        toggleBookmarkDropdown();
      });
      frag.appendChild(div);
    });
  }
  container.appendChild(frag);
}
function toggleBookmark() {
  const loc = rendition.currentLocation();
  if (!loc?.start?.cfi) return;
  const cfi = loc.start.cfi;
  const idx = bookmarks.findIndex(bm => bm.cfi === cfi);
  if (idx !== -1) bookmarks.splice(idx, 1);
  else {
    let snippet = "";
    rendition.getContents().forEach(contents => {
      const doc = contents.document;
      if (!snippet && doc?.body?.textContent) {
        snippet = doc.body.textContent.trim().substring(0,100) + "...";
      }
    });
    bookmarks.push({ cfi, snippet, page: loc.start.index || "?" });
  }
  saveBookmarks();
  updateBookmarkStar();
}
function toggleBookmarkDropdown() {
  document.getElementById("bookmark-panel").classList.toggle("open");
}
// === END BOOKMARK HELPERS ===

// === START PAGE NAV INFO ===
function updateNavInfo() {
  const loc = rendition.currentLocation();
  let pageNum = "?", total = "?";
  if (loc && book.locations && typeof book.locations.length === "function") {
    const idx = loc.start.location ?? loc.start.index ?? 0;
    pageNum = idx + 1;
    total = book.locations.length();
  }
  document.getElementById("nav-page-num").textContent = `${pageNum} of ${total}`;
}
// === END PAGE NAV INFO ===

// === START LIBRARY & URL HANDLING ===
const urlParams = new URLSearchParams(window.location.search);
const bookParam = urlParams.get("book");
const lastSavedBook = localStorage.getItem("last-book");
let theBookUrl = bookParam ? decodeURIComponent(bookParam) : (lastSavedBook || null);
const libraryContainer = document.getElementById("library-container");
const readerContainer = document.getElementById("reader-container");
if (theBookUrl) {
  readerContainer.style.display = "block";
  libraryContainer.style.display = "none";
} else {
  readerContainer.style.display = "none";
  libraryContainer.style.display = "block";
}
let libraryVisible = !theBookUrl;
function toggleLibrary(force) {
  libraryVisible = typeof force === "boolean" ? force : !libraryVisible;
  libraryContainer.style.display = libraryVisible ? "block" : "none";
  readerContainer.style.display = libraryVisible ? "none" : "block";
  closeMenus();
}
function loadLibrary() {
  const div = document.getElementById("library");
  div.textContent = "Loading books...";
  fetch("/ebooks/library.json")
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(books => {
      div.innerHTML = "";
      books.forEach(bk => {
        const b = document.createElement("div");
        b.className = "book";
        b.innerHTML = `
          <img src="${bk.cover}" alt="Cover of ${bk.title}" />
          <h3>${bk.title}</h3>
          <p>${bk.author}</p>
          <button onclick="readBook('${bk.fileUrl}')">Read</button>
        `;
        div.appendChild(b);
      });
    })
    .catch(err => {
      console.error("Failed to load library.json:", err);
      div.textContent = "Failed to load book list.";
    });
}
loadLibrary();
function readBook(epubUrl) {
  if (rendition && currentBookUrl) {
    const loc = rendition.currentLocation();
    if (loc?.start?.cfi) {
      localStorage.setItem("last-location-" + currentBookUrl, loc.start.cfi);
    }
  }
  cleanupReader();
  localStorage.setItem("last-book", epubUrl);
  const ns = new URLSearchParams(window.location.search);
  ns.set("book", epubUrl);
  window.history.replaceState({}, "", `?${ns.toString()}`);
  initBook(epubUrl);
  toggleLibrary(false);
}
// === END LIBRARY & URL HANDLING ===

// === START READER INITIALIZATION & RENDITION ===
function initBook(chosenUrl) {
  if (!chosenUrl) return;
  currentBookUrl = chosenUrl;
  bookmarks = [];
  rendition?.destroy();
  book?.destroy();
  book = ePub(chosenUrl);
  registerReaderEvents();
  book.ready.then(() => {
    initRendition(currentFlow);
    setTimeout(() => book.locations.generate(1600), 100);
    book.loaded.metadata.then(meta => {
      document.getElementById("book-title").textContent = meta.title || "Untitled";
      document.getElementById("book-author").textContent = meta.creator || "";
    });
    book.loaded.cover
      .then(url => book.archive.createUrl(url, { base64: true }))
      .then(dataUrl => {
        document.getElementById("cover").src = dataUrl;
      })
      .catch(() => console.warn("No cover image found."));
    book.loaded.navigation.then(nav => {
      const toc = document.getElementById("toc-panel");
      toc.innerHTML = "";
      nav.toc.forEach(chap => {
        if (/contents|table of contents/i.test(chap.label)) return;
        const a = document.createElement("a");
        a.textContent = chap.label;
        a.href = "#";
        a.addEventListener("click", e => {
          e.preventDefault();
          rendition.display(chap.href);
          toc.classList.remove("open");
        });
        toc.appendChild(a);
      });
      const about = nav.toc.find(chap => /about|author/i.test(chap.label));
      if (about) {
        const spine = book.spine.getByHref(about.href);
        spine.load(book.archive).then(doc => {
          const img = doc.querySelector("img[src$='.jpg'],img[src$='.jpeg'],img[src$='.png']");
          if (img) {
            const src = img.getAttribute("src");
            book.archive.createUrl(src, { base64: true }).then(url => {
              const ci = document.getElementById("contact-image");
              ci.innerHTML = "";
              const iElem = document.createElement("img");
              iElem.src = url;
              ci.appendChild(iElem);
            }).catch(err => console.warn("Error creating URL for contact image:", err));
          }
        }).catch(err => console.warn("Error loading About/Author item:", err));
      }
    });
    applyFontSwitch();
    loadBookmarks();
  });
}

function initRendition(flowMode, cfi) {
  rendition = book.renderTo("viewer", {
    width: "100%",
    height: "100%",
    flow: flowMode === "scrolled-doc" ? "scrolled" : "paginated",
    snap: flowMode !== "scrolled-doc",
    spread: "always",
    direction: "ltr"
  });
  registerHooks();
  const storedCfi = localStorage.getItem("last-location-" + currentBookUrl);
  rendition.display(cfi || storedCfi || undefined);
  rendition.on("relocated", loc => {
    if (loc?.start?.cfi) {
      localStorage.setItem("last-location-" + currentBookUrl, loc.start.cfi);
      updateBookmarkStar();
      updateNavInfo();
    }
  });
  rendition.on("rendered", () => {
    applyThemeStylesFromCurrent();
    applyFontSwitch();
    updateBookmarkStar();
    updateNavInfo();
  });
  updateSwipeListeners();
  if (flowMode === "scrolled-doc") {
    document.getElementById("toc-panel").classList.remove("open");
  }
}
// === END READER INITIALIZATION & RENDITION ===

// === START HOOKS & SWIPE HANDLING ===
function registerHooks() {
  rendition.hooks.content.register(contents => {
    const doc = contents.document;
    if (currentFlow === "scrolled-doc") {
      doc.body.style.margin = doc.body.style.padding = "0";
      doc.documentElement.style.margin = doc.documentElement.style.padding = "0";
      doc.body.style.paddingBottom = "30px";
      document.getElementById("tap-left").style.pointerEvents = "none";
      document.getElementById("tap-right").style.pointerEvents = "none";
      const sentinel = doc.createElement("div");
      sentinel.style.width = "100%";
      sentinel.style.height = "1px";
      doc.body.appendChild(sentinel);
      new IntersectionObserver(entries => {
        const cb = document.getElementById("continue-bar");
        entries.forEach(e => { cb.style.display = e.isIntersecting ? "block" : "none"; });
      }, { root: null, threshold: 0, rootMargin: "0px 0px -30px 0px" })
        .observe(sentinel);
    } else {
      document.getElementById("tap-left").style.pointerEvents = "auto";
      document.getElementById("tap-right").style.pointerEvents = "auto";
      doc.body.style.paddingTop = "20px";
      doc.body.style.paddingBottom = "30px";
    }
    rendition.themes.fontSize(currentFontSize + "%");
    document.getElementById("viewer").style.overflow = "hidden";
    applyThemeStylesFromCurrent();
  });
}

function updateSwipeListeners() {
  const v = document.getElementById("viewer");
  if (currentFlow === "swipe") {
    document.getElementById("tap-left").style.pointerEvents = "none";
    document.getElementById("tap-right").style.pointerEvents = "none";
    v.addEventListener("touchstart", handleTouchStart, false);
    v.addEventListener("touchend", handleTouchEnd, false);
    ["gesture-left","gesture-right"].forEach(id => {
      const el = document.getElementById(id);
      el.style.pointerEvents = "auto";
      el.addEventListener("click", id==="gesture-left" ? swipePrev : swipeNext);
    });
  } else {
    v.removeEventListener("touchstart", handleTouchStart, false);
    v.removeEventListener("touchend", handleTouchEnd, false);
    ["gesture-left","gesture-right"].forEach(id => {
      const el = document.getElementById(id);
      el.removeEventListener("click", id==="gesture-left" ? swipePrev : swipeNext);
      el.style.pointerEvents = "none";
    });
    document.getElementById("tap-left").style.pointerEvents = "auto";
    document.getElementById("tap-right").style.pointerEvents = "auto";
  }
}

function handleTouchStart(evt) {
  if (currentFlow !== "swipe") return;
  const t = evt.touches[0];
  xDown = t.clientX; yDown = t.clientY;
}
function handleTouchEnd(evt) {
  if (currentFlow !== "swipe" || xDown===null || yDown===null) return;
  const xUp = evt.changedTouches[0].clientX;
  const yUp = evt.changedTouches[0].clientY;
  const xDiff = xDown - xUp;
  const yDiff = yDown - yUp;
  if (Math.abs(xDiff)>Math.abs(yDiff) && Math.abs(xDiff)>SWIPE_THRESHOLD) {
    xDiff>0? swipeNext(): swipePrev();
  }
  xDown=yDown=null;
}

function swipeNext() {
  if (swipeInProgress) return;
  swipeInProgress = true;
  const v = document.getElementById("viewer");
  v.classList.add("swipe-transition");
  v.style.transform = "translateX(-100%)";
  setTimeout(()=>{
    rendition.next();
    v.classList.remove("swipe-transition");
    v.style.transform = "";
    swipeInProgress = false;
  },300);
}

function swipePrev() {
  if (swipeInProgress) return;
  swipeInProgress = true;
  const v = document.getElementById("viewer");
  v.classList.add("swipe-transition");
  v.style.transform = "translateX(100%)";
  setTimeout(()=>{
    rendition.prev();
    v.classList.remove("swipe-transition");
    v.style.transform = "";
    swipeInProgress = false;
  },300);
}
// === END HOOKS & SWIPE HANDLING ===

// === START FONT SWITCHER ===
function applyFontSwitch() {
  const storedFont = localStorage.getItem("reader-font") || "-apple-system";
  document.getElementById("font-switcher").value = storedFont;
  if (!rendition) return;
  if (storedFont === "OpenDyslexic") {
    const styleEl = document.createElement("style");
    styleEl.id = "OpenDyslexicStyle";
    styleEl.innerHTML = `
      @font-face { font-family: "OpenDyslexic"; src: url("/fonts/OpenDyslexic-Regular.otf") format("opentype"); font-weight: normal; }
      @font-face { font-family: "OpenDyslexic"; src: url("/fonts/OpenDyslexic-Bold.otf") format("opentype"); font-weight: bold; }
      body { font-family: "OpenDyslexic", sans-serif !important; }
    `;
    rendition.getContents().forEach(contents => {
      const doc = contents.document;
      if (!doc.getElementById("OpenDyslexicStyle")) doc.head.appendChild(styleEl.cloneNode(true));
    });
  } else {
    rendition.themes.override("body", { "font-family": `${storedFont}, serif !important` });
    rendition.getContents().forEach(contents => {
      const doc = contents.document;
      let o = doc.getElementById("fontOverrideStyle");
      if (!o) {
        o = doc.createElement("style");
        o.id = "fontOverrideStyle";
        doc.head.appendChild(o);
      }
      o.textContent = `body { font-family: ${storedFont}, serif !important; }`;
    });
  }
}
document.getElementById("font-switcher").addEventListener("change", e => {
  localStorage.setItem("reader-font", e.target.value);
  applyFontSwitch();
});
// === END FONT SWITCHER ===

// === START NAVIGATION CONTROLS ===
document.getElementById("nav-toggle").addEventListener("click", () => {
  document.getElementById("nav-panel").classList.toggle("open");
});
document.getElementById("rewind-btn").addEventListener("click", () => rendition.prev());
document.getElementById("forward-btn").addEventListener("click", () => rendition.next());
// === END NAVIGATION CONTROLS ===

// === START MENU & THEME CONTROLS ===
let openMenuType = null;
function toggleMenu(type) {
  if (openMenuType === type) return closeMenus();
  closeMenus();
  if (type === 'menu') {
    document.getElementById("expanded-menu").classList.add("open");
    document.getElementById("menu-backdrop").style.display = "block";
  }
  if (type === 'settings') {
    document.getElementById("settings-modal").classList.add("open");
  }
  openMenuType = type;
}
function closeMenus() {
  document.getElementById("expanded-menu").classList.remove("open");
  document.getElementById("settings-modal").classList.remove("open");
  document.getElementById("menu-backdrop").style.display = "none";
  openMenuType = null;
}
function applyThemeStylesFromCurrent() {
  if (!rendition) return;
  let bg = "#fff", color = "#000";
  if (document.body.classList.contains("sepia-mode")) {
    bg = "#f4ecd8"; color = "#000";
  } else if (document.body.classList.contains("matcha-mode")) {
    bg = "#C3D8B6"; color = "#000";
  }
  rendition.getContents().forEach(c => {
    const doc = c.document;
    doc.documentElement.style.background = bg;
    doc.body.style.background = bg;
    doc.body.style.color = color;
  });
}
document.getElementById("menu-toggle").addEventListener("click", () => { closeMenus(); toggleMenu('menu'); });
document.getElementById("toc-toggle").addEventListener("click", () => { document.getElementById("toc-panel").classList.toggle("open"); });
document.getElementById("settings-toggle").addEventListener("click", () => { closeMenus(); toggleMenu('settings'); });
document.getElementById("bookmark-toggle").addEventListener("click", toggleBookmark);
document.getElementById("bookmark-dropdown").addEventListener("click", toggleBookmarkDropdown);
document.getElementById("reading-mode").addEventListener("change", e => {
  const m = e.target.value;
  localStorage.setItem("reading-mode", m);
  currentFlow = m;
  if (!rendition || !book) return;
  const cfi = rendition.location?.start?.cfi || localStorage.getItem("last-location-"+currentBookUrl);
  rendition.destroy();
  setTimeout(() => initRendition(m, cfi), 50);
});
document.getElementById("theme-select").addEventListener("change", e => changeTheme(e.target.value));
function changeFontSize(delta) {
  currentFontSize = Math.max(60, Math.min(200, currentFontSize + delta*10));
  localStorage.setItem("reader-font-size", currentFontSize);
  rendition?.themes.fontSize(currentFontSize + "%");
}
function changeTheme(theme) {
  document.body.className = "";
  if (theme==="sepia") document.body.classList.add("sepia-mode");
  else if (theme==="matcha") document.body.classList.add("matcha-mode");
  else document.body.classList.add("light-mode");
  localStorage.setItem("reader-theme", theme);
  document.getElementById("theme-select").value = theme;
  applyThemeStylesFromCurrent();
}
document.getElementById("continue-bar").addEventListener("click", () => {
  if (!rendition || currentFlow!=="scrolled-doc") { rendition?.next(); return; }
  const loc = rendition.currentLocation();
  if (loc?.start?.index != null) {
    const next = book.spine.get(loc.start.index+1);
    if (next) rendition.display(next.href);
    else console.warn("No next chapter found.");
  } else console.warn("Invalid current location:", loc);
});
if (theBookUrl) initBook(theBookUrl);
const savedTheme = localStorage.getItem("reader-theme") || "light";
document.getElementById("theme-select").value = savedTheme;
changeTheme(savedTheme);
// === END MENU & THEME CONTROLS ===
