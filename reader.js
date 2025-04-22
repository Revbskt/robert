/* ---------------  Global State  --------------- */
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

/* ---------------  Utility: Bookmark Storage  --------------- */
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

/* ---------------  Bookmark Star / UI  --------------- */
function updateBookmarkStar() {
  const btn = document.getElementById("bookmark-toggle");
  const cfi = rendition?.currentLocation()?.start?.cfi;
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
    const empty = document.createElement("div");
    empty.textContent = "No bookmarks yet.";
    frag.appendChild(empty);
  } else {
    bookmarks.forEach(bm => {
      const item = document.createElement("div");
      item.textContent = `Page ${bm.page || "?"} - ${bm.snippet}`;
      item.addEventListener("click", () => {
        rendition.display(bm.cfi);
        toggleBookmarkDropdown();
      });
      frag.appendChild(item);
    });
  }
  container.appendChild(frag);
}

/* ---------------  Bookmark Toggle  --------------- */
function toggleBookmark() {
  const loc = rendition.currentLocation();
  if (!loc?.start?.cfi) return;
  const cfi = loc.start.cfi;
  const idx = bookmarks.findIndex(bm => bm.cfi === cfi);
  if (idx !== -1) bookmarks.splice(idx, 1);
  else {
    let snippet = "";
    rendition.getContents().forEach(c => {
      const txt = c.document.body?.textContent?.trim();
      if (txt && !snippet) snippet = txt.slice(0, 100) + "...";
    });
    const pageNum = loc.start.index ?? "?";
    bookmarks.push({ cfi, snippet, page: pageNum });
  }
  saveBookmarks();
  updateBookmarkStar();
}
function toggleBookmarkDropdown() {
  document.getElementById("bookmark-panel").classList.toggle("open");
}

/* ---------------  Cleanup / Event Handling  --------------- */
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

