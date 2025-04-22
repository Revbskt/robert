// === Global State ===
let book, rendition;
let bookmarks = [];
let currentBookUrl = "";
let currentFlow = localStorage.getItem("reading-mode") || "swipe";
let currentFontSize = parseInt(localStorage.getItem("reader-font-size")) || 100;
let lastNonNightTheme = "light";
let xDown = null, yDown = null;
let swipeInProgress = false;

// === Book Load Handling ===
function initBook(url) {
  currentBookUrl = url;
  book = ePub(url);
  rendition = book.renderTo("viewer", {
    width: "100%",
    height: "100%",
    flow: currentFlow === "scrolled-doc" ? "scrolled" : "paginated",
    snap: currentFlow !== "scrolled-doc",
    spread: "always",
    direction: "ltr"
  });

  const cfi = localStorage.getItem("last-location-" + url);
  rendition.display(cfi || undefined);
  registerReaderEvents();

  book.ready.then(() => {
    book.locations.generate(1600).then(() => updateCompassInfo());
    lazyBuildIndex();
  });

  book.loaded.metadata.then(meta => {
    document.getElementById("book-title").textContent = meta.title || "Untitled";
    document.getElementById("book-author").textContent = meta.creator || "";
  });

  book.loaded.cover
    .then(cover => book.archive.createUrl(cover, { base64: true }))
    .then(url => { document.getElementById("cover").src = url; })
    .catch(() => {});

  book.loaded.navigation.then(nav => {
    const tocPanel = document.getElementById("toc-panel");
    tocPanel.innerHTML = "";
    nav.toc.forEach(chapter => {
      if (/contents|table of contents/i.test(chapter.label)) return;
      const link = document.createElement("a");
      link.textContent = chapter.label;
      link.href = "#";
      link.addEventListener("click", e => {
        e.preventDefault();
        rendition.display(chapter.href);
        tocPanel.classList.remove("open");
      });
      tocPanel.appendChild(link);
    });
  });

  rendition.on("relocated", location => {
    localStorage.setItem("last-location-" + currentBookUrl, location.start.cfi);
    updateBookmarkStar();
    updateCompassInfo();
  });

  rendition.on("rendered", () => {
    applyFontSwitch();
    applyThemeStylesFromCurrent();
    updateBookmarkStar();
  });
}

// === Library + Navigation ===
function toggleLibrary(force) {
  const lib = document.getElementById("library-container");
  const reader = document.getElementById("reader-container");
  const showLib = typeof force === "boolean" ? force : lib.style.display !== "block";
  lib.style.display = showLib ? "block" : "none";
  reader.style.display = showLib ? "none" : "block";
  closeMenus();
}

function loadLibrary() {
  const library = document.getElementById("library");
  fetch("/ebooks/library.json")
    .then(res => res.json())
    .then(books => {
      library.innerHTML = "";
      books.forEach(book => {
        const div = document.createElement("div");
        div.className = "book";
        div.innerHTML = `
          <img src="${book.cover}" />
          <h3>${book.title}</h3>
          <p>${book.author}</p>
          <button onclick="readBook('${book.fileUrl}')">Read</button>
        `;
        library.appendChild(div);
      });
    });
}
loadLibrary();

function readBook(url) {
  if (rendition) {
    const loc = rendition.currentLocation();
    if (loc?.start?.cfi) {
      localStorage.setItem("last-location-" + currentBookUrl, loc.start.cfi);
    }
    rendition.destroy();
  }
  localStorage.setItem("last-book", url);
  window.history.replaceState({}, "", `?book=${encodeURIComponent(url)}`);
  initBook(url);
  toggleLibrary(false);
}

// === Tap + Swipe ===
function registerReaderEvents() {
  document.getElementById("tap-left").addEventListener("click", () => {
    if (currentFlow === "paginated") rendition.prev();
  });
  document.getElementById("tap-right").addEventListener("click", () => {
    if (currentFlow === "paginated") rendition.next();
  });
  const viewer = document.getElementById("viewer");
  viewer.addEventListener("touchstart", e => {
    const t = e.touches[0];
    xDown = t.clientX;
    yDown = t.clientY;
  }, false);
  viewer.addEventListener("touchend", e => {
    if (!xDown || !yDown) return;
    const xUp = e.changedTouches[0].clientX;
    const xDiff = xDown - xUp;
    if (Math.abs(xDiff) > 50) {
      if (xDiff > 0) swipeNext(); else swipePrev();
    }
    xDown = null; yDown = null;
  });
}

