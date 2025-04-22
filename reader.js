// reader.js

// Global variables
let lastNonNightTheme = "light";
let currentBookUrl = "";
let bookmarks = [];
let xDown = null, yDown = null;
const SWIPE_THRESHOLD = 20;
let swipeInProgress = false;
let book, rendition;
let currentFontSize = parseInt(localStorage.getItem("reader-font-size")) || 100;
let currentFlow = localStorage.getItem("reading-mode") || "swipe";
let openMenuType = null;

// Toggle functions
function toggleMenu(type) {
  if (openMenuType === type) return closeMenus();
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

function toggleLibrary(forceState) {
  const lib = document.getElementById("library-container");
  const reader = document.getElementById("reader-container");
  const showLib = typeof forceState === 'boolean' ? forceState : lib.style.display !== "block";
  lib.style.display = showLib ? "block" : "none";
  reader.style.display = showLib ? "none" : "block";
  closeMenus();
}

function loadLibrary() {
  const libraryDiv = document.getElementById("library");
  libraryDiv.textContent = "📚 Loading books...";

  fetch("/ebooks/library.json")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} - ${response.statusText}`);
      }
      return response.json();
    })
    .then((books) => {
      libraryDiv.innerHTML = "";
      if (!Array.isArray(books) || books.length === 0) {
        libraryDiv.textContent = "No books found in library.json.";
        return;
      }

      books.forEach((book) => {
        const div = document.createElement("div");
        div.className = "book";
        div.innerHTML = `
          <img src="${book.cover}" alt="Cover of ${book.title}" />
          <h3>${book.title}</h3>
          <p>${book.author}</p>
          <button onclick="readBook('${book.fileUrl}')">Read</button>
        `;
        libraryDiv.appendChild(div);
      });
    })
    .catch((err) => {
      console.error("⚠️ Failed to load library.json:", err);
      libraryDiv.textContent = "❌ Could not load your book list. Make sure /ebooks/library.json exists and is valid.";
    });
}

const urlParams = new URLSearchParams(window.location.search);
const bookParam = urlParams.get("book");
const lastSavedBook = localStorage.getItem("last-book");
const theBookUrl = bookParam ? decodeURIComponent(bookParam) : lastSavedBook || null;

document.getElementById("menu-toggle").onclick = () => toggleMenu("menu");
document.getElementById("toc-toggle").onclick = () => document.getElementById("toc-panel").classList.toggle("open");
document.getElementById("settings-toggle").onclick = () => toggleMenu("settings");
document.getElementById("theme-toggle").onclick = () => {
  closeMenus();
  if (document.body.classList.contains("night-mode")) changeTheme(lastNonNightTheme);
  else {
    lastNonNightTheme = document.getElementById("theme-select").value;
    changeTheme("night");
  }
};

function changeTheme(theme) {
  document.body.className = "";
  document.body.classList.add(`${theme}-mode`);
  document.getElementById("theme-toggle").textContent = theme === "night" ? "☀️" : "🌙";
  localStorage.setItem("reader-theme", theme);
  document.getElementById("theme-select").value = theme;
  applyThemeStylesFromCurrent();
}

function applyThemeStylesFromCurrent() {
  if (!rendition) return;
  let bg = "#fff", color = "#000";
  if (document.body.classList.contains("night-mode")) {
    bg = "#111"; color = "#eee";
  } else if (document.body.classList.contains("sepia-mode")) {
    bg = "#f4ecd8"; color = "#000";
  } else if (document.body.classList.contains("matcha-mode")) {
    bg = "#C3D8B6"; color = "#000";
  } else if (document.body.classList.contains("light-mode")) {
    bg = "#f5f5f5"; color = "#000";
  }
  rendition.getContents().forEach(contents => {
    const doc = contents.document;
    doc.documentElement.style.background = bg;
    doc.body.style.background = bg;
    doc.body.style.color = color;
  });
}

function changeFontSize(delta) {
  currentFontSize = Math.max(60, Math.min(200, currentFontSize + delta * 10));
  localStorage.setItem("reader-font-size", currentFontSize);
  if (rendition) rendition.themes.fontSize(`${currentFontSize}%`);
}

function readBook(url) {
  if (rendition && currentBookUrl) {
    const loc = rendition.currentLocation();
    if (loc?.start?.cfi) {
      localStorage.setItem("last-location-" + currentBookUrl, loc.start.cfi);
    }
  }
  cleanupReader();
  localStorage.setItem("last-book", url);
  const newSearch = new URLSearchParams(window.location.search);
  newSearch.set("book", url);
  window.history.replaceState({}, "", `?${newSearch}`);
  initBook(url);
  toggleLibrary(false);
}

if (theBookUrl) {
  document.getElementById("library-container").style.display = "none";
  document.getElementById("reader-container").style.display = "block";
  initBook(theBookUrl);
} else {
  toggleLibrary(true);
  loadLibrary();
}

const savedTheme = localStorage.getItem("reader-theme") || "light";
document.getElementById("theme-select").value = savedTheme;
changeTheme(savedTheme);
