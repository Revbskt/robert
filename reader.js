// Global variables for theme, book, bookmarks, and swipe control
let lastNonNightTheme = "light";
let currentBookUrl = "";
let bookmarks = [];

let xDown = null;
let yDown = null;
const SWIPE_THRESHOLD = 20;
let swipeInProgress = false;

// Named tap handlers
function tapLeftHandler() {
  if (currentFlow === "paginated" && rendition) rendition.prev();
}
function tapRightHandler() {
  if (currentFlow === "paginated" && rendition) rendition.next();
}

// Cleanup old listeners
function cleanupReader() {
  const viewer = document.getElementById("viewer");
  viewer?.removeEventListener("touchstart", handleTouchStart);
  viewer?.removeEventListener("touchend", handleTouchEnd);
  document.getElementById("gesture-left")?.removeEventListener("click", swipePrev);
  document.getElementById("gesture-right")?.removeEventListener("click", swipeNext);
  document.getElementById("tap-left")?.removeEventListener("click", tapLeftHandler);
  document.getElementById("tap-right")?.removeEventListener("click", tapRightHandler);
}

// Bookmark storage helpers
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
function updateBookmarkStar() {
  const btn = document.getElementById("bookmark-toggle");
  const loc = rendition?.currentLocation();
  const cfi = loc?.start?.cfi;
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
    const d = document.createElement("div");
    d.textContent = "No bookmarks yet.";
    frag.appendChild(d);
  } else {
    bookmarks.forEach(bm => {
      const d = document.createElement("div");
      d.textContent = `Page ${bm.page || "?"} – ${bm.snippet}`;
      d.addEventListener("click", () => {
        rendition.display(bm.cfi);
        toggleBookmarkDropdown();
      });
      frag.appendChild(d);
    });
  }
  container.appendChild(frag);
}
function toggleBookmark() {
  const loc = rendition?.currentLocation();
  const cfi = loc?.start?.cfi;
  if (!cfi) return;
  const idx = bookmarks.findIndex(bm => bm.cfi === cfi);
  if (idx > -1) bookmarks.splice(idx, 1);
  else {
    let snippet = "";
    rendition.getContents().forEach(c => {
      const text = c.document.body?.textContent.trim();
      if (!snippet && text) snippet = text.substring(0, 100) + "...";
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

// Library ↔ reader toggle & load
const urlParams = new URLSearchParams(window.location.search);
const bookParam = urlParams.get("book");
const lastSaved = localStorage.getItem("last-book");
let theBookUrl = bookParam ? decodeURIComponent(bookParam) : (lastSaved || null);
const libCont = document.getElementById("library-container");
const readCont = document.getElementById("reader-container");
let libraryVisible = !theBookUrl;
if (theBookUrl) {
  readCont.style.display = "block";
  libCont.style.display = "none";
} else {
  readCont.style.display = "none";
  libCont.style.display = "block";
}
function toggleLibrary(force) {
  libraryVisible = typeof force === "boolean" ? force : !libraryVisible;
  libCont.style.display = libraryVisible ? "block" : "none";
  readCont.style.display = libraryVisible ? "none" : "block";
  closeMenus();
}
function loadLibrary() {
  const div = document.getElementById("library");
  div.textContent = "Loading books...";
  fetch("/ebooks/library.json")
    .then(r => r.json())
    .then(books => {
      div.innerHTML = "";
      books.forEach(b => {
        const elt = document.createElement("div");
        elt.className = "book";
        elt.innerHTML = `
          <img src="${b.cover}" alt="Cover of ${b.title}" />
          <h3>${b.title}</h3>
          <p>${b.author}</p>
          <button onclick="readBook('${b.fileUrl}')">Read</button>
        `;
        div.appendChild(elt);
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
  const params = new URLSearchParams(window.location.search);
  params.set("book", epubUrl);
  window.history.replaceState({}, "", `?${params.toString()}`);
  initBook(epubUrl);
  toggleLibrary(false);
}

// —— Reader logic ——
let book, rendition;
let currentFontSize = parseInt(localStorage.getItem("reader-font-size")) || 100;
let currentFlow = localStorage.getItem("reading-mode") || "paginated";

function updateSwipeListeners() {
  const viewer = document.getElementById("viewer");
  if (currentFlow === "swipe") {
    document.getElementById("tap-left").style.pointerEvents = "none";
    document.getElementById("tap-right").style.pointerEvents = "none";
    viewer.addEventListener("touchstart", handleTouchStart, false);
    viewer.addEventListener("touchend", handleTouchEnd, false);
    document.getElementById("gesture-left").style.pointerEvents = "auto";
    document.getElementById("gesture-right").style.pointerEvents = "auto";
    document.getElementById("gesture-left").addEventListener("click", swipePrev);
    document.getElementById("gesture-right").addEventListener("click", swipeNext);
  } else {
    viewer.removeEventListener("touchstart", handleTouchStart);
    viewer.removeEventListener("touchend", handleTouchEnd);
    document.getElementById("gesture-left").removeEventListener("click", swipePrev);
    document.getElementById("gesture-right").removeEventListener("click", swipeNext);
    document.getElementById("gesture-left").style.pointerEvents = "none";
    document.getElementById("gesture-right").style.pointerEvents = "none";
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
  if (currentFlow !== "swipe" || xDown === null) return;
  const xUp = evt.changedTouches[0].clientX;
  const yUp = evt.changedTouches[0].clientY;
  const xDiff = xDown - xUp;
  const yDiff = yDown - yUp;
  if (Math.abs(xDiff) > Math.abs(yDiff) && Math.abs(xDiff) > SWIPE_THRESHOLD) {
    xDiff > 0 ? swipeNext() : swipePrev();
  }
  xDown = null; yDown = null;
}

function swipeNext() {
  if (swipeInProgress) return;
  swipeInProgress = true;
  const v = document.getElementById("viewer");
  v.classList.add("swipe-transition");
  v.style.transform = "translateX(-100%)";
  setTimeout(() => {
    rendition.next();
    v.classList.remove("swipe-transition");
    v.style.transform = "";
    swipeInProgress = false;
  }, 300);
}
function swipePrev() {
  if (swipeInProgress) return;
  swipeInProgress = true;
  const v = document.getElementById("viewer");
  v.classList.add("swipe-transition");
  v.style.transform = "translateX(100%)";
  setTimeout(() => {
    rendition.prev();
    v.classList.remove("swipe-transition");
    v.style.transform = "";
    swipeInProgress = false;
  }, 300);
}

// Font switcher (including OpenDyslexic handling)
function applyFontSwitch() {
  const storedFont = localStorage.getItem("reader-font") || "-apple-system";
  document.getElementById("font-switcher").value = storedFont;
  if (!rendition) return;
  if (storedFont === "OpenDyslexic") {
    const styleEl = document.createElement("style");
    styleEl.id = "OpenDyslexicStyle";
    styleEl.innerHTML = `
      @font-face {
        font-family: "OpenDyslexic";
        src: url("/fonts/OpenDyslexic-Regular.otf") format("opentype");
      }
      body { font-family: "OpenDyslexic", sans-serif !important; }
    `;
    rendition.getContents().forEach(c => {
      const doc = c.document;
      if (!doc.getElementById("OpenDyslexicStyle")) {
        doc.head.appendChild(styleEl.cloneNode(true));
      }
    });
  } else {
    rendition.themes.override("body", { "font-family": storedFont + ", serif !important" });
    rendition.getContents().forEach(c => {
      const doc = c.document;
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

// Initialize book & rendition
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
      .then(cv => book.archive.createUrl(cv, { base64: true }))
      .then(dataUrl => { document.getElementById("cover").src = dataUrl; })
      .catch(() => console.warn("No cover image found."));
    book.loaded.navigation.then(nav => {
      const toc = document.getElementById("toc-panel");
      toc.innerHTML = "";
      nav.toc.forEach(ch => {
        if (!/contents|table of contents/i.test(ch.label)) {
          const a = document.createElement("a");
          a.textContent = ch.label;
          a.href = "#";
          a.addEventListener("click", ev => {
            ev.preventDefault();
            rendition.display(ch.href);
            toc.classList.remove("open");
          });
          toc.appendChild(a);
        }
      });
      // load author/contact image if present
      const about = nav.toc.find(ch => /about|author/i.test(ch.label));
      if (about) {
        const spineItem = book.spine.getByHref(about.href);
        spineItem.load(book.archive).then(doc => {
          const img = doc.querySelector("img[src$='.jpg'], img[src$='.jpeg'], img[src$='.png']");
          if (img) {
            const src = img.getAttribute("src");
            book.archive.createUrl(src, { base64: true })
              .then(url => {
                const c = document.getElementById("contact-image");
                c.innerHTML = "";
                const i = document.createElement("img");
                i.src = url;
                c.appendChild(i);
              })
              .catch(err => console.warn("Error creating URL for contact image:", err));
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
    width: "100%",
    height: "100%",
    flow: flow === "scrolled-doc" ? "scrolled" : "paginated",
    snap: flow !== "scrolled-doc",
    spread: "always",
    direction: "ltr"
  });
  registerHooks();
  const saved = localStorage.getItem("last-location-" + currentBookUrl);
  rendition.display(cfi || saved);
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
  if (flow === "scrolled-doc") {
    document.getElementById("toc-panel").classList.remove("open");
  }
}

function registerHooks() {
  rendition.hooks.content.register(c => {
    const d = c.document;
    if (currentFlow === "scrolled-doc") {
      d.body.style.margin = d.documentElement.style.margin = "0";
      d.body.style.padding = "0 0 30px 0";
      document.getElementById("tap-left").style.pointerEvents = "none";
      document.getElementById("tap-right").style.pointerEvents = "none";
      const sentinel = d.createElement("div");
      sentinel.style.width = "100%";
      sentinel.style.height = "1px";
      d.body.appendChild(sentinel);
      new IntersectionObserver(entries => {
        const cb = document.getElementById("continue-bar");
        entries.forEach(e => { cb.style.display = e.isIntersecting ? "block" : "none"; });
      }, { rootMargin: "0px 0px -30px 0px" }).observe(sentinel);
    } else {
      document.getElementById("tap-left").style.pointerEvents = "auto";
      document.getElementById("tap-right").style.pointerEvents = "auto";
      d.body.style.paddingTop = "20px";
      d.body.style.paddingBottom = "30px";
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

// Toolbar & control bindings
document.getElementById("menu-toggle").addEventListener("click", () => toggleMenu("menu"));
document.getElementById("toc-toggle").addEventListener("click", () => {
  document.getElementById("toc-panel").classList.toggle("open");
});
document.getElementById("settings-toggle").addEventListener("click", () => toggleMenu("settings"));
document.getElementById("theme-toggle").addEventListener("click", () => {
  closeMenus();
  if (document.body.classList.contains("night-mode")) {
    changeTheme(lastNonNightTheme);
  } else {
    lastNonNightTheme = document.getElementById("theme-select").value;
    changeTheme("night");
  }
});
document.getElementById("bookmark-toggle").addEventListener("click", toggleBookmark);
document.getElementById("bookmark-dropdown").addEventListener("click", toggleBookmarkDropdown);
document.getElementById("reading-mode").addEventListener("change", e => {
  localStorage.setItem("reading-mode", e.target.value);
  currentFlow = e.target.value;
  if (!rendition) return;
  const loc = rendition.currentLocation()?.start?.cfi || localStorage.getItem("last-location-" + currentBookUrl);
  rendition.destroy();
  setTimeout(() => initRendition(currentFlow, loc), 50);
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
  document.getElementById("theme-toggle").textContent =
    document.body.classList.contains("night-mode") ? "☀️" : "🌙";
  localStorage.setItem("reader-theme", theme);
  document.getElementById("theme-select").value = theme;
  applyThemeStylesFromCurrent();
}

document.getElementById("continue-bar").addEventListener("click", () => {
  if (!rendition || currentFlow !== "scrolled-doc") {
    rendition?.next();
    return;
  }
  const loc = rendition.currentLocation();
  const idx = loc?.start?.index;
  if (idx != null) {
    const next = book.spine.get(idx + 1);
    if (next) rendition.display(next.href);
    else console.warn("No next chapter found.");
  }
});

if (theBookUrl) initBook(theBookUrl);
changeTheme(localStorage.getItem("reader-theme") || "light");


// —— Highlighting Module ——
// Inline paragraph‐highlighting & note tool

// Module state
let highlightMode = false;
let selectedParagraph = null;
let selectedColor = 'yellow';
let highlights = [];
let currentEditingHighlight = null;

// DOM refs
const highlightToggleBtn = document.getElementById('highlight-toggle');
const paragraphs = document.querySelectorAll('.page-content p');
const highlightMenu = document.getElementById('highlight-menu');
const saveHighlightBtn = document.getElementById('save-highlight');
const cancelHighlightBtn = document.getElementById('cancel-highlight');
const noteInput = document.getElementById('note-input');
const colorOptions = document.querySelectorAll('.color-option');
const highlightsContainer = document.getElementById('highlights-container');
const noHighlightsMessage = document.getElementById('no-highlights-message');
const editNotePopup = document.getElementById('edit-note-popup');
const editNoteInput = document.getElementById('edit-note-input');
const saveEditBtn = document.getElementById('save-edit');
const cancelEditBtn = document.getElementById('cancel-edit');
const backToBookBtn = document.getElementById('back-to-book-btn');
const viewHighlightsBtn = document.getElementById('view-highlights-btn');
const bookView = document.getElementById('book-view');
const highlightsView = document.getElementById('highlights-view');

// Load highlights from localStorage
function loadHighlights() {
  const saved = localStorage.getItem('bookHighlights');
  if (saved) {
    try {
      highlights = JSON.parse(saved);
      highlights.forEach(h => {
        const p = paragraphs[h.paragraphIndex];
        if (p) p.className = 'highlight-' + h.color;
      });
    } catch {
      highlights = [];
    }
  }
}

// Save highlights
function saveHighlights() {
  localStorage.setItem('bookHighlights', JSON.stringify(highlights));
}

// Toast notification
function showToast(msg, duration = 2000) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// Toggle highlight mode
highlightToggleBtn.addEventListener('click', () => {
  highlightMode = !highlightMode;
  highlightToggleBtn.classList.toggle('active');
  if (highlightMode) showToast('Highlight mode on');
  else {
    showToast('Highlight mode off');
    if (selectedParagraph) {
      selectedParagraph.classList.remove('selected');
      selectedParagraph = null;
    }
  }
});

// Paragraph click handler
paragraphs.forEach(p => {
  p.addEventListener('click', () => {
    if (!highlightMode) return;
    if (selectedParagraph) selectedParagraph.classList.remove('selected');
    selectedParagraph = p;
    p.classList.add('selected');
    highlightMenu.style.display = 'block';
    noteInput.value = '';
  });
});

// Color options
colorOptions.forEach(opt => {
  opt.addEventListener('click', () => {
    selectedColor = opt.dataset.color;
    colorOptions.forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
  });
});

// Save new highlight
saveHighlightBtn.addEventListener('click', () => {
  if (!selectedParagraph) return;
  const idx = Number(selectedParagraph.dataset.index);
  const note = noteInput.value.trim();
  selectedParagraph.className = 'highlight-' + selectedColor;
  selectedParagraph.classList.remove('selected');
  highlights.push({
    id: Date.now(),
    paragraphIndex: idx,
    text: selectedParagraph.textContent,
    color: selectedColor,
    note,
    timestamp: new Date().toISOString()
  });
  saveHighlights();
  highlightMenu.style.display = 'none';
  selectedParagraph = null;
  showToast(note ? 'Highlight + note saved' : 'Highlight saved');
});

// Cancel highlight
cancelHighlightBtn.addEventListener('click', () => {
  if (selectedParagraph) selectedParagraph.classList.remove('selected');
  selectedParagraph = null;
  highlightMenu.style.display = 'none';
});

// View highlights list
viewHighlightsBtn.addEventListener('click', () => {
  bookView.style.display = 'none';
  highlightsView.style.display = 'block';
  updateHighlightsList();
});

// Back to book
backToBookBtn.addEventListener('click', () => {
  highlightsView.style.display = 'none';
  bookView.style.display = 'block';
});

// Save edited note
saveEditBtn.addEventListener('click', () => {
  const updated = editNoteInput.value.trim();
  const i = highlights.findIndex(h => h.id === currentEditingHighlight);
  if (i > -1) {
    highlights[i].note = updated;
    saveHighlights();
    editNotePopup.style.display = 'none';
    currentEditingHighlight = null;
    updateHighlightsList();
    showToast('Note updated');
  }
});

// Cancel edit
cancelEditBtn.addEventListener('click', () => {
  editNotePopup.style.display = 'none';
  currentEditingHighlight = null;
});

// Build highlights list UI
function updateHighlightsList() {
  highlightsContainer.innerHTML = '';
  if (!highlights.length) {
    noHighlightsMessage.style.display = 'block';
    return;
  }
  noHighlightsMessage.style.display = 'none';
  const sorted = [...highlights].sort((a,b) => a.paragraphIndex - b.paragraphIndex);
  sorted.forEach(h => {
    const item = document.createElement('div');
    item.className = 'highlight-item';
    item.style.borderLeft = '4px solid ' + getColorCode(h.color);
    const txt = document.createElement('div');
    txt.className = 'highlight-text';
    txt.textContent = h.text;
    item.appendChild(txt);
    if (h.note) {
      const n = document.createElement('div');
      n.className = 'highlight-note';
      n.textContent = h.note;
      item.appendChild(n);
    }
    const actions = document.createElement('div');
    actions.className = 'highlight-actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'action-btn';
    editBtn.innerHTML = '✏️';
    editBtn.title = 'Edit Note';
    editBtn.addEventListener('click', () => {
      currentEditingHighlight = h.id;
      editNoteInput.value = h.note || '';
      editNotePopup.style.display = 'block';
    });
    const delBtn = document.createElement('button');
    delBtn.className = 'action-btn';
    delBtn.innerHTML = '🗑️';
    delBtn.title = 'Delete Highlight';
    delBtn.addEventListener('click', () => {
      highlights = highlights.filter(x => x.id !== h.id);
      saveHighlights();
      const p = paragraphs[h.paragraphIndex];
      if (p) p.className = '';
      updateHighlightsList();
      showToast('Highlight deleted');
    });
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    item.appendChild(actions);
    highlightsContainer.appendChild(item);
  });
}

// Map color name to hex
function getColorCode(name) {
  return {
    yellow:'#ffff00',
    green:'#00ff00',
    blue:'#00bfff',
    pink:'#ff69b4'
  }[name] || '#ffff00';
}

// Initialize highlights on load
loadHighlights();
