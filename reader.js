// This file contains all event handlers, EPUB.js setup, bookmark logic, UI toggle controls, etc.

let lastNonNightTheme = "light";
let currentBookUrl = "";
let bookmarks = [];
let xDown = null;
let yDown = null;
const SWIPE_THRESHOLD = 20;
let swipeInProgress = false;
let libraryVisible = false;
let currentFontSize = parseInt(localStorage.getItem("reader-font-size")) || 100;
let currentFlow = localStorage.getItem("reading-mode") || "swipe";
let book, rendition;

// DOM references
const libraryContainer = document.getElementById("library-container");
const readerContainer = document.getElementById("reader-container");
const backToReaderBtn = document.getElementById("back-to-reader-btn");
const libraryToggle = document.getElementById("library-toggle");

function toggleLibrary(forceState) {
  libraryVisible = typeof forceState === 'boolean' ? forceState : !libraryVisible;
  libraryContainer.style.display = libraryVisible ? "block" : "none";
  readerContainer.style.display = libraryVisible ? "none" : "block";
  closeMenus();
}
if (backToReaderBtn) backToReaderBtn.addEventListener("click", () => toggleLibrary(false));
if (libraryToggle) libraryToggle.addEventListener("click", () => toggleLibrary(true));

function cleanupReader() {
  const viewer = document.getElementById("viewer");
  viewer?.removeEventListener("touchstart", handleTouchStart);
  viewer?.removeEventListener("touchend", handleTouchEnd);
  document.getElementById("gesture-left")?.removeEventListener("click", swipePrev);
  document.getElementById("gesture-right")?.removeEventListener("click", swipeNext);
  document.getElementById("tap-left")?.removeEventListener("click", tapLeftHandler);
  document.getElementById("tap-right")?.removeEventListener("click", tapRightHandler);
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

function readBook(epubUrl) {
  if (rendition && currentBookUrl) {
    const loc = rendition.currentLocation();
    if (loc?.start?.cfi) {
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

// --- Load last or current book ---
const urlParams = new URLSearchParams(window.location.search);
const bookParam = urlParams.get("book");
const lastSavedBook = localStorage.getItem("last-book");
let theBookUrl = bookParam ? decodeURIComponent(bookParam) : lastSavedBook;
if (theBookUrl) {
  readerContainer.style.display = "block";
  libraryContainer.style.display = "none";
  initBook(theBookUrl);
} else {
  readerContainer.style.display = "none";
  libraryContainer.style.display = "block";
}
loadLibrary();
function tapLeftHandler() {
  if (currentFlow === "paginated" && rendition) rendition.prev();
}
function tapRightHandler() {
  if (currentFlow === "paginated" && rendition) rendition.next();
}

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

// Settings / Theme / Font UI handlers
document.getElementById("theme-select").addEventListener("change", (e) => {
  changeTheme(e.target.value);
});
document.getElementById("reading-mode").addEventListener("change", (e) => {
  const newMode = e.target.value;
  localStorage.setItem("reading-mode", newMode);
  currentFlow = newMode;
  if (!rendition || !book) return;
  const currentLocation = rendition.location?.start?.cfi || localStorage.getItem("last-location-" + currentBookUrl);
  rendition.destroy();
  setTimeout(() => {
    initRendition(newMode, currentLocation);
  }, 50);
});
document.getElementById("font-smaller").addEventListener("click", () => changeFontSize(-1));
document.getElementById("font-larger").addEventListener("click", () => changeFontSize(1));

// Toggle controls
document.getElementById("menu-toggle").addEventListener("click", () => {
  closeMenus();
  toggleMenu("menu");
});
document.getElementById("settings-toggle").addEventListener("click", () => {
  closeMenus();
  toggleMenu("settings");
});
document.getElementById("theme-toggle").addEventListener("click", () => {
  closeMenus();
  if (document.body.classList.contains("night-mode")) {
    changeTheme(lastNonNightTheme);
  } else {
    lastNonNightTheme = document.getElementById("theme-select").value;
    changeTheme("night");
  }
});
document.querySelector(".close-menu").addEventListener("click", () => closeMenus());
document.querySelector(".close-settings").addEventListener("click", () => closeMenus());
document.getElementById("toc-toggle").addEventListener("click", () => {
  document.getElementById("toc-panel").classList.toggle("open");
});
document.getElementById("bookmark-toggle").addEventListener("click", () => toggleBookmark());
document.getElementById("bookmark-dropdown").addEventListener("click", () => toggleBookmarkDropdown());
document.getElementById("continue-bar").addEventListener("click", () => {
  if (!rendition || currentFlow !== "scrolled-doc") {
    if (rendition) rendition.next();
    return;
  }
  const loc = rendition.currentLocation();
  if (loc && loc.start && typeof loc.start.index !== "undefined") {
    const currentIndex = loc.start.index;
    const nextItem = book.spine.get(currentIndex + 1);
    if (nextItem) {
      rendition.display(nextItem.href);
    }
  }
});

// Stub functions you may have elsewhere
function initBook(url) {
  console.warn("initBook() logic is expected elsewhere in reader.js – please ensure it's included.");
}
function toggleBookmark() {
  console.warn("toggleBookmark() logic is expected elsewhere in reader.js – please ensure it's included.");
}
function toggleBookmarkDropdown() {
  console.warn("toggleBookmarkDropdown() logic is expected elsewhere in reader.js – please ensure it's included.");
}
function closeMenus() {
  document.getElementById("expanded-menu").classList.remove("open");
  document.getElementById("settings-modal").classList.remove("open");
  document.getElementById("menu-backdrop").style.display = "none";
}
function toggleMenu(type) {
  if (type === "menu") {
    document.getElementById("expanded-menu").classList.add("open");
    document.getElementById("menu-backdrop").style.display = "block";
  } else if (type === "settings") {
    document.getElementById("settings-modal").classList.add("open");
  }
}
function changeFontSize(delta) {
  currentFontSize = Math.max(60, Math.min(200, currentFontSize + delta * 10));
  localStorage.setItem("reader-font-size", currentFontSize);
  if (rendition) {
    rendition.themes.fontSize(currentFontSize + "%");
  }
}
function changeTheme(theme) {
  document.body.className = "";
  if (theme === "night") {
    document.body.classList.add("night-mode");
  } else if (theme === "sepia") {
    document.body.classList.add("sepia-mode");
  } else if (theme === "matcha") {
    document.body.classList.add("matcha-mode");
  } else {
    document.body.classList.add("light-mode");
  }
  document.getElementById("theme-toggle").textContent = document.body.classList.contains("night-mode") ? "☀️" : "🌙";
  localStorage.setItem("reader-theme", theme);
  document.getElementById("theme-select").value = theme;
}

// Apply saved theme on load
const savedTheme = localStorage.getItem("reader-theme") || "light";
document.getElementById("theme-select").value = savedTheme;
changeTheme(savedTheme);
