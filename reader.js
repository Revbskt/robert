let book, rendition, currentBookUrl = "", currentFlow = "swipe";
let currentFontSize = parseInt(localStorage.getItem("reader-font-size")) || 100;
let bookmarks = [], lastNonNightTheme = "light", swipeInProgress = false;

const SWIPE_THRESHOLD = 20;
let xDown = null, yDown = null;

document.getElementById("menu-toggle").addEventListener("click", () => { toggleMenu('menu'); });
document.getElementById("toc-toggle").addEventListener("click", () => { document.getElementById("toc-panel").classList.toggle("open"); });
document.getElementById("settings-toggle").addEventListener("click", () => { toggleMenu('settings'); });
document.getElementById("theme-toggle").addEventListener("click", () => {
  if (document.body.classList.contains("night-mode")) changeTheme(lastNonNightTheme);
  else { lastNonNightTheme = document.getElementById("theme-select").value; changeTheme("night"); }
});
document.getElementById("bookmark-toggle").addEventListener("click", toggleBookmark);
document.getElementById("bookmark-dropdown").addEventListener("click", toggleBookmarkDropdown);
document.getElementById("reading-mode").addEventListener("change", (e) => {
  localStorage.setItem("reading-mode", e.target.value);
  currentFlow = e.target.value;
  const loc = rendition?.location?.start?.cfi || localStorage.getItem("last-location-" + currentBookUrl);
  rendition.destroy(); setTimeout(() => initRendition(currentFlow, loc), 50);
});
document.getElementById("theme-select").addEventListener("change", e => changeTheme(e.target.value));
document.getElementById("font-switcher").addEventListener("change", (e) => {
  localStorage.setItem("reader-font", e.target.value); applyFontSwitch();
});
document.getElementById("continue-bar").addEventListener("click", () => {
  if (currentFlow !== "scrolled-doc") return rendition?.next();
  const loc = rendition.currentLocation(), idx = loc?.start?.index;
  const next = book.spine.get(idx + 1); if (next) rendition.display(next.href);
});
document.getElementById("nav-toggle").addEventListener("click", () => {
  document.getElementById("nav-panel").classList.toggle("open");
});
document.getElementById("nav-rewind").addEventListener("click", () => { rendition?.prev(); });
document.getElementById("nav-forward").addEventListener("click", () => { rendition?.next(); });
document.getElementById("nav-slider").addEventListener("input", (e) => {
  const pct = parseInt(e.target.value);
  if (book?.locations) rendition.display(book.locations.cfiFromPercentage(pct / 100));
});

