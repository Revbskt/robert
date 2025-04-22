// === GLOBAL VARS & INITIAL SETUP ===
let lastNonNightTheme = "light";
let currentBookUrl = "";
let bookmarks = [];
let xDown = null;
let yDown = null;
const SWIPE_THRESHOLD = 20;
let swipeInProgress = false;
let book, rendition;
let currentFontSize = parseInt(localStorage.getItem("reader-font-size")) || 100;
let currentFlow = localStorage.getItem("reading-mode") || "swipe";

// === TOUCH HANDLERS: SWIPE SUPPORT ===
function handleTouchStart(evt) {
  if (currentFlow !== "swipe") return;
  const firstTouch = evt.touches[0];
  xDown = firstTouch.clientX;
  yDown = firstTouch.clientY;
}
function handleTouchEnd(evt) {
  if (currentFlow !== "swipe" || !xDown || !yDown) return;
  let xUp = evt.changedTouches[0].clientX;
  let yUp = evt.changedTouches[0].clientY;
  let xDiff = xDown - xUp;
  let yDiff = yDown - yUp;
  if (Math.abs(xDiff) > Math.abs(yDiff) && Math.abs(xDiff) > SWIPE_THRESHOLD) {
    xDiff > 0 ? swipeNext() : swipePrev();
  }
  xDown = null;
  yDown = null;
}

// === SWIPE: PAGE EFFECTS ===
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

// === TAPS ===
function tapLeftHandler() {
  if (currentFlow === "paginated" && rendition) rendition.prev();
}
function tapRightHandler() {
  if (currentFlow === "paginated" && rendition) rendition.next();
}
function registerReaderEvents() {
  document.getElementById("tap-left").addEventListener("click", tapLeftHandler);
  document.getElementById("tap-right").addEventListener("click", tapRightHandler);
}

// === CLEANUP ===
function cleanupReader() {
  const viewer = document.getElementById("viewer");
  viewer.removeEventListener("touchstart", handleTouchStart, false);
  viewer.removeEventListener("touchend", handleTouchEnd, false);
  ["gesture-left", "gesture-right", "tap-left", "tap-right"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.replaceWith(el.cloneNode(true)); // removes listeners
  });
}

// === LIBRARY + BOOK SELECTION ===
function toggleLibrary(forceState) {
  const lib = document.getElementById("library-container");
  const read = document.getElementById("reader-container");
  const showLibrary = typeof forceState === "boolean" ? forceState : lib.style.display === "none";
  lib.style.display = showLibrary ? "block" : "none";
  read.style.display = showLibrary ? "none" : "block";
  closeMenus();
}
function loadLibrary() {
  const container = document.getElementById("library");
  fetch("/ebooks/library.json")
    .then(res => res.json())
    .then(books => {
      container.innerHTML = "";
      books.forEach(book => {
        const div = document.createElement("div");
        div.className = "book";
        div.innerHTML = `
          <img src="${book.cover}" alt="${book.title}" />
          <h3>${book.title}</h3>
          <p>${book.author}</p>
          <button onclick="readBook('${book.fileUrl}')">Read</button>
        `;
        container.appendChild(div);
      });
    })
    .catch(() => (container.textContent = "Failed to load books."));
}
function readBook(epubUrl) {
  if (rendition && currentBookUrl) {
    const loc = rendition.currentLocation();
    if (loc?.start?.cfi) {
      localStorage.setItem("last-location-" + currentBookUrl, loc.start.cfi);
    }
  }
  cleanupReader();
  localStorage.setItem("last-book", epubUrl);
  const url = new URLSearchParams(window.location.search);
  url.set("book", epubUrl);
  window.history.replaceState({}, "", `?${url}`);
  initBook(epubUrl);
  toggleLibrary(false);
}

// === INIT: BOOK LOAD ===
function initBook(chosenUrl) {
  if (!chosenUrl) return;
  currentBookUrl = chosenUrl;
  bookmarks = [];
  if (rendition) rendition.destroy();
  if (book) book.destroy();

  book = ePub(chosenUrl);
  book.ready.then(() => {
    initRendition(currentFlow);
    setTimeout(() => book.locations.generate(1600), 100);
    book.loaded.metadata.then(meta => {
      document.getElementById("book-title").textContent = meta.title || "";
      document.getElementById("book-author").textContent = meta.creator || "";
    });
    book.loaded.cover
      .then(coverUrl => book.archive.createUrl(coverUrl, { base64: true }))
      .then(dataUrl => { document.getElementById("cover").src = dataUrl; })
      .catch(() => {});
    loadBookmarks();
    applyFontSwitch();
  });
}

// === INIT: RENDITION ===
function initRendition(flowMode, cfi) {
  rendition = book.renderTo("viewer", {
    width: "100%",
    height: "100%",
    flow: flowMode === "scrolled-doc" ? "scrolled" : "paginated",
    snap: flowMode !== "scrolled-doc",
    spread: "always",
    direction: "ltr"
  });
  registerReaderEvents();
  const stored = localStorage.getItem("last-location-" + currentBookUrl);
  rendition.display(cfi || stored || undefined);
  rendition.on("relocated", loc => {
    if (loc?.start?.cfi) {
      localStorage.setItem("last-location-" + currentBookUrl, loc.start.cfi);
      updateBookmarkStar();
    }
  });
  rendition.on("rendered", () => {
    applyThemeStylesFromCurrent();
    applyFontSwitch();
    updateBookmarkStar();
  });
  updateSwipeListeners();
}

