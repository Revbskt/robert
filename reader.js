// ==========================
// Global Setup
// ==========================
let lastNonNightTheme = "light";
let currentBookUrl = "";
let bookmarks = [];
let book, rendition;
let currentFontSize = parseInt(localStorage.getItem("reader-font-size")) || 100;
let currentFlow = localStorage.getItem("reading-mode") || "paginated";

// Swipe detection
let xDown = null;
let yDown = null;
const SWIPE_THRESHOLD = 20;
let swipeInProgress = false;

// ==========================
// Library Load and Toggle
// ==========================
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
function toggleLibrary(forceState) {
  libraryVisible = typeof forceState === 'boolean' ? forceState : !libraryVisible;
  libraryContainer.style.display = libraryVisible ? "block" : "none";
  readerContainer.style.display = libraryVisible ? "none" : "block";
  closeMenus();
}

function loadLibrary() {
  const libraryDiv = document.getElementById("library");
  libraryDiv.textContent = "Loading books...";
  fetch("/ebooks/library.json")
    .then(response => response.json())
    .then(books => {
      libraryDiv.innerHTML = "";
      books.forEach(book => {
        const bookDiv = document.createElement("div");
        bookDiv.className = "book";
        bookDiv.innerHTML = `
          <img src="${book.cover}" alt="Cover of ${book.title}" />
          <h3>${book.title}</h3>
          <p>${book.author}</p>
          <button onclick="readBook('${book.fileUrl}')">Read</button>
        `;
        libraryDiv.appendChild(bookDiv);
      });
    })
    .catch(err => {
      console.error("Failed to load library.json:", err);
      libraryDiv.textContent = "Failed to load book list.";
    });
}
loadLibrary();

function readBook(epubUrl) {
  if (rendition && currentBookUrl) {
    const loc = rendition.currentLocation();
    if (loc && loc.start && loc.start.cfi) {
      localStorage.setItem("last-location-" + currentBookUrl, loc.start.cfi);
    }
  }
  cleanupReader();
  localStorage.setItem("last-book", epubUrl);
  const newSearch = new URLSearchParams(window.location.search);
  newSearch.set("book", epubUrl);
  window.history.replaceState({}, "", `?${newSearch.toString()}`);
  initBook(epubUrl);
  toggleLibrary(false);
}

// ==========================
// Book Init and Rendition
// ==========================
function initBook(chosenUrl) {
  if (!chosenUrl) return;
  currentBookUrl = chosenUrl;
  bookmarks = [];
  if (rendition) rendition.destroy();
  if (book) book.destroy();
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
      .then(coverUrl => book.archive.createUrl(coverUrl, { base64: true }))
      .then(coverDataUrl => { document.getElementById("cover").src = coverDataUrl; })
      .catch(() => console.warn("No cover image found."));
    loadBookmarks();
    applyFontSwitch();
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
  rendition.on("relocated", location => {
    if (location?.start?.cfi) {
      localStorage.setItem("last-location-" + currentBookUrl, location.start.cfi);
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

function cleanupReader() {
  const viewer = document.getElementById("viewer");
  viewer?.removeEventListener("touchstart", handleTouchStart);
  viewer?.removeEventListener("touchend", handleTouchEnd);
  ["gesture-left", "gesture-right"].forEach(id => {
    const el = document.getElementById(id);
    el?.removeEventListener("click", swipeNext);
  });
  ["tap-left", "tap-right"].forEach(id => {
    const el = document.getElementById(id);
    el?.removeEventListener("click", tapLeftHandler);
  });
}

function registerReaderEvents() {
  document.getElementById("tap-left")?.addEventListener("click", tapLeftHandler);
  document.getElementById("tap-right")?.addEventListener("click", tapRightHandler);
}

function tapLeftHandler() {
  if (currentFlow === "paginated" && rendition) rendition.prev();
}

function tapRightHandler() {
  if (currentFlow === "paginated" && rendition) rendition.next();
}