function changeTheme(theme) {
  document.body.className = "";
  document.body.classList.add(`${theme}-mode`);
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
function toggleLibrary(force) {
  const lib = document.getElementById("library-container");
  const reader = document.getElementById("reader-container");
  const on = typeof force === 'boolean' ? force : lib.style.display !== "block";
  lib.style.display = on ? "block" : "none";
  reader.style.display = on ? "none" : "block";
  closeMenus();
}
function toggleMenu(type) {
  closeMenus();
  if (type === 'menu') {
    document.getElementById("expanded-menu").classList.add("open");
    document.getElementById("menu-backdrop").style.display = "block";
  } else if (type === 'settings') {
    document.getElementById("settings-modal").classList.add("open");
  }
}
function closeMenus() {
  document.getElementById("expanded-menu").classList.remove("open");
  document.getElementById("settings-modal").classList.remove("open");
  document.getElementById("menu-backdrop").style.display = "none";
}
function readBook(url) {
  saveLocation();
  cleanupReader();
  localStorage.setItem("last-book", url);
  window.history.replaceState({}, "", `?book=${encodeURIComponent(url)}`);
  initBook(url);
  toggleLibrary(false);
}
function saveLocation() {
  if (rendition && currentBookUrl) {
    const loc = rendition.currentLocation();
    if (loc?.start?.cfi) localStorage.setItem("last-location-" + currentBookUrl, loc.start.cfi);
  }
}
function initBook(url) {
  if (!url) return;
  currentBookUrl = url;
  book = ePub(url);
  book.ready.then(() => {
    initRendition(currentFlow);
    setTimeout(() => book.locations.generate(1600), 100);
    book.loaded.metadata.then(meta => {
      document.getElementById("book-title").textContent = meta.title || "Untitled";
      document.getElementById("book-author").textContent = meta.creator || "";
    });
    book.loaded.cover
      .then(coverUrl => book.archive.createUrl(coverUrl, { base64: true }))
      .then(url => { document.getElementById("cover").src = url; })
      .catch(() => {});
    book.loaded.navigation.then(nav => {
      const tocPanel = document.getElementById("toc-panel");
      tocPanel.innerHTML = "";
      nav.toc.forEach(ch => {
        if (/contents|table/i.test(ch.label)) return;
        const link = document.createElement("a");
        link.textContent = ch.label;
        link.href = "#";
        link.addEventListener("click", e => {
          e.preventDefault();
          rendition.display(ch.href);
          tocPanel.classList.remove("open");
        });
        tocPanel.appendChild(link);
      });
    });
    applyFontSwitch();
    loadBookmarks();
  });
}
function initRendition(flow, cfi) {
  rendition = book.renderTo("viewer", {
    width: "100%", height: "100%",
    flow: flow === "scrolled-doc" ? "scrolled" : "paginated",
    snap: flow !== "scrolled-doc", spread: "always"
  });
  registerHooks();
  const last = localStorage.getItem("last-location-" + currentBookUrl);
  rendition.display(cfi || last || undefined);
  rendition.on("relocated", location => {
    if (location?.start?.cfi) {
      localStorage.setItem("last-location-" + currentBookUrl, location.start.cfi);
      updateBookmarkStar();
      updatePageNav();
      const count = parseInt(localStorage.getItem("pages-read") || "0") + 1;
      localStorage.setItem("pages-read", count);
    }
  });
  updateSwipeListeners();
}
function registerHooks() {
  rendition.hooks.content.register(contents => {
    const doc = contents.document;
    doc.body.style.paddingTop = "20px";
    doc.body.style.paddingBottom = "30px";
    doc.body.style.margin = "0";
    applyThemeStylesFromCurrent();
  });
}
function updateSwipeListeners() {
  const viewer = document.getElementById("viewer");
  const swipe = currentFlow === "swipe";
  viewer.removeEventListener("touchstart", handleTouchStart);
  viewer.removeEventListener("touchend", handleTouchEnd);
  document.getElementById("gesture-left").style.pointerEvents = swipe ? "auto" : "none";
  document.getElementById("gesture-right").style.pointerEvents = swipe ? "auto" : "none";
  if (swipe) {
    viewer.addEventListener("touchstart", handleTouchStart, false);
    viewer.addEventListener("touchend", handleTouchEnd, false);
  }
}
function handleTouchStart(e) {
  const t = e.touches[0];
  xDown = t.clientX; yDown = t.clientY;
}
function handleTouchEnd(e) {
  const t = e.changedTouches[0];
  const xUp = t.clientX, yUp = t.clientY;
  const xDiff = xDown - xUp, yDiff = yDown - yUp;
  if (Math.abs(xDiff) > Math.abs(yDiff) && Math.abs(xDiff) > SWIPE_THRESHOLD) {
    xDiff > 0 ? swipeNext() : swipePrev();
  }
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
function toggleBookmarkDropdown() {
  document.getElementById("bookmark-panel").classList.toggle("open");
}
function toggleBookmark() {
  const loc = rendition.currentLocation();
  const cfi = loc?.start?.cfi;
  if (!cfi) return;
  const index = bookmarks.findIndex(b => b.cfi === cfi);
  if (index !== -1) bookmarks.splice(index, 1);
  else {
    let snippet = "";
    rendition.getContents().forEach(c => {
      if (!snippet && c.document?.body?.textContent) {
        snippet = c.document.body.textContent.trim().substring(0, 100) + "...";
      }
    });
    bookmarks.push({ cfi, snippet });
  }
  saveBookmarks();
  updateBookmarkStar();
}
function updateBookmarkUI() {
  const panel = document.getElementById("bookmark-panel");
  panel.innerHTML = "";
  if (!bookmarks.length) {
    const empty = document.createElement("div");
    empty.textContent = "No bookmarks yet.";
    panel.appendChild(empty);
    return;
  }
  bookmarks.forEach(b => {
    const item = document.createElement("div");
    item.textContent = b.snippet || "Bookmark";
    item.addEventListener("click", () => {
      rendition.display(b.cfi);
      panel.classList.remove("open");
    });
    panel.appendChild(item);
  });
}
function updateBookmarkStar() {
  const btn = document.getElementById("bookmark-toggle");
  const cfi = rendition?.currentLocation()?.start?.cfi;
  const exists = bookmarks.some(b => b.cfi === cfi);
  btn.textContent = exists ? "★" : "☆";
  btn.style.color = exists ? "blue" : "inherit";
}
function getBookmarkKey() {
  return "bookmarks_" + currentBookUrl;
}
function saveBookmarks() {
  localStorage.setItem(getBookmarkKey(), JSON.stringify(bookmarks));
  updateBookmarkUI();
}
function loadBookmarks() {
  const data = localStorage.getItem(getBookmarkKey());
  bookmarks = data ? JSON.parse(data) : [];
  updateBookmarkUI();
}
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
    const doc = c.document;
    doc.documentElement.style.background = bg;
    doc.body.style.background = bg;
    doc.body.style.color = color;
  });
}
function applyFontSwitch() {
  const font = localStorage.getItem("reader-font") || "-apple-system";
  if (font === "OpenDyslexic") {
    const style = `
      @font-face { font-family: "OpenDyslexic"; src: url("/fonts/OpenDyslexic-Regular.otf"); }
      body { font-family: "OpenDyslexic", sans-serif !important; }
    `;
    rendition.getContents().forEach(c => {
      const doc = c.document;
      let s = doc.getElementById("OpenDyslexicStyle");
      if (!s) {
        s = doc.createElement("style");
        s.id = "OpenDyslexicStyle";
        s.textContent = style;
        doc.head.appendChild(s);
      }
    });
  } else {
    rendition.themes.override("body", {
      "font-family": font + ", serif !important"
    });
  }
}
function updatePageNav() {
  const loc = rendition?.currentLocation();
  if (!loc?.start?.cfi || !book?.locations) return;
  const percent = book.locations.percentageFromCfi(loc.start.cfi);
  const totalPages = book.locations.total;
  const page = Math.round(percent * totalPages);
  const readCount = parseInt(localStorage.getItem("pages-read") || "0");
  document.getElementById("nav-info").textContent = `Page ${page} of ${totalPages} — Pages read: ${readCount}`;
  document.getElementById("nav-slider").value = Math.round(percent * 100);
}
function cleanupReader() {
  document.getElementById("tap-left").removeEventListener("click", swipePrev);
  document.getElementById("tap-right").removeEventListener("click", swipeNext);
}

const bookParam = new URLSearchParams(window.location.search).get("book");
const theBookUrl = bookParam || localStorage.getItem("last-book");
if (theBookUrl) {
  document.getElementById("reader-container").style.display = "block";
  document.getElementById("library-container").style.display = "none";
  initBook(theBookUrl);
} else {
  document.getElementById("reader-container").style.display = "none";
  document.getElementById("library-container").style.display = "block";
}
changeTheme(localStorage.getItem("reader-theme") || "light");