// === UPDATE: FONT SWITCHER ===
function applyFontSwitch() {
  const storedFont = localStorage.getItem("reader-font") || "-apple-system";
  if (rendition) {
    if (storedFont === "OpenDyslexic") {
      const styleTag = `
        @font-face {
          font-family: "OpenDyslexic";
          src: url("/fonts/OpenDyslexic-Regular.otf") format("opentype");
        }
        body { font-family: "OpenDyslexic", sans-serif !important; }
      `;
      rendition.getContents().forEach(c => {
        const doc = c.document;
        let el = doc.getElementById("OpenDyslexicStyle");
        if (!el) {
          el = doc.createElement("style");
          el.id = "OpenDyslexicStyle";
          el.textContent = styleTag;
          doc.head.appendChild(el);
        }
      });
    } else {
      rendition.themes.override("body", {
        "font-family": storedFont + ", serif !important"
      });
    }
  }
}

// === UPDATE: BOOKMARKS ===
function getBookmarkKey() {
  return "bookmarks_" + currentBookUrl;
}
function loadBookmarks() {
  const data = localStorage.getItem(getBookmarkKey());
  bookmarks = data ? JSON.parse(data) : [];
  updateBookmarkUI();
}
function saveBookmarks() {
  localStorage.setItem(getBookmarkKey(), JSON.stringify(bookmarks));
  updateBookmarkUI();
}
function toggleBookmark() {
  const loc = rendition.currentLocation();
  const cfi = loc?.start?.cfi;
  if (!cfi) return;
  const index = bookmarks.findIndex(bm => bm.cfi === cfi);
  if (index !== -1) {
    bookmarks.splice(index, 1);
  } else {
    let snippet = "";
    rendition.getContents().forEach(c => {
      const txt = c.document.body?.textContent?.trim();
      if (!snippet && txt) snippet = txt.slice(0, 100) + "...";
    });
    bookmarks.push({ cfi, snippet });
  }
  saveBookmarks();
  updateBookmarkStar();
}
function updateBookmarkStar() {
  const btn = document.getElementById("bookmark-toggle");
  const cfi = rendition?.currentLocation()?.start?.cfi;
  const exists = bookmarks.some(b => b.cfi === cfi);
  btn.textContent = exists ? "★" : "☆";
  btn.style.color = exists ? "blue" : "inherit";
}
function updateBookmarkUI() {
  const panel = document.getElementById("bookmark-panel");
  panel.innerHTML = "";
  const frag = document.createDocumentFragment();
  bookmarks.forEach(b => {
    const div = document.createElement("div");
    div.textContent = b.snippet || "(Bookmark)";
    div.onclick = () => {
      rendition.display(b.cfi);
      toggleBookmarkDropdown();
    };
    frag.appendChild(div);
  });
  panel.appendChild(frag);
}
function toggleBookmarkDropdown() {
  document.getElementById("bookmark-panel").classList.toggle("open");
}

// === EVENT: TOOLBAR BUTTONS ===
document.getElementById("menu-toggle").onclick = () => { toggleMenu("menu"); };
document.getElementById("toc-toggle").onclick = () => { document.getElementById("toc-panel").classList.toggle("open"); };
document.getElementById("bookmark-toggle").onclick = toggleBookmark;
document.getElementById("bookmark-dropdown").onclick = toggleBookmarkDropdown;
document.getElementById("settings-toggle").onclick = () => { toggleMenu("settings"); };
document.getElementById("theme-toggle").onclick = () => {
  const current = document.body.classList;
  lastNonNightTheme = document.getElementById("theme-select").value;
  const night = current.contains("night-mode");
  changeTheme(night ? lastNonNightTheme : "night");
};
document.getElementById("theme-select").onchange = e => changeTheme(e.target.value);
document.getElementById("font-switcher").onchange = e => {
  const font = e.target.value;
  localStorage.setItem("reader-font", font);
  applyFontSwitch();
};
document.getElementById("reading-mode").onchange = e => {
  const mode = e.target.value;
  localStorage.setItem("reading-mode", mode);
  currentFlow = mode;
  const cfi = rendition?.location?.start?.cfi || localStorage.getItem("last-location-" + currentBookUrl);
  rendition.destroy();
  setTimeout(() => initRendition(mode, cfi), 50);
};

// === RENDER: THEMES ===
function changeTheme(theme) {
  document.body.className = "";
  document.body.classList.add(`${theme}-mode`);
  localStorage.setItem("reader-theme", theme);
  document.getElementById("theme-select").value = theme;
  document.getElementById("theme-toggle").textContent = theme === "night" ? "☀️" : "🌙";
  applyThemeStylesFromCurrent();
}
function applyThemeStylesFromCurrent() {
  if (!rendition) return;
  let bg = "#fff", fg = "#000";
  if (document.body.classList.contains("night-mode")) { bg = "#111"; fg = "#eee"; }
  if (document.body.classList.contains("sepia-mode")) { bg = "#f4ecd8"; fg = "#000"; }
  if (document.body.classList.contains("matcha-mode")) { bg = "#C3D8B6"; fg = "#000"; }
  if (document.body.classList.contains("light-mode")) { bg = "#f5f5f5"; fg = "#000"; }
  rendition.getContents().forEach(c => {
    const doc = c.document;
    doc.documentElement.style.background = bg;
    doc.body.style.background = bg;
    doc.body.style.color = fg;
  });
}

// === INIT: AUTO LOAD ===
const urlParams = new URLSearchParams(window.location.search);
const paramBook = urlParams.get("book");
const savedBook = localStorage.getItem("last-book");
const theBookUrl = paramBook || savedBook || null;

if (theBookUrl) {
  document.getElementById("library-container").style.display = "none";
  document.getElementById("reader-container").style.display = "block";
  initBook(theBookUrl);
} else {
  document.getElementById("library-container").style.display = "block";
  document.getElementById("reader-container").style.display = "none";
  loadLibrary();
}

const savedTheme = localStorage.getItem("reader-theme") || "light";
changeTheme(savedTheme);
