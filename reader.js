let lastNonNightTheme = "light";
let currentBookUrl = "";
let bookmarks = [];
let xDown = null;
let yDown = null;
const SWIPE_THRESHOLD = 20;
let swipeInProgress = false;
let currentFontSize = parseInt(localStorage.getItem("reader-font-size")) || 100;
let currentFlow = localStorage.getItem("reading-mode") || "swipe";
let book, rendition;

// Toggle library view
function toggleLibrary(forceState) {
  const lib = document.getElementById("library-container");
  const read = document.getElementById("reader-container");
  const isLibrary = typeof forceState === 'boolean' ? forceState : lib.style.display === "none";
  lib.style.display = isLibrary ? "block" : "none";
  read.style.display = isLibrary ? "none" : "block";
  closeMenus();
}

// Load book list
function loadLibrary() {
  const libraryDiv = document.getElementById("library");
  fetch("/ebooks/library.json")
    .then(res => res.json())
    .then(books => {
      libraryDiv.innerHTML = "";
      books.forEach(book => {
        const div = document.createElement("div");
        div.className = "book";
        div.innerHTML = `
          <img src="${book.cover}" />
          <h3>${book.title}</h3>
          <p>${book.author}</p>
          <button onclick="readBook('${book.fileUrl}')">Read</button>
        `;
        libraryDiv.appendChild(div);
      });
    })
    .catch(err => {
      console.error("library.json load failed:", err);
      libraryDiv.textContent = "Failed to load books.";
    });
}

