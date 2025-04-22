// === GLOBAL VARS ===
let lastNonNightTheme = "light";
let currentBookUrl = "";
let bookmarks = [];
let book, rendition;
let swipeInProgress = false;
let xDown = null;
let yDown = null;
const SWIPE_THRESHOLD = 20;
let currentFontSize = parseInt(localStorage.getItem("reader-font-size")) || 100;
let currentFlow = localStorage.getItem("reading-mode") || "swipe";
let openMenuType = null;

// === TAP/SWIPE HANDLERS ===
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

// === EVENT: MENU TOGGLE ===
function toggleMenu(type) {
  closeMenus();
  if (type === 'menu') {
    document.getElementById("expanded-menu").classList.add("open");
    document.getElementById("menu-backdrop").style.display = "block";
  } else if (type === 'settings') {
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

// === EVENT: TOOLBAR BUTTONS ===
document.getElementById("menu-toggle").onclick = () => toggleMenu("menu");
document.getElementById("settings-toggle").onclick = () => toggleMenu("settings");
document.getElementById("toc-toggle").onclick = () => {
  document.getElementById("toc-panel").classList.toggle("open");
};
document.getElementById("theme-toggle").onclick = () => {
  closeMenus();
  if (document.body.classList.contains("night-mode")) {
    changeTheme(lastNonNightTheme);
  } else {
    lastNonNightTheme = document.getElementById("theme-select").value;
    changeTheme("night");
  }
};
document.getElementById("theme-select").onchange = e => changeTheme(e.target.value);
document.getElementById("bookmark-toggle").onclick = () => toggleBookmark();
document.getElementById("bookmark-dropdown").onclick = () => toggleBookmarkDropdown();
document.getElementById("font-switcher").onchange = e => {
  const selectedFont = e.target.value;
  localStorage.setItem("reader-font", selectedFont);
  applyFontSwitch();
};
document.getElementById("reading-mode").onchange = e => {
  const newMode = e.target.value;
  localStorage.setItem("reading-mode", newMode);
  currentFlow = newMode;
  const currentLocation = rendition?.location?.start?.cfi || localStorage.getItem("last-location-" + currentBookUrl);
  rendition.destroy();
  setTimeout(() => {
    initRendition(newMode, currentLocation);
  }, 50);
};

// === THEME + FONT ===
function changeTheme(theme) {
  document.body.className = "";
  document.body.classList.add(`${theme}-mode`);
  document.getElementById("theme-toggle").textContent = theme === "night" ? "☀️" : "🌙";
  document.getElementById("theme-select").value = theme;
  localStorage.setItem("reader-theme", theme);
  applyThemeStylesFromCurrent();
}
function applyThemeStylesFromCurrent() {
  if (!rendition) return;
  let bg = "#fff", color = "#000";
  if (document.body.classList.contains("night-mode")) { bg = "#111"; color = "#eee"; }
  else if (document.body.classList.contains("sepia-mode")) { bg = "#f4ecd8"; color = "#000"; }
  else if (document.body.classList.contains("matcha-mode")) { bg = "#C3D8B6"; color = "#000"; }
  else { bg = "#f5f5f5"; color = "#000"; }
  rendition.getContents().forEach(contents => {
    const doc = contents.document;
    doc.documentElement.style.background = bg;
    doc.body.style.background = bg;
    doc.body.style.color = color;
  });
}
function applyFontSwitch() {
  const storedFont = localStorage.getItem("reader-font") || "-apple-system";
  document.getElementById("font-switcher").value = storedFont;
  if (rendition) {
    if (storedFont === "OpenDyslexic") {
      const style = `
        @font-face {
          font-family: "OpenDyslexic";
          src: url("/fonts/OpenDyslexic-Regular.otf") format("opentype");
        }
        body { font-family: "OpenDyslexic", sans-serif !important; }
      `;
      rendition.getContents().forEach(contents => {
        const doc = contents.document;
        let existing = doc.getElementById("OpenDyslexicStyle");
        if (!existing) {
          existing = doc.createElement("style");
          existing.id = "OpenDyslexicStyle";
          existing.textContent = style;
          doc.head.appendChild(existing);
        }
      });
    } else {
      rendition.themes.override("body", {
        "font-family": storedFont + ", serif !important"
      });
    }
  }
}

// === BOOKMARKS ===
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
  bookmarks.forEach(bm => {
    const item = document.createElement("div");
    item.textContent = bm.snippet || "(Bookmark)";
    item.onclick = () => {
      rendition.display(bm.cfi);
      toggleBookmarkDropdown();
    };
    container.appendChild(item);
  });
}
function updateBookmarkStar() {
  const btn = document.getElementById("bookmark-toggle");
  const cfi = rendition?.currentLocation()?.start?.cfi;
  const exists = bookmarks.some(bm => bm.cfi === cfi);
  btn.textContent = exists ? "★" : "☆";
  btn.style.color = exists ? "blue" : "inherit";
}
function toggleBookmark() {
  const location = rendition.currentLocation();
  const cfi = location?.start?.cfi;
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
function toggleBookmarkDropdown() {
  document.getElementById("bookmark-panel").classList.toggle("open");
}

// === INIT: BOOK LOAD & RENDER ===
function initBook(chosenUrl) {
  if (!chosenUrl) return;
  currentBookUrl = chosenUrl;
  if (rendition) rendition.destroy();
  if (book) book.destroy();
  book = ePub(chosenUrl);
  book.ready.then(() => {
    initRendition(currentFlow);
    setTimeout(() => book.locations.generate(1600), 100);
    book.loaded.metadata.then(meta => {
      document.getElementById("book-title").textContent = meta.title || "Untitled";
      document.getElementById("book-author").textContent = meta.creator || "";
    });
    book.loaded.cover
      .then(coverUrl => book.archive.createUrl(coverUrl, { base64: true }))
      .then(data => { document.getElementById("cover").src = data; })
      .catch(() => {});
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
function registerReaderEvents() {
  document.getElementById("tap-left").addEventListener("click", () => {
    if (currentFlow === "paginated" && rendition) rendition.prev();
  });
  document.getElementById("tap-right").addEventListener("click", () => {
    if (currentFlow === "paginated" && rendition) rendition.next();
  });
}
function updateSwipeListeners() {
  const viewer = document.getElementById("viewer");
  if (currentFlow === "swipe") {
    viewer.addEventListener("touchstart", handleTouchStart, false);
    viewer.addEventListener("touchend", handleTouchEnd, false);
  } else {
    viewer.removeEventListener("touchstart", handleTouchStart, false);
    viewer.removeEventListener("touchend", handleTouchEnd, false);
  }
}

// === AUTO LOAD ON PAGE OPEN ===
const urlParams = new URLSearchParams(window.location.search);
const bookParam = urlParams.get("book");
const lastSavedBook = localStorage.getItem("last-book");
const theBookUrl = bookParam ? decodeURIComponent(bookParam) : lastSavedBook;
const savedTheme = localStorage.getItem("reader-theme") || "light";
changeTheme(savedTheme);

if (theBookUrl) {
  document.getElementById("library-container").style.display = "none";
  document.getElementById("reader-container").style.display = "block";
  initBook(theBookUrl);
} else {
  document.getElementById("library-container").style.display = "block";
  document.getElementById("reader-container").style.display = "none";
}
