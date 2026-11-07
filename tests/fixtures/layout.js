// Fixture helper: give every [data-rect] element the fixed position its
// data-rect="left,top,width,height" describes, so real layout in the live
// check equals the rects jsdom reads in the headless suites. Inside
// [data-fixture-real-layout] the page is laid out for real instead (the show
// page, whose restyle is what the live check measures).
for (const el of document.querySelectorAll("[data-rect]")) {
  if (el.closest("[data-fixture-real-layout]")) continue;
  const [l, t, w, h] = el.getAttribute("data-rect").split(",").map(Number);
  el.style.left = l + "px";
  el.style.top = t + "px";
  el.style.width = w + "px";
  el.style.height = h + "px";
}
// The show page is served at every season's address: select the season the
// address names, as Dropout does (the bare address is Season 1).
const seasonSelect = document.querySelector("select.js-switch-season");
if (seasonSelect) {
  const m = /\/season:(\d+)/.exec(location.pathname);
  const n = m ? Number(m[1]) : 1;
  for (const o of seasonSelect.options) o.selected = new RegExp("/season:" + n + "$").test(o.value);
}
// A fixture-only stand-in for the site's Load More: append two tiles.
const more = document.getElementById("loadmore");
if (more && more.closest("[data-fixture-real-layout]")) {
  more.addEventListener("click", (e) => {
    e.preventDefault();
    const grid = document.getElementById("grid");
    const last = grid.querySelector("li:last-child");
    for (const n of [7, 8]) {
      const li = last.cloneNode(true);
      li.setAttribute("data-item-id", String(n));
      for (const a of li.querySelectorAll("a")) a.href = "https://watch.dropout.tv/game-changer/season:1/videos/ep" + n;
      const link = li.querySelector("a.browse-item-link");
      link.id = "ep" + n;
      li.querySelector("strong").textContent = "Ep " + n + " title";
      li.querySelector(".media-episode").textContent = "Episode " + n;
      grid.appendChild(li);
    }
    more.remove();
  });
} else if (more) {
  more.addEventListener("click", (e) => {
    e.preventDefault();
    const grid = document.getElementById("grid");
    for (const [n, x] of [[7, 40], [8, 440]]) {
      const li = document.createElement("li");
      li.className = "browse-item-card js-collection-item";
      const a = document.createElement("a");
      a.href = "https://watch.dropout.tv/game-changer/season:1/videos/ep" + n;
      a.className = "browse-item-link";
      a.id = "ep" + n;
      a.setAttribute("data-rect", x + ",740,380,214");
      a.textContent = "Ep " + n;
      a.style.cssText = "position:fixed;left:" + x + "px;top:740px;width:380px;height:214px";
      li.appendChild(a);
      grid.appendChild(li);
    }
    more.remove();
  });
}
// A fixture-only stand-in for a collection page's Load More (collection.html):
// append the tiles kept in <template id="more-tiles">; then there are no more.
const collectionMore = document.getElementById("collection-more");
const moreTiles = document.getElementById("more-tiles");
if (collectionMore && moreTiles) {
  collectionMore.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("collection-grid").appendChild(moreTiles.content.cloneNode(true));
    collectionMore.closest(".loadmore").remove();
  });
}
// Fixture-only stand-in for the site's trailer modal toggle.
const trailer = document.getElementById("trailer");
const modal = document.getElementById("modal-trailer");
if (trailer && modal) {
  trailer.addEventListener("click", (e) => { e.preventDefault(); modal.classList.add("open"); modal.setAttribute("data-rect", "200,100,880,600"); modal.style.cssText = "position:fixed;left:200px;top:100px;width:880px;height:600px"; });
  const close = document.getElementById("modal-close");
  if (close) close.addEventListener("click", () => { modal.classList.remove("open"); modal.removeAttribute("data-rect"); modal.style.cssText = ""; });
}
// Fixture-only stand-ins for Dropout's Home (home.html): "Show more" appends
// the rows kept in <template id="more-rows"> and then hides itself, as the
// site does when its hub has no more pages; the banner's My list button
// toggles in place.
const seeMore = document.getElementById("see-more");
const moreRows = document.getElementById("more-rows");
if (seeMore && moreRows) {
  seeMore.querySelector("button").addEventListener("click", () => {
    setTimeout(() => {
      document.getElementById("rows").appendChild(moreRows.content.cloneNode(true));
      seeMore.className = "see-more-row row margin-bottom-medium see-more-row--hide";
    }, 150);
  });
}
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest(".slide-button--my-list");
  if (!b) return;
  const on = b.classList.contains("icon-watchlist-add");
  b.classList.toggle("icon-watchlist-add", !on);
  b.classList.toggle("icon-watchlist-remove", on);
  b.setAttribute("aria-label", on ? "Remove from my list" : "Add to my list");
});
// Fixture-only stand-in for React on Home's show tiles: the tile draws a tall
// poster, and the component that drew it carries the show's data, whose
// thumbnail is the wide picture. Set by the page's own script, so a content
// script sees it only through wrappedJSObject, as on the real site.
for (const el of document.querySelectorAll("[data-fixture-thumbnail]")) {
  el["__reactFiber$fixture"] = {
    memoizedProps: { className: el.className },
    return: { memoizedProps: { thumbnailType: "aspect_ratio_2_3", data: { thumbnail: { medium: el.getAttribute("data-fixture-thumbnail") } } } }
  };
}
// Home at /browse?late-banner: Dropout draws the featured banner after
// Leanback's Home is up, as on the real site. The banner is taken out, and put
// back once Leanback has put the selection on a card; <html
// data-fixture-landed> records where that first selection was.
const banner = /[?&]late-banner\b/.test(location.search) && document.querySelector("#browse-component .carousel");
if (banner) {
  const parent = banner.parentNode;
  const next = banner.nextSibling;
  banner.remove();
  const onFocus = (e) => {
    const home = e.target.closest && e.target.closest(".tenfoot-home");
    if (!home) return;
    document.removeEventListener("focusin", onFocus, true);
    document.documentElement.setAttribute("data-fixture-landed", e.target.closest(".tenfoot-card") ? "card" : "other");
    setTimeout(() => parent.insertBefore(banner, next), 300);
  };
  document.addEventListener("focusin", onFocus, true);
}
// A fixture-only stand-in for Dropout's search app (search.html): the box
// redraws the results as you type, keeping those whose title holds the
// words, and adds a step to the tab's history for each search with the words
// in the address (history.pushState, as the app's search bundle does: after
// every search, even one that leaves the address as it was, and none for
// fewer than two letters; read in search-a5c48bee.js, 2026-11-02). Pressing
// a filter searches again, so it adds a step too. The app's 500 ms wait after
// the last letter is not copied: here every letter searches at once. An
// empty box shows the app's "Start typing" message; Load More adds four
// results.
const searchBox = document.querySelector("input.SearchForm-module__search-input");
const searchList = document.querySelector("ul.SearchResults-module__search-results");
if (searchBox && searchList) {
  const container = searchList.closest(".SearchResults-module__search-results-container");
  const listBox = searchList.parentElement;
  const blank = document.createElement("h3");
  blank.className = "BlankSearchResults-module__no-results";
  blank.textContent = "Start typing to see results";
  const pool = Array.from(searchList.children).map((li) => li.cloneNode(true));
  const loadMore = document.querySelector("button.SearchResults-module__load-more");
  const apply = () => {
    const q = searchBox.value.trim().toLowerCase();
    if (q.length >= 2) history.pushState({}, "", "/search?q=" + encodeURIComponent(searchBox.value));
    if (!q) {
      listBox.remove();
      container.appendChild(blank);
      return;
    }
    blank.remove();
    if (!listBox.isConnected) container.appendChild(listBox);
    const hits = pool.filter((li) => li.querySelector(".truncate").textContent.toLowerCase().includes(q));
    searchList.replaceChildren(...hits.map((li) => li.cloneNode(true)));
    for (const b of listBox.querySelectorAll("button.TypeFilters-module__type-filter span")) b.textContent = b.textContent.replace(/\(\d+\)/, "(" + hits.length + ")");
  };
  searchBox.addEventListener("input", apply);
  for (const b of document.querySelectorAll("button.TypeFilters-module__type-filter")) {
    b.addEventListener("click", () => {
      for (const o of document.querySelectorAll("button.TypeFilters-module__type-filter")) o.classList.toggle("TypeFilters-module__selected", o === b);
      if (searchBox.value.trim().length >= 2) history.pushState({}, "", location.pathname + location.search);
    });
  }
  if (loadMore) {
    loadMore.addEventListener("click", () => {
      for (const n of [8, 9, 10, 11]) {
        const li = pool[pool.length - 1].cloneNode(true);
        li.setAttribute("data-index", String(n));
        li.querySelector("a").href = "https://watch.dropout.tv/videos/result-" + n;
        li.querySelector(".truncate").textContent = "More test " + n;
        pool.push(li);
        if (li.querySelector(".truncate").textContent.toLowerCase().includes(searchBox.value.trim().toLowerCase())) searchList.appendChild(li.cloneNode(true));
      }
      loadMore.remove();
    });
  }
}
