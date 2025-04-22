// reader.js

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

function closeMenus() {
  document.getElementById("expanded-menu")?.classList.remove("open");
  document.getElementById("settings-modal")?.classList.remove("open");
  document.getElementById("menu-backdrop")?.style.display = "none";
  openMenuType = null;
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

function applyThemeStylesFromCurrent() {
  if (!rendition) return;
  let bg = "#fff",
    color = "#000";
  if (document.body.classList.contains("night-mode")) {
    bg = "#111";
    color = "#eee";
  } else if (document.body.classList.contains("sepia-mode")) {
    bg = "#f4ecd8";
    color = "#000";
  } else if (document.body.classList.contains("matcha-mode")) {
    bg = "#C3D8B6";
    color = "#000";
  } else {
    bg = "#f5f5f5";
    color = "#000";
  }
  rendition.getContents().forEach((contents) => {
    const doc = contents.document;
    doc.documentElement.style.background = bg;
    doc.body.style.background = bg;
    doc.body.style.color = color;
  });
}

function applyFontSwitch() {
  const storedFont = localStorage.getItem("reader-font") || "-apple-system";
  if (rendition) {
    rendition.themes.override("body", {
      "font-family": storedFont + ", serif !important",
    });
  }
}

function handleTouchStart(evt) {
  if (currentFlow !== "swipe") return;
  const firstTouch = evt.touches[0];
  xDown = firstTouch.clientX;
  yDown = firstTouch.clientY;
}

function handleTouchEnd(evt) {
  if (currentFlow !== "swipe" || !xDown || !yDown) return;
  const xUp = evt.changedTouches[0].clientX;
  const yUp = evt.changedTouches[0].clientY;
  const xDiff = xDown - xUp;
  const yDiff = yDown - yUp;
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

function tapLeftHandler() {
  if (currentFlow === "paginated" && rendition) rendition.prev();
}
function tapRightHandler() {
  if (currentFlow === "paginated" && rendition) rendition.next();
}

function cleanupReader() {
  const viewer = document.getElementById("viewer");
  viewer.removeEventListener("touchstart", handleTouchStart);
  viewer.removeEventListener("touchend", handleTouchEnd);
  document.getElementById("gesture-left")?.removeEventListener("click", swipePrev);
  document.getElementById("gesture-right")?.removeEventListener("click", swipeNext);
  document.getElementById("tap-left")?.removeEventListener("click", tapLeftHandler);
  document.getElementById("tap-right")?.removeEventListener("click", tapRightHandler);
}

function readBook(url) {
  if (rendition && currentBookUrl) {
    const loc = rendition.currentLocation();
    if (loc?.start?.cfi)
      localStorage.setItem("last-location-" + currentBookUrl, loc.start.cfi);
  }
  cleanupReader();
  localStorage.setItem("last-book", url);
  const newSearch = new URLSearchParams(window.location.search);
  newSearch.set("book", url);
  window.history.replaceState({}, "", `?${newSearch}`);
  initBook(url);
  toggleLibrary(false);
}

function initBook(chosenUrl) {
  if (!chosenUrl) return;
  currentBookUrl = chosenUrl;
  bookmarks = [];
  if (rendition) rendition.destroy();
  if (book) book.destroy();

  book = ePub(chosenUrl);
  rendition = book.renderTo("viewer", {
    width: "100%",
    height: "100%",
    flow: currentFlow === "scrolled-doc" ? "scrolled" : "paginated",
    snap: currentFlow !== "scrolled-doc",
    spread: "always",
    direction: "ltr",
  });

  rendition.display(localStorage.getItem("last-location-" + currentBookUrl));

  rendition.on("relocated", (location) => {
    if (location?.start?.cfi)
      localStorage.setItem("last-location-" + currentBookUrl, location.start.cfi);
  });

  rendition.on("rendered", () => {
    applyThemeStylesFromCurrent();
    applyFontSwitch();
  });

  registerHooks();
  updateSwipeListeners();
}

function registerHooks() {
  rendition.hooks.content.register((contents) => {
    const doc = contents.document;
    if (currentFlow === "scrolled-doc") {
      doc.body.style.margin = "0";
      doc.body.style.paddingBottom = "30px";
    } else {
      doc.body.style.paddingTop = "20px";
      doc.body.style.paddingBottom = "30px";
    }
    rendition.themes.fontSize(currentFontSize + "%");
  });
}

function updateSwipeListeners() {
  const viewer = document.getElementById("viewer");
  if (currentFlow === "swipe") {
    document.getElementById("tap-left").style.pointerEvents = "none";
    document.getElementById("tap-right").style.pointerEvents = "none";
    viewer.addEventListener("touchstart", handleTouchStart);
    viewer.addEventListener("touchend", handleTouchEnd);
    document.getElementById("gesture-left").addEventListener("click", swipePrev);
    document.getElementById("gesture-right").addEventListener("click", swipeNext);
    document.getElementById("gesture-left").style.pointerEvents = "auto";
    document.getElementById("gesture-right").style.pointerEvents = "auto";
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

function toggleLibrary(force) {
  const lib = document.getElementById("library-container");
  const reader = document.getElementById("reader-container");
  const showLib = typeof force === "boolean" ? force : lib.style.display !== "block";
  lib.style.display = showLib ? "block" : "none";
  reader.style.display = showLib ? "none" : "block";
  closeMenus();
}

function loadLibrary() {
  const libraryDiv = document.getElementById("library");
  libraryDiv.textContent = "Loading books...";
  fetch("/ebooks/library.json")
    .then((response) => response.json())
    .then((books) => {
      libraryDiv.innerHTML = "";
      books.forEach((book) => {
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
    .catch((err) => {
      console.error("Failed to load library.json:", err);
      libraryDiv.textContent = "Failed to load book list.";
    });
}

const urlParams = new URLSearchParams(window.location.search);
const bookParam = urlParams.get("book");
const lastBook = localStorage.getItem("last-book");
const autoBook = bookParam ? decodeURIComponent(bookParam) : lastBook || null;

if (autoBook) {
  toggleLibrary(false);
  initBook(autoBook);
} else {
  toggleLibrary(true);
  loadLibrary();
}

const savedTheme = localStorage.getItem("reader-theme") || "light";
document.getElementById("theme-select").value = savedTheme;
changeTheme(savedTheme);

// Expose globals
window.toggleLibrary = toggleLibrary;
window.readBook = readBook;
window.changeTheme = changeTheme;
window.loadLibrary = loadLibrary;
window.applyFontSwitch = applyFontSwitch;
window.applyThemeStylesFromCurrent = applyThemeStylesFromCurrent;
window.closeMenus = closeMenus;