/* ---------------  Library Loading  --------------- */
const libraryDiv = document.getElementById("library");
function loadLibrary() {
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

/* ---------------  Reading Logic  --------------- */
function readBook(epubUrl) {
  if (rendition && currentBookUrl) {
    const loc = rendition.currentLocation();
    if (loc?.start?.cfi) localStorage.setItem("last-location-" + currentBookUrl, loc.start.cfi);
  }
  cleanupReader();
  localStorage.setItem("last-book", epubUrl);
  const params = new URLSearchParams(location.search);
  params.set("book", epubUrl);
  history.replaceState({}, "", `?${params}`);
  initBook(epubUrl);
  toggleLibrary(false);
}

/* ---------------  Swipe Handling  --------------- */
function tapLeftHandler() { if (currentFlow === "paginated") rendition.prev(); }
function tapRightHandler() { if (currentFlow === "paginated") rendition.next(); }

function updateSwipeListeners() {
  const viewer = document.getElementById("viewer");
  if (currentFlow === "swipe") {
    ["tap-left","tap-right"].forEach(id => document.getElementById(id).style.pointerEvents = "none");
    viewer.addEventListener("touchstart", handleTouchStart);
    viewer.addEventListener("touchend", handleTouchEnd);
    ["gesture-left","gesture-right"].forEach(id => {
      const el = document.getElementById(id);
      el.style.pointerEvents = "auto";
      el.addEventListener("click", id === "gesture-left" ? swipePrev : swipeNext);
    });
  } else {
    viewer.removeEventListener("touchstart", handleTouchStart);
    viewer.removeEventListener("touchend", handleTouchEnd);
    ["gesture-left","gesture-right"].forEach(id => {
      document.getElementById(id).removeEventListener("click", swipePrev);
      document.getElementById(id).removeEventListener("click", swipeNext);
      document.getElementById(id).style.pointerEvents = "none";
    });
    ["tap-left","tap-right"].forEach(id => document.getElementById(id).style.pointerEvents = "auto");
  }
}
function handleTouchStart(e) {
  if (currentFlow !== "swipe") return;
  xDown = e.touches[0].clientX;
  yDown = e.touches[0].clientY;
}
function handleTouchEnd(e) {
  if (currentFlow !== "swipe" || !xDown || !yDown) return;
  const xUp = e.changedTouches[0].clientX;
  const yUp = e.changedTouches[0].clientY;
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

/* ---------------  Font Handling  --------------- */
function applyFontSwitch() {
  const storedFont = localStorage.getItem("reader-font") || "-apple-system";
  document.getElementById("font-switcher").value = storedFont;
  if (!rendition) return;
  if (storedFont === "OpenDyslexic") {
    const tpl = document.createElement("style");
    tpl.innerHTML = `
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
      let el = c.document.getElementById("OpenDyslexicStyle");
      if (!el) {
        el = tpl.cloneNode(true);
        el.id = "OpenDyslexicStyle";
        c.document.head.appendChild(el);
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

/* ---------------  Init / Rendition  --------------- */
function initBook(url) {
  if (!url) return;
  currentBookUrl = url;
  bookmarks = [];
  rendition?.destroy();
  book?.destroy();

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
      .then(c => book.archive.createUrl(c, { base64: true }))
      .then(u => { document.getElementById("cover").src = u; })
      .catch(() => console.warn("No cover image found."));

    book.loaded.navigation.then(nav => {
      const toc = document.getElementById("toc-panel");
      toc.innerHTML = "";
      nav.toc.forEach(ch => {
        if (/contents|table of contents/i.test(ch.label)) return;
        const a = document.createElement("a");
        a.textContent = ch.label;
        a.href = "#";
        a.addEventListener("click", e => {
          e.preventDefault();
          rendition.display(ch.href);
          toc.classList.remove("open");
        });
        toc.appendChild(a);
      });

      const about = nav.toc.find(ch => /about|author/i.test(ch.label));
      if (about) {
        const spineItem = book.spine.getByHref(about.href);
        spineItem?.load(book.archive).then(doc => {
          const img = doc.querySelector("img[src$='.jpg'], img[src$='.jpeg'], img[src$='.png']");
          if (img) {
            const src = img.getAttribute("src");
            book.archive.createUrl(src, { base64: true }).then(url => {
              const ctn = document.getElementById("contact-image");
              ctn.innerHTML = "";
              const im = document.createElement("img");
              im.src = url;
              ctn.appendChild(im);
            });
          }
        });
      }
    });

    applyFontSwitch();
    loadBookmarks();
  });
}

function initRendition(flow, cfi) {
  rendition = book.renderTo("viewer", {
    width: "100%", height: "100%",
    flow: flow === "scrolled-doc" ? "scrolled" : "paginated",
    snap: flow === "scrolled-doc" ? false : true,
    spread: "always", direction: "ltr"
  });
  registerHooks();
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

function registerHooks() {
  rendition.hooks.content.register(c => {
    const doc = c.document;
    if (currentFlow === "scrolled-doc") {
      doc.body.style.margin = doc.documentElement.style.margin = "0";
      doc.body.style.padding = doc.documentElement.style.padding = "0";
      doc.body.style.paddingBottom = "30px";
      ["tap-left","tap-right"].forEach(id => document.getElementById(id).style.pointerEvents = "none");

      const sentinel = doc.createElement("div");
      sentinel.style.width = "100%";
      sentinel.style.height = "1px";
      doc.body.appendChild(sentinel);

      const obs = new IntersectionObserver(entries => {
        const bar = document.getElementById("continue-bar");
        entries.forEach(e => bar.style.display = e.isIntersecting ? "block" : "none");
      }, { rootMargin: "0px 0px -30px 0px" });
      obs.observe(sentinel);
    } else {
      ["tap-left","tap-right"].forEach(id => document.getElementById(id).style.pointerEvents = "auto");
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

/* ---------------  Menus & Theme  --------------- */
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

/* ---------------  Toolbar Buttons  --------------- */
document.getElementById("menu-toggle").addEventListener("click", () => { closeMenus(); toggleMenu("menu"); });
document.getElementById("toc-toggle").addEventListener("click", () => { document.getElementById("toc-panel").classList.toggle("open"); });
document.getElementById("settings-toggle").addEventListener("click", () => { closeMenus(); toggleMenu("settings"); });
document.getElementById("theme-toggle").addEventListener("click", () => {
  closeMenus();
  if (document.body.classList.contains("night-mode")) changeTheme(lastNonNightTheme);
  else {
    lastNonNightTheme = document.getElementById("theme-select").value;
    changeTheme("night");
  }
});

/* ---------------  Bookmark Buttons  --------------- */
document.getElementById("bookmark-toggle").addEventListener("click", toggleBookmark);
document.getElementById("bookmark-dropdown").addEventListener("click", toggleBookmarkDropdown);

/* ---------------  Reading‑mode / Theme Selectors  --------------- */
document.getElementById("reading-mode").addEventListener("change", e => {
  const newMode = e.target.value;
  localStorage.setItem("reading-mode", newMode);
  currentFlow = newMode;
  if (!rendition || !book) return;
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
  if (theme === "night") document.body.classList.add("night-mode");
  else if (theme === "sepia") document.body.classList.add("sepia-mode");
  else if (theme === "matcha") document.body.classList.add("matcha-mode");
  else document.body.classList.add("light-mode");

  document.getElementById("theme-toggle").textContent = document.body.classList.contains("night-mode") ? "☀️" : "🌙";
  localStorage.setItem("reader-theme", theme);
  document.getElementById("theme-select").value = theme;
  applyThemeStylesFromCurrent();
}

/* ---------------  Continue Bar  --------------- */
document.getElementById("continue-bar").addEventListener("click", () => {
  if (currentFlow !== "scrolled-doc") { rendition?.next(); return; }
  const loc = rendition.currentLocation();
  const idx = loc?.start?.index;
  if (idx !== undefined) {
    const nextItem = book.spine.get(idx + 1);
    nextItem ? rendition.display(nextItem.href) : console.warn("No next chapter found.");
  }
});

/* ---------------  Initial Boot  --------------- */
const params = new URLSearchParams(location.search);
const bookParam = params.get("book");
const lastBook = localStorage.getItem("last-book");
const theBookUrl = bookParam ? decodeURIComponent(bookParam) : lastBook;

const libCtn = document.getElementById("library-container");
const readCtn = document.getElementById("reader-container");
let libraryVisible = !theBookUrl;
function toggleLibrary(force) {
  libraryVisible = typeof force === "boolean" ? force : !libraryVisible;
  libCtn.style.display = libraryVisible ? "block" : "none";
  readCtn.style.display = libraryVisible ? "none" : "block";
  closeMenus();
}
toggleLibrary(libraryVisible);

if (theBookUrl) initBook(theBookUrl);

const savedTheme = localStorage.getItem("reader-theme") || "light";
document.getElementById("theme-select").value = savedTheme;
changeTheme(savedTheme);
