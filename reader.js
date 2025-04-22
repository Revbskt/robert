// reader.js

/* ---------------  Global State  --------------- */
let lastNonNightTheme = "light";
let currentBookUrl = "";
let bookmarks = [];

let xDown = null;
let yDown = null;
let swipeInProgress = false;
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
  if (book.locations && typeof book.locations.length === "number") {
    const idx = book.locations.locationFromCfi(loc.start.cfi);
    if (idx != null) pageNum = idx + 1;
    pageTotal = book.locations.length;
  }

  el.textContent = `Ch ${chapIndex}/${spineLength} Pg ${pageNum}/${pageTotal}`;
}

/* ---------------  Bookmark Storage Helpers  --------------- */
function getBookmarkKey() {
  return "bookmarks_" + currentBookUrl;
}

function loadBookmarks() {
  const stored = localStorage.getItem(getBookmarkKey());
  bookmarks = stored ? JSON.parse(stored) : [];
  updateBookmarkUI();
}

function saveBookmarks() {
  localStorage.setItem(getBookmarkKey(), JSON.stringify(bookmarks));
  updateBookmarkUI();
}

/* ---------------  Bookmark UI  --------------- */
function updateBookmarkStar() {
  const btn = document.getElementById("bookmark-toggle");
  const cfi = rendition?.currentLocation()?.start?.cfi;
  if (!cfi) {
    btn.textContent = "☆";
    return;
  }
  const exists = bookmarks.some(bm => bm.cfi === cfi);
  btn.textContent = exists ? "★" : "☆";
  btn.style.color   = exists ? "blue" : "inherit";
}

function updateBookmarkUI() {
  const container = document.getElementById("bookmark-panel");
  container.innerHTML = "";
  const frag = document.createDocumentFragment();

  if (bookmarks.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = "No bookmarks yet.";
    frag.appendChild(empty);
  } else {
    bookmarks.forEach(bm => {
      const item = document.createElement("div");
      item.textContent = `Page ${bm.page || "?"} – ${bm.snippet}`;
      item.addEventListener("click", () => {
        rendition.display(bm.cfi);
        toggleBookmarkDropdown();
      });
      frag.appendChild(item);
    });
  }

  container.appendChild(frag);
}

function toggleBookmark() {
  const loc = rendition.currentLocation();
  if (!loc?.start?.cfi) return;

  const cfi = loc.start.cfi;
  const idx = bookmarks.findIndex(bm => bm.cfi === cfi);

  if (idx !== -1) {
    bookmarks.splice(idx, 1);
  } else {
    let snippet = "";
    rendition.getContents().forEach(contents => {
      const text = contents.document.body?.textContent?.trim();
      if (text && !snippet) snippet = text.slice(0, 100) + "...";
    });
    const pageNum = loc.start.index || "?";
    bookmarks.push({ cfi, snippet, page: pageNum });
  }

  saveBookmarks();
  updateBookmarkStar();
}

function toggleBookmarkDropdown() {
  document.getElementById("bookmark-panel").classList.toggle("open");
}

