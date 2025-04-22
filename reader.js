let book, rendition, index = null;
let bookmarks = [];
let currentBookUrl = "";
let currentFlow = localStorage.getItem("reading-mode") || "paginated";
let currentFontSize = parseInt(localStorage.getItem("reader-font-size")) || 100;

// Show/hide library
function toggleLibrary(force) {
  const lib = document.getElementById("library-container");
  const read = document.getElementById("reader-container");
  const showLib = typeof force === "boolean" ? force : lib.style.display === "none";
  lib.style.display = showLib ? "block" : "none";
  read.style.display = showLib ? "none" : "block";
}

// Load library
function loadLibrary() {
  const library = document.getElementById("library");
  fetch("ebooks/library.json")
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
    })
    .catch(() => {
      library.textContent = "Could not load book list.";
    });
}
loadLibrary();

// Start reader
function readBook(url) {
  localStorage.setItem("last-book", url);
  const params = new URLSearchParams(window.location.search);
  params.set("book", url);
  window.location.search = params.toString();
}

function initBook(url) {
  currentBookUrl = url;
  book = ePub(url);
  rendition = book.renderTo("viewer", {
    flow: currentFlow === "scrolled-doc" ? "scrolled" : "paginated",
    width: "100%",
    height: "100%",
    spread: "always"
  });

  rendition.display(localStorage.getItem("last-location-" + url) || undefined);
  applyFontSwitch();

  rendition.on("relocated", loc => {
    if (loc?.start?.cfi) {
      localStorage.setItem("last-location-" + url, loc.start.cfi);
      updateCompass(loc);
    }
  });

  // Bookmark init
  loadBookmarks();
  document.getElementById("bookmark-toggle").addEventListener("click", toggleBookmark);

  // Slider
  document.getElementById("page-slider").addEventListener("input", e => {
    const percent = parseFloat(e.target.value);
    if (book.locations) {
      const cfi = book.locations.cfiFromPercentage(percent / 100);
      rendition.display(cfi);
    }
  });

  // Search
  document.getElementById("search-input").addEventListener("input", e => {
    const val = e.target.value.trim().toLowerCase();
    const box = document.getElementById("search-results");
    box.innerHTML = "";
    if (index && val.length > 2) {
      const results = index.search(val);
      results.forEach(res => {
        const item = index.store[res.ref];
        const div = document.createElement("div");
        div.textContent = item.text.slice(0, 100) + "...";
        div.addEventListener("click", () => rendition.display(item.cfi));
        box.appendChild(div);
      });
    }
  });

  // Build locations & search index
  book.ready.then(() => {
    return book.locations.generate(1600).then(() => {
      buildSearchIndex();
    });
  });
}

// Toggle theme
function changeTheme(theme) {
  document.body.className = `${theme}-mode`;
  localStorage.setItem("reader-theme", theme);
  document.getElementById("theme-toggle").textContent = theme === "night" ? "☀️" : "🌙";
  document.getElementById("theme-select").value = theme;
}

// Font switch
function applyFontSwitch() {
  const font = localStorage.getItem("reader-font") || "-apple-system";
  document.getElementById("font-switcher").value = font;
  if (font === "OpenDyslexic") {
    const style = `
      @font-face {
        font-family: "OpenDyslexic";
        src: url("/fonts/OpenDyslexic-Regular.otf") format("opentype");
      }
      body { font-family: "OpenDyslexic", sans-serif !important; }
    `;
    rendition.getContents().forEach(c => {
      let el = c.document.getElementById("OpenDyslexicStyle");
      if (!el) {
        el = c.document.createElement("style");
        el.id = "OpenDyslexicStyle";
        el.innerHTML = style;
        c.document.head.appendChild(el);
      }
    });
  } else {
    rendition.themes.override("body", { "font-family": font });
  }
}

// Bookmarks
function getBookmarkKey() {
  return "bookmarks_" + currentBookUrl;
}
function loadBookmarks() {
  bookmarks = JSON.parse(localStorage.getItem(getBookmarkKey()) || "[]");
  updateBookmarkUI();
}
function saveBookmarks() {
  localStorage.setItem(getBookmarkKey(), JSON.stringify(bookmarks));
}
function updateBookmarkUI() {
  const panel = document.getElementById("bookmark-panel");
  panel.innerHTML = "";
  bookmarks.forEach(bm => {
    const div = document.createElement("div");
    div.textContent = `Page ${bm.page || "?"} - ${bm.snippet}`;
    div.onclick = () => rendition.display(bm.cfi);
    panel.appendChild(div);
  });
}
function toggleBookmark() {
  const loc = rendition.currentLocation();
  const cfi = loc?.start?.cfi;
  if (!cfi) return;
  const idx = bookmarks.findIndex(b => b.cfi === cfi);
  if (idx >= 0) {
    bookmarks.splice(idx, 1);
  } else {
    const snippet = rendition.getContents().map(c => c.document.body.textContent.trim().slice(0, 80)).join(" ");
    bookmarks.push({ cfi, snippet });
  }
  saveBookmarks();
  updateBookmarkUI();
}
function toggleBookmarkDropdown() {
  document.getElementById("bookmark-panel").classList.toggle("open");
}

// Compass
function updateCompass(loc) {
  if (!book?.locations || !loc?.start?.cfi) return;
  const percent = book.locations.percentageFromCfi(loc.start.cfi) * 100;
  document.getElementById("page-slider").value = percent.toFixed(2);
  document.getElementById("location-info").textContent = `Page ${Math.round(percent)} • CFI: ${loc.start.cfi}`;
}

// Build Search Index
function buildSearchIndex() {
  index = lunr(function () {
    this.ref("cfi");
    this.field("text");
    index.store = {};
    book.spine.each(item => {
      item.load(book.load.bind(book)).then(res => {
        const text = res.document.body.textContent;
        this.add({ cfi: item.cfiBase, text });
        index.store[item.cfiBase] = { cfi: item.cfiBase, text };
      });
    });
  });
}

// Init from param
const bookParam = new URLSearchParams(window.location.search).get("book");
if (bookParam) {
  toggleLibrary(false);
  initBook(bookParam);
} else {
  toggleLibrary(true);
}

// Event Listeners
document.getElementById("menu-toggle").onclick = () => toggleMenu('menu');
document.getElementById("toc-toggle").onclick = () => document.getElementById("toc-panel").classList.toggle("open");
document.getElementById("bookmark-dropdown").onclick = toggleBookmarkDropdown;
document.getElementById("compass-toggle").onclick = () => document.getElementById("compass-panel").classList.toggle("open");
document.getElementById("theme-toggle").onclick = () => {
  const current = localStorage.getItem("reader-theme") || "light";
  changeTheme(current === "night" ? "light" : "night");
};
document.getElementById("font-switcher").onchange = e => {
  localStorage.setItem("reader-font", e.target.value);
  applyFontSwitch();
};
document.getElementById("reading-mode").onchange = e => {
  localStorage.setItem("reading-mode", e.target.value);
  window.location.reload();
};
document.getElementById("theme-select").onchange = e => changeTheme(e.target.value);