function swipeNext() {
  if (swipeInProgress) return;
  swipeInProgress = true;
  const viewer = document.getElementById("viewer");
  viewer.classList.add("swipe-transition");
  viewer.style.transform = "translateX(-100%)";
  setTimeout(() => {
    rendition.next();
    viewer.style.transform = "";
    viewer.classList.remove("swipe-transition");
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
    viewer.style.transform = "";
    viewer.classList.remove("swipe-transition");
    swipeInProgress = false;
  }, 300);
}

// === Bookmark ===
function getBookmarkKey() {
  return "bookmarks_" + currentBookUrl;
}

function loadBookmarks() {
  const raw = localStorage.getItem(getBookmarkKey());
  bookmarks = raw ? JSON.parse(raw) : [];
  updateBookmarkUI();
}

function toggleBookmark() {
  const cfi = rendition?.currentLocation()?.start?.cfi;
  if (!cfi) return;
  const exists = bookmarks.find(b => b.cfi === cfi);
  if (exists) {
    bookmarks = bookmarks.filter(b => b.cfi !== cfi);
  } else {
    const snippet = rendition.getContents()?.[0]?.document?.body?.textContent?.trim().slice(0, 100) + "...";
    bookmarks.push({ cfi, snippet });
  }
  localStorage.setItem(getBookmarkKey(), JSON.stringify(bookmarks));
  updateBookmarkUI();
  updateBookmarkStar();
}

function updateBookmarkStar() {
  const cfi = rendition?.currentLocation()?.start?.cfi;
  const btn = document.getElementById("bookmark-toggle");
  const marked = bookmarks.some(b => b.cfi === cfi);
  btn.textContent = marked ? "★" : "☆";
  btn.style.color = marked ? "blue" : "";
}

function updateBookmarkUI() {
  const panel = document.getElementById("bookmark-panel");
  panel.innerHTML = bookmarks.length ? "" : "<div>No bookmarks yet.</div>";
  bookmarks.forEach(b => {
    const div = document.createElement("div");
    div.textContent = b.snippet;
    div.onclick = () => {
      rendition.display(b.cfi);
      panel.classList.remove("open");
    };
    panel.appendChild(div);
  });
}

function toggleBookmarkDropdown() {
  document.getElementById("bookmark-panel").classList.toggle("open");
}

// === Compass + Page Nav ===
function updateCompassInfo() {
  const cfi = rendition?.location?.start?.cfi;
  const page = book?.locations?.locationFromCfi(cfi) || 0;
  const total = book?.locations?.length() || 100;
  document.getElementById("location-info").textContent = `Page ${page} of ${total} • CFI: ${cfi}`;
  document.getElementById("page-slider").value = Math.floor((page / total) * 100);
}

document.getElementById("page-slider").addEventListener("input", e => {
  const pct = parseInt(e.target.value, 10) / 100;
  const cfi = book?.locations?.cfiFromPercentage(pct);
  if (cfi) rendition.display(cfi);
});

document.getElementById("compass-toggle").addEventListener("click", () => {
  document.getElementById("compass-panel").classList.toggle("open");
});

// === Search ===
let lunrIndex = null, chapters = [];

document.getElementById("search-input").addEventListener("input", function () {
  const q = this.value.trim();
  const resultsDiv = document.getElementById("search-results");
  resultsDiv.innerHTML = "";
  if (!q || !lunrIndex) return;
  const results = lunrIndex.search(q);
  results.forEach(res => {
    const item = chapters.find(c => c.id === res.ref);
    if (item) {
      const div = document.createElement("div");
      div.textContent = item.text.slice(0, 120) + "...";
      div.addEventListener("click", () => {
        rendition.display(item.cfi);
        document.getElementById("compass-panel").classList.remove("open");
      });
      resultsDiv.appendChild(div);
    }
  });
});

function lazyBuildIndex() {
  chapters = [];
  lunrIndex = lunr(function () {
    this.ref("id");
    this.field("text");
    let i = 0;
    book.spine.each(item => {
      item.load(book.archive).then(doc => {
        const text = doc.body.textContent.trim();
        if (text.length > 50) {
          const id = "chap_" + i++;
          const cfi = item.cfiBase;
          chapters.push({ id, text, cfi });
          this.add({ id, text });
        }
      });
    });
  });
}