/* ---------------  Cleanup Event Listeners  --------------- */
function cleanupReader() {
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

/* ---------------  Library Loader  --------------- */
function loadLibrary() {
  const libraryDiv = document.getElementById("library");
  libraryDiv.textContent = "Loading books...";
  fetch("/ebooks/library.json")
    .then(r => r.json())
    .then(books => {
      libraryDiv.innerHTML = "";
      books.forEach(b => {
        const div = document.createElement("div");
        div.className = "book";
        div.innerHTML = `
          <img src="${b.cover}" alt="Cover of ${b.title}" />
          <h3>${b.title}</h3>
          <p>${b.author}</p>
          <button onclick="readBook('${b.fileUrl}')">Read</button>
        `;
        libraryDiv.appendChild(div);
      });
    })
    .catch(err => {
      console.error("Failed to load library.json:", err);
      libraryDiv.textContent = "Failed to load book list.";
    });
}
loadLibrary();

/* ---------------  Book Selection  --------------- */
function readBook(epubUrl) {
  if (rendition && currentBookUrl) {
    const loc = rendition.currentLocation();
    if (loc?.start?.cfi) {
      localStorage.setItem("last-location-" + currentBookUrl, loc.start.cfi);
    }
  }
  cleanupReader();
  rendition?.destroy();
  book?.destroy();

  localStorage.setItem("last-book", epubUrl);
  const params = new URLSearchParams(location.search);
  params.set("book", epubUrl);
  history.replaceState({}, "", `?${params}`);

  initBook(epubUrl);
  toggleLibrary(false);
}

/* ---------------  Tap/Swipe Handlers  --------------- */
function tapLeftHandler()  { if (currentFlow === "paginated") rendition.prev(); }
function tapRightHandler() { if (currentFlow === "paginated") rendition.next(); }

function updateSwipeListeners() {
  const viewer = document.getElementById("viewer");
  if (currentFlow === "swipe") {
    ["tap-left","tap-right"].forEach(id => document.getElementById(id).style.pointerEvents = "none");
    viewer.addEventListener("touchstart", handleTouchStart);
    viewer.addEventListener("touchend",   handleTouchEnd);
    ["gesture-left","gesture-right"].forEach(id => {
      const el = document.getElementById(id);
      el.style.pointerEvents = "auto";
      el.addEventListener("click", id === "gesture-left" ? swipePrev : swipeNext);
    });
  } else {
    viewer.removeEventListener("touchstart", handleTouchStart);
    viewer.removeEventListener("touchend",   handleTouchEnd);
    ["gesture-left","gesture-right"].forEach(id => {
      const el = document.getElementById(id);
      el.removeEventListener("click", swipePrev);
      el.removeEventListener("click", swipeNext);
      el.style.pointerEvents = "none";
    });
    ["tap-left","tap-right"].forEach(id => document.getElementById(id).style.pointerEvents = "auto");
  }
}

function handleTouchStart(evt) {
  if (currentFlow !== "swipe") return;
  xDown = evt.touches[0].clientX;
  yDown = evt.touches[0].clientY;
}

function handleTouchEnd(evt) {
  if (currentFlow !== "swipe" || xDown === null || yDown === null) return;
  const xUp = evt.changedTouches[0].clientX;
  const yUp = evt.changedTouches[0].clientY;
  const xDiff = xDown - xUp;
  const yDiff = yDown - yUp;
  if (Math.abs(xDiff) > Math.abs(yDiff) && Math.abs(xDiff) > SWIPE_THRESHOLD) {
    xDiff > 0 ? swipeNext() : swipePrev();
  }
  xDown = yDown = null;
}

function swipeNext() {
  if (swipeInProgress) return;
  swipeInProgress = true;
  const viewer = document.getElementById("viewer");
  viewer.classList.add("swipe-transition");
  viewer.style.transform = "translateX(-100%)";
  setTimeout(() => {
    rendition.next();
    viewer.classList.remove("swipe-transition");
    viewer.style.transform = "";
    swipeInProgress = false;
  }, 300);
}

function swipePrev() {
  if (swipeInProgress) return;
  swipeInProgress = true;
  const viewer = document.getElementById("viewer");
  viewer.classList.add("swipe-transition");
  viewer.style.transform = "translateX(100%)";
  setTimeout(() => {
    rendition.prev();
    viewer.classList.remove("swipe-transition");
    viewer.style.transform = "";
    swipeInProgress = false;
  }, 300);
}

/* ---------------  Font Switcher  --------------- */
function applyFontSwitch() {
  const storedFont = localStorage.getItem("reader-font") || "-apple-system";
  document.getElementById("font-switcher").value = storedFont;
  if (!rendition) return;

  if (storedFont === "OpenDyslexic") {
    const styleTpl = document.createElement("style");
    styleTpl.innerHTML = `
      @font-face {
        font-family: "OpenDyslexic";
        src: url("/fonts/OpenDyslexic-Regular.otf") format("opentype");
      }
      @font-face {
        font-family: "OpenDyslexic";
        src: url("/fonts/OpenDyslexic-Bold.otf") format("opentype");
        font-weight: bold;
      }
      body { font-family: "OpenDyslexic", sans-serif !important; }
    `;
    rendition.getContents().forEach(c => {
      let existing = c.document.getElementById("OpenDyslexicStyle");
      if (!existing) {
        const clone = styleTpl.cloneNode(true);
        clone.id = "OpenDyslexicStyle";
        c.document.head.appendChild(clone);
      }
    });
  } else {
    rendition.themes.override("body", { "font-family": `${storedFont}, serif !important` });
    rendition.getContents().forEach(c => {
      let st = c.document.getElementById("fontOverrideStyle");
      if (!st) {
        st = c.document.createElement("style");
        st.id = "fontOverrideStyle";
        c.document.head.appendChild(st);
      }
      st.textContent = `body { font-family: ${storedFont}, serif !important; }`;
    });
  }
}

document.getElementById("font-switcher").addEventListener("change", e => {
  localStorage.setItem("reader-font", e.target.value);
  applyFontSwitch();
});

/* ---------------  Initialize Book & Rendition  --------------- */
function initBook(url) {
  if (!url) return;
  currentBookUrl = url;
  cleanupReader();
  rendition?.destroy();
  book?.destroy();
  bookmarks = [];

  book = ePub(url);
  registerReaderEvents();

  // load & generate locations first
  book.ready
    .then(() => book.locations.generate(1600))
    .then(() => {
      // then create rendition
      initRendition(currentFlow);

      // metadata & cover
      book.loaded.metadata.then(meta => {
        document.getElementById("book-title").textContent = meta.title || "Untitled";
        document.getElementById("book-author").textContent = meta.creator || "";
      });
      book.loaded.cover
        .then(src => book.archive.createUrl(src, { base64: true }))
        .then(url => { document.getElementById("cover").src = url; })
        .catch(() => {});

      // TOC
      book.loaded.navigation.then(buildTOC);

      applyFontSwitch();
      loadBookmarks();
    });
}

function initRendition(flow, cfi) {
  rendition = book.renderTo("viewer", {
    width: "100%",
    height: "100%",
    flow: flow === "scrolled-doc" ? "scrolled" : "paginated",
    snap: flow === "scrolled-doc" ? false : true,
    spread: "always",
    direction: "ltr"
  });

  registerHooks();

  const storedCfi = localStorage.getItem("last-location-" + currentBookUrl);
  rendition.display(cfi || storedCfi);

  // show location immediately
  updatePageLocation(rendition.currentLocation());

  // now wire events
  rendition.on("relocated", loc => {
    if (loc?.start?.cfi) {
      localStorage.setItem("last-location-" + currentBookUrl, loc.start.cfi);
      updateBookmarkStar();
      updatePageLocation(loc);
    }
  });

  rendition.on("rendered", () => {
    applyThemeStylesFromCurrent();
    applyFontSwitch();
    updateBookmarkStar();
    updatePageLocation(rendition.currentLocation());
  });

  updateSwipeListeners();
}

/* ---------------  Content Hook & Event Registration  --------------- */
function registerHooks() {
  rendition.hooks.content.register(contents => {
    const doc = contents.document;
    if (currentFlow === "scrolled-doc") {
      doc.body.style.margin = doc.documentElement.style.margin = "0";
      doc.body.style.padding = doc.documentElement.style.padding = "0";
      doc.body.style.paddingBottom = "30px";
      Array.from(["tap-left","tap-right"]).forEach(id => document.getElementById(id).style.pointerEvents = "none");

      const sentinel = doc.createElement("div");
      sentinel.style.width = "100%";
      sentinel.style.height = "1px";
      doc.body.appendChild(sentinel);

      new IntersectionObserver(entries => {
        const bar = document.getElementById("continue-bar");
        entries.forEach(e => bar.style.display = e.isIntersecting ? "block" : "none");
      }, { rootMargin: "0px 0px -30px 0px" }).observe(sentinel);
    } else {
      Array.from(["tap-left","tap-right"]).forEach(id => document.getElementById(id).style.pointerEvents = "auto");
      doc.body.style.paddingTop = "20px";
      doc.body.style.paddingBottom = "30px";
    }
    rendition.themes.fontSize(currentFontSize + "%");
    document.getElementById("viewer").style.overflow = "hidden";
    applyThemeStylesFromCurrent();
  });
}

function registerReaderEvents() {
  document.getElementById("tap-left").addEventListener("click", tapLeftHandler);
  document.getElementById("tap-right").addEventListener("click", tapRightHandler);
}

/* ---------------  Menus & Themes  --------------- */
let openMenuType = null;
function toggleMenu(type) {
  if (openMenuType === type) { closeMenus(); return; }
  closeMenus();
  if (type === "menu") {
    document.getElementById("expanded-menu").classList.add("open");
    document.getElementById("menu-backdrop").style.display = "block";
  } else if (type === "settings") {
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
  if (document.body.classList.contains("night-mode")) { bg = "#111"; color = "#eee"; }
  else if (document.body.classList.contains("sepia-mode")) { bg = "#f4ecd8"; }
  else if (document.body.classList.contains("matcha-mode")) { bg = "#C3D8B6"; }

  rendition.getContents().forEach(c => {
    c.document.documentElement.style.background = bg;
    c.document.body.style.background = bg;
    c.document.body.style.color = color;
  });
}

/* ---------------  Toolbar & Control Listeners  --------------- */
document.getElementById("menu-toggle").addEventListener("click",   () => { closeMenus(); toggleMenu("menu"); });
document.getElementById("toc-toggle").addEventListener("click",    () => { document.getElementById("toc-panel").classList.toggle("open"); });
document.getElementById("settings-toggle").addEventListener("click",() => { closeMenus(); toggleMenu("settings"); });
document.getElementById("theme-toggle").addEventListener("click",  () => {
  closeMenus();
  if (document.body.classList.contains("night-mode")) changeTheme(lastNonNightTheme);
  else {
    lastNonNightTheme = document.getElementById("theme-select").value;
    changeTheme("night");
  }
});

document.getElementById("bookmark-toggle").addEventListener("click",    toggleBookmark);
document.getElementById("bookmark-dropdown").addEventListener("click",  toggleBookmarkDropdown);

document.getElementById("reading-mode").addEventListener("change", e => {
  const newMode = e.target.value;
  localStorage.setItem("reading-mode", newMode);
  currentFlow = newMode;
  if (!rendition) return;
  const loc = rendition.location?.start?.cfi || localStorage.getItem("last-location-" + currentBookUrl);
  rendition.destroy();
  setTimeout(() => initRendition(newMode, loc), 50);
});

document.getElementById("theme-select").addEventListener("change", e => changeTheme(e.target.value));

function changeFontSize(delta) {
  currentFontSize = Math.max(60, Math.min(200, currentFontSize + delta * 10));
  localStorage.setItem("reader-font-size", currentFontSize);
  rendition?.themes.fontSize(currentFontSize + "%");
}

function changeTheme(theme) {
  document.body.className = "";
  if (theme === "night")      document.body.classList.add("night-mode");
  else if (theme === "sepia") document.body.classList.add("sepia-mode");
  else if (theme === "matcha")document.body.classList.add("matcha-mode");
  else                        document.body.classList.add("light-mode");

  document.getElementById("theme-toggle").textContent =
    document.body.classList.contains("night-mode") ? "☀️" : "🌙";

  localStorage.setItem("reader-theme", theme);
  document.getElementById("theme-select").value = theme;
  applyThemeStylesFromCurrent();
}

document.getElementById("continue-bar").addEventListener("click", () => {
  if (currentFlow !== "scrolled-doc") { rendition?.next(); return; }
  const loc = rendition.currentLocation();
  const idx = loc?.start?.index;
  if (idx != null) {
    const next = book.spine.get(idx + 1);
    if (next) rendition.display(next.href);
  }
});

/* ---------------  Initial Boot  --------------- */
function toggleLibrary(force) {
  const lib = document.getElementById("library-container");
  const rdr = document.getElementById("reader-container");
  const showLib = typeof force === "boolean" ? force : !lib.style.display || lib.style.display === "none";
  lib.style.display = showLib ? "block" : "none";
  rdr.style.display = showLib ? "none" : "block";
  closeMenus();
}

const params   = new URLSearchParams(location.search);
const bookParam= params.get("book");
const lastBook = localStorage.getItem("last-book");
const initialBook = bookParam ? decodeURIComponent(bookParam) : lastBook;

toggleLibrary(!initialBook);
if (initialBook) initBook(initialBook);

const savedTheme = localStorage.getItem("reader-theme") || "light";
changeTheme(savedTheme);