// Bookmark helpers
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
function updateBookmarkUI() {
  const container = document.getElementById("bookmark-panel");
  container.innerHTML = "";
  const frag = document.createDocumentFragment();
  if (bookmarks.length === 0) {
    const msg = document.createElement("div");
    msg.textContent = "No bookmarks yet.";
    frag.appendChild(msg);
  } else {
    bookmarks.forEach((bm) => {
      const item = document.createElement("div");
      item.textContent = `Page ${bm.page || "?"} - ${bm.snippet}`;
      item.onclick = () => {
        rendition.display(bm.cfi);
        toggleBookmarkDropdown();
      };
      frag.appendChild(item);
    });
  }
  container.appendChild(frag);
}
function updateBookmarkStar() {
  const btn = document.getElementById("bookmark-toggle");
  const cfi = rendition?.currentLocation()?.start?.cfi;
  if (!cfi) { btn.textContent = "☆"; return; }
  const exists = bookmarks.some(b => b.cfi === cfi);
  btn.textContent = exists ? "★" : "☆";
  btn.style.color = exists ? "blue" : "inherit";
}
function toggleBookmark() {
  const loc = rendition.currentLocation();
  if (!loc?.start?.cfi) return;
  const cfi = loc.start.cfi;
  const index = bookmarks.findIndex(b => b.cfi === cfi);
  if (index !== -1) {
    bookmarks.splice(index, 1);
  } else {
    let snippet = "";
    rendition.getContents().forEach(c => {
      const text = c.document?.body?.textContent?.trim();
      if (text && !snippet) snippet = text.substring(0, 100) + "...";
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

// Book reader setup
function initBook(url) {
  currentBookUrl = url;
  bookmarks = [];
  if (rendition) rendition.destroy();
  if (book) book.destroy();

  book = ePub(url);
  registerReaderEvents();
  book.ready.then(() => {
    initRendition(currentFlow);
    setTimeout(() => book.locations.generate(1600), 100);
    book.loaded.metadata.then(meta => {
      document.getElementById("book-title").textContent = meta.title || "Untitled";
      document.getElementById("book-author").textContent = meta.creator || "";
    });
    book.loaded.cover
      .then(cover => book.archive.createUrl(cover, { base64: true }))
      .then(dataUrl => document.getElementById("cover").src = dataUrl)
      .catch(() => console.warn("No cover found."));
    book.loaded.navigation.then(nav => {
      const tocPanel = document.getElementById("toc-panel");
      tocPanel.innerHTML = "";
      nav.toc.forEach(ch => {
        const link = document.createElement("a");
        link.textContent = ch.label;
        link.href = "#";
        link.onclick = e => {
          e.preventDefault();
          rendition.display(ch.href);
          tocPanel.classList.remove("open");
        };
        tocPanel.appendChild(link);
      });
    });
    applyFontSwitch();
    loadBookmarks();
  });
}

function initRendition(mode, cfi) {
  rendition = book.renderTo("viewer", {
    width: "100%",
    height: "100%",
    flow: mode === "scrolled-doc" ? "scrolled" : "paginated",
    snap: mode !== "scrolled-doc",
    spread: "always",
    direction: "ltr"
  });
  registerHooks();
  const savedCfi = localStorage.getItem("last-location-" + currentBookUrl);
  rendition.display(cfi || savedCfi || undefined);
  rendition.on("relocated", loc => {
    if (loc?.start?.cfi) {
      localStorage.setItem("last-location-" + currentBookUrl, loc.start.cfi);
      updateBookmarkStar();
    }
  });
  rendition.on("rendered", () => {
    applyFontSwitch();
    updateBookmarkStar();
    applyThemeStylesFromCurrent();
  });
  updateSwipeListeners();
}

// Font and theme styling
function applyThemeStylesFromCurrent() {
  if (!rendition) return;
  let bg = "#fff", color = "#000";
  if (document.body.classList.contains("night-mode")) {
    bg = "#111"; color = "#eee";
  } else if (document.body.classList.contains("sepia-mode")) {
    bg = "#f4ecd8";
  } else if (document.body.classList.contains("matcha-mode")) {
    bg = "#C3D8B6";
  }
  rendition.getContents().forEach(c => {
    c.document.documentElement.style.background = bg;
    c.document.body.style.background = bg;
    c.document.body.style.color = color;
  });
}
function applyFontSwitch() {
  const selectedFont = localStorage.getItem("reader-font") || "-apple-system";
  const dropdown = document.getElementById("font-switcher");
  if (dropdown) dropdown.value = selectedFont;
  if (!rendition) return;
  if (selectedFont === "OpenDyslexic") {
    const styleTag = `
      @font-face {
        font-family: "OpenDyslexic";
        src: url("/fonts/OpenDyslexic-Regular.otf") format("opentype");
      }
      body { font-family: "OpenDyslexic", sans-serif !important; }
    `;
    rendition.getContents().forEach(c => {
      const doc = c.document;
      if (!doc.getElementById("OpenDyslexicStyle")) {
        const style = doc.createElement("style");
        style.id = "OpenDyslexicStyle";
        style.textContent = styleTag;
        doc.head.appendChild(style);
      }
    });
  } else {
    rendition.themes.override("body", {
      "font-family": `${selectedFont}, serif !important`
    });
  }
}

// Swipe & gesture setup
function registerReaderEvents() {
  document.getElementById("tap-left").addEventListener("click", () => rendition.prev());
  document.getElementById("tap-right").addEventListener("click", () => rendition.next());
}
function registerHooks() {
  rendition.hooks.content.register(c => {
    const doc = c.document;
    if (currentFlow === "scrolled-doc") {
      doc.body.style.paddingBottom = "30px";
    }
    rendition.themes.fontSize(currentFontSize + "%");
  });
}
function updateSwipeListeners() {
  const viewer = document.getElementById("viewer");
  if (currentFlow === "swipe") {
    viewer.addEventListener("touchstart", handleTouchStart);
    viewer.addEventListener("touchend", handleTouchEnd);
    document.getElementById("gesture-left").onclick = swipePrev;
    document.getElementById("gesture-right").onclick = swipeNext;
  }
}

// UI event wiring
document.getElementById("menu-toggle").onclick = () => toggleMenu("menu");
document.getElementById("settings-toggle").onclick = () => toggleMenu("settings");
document.getElementById("theme-toggle").onclick = () => {
  const cur = document.getElementById("theme-select").value;
  lastNonNightTheme = cur;
  changeTheme(document.body.classList.contains("night-mode") ? lastNonNightTheme : "night");
};
document.getElementById("bookmark-toggle").onclick = toggleBookmark;
document.getElementById("bookmark-dropdown").onclick = toggleBookmarkDropdown;
document.getElementById("reading-mode").onchange = e => {
  currentFlow = e.target.value;
  localStorage.setItem("reading-mode", currentFlow);
  const loc = rendition?.location?.start?.cfi || null;
  rendition.destroy();
  initRendition(currentFlow, loc);
};
document.getElementById("theme-select").onchange = e => changeTheme(e.target.value);
document.getElementById("font-switcher").onchange = e => {
  localStorage.setItem("reader-font", e.target.value);
  applyFontSwitch();
};
document.getElementById("font-larger").onclick = () => changeFontSize(1);
document.getElementById("font-smaller").onclick = () => changeFontSize(-1);
document.querySelector(".close-menu").onclick = closeMenus;
document.querySelector(".close-settings").onclick = closeMenus;
document.getElementById("toc-toggle").onclick = () => {
  document.getElementById("toc-panel").classList.toggle("open");
};
document.getElementById("continue-bar").onclick = () => {
  if (rendition) rendition.next();
};

function changeTheme(theme) {
  document.body.className = "";
  document.body.classList.add(theme + "-mode");
  document.getElementById("theme-toggle").textContent = theme === "night" ? "☀️" : "🌙";
  localStorage.setItem("reader-theme", theme);
  document.getElementById("theme-select").value = theme;
  applyThemeStylesFromCurrent();
}
function changeFontSize(delta) {
  currentFontSize = Math.max(60, Math.min(200, currentFontSize + delta * 10));
  localStorage.setItem("reader-font-size", currentFontSize);
  rendition?.themes.fontSize(currentFontSize + "%");
}
function toggleMenu(type) {
  closeMenus();
  if (type === "menu") {
    document.getElementById("expanded-menu").classList.add("open");
    document.getElementById("menu-backdrop").style.display = "block";
  } else if (type === "settings") {
    document.getElementById("settings-modal").classList.add("open");
  }
}
function closeMenus() {
  document.getElementById("expanded-menu").classList.remove("open");
  document.getElementById("settings-modal").classList.remove("open");
  document.getElementById("menu-backdrop").style.display = "none";
}

// Startup
const params = new URLSearchParams(location.search);
const bookParam = params.get("book");
const lastBook = localStorage.getItem("last-book");
const bookToLoad = bookParam ? decodeURIComponent(bookParam) : lastBook;
if (bookToLoad) {
  toggleLibrary(false);
  initBook(bookToLoad);
} else {
  toggleLibrary(true);
}
loadLibrary();
const theme = localStorage.getItem("reader-theme") || "light";
document.getElementById("theme-select").value = theme;
changeTheme(theme);
