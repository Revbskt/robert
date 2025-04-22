/* ---------------  Global State  --------------- */
let lastNonNightTheme = "light";
let currentBookUrl = "";
let bookmarks = [];
let xDown = null, yDown = null, swipeInProgress = false;
const SWIPE_THRESHOLD = 20;

let book, rendition;
let currentFontSize = parseInt(localStorage.getItem("reader-font-size")) || 100;
let currentFlow    = localStorage.getItem("reading-mode")   || "swipe";

/* ---------------  Kindle‑style Chapter/Page Helper  --------------- */
function updatePageLocation(loc) {
  const el = document.getElementById("page-location");
  if (!loc?.start?.cfi || !book?.locations?.length) {
    el.textContent = "";
    return;
  }
  // Chapter = spine index +1
  const chapIndex = (loc.start.index || 0) + 1;
  const chapTotal = book.spine?.length || "?";
  // Page within book.locations
  const pg      = loc.start.location || 0;
  const pgTotal = book.locations.length;
  el.textContent = `Ch ${chapIndex}/${chapTotal} Pg ${pg}/${pgTotal}`;
}

/* ---------------  (other helpers: bookmarks, cleanup, swipe, font, etc.)  --------------- */
/* …all your existing functions go here, unchanged…  */

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

    /* …metadata, cover loading, TOC building, applyFontSwitch(), loadBookmarks()… */
  });
}

function initRendition(flow, cfi) {
  rendition = book.renderTo("viewer", {
    width: "100%",
    height: "100%",
    flow: flow === "scrolled-doc" ? "scrolled" : "paginated",
    snap: flow === "scrolled-doc" ? false : true,
    spread: "always",
    direction: "ltr",
  });

  registerHooks();

  // 1) Display immediately
  const storedCfi = localStorage.getItem("last-location-" + currentBookUrl);
  rendition.display(cfi || storedCfi || undefined);

  // 2) Show initial “Ch x/x Pg y/y”
  updatePageLocation(rendition.currentLocation());

  // 3) Now that rendition exists, wire up events safely:
  rendition.on("relocated", loc => {
    if (loc?.start?.cfi) {
      localStorage.setItem("last-location-" + currentBookUrl, loc.start.cfi);
      updateBookmarkStar();
      updatePageLocation(loc);
    }
  });

  rendition.on("rendered", () => {
    applyThemeStylesFromCurrent();
    applyFontSwitch();
    updateBookmarkStar();
    updatePageLocation(rendition.currentLocation());
  });

  updateSwipeListeners();
}

/* ---------------  (the rest of your code remains the same)  --------------- */
