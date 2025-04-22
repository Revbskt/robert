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

/* ---------------  Chapter/Page Location  --------------- */
function updatePageLocation(loc) {
  const el = document.getElementById("page-location");
  if (!loc?.start?.cfi || !book?.locations?.length) {
    el.textContent = "";
    return;
  }
  // Chapter (spine index +1) / total spine items
  const chapIndex = (loc.start.index || 0) + 1;
  const chapTotal = book.spine?.length || "?";
  // “Kindle-style” page = flat location
  const pg = loc.start.location || 0;
  const pgTotal = book.locations.length;
  el.textContent = `Ch ${chapIndex}/${chapTotal} Pg ${pg}/${pgTotal}`;
}

/* ---------------  (rest of your existing code…)  --------------- */
/* Insert updatePageLocation calls in your rendition event handlers: */

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

/* In initRendition(), right after rendition.display(...): */
  rendition.display(cfi || storedCfi || undefined);
  updatePageLocation(rendition.currentLocation());

/* ---------------  (everything else stays exactly as before)  --------------- */