// === Fonts + Themes ===
function applyFontSwitch() {
  const font = localStorage.getItem("reader-font") || "-apple-system";
  document.getElementById("font-switcher").value = font;
  if (font === "OpenDyslexic") {
    const styleTag = document.createElement("style");
    styleTag.innerHTML = `
      @font-face {
        font-family: "OpenDyslexic";
        src: url("/fonts/OpenDyslexic-Regular.otf") format("opentype");
      }
      body { font-family: "OpenDyslexic", sans-serif !important; }
    `;
    rendition.getContents().forEach(c => {
      if (!c.document.getElementById("OpenDyslexicStyle")) {
        const clone = styleTag.cloneNode(true);
        clone.id = "OpenDyslexicStyle";
        c.document.head.appendChild(clone);
      }
    });
  } else {
    rendition.themes.override("body", {
      "font-family": font + ", serif !important"
    });
  }
}

document.getElementById("font-switcher").addEventListener("change", e => {
  localStorage.setItem("reader-font", e.target.value);
  applyFontSwitch();
});

function changeFontSize(delta) {
  currentFontSize = Math.max(60, Math.min(200, currentFontSize + delta * 10));
  localStorage.setItem("reader-font-size", currentFontSize);
  if (rendition) rendition.themes.fontSize(currentFontSize + "%");
}

function changeTheme(theme) {
  document.body.className = "";
  document.body.classList.add(theme + "-mode");
  document.getElementById("theme-toggle").textContent = theme === "night" ? "☀️" : "🌙";
  localStorage.setItem("reader-theme", theme);
  document.getElementById("theme-select").value = theme;
  applyThemeStylesFromCurrent();
}

document.getElementById("theme-toggle").addEventListener("click", () => {
  const isNight = document.body.classList.contains("night-mode");
  if (isNight) {
    changeTheme(lastNonNightTheme);
  } else {
    lastNonNightTheme = document.getElementById("theme-select").value;
    changeTheme("night");
  }
});

document.getElementById("theme-select").addEventListener("change", e => {
  changeTheme(e.target.value);
});

function applyThemeStylesFromCurrent() {
  if (!rendition) return;
  const theme = document.body.className;
  const bg = getComputedStyle(document.body).backgroundColor;
  const color = getComputedStyle(document.body).color;
  rendition.getContents().forEach(c => {
    const doc = c.document;
    doc.body.style.background = bg;
    doc.body.style.color = color;
  });
}

// === Modal + Menu ===
let openMenuType = null;

function toggleMenu(type) {
  if (openMenuType === type) return closeMenus();
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

// === TOC, Continue, Startup ===
document.getElementById("toc-toggle").addEventListener("click", () => {
  document.getElementById("toc-panel").classList.toggle("open");
});

document.getElementById("bookmark-toggle").addEventListener("click", toggleBookmark);
document.getElementById("bookmark-dropdown").addEventListener("click", toggleBookmarkDropdown);
document.getElementById("menu-toggle").addEventListener("click", () => { toggleMenu("menu"); });
document.getElementById("settings-toggle").addEventListener("click", () => { toggleMenu("settings"); });

document.getElementById("reading-mode").addEventListener("change", e => {
  const mode = e.target.value;
  localStorage.setItem("reading-mode", mode);
  currentFlow = mode;
  const cfi = rendition.location?.start?.cfi || localStorage.getItem("last-location-" + currentBookUrl);
  rendition.destroy();
  initBook(currentBookUrl);
  setTimeout(() => rendition.display(cfi), 100);
});

document.getElementById("continue-bar").addEventListener("click", () => {
  if (rendition) rendition.next();
});

// === Initialize ===
const urlParams = new URLSearchParams(window.location.search);
const bookParam = urlParams.get("book");
const lastSavedBook = localStorage.getItem("last-book");
const theBookUrl = bookParam || lastSavedBook;

if (theBookUrl) {
  document.getElementById("library-container").style.display = "none";
  document.getElementById("reader-container").style.display = "block";
  initBook(theBookUrl);
} else {
  document.getElementById("library-container").style.display = "block";
  document.getElementById("reader-container").style.display = "none";
}

const savedTheme = localStorage.getItem("reader-theme") || "light";
document.getElementById("theme-select").value = savedTheme;
changeTheme(savedTheme);
