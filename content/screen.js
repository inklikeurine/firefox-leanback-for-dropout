// Leanback for Dropout — the screen Leanback draws for Dropout's collection
// pages: Browse (all shows), My List, and the lists (Trending, New Releases,
// a show's new episodes…). Like Home (content/home.js), the page is only
// read: Dropout's page stays underneath, untouched, and Leanback's layer
// covers it, a child of <html> outside the site's tree. It is drawn as Home
// is — the same layer, the same cards (content/cards.js), the same scrolling
// — with the page's title at the top and the tiles in a grid of COLUMNS
// across.
//
// The selection is a position in the list of cards. ◀ ▶ move along a row and
// stop at its ends ({edge: "left"} is the cue for the rail); ▲ ▼ move a row,
// keeping the column. The selected row slides up to the same place near the
// top every time. Near the end Dropout's own Load More is pressed, and its
// new tiles join the grid.
//
// Site-specific selectors come from sites/dropout.json → screen.

(function () {
  const LAYER_CLASS = "tenfoot-home";
  const COLUMNS = 5;
  const PREFETCH_ROWS = 2;
  const MORE_TIMEOUT_MS = 6000;
  const ROW_ANCHOR = 0.07; // the selected row's top, as a share of the viewport height

  const C = () => globalThis.TenfootCards;

  function qs(sel, scope) {
    if (!sel || !scope) return null;
    try {
      return scope.querySelector(sel);
    } catch (_err) {
      return null;
    }
  }

  function qsa(sel, scope) {
    if (!sel || !scope) return [];
    try {
      return Array.from(scope.querySelectorAll(sel));
    } catch (_err) {
      return [];
    }
  }

  /**
   * What a collection page holds: its title, its tiles in page order (one per
   * link), and whether Dropout has more to load.
   * @param {Document} doc
   * @param {object} R — the rules' "screen" object
   */
  function readPage(doc, R) {
    const rules = R || {};
    const { textOf, hrefOf, tidyDuration, parseDuration, percentOf } = C();
    const root = qs(rules.root, doc);
    const out = { root: Boolean(root), title: textOf(qs(rules.title, doc)), items: [], more: false };
    if (!root) return out;
    const seen = new Set();
    for (const tile of qsa(rules.item, root)) {
      const href = hrefOf(qs(rules.itemLink, tile));
      if (!href || seen.has(href)) continue;
      seen.add(href);
      const img = qs(rules.itemImage, tile);
      const durationText = tidyDuration(textOf(qs(rules.itemDuration, tile)));
      out.items.push({
        key: href,
        href,
        title: textOf(qs(rules.itemTitle, tile)) || (img && img.getAttribute("alt")) || "",
        subtitle: textOf(qs(rules.itemSubtext, tile)),
        image: img ? img.getAttribute("src") || "" : "",
        duration: parseDuration(durationText),
        durationText,
        percent: percentOf(qs(rules.itemProgress, tile)),
        badge: textOf(qs(rules.itemBadge, tile))
      });
    }
    out.more = Boolean(qs(rules.more, doc));
    return out;
  }

  /**
   * @param {Document} doc
   * @param {{
   *   rules: object,                        // sites/dropout.json → screen
   *   title?: string,                       // in place of the page's own
   *   rail?: boolean,                       // the rail is beside it (room is left)
   *   badges?: boolean,                     // false: no badges on the cards
   *   history?: () => object,               // the watch-history store
   *   onObserve?: (items: object[]) => void // Dropout's progress bars, for the history
   * }} opts
   */
  function createScreen(doc, opts) {
    const o = opts || {};
    const R = o.rules || {};
    const H = globalThis.TenfootHistory;
    const win = doc.defaultView || globalThis;

    const el = (tag, cls) => {
      const e = doc.createElement(tag);
      if (cls) e.className = cls;
      return e;
    };

    let layer = doc.querySelector(`.${LAYER_CLASS}`);
    if (layer) layer.remove();
    layer = el("div", `${LAYER_CLASS} tenfoot-screen`);
    layer.setAttribute("role", "main");
    layer.hidden = true;
    if (o.rail === false) layer.dataset.tenfootNorail = "true";
    const view = el("div", "tenfoot-home-view");
    const scroller = el("div", "tenfoot-home-scroll");
    const head = el("div", "tenfoot-screen-head");
    const titleEl = el("h1", "tenfoot-screen-title");
    head.appendChild(titleEl);
    const grid = el("div", "tenfoot-screen-grid");
    const moreBox = el("p", "tenfoot-home-more");
    moreBox.textContent = "Loading more…";
    moreBox.hidden = true;
    scroller.append(head, grid, moreBox);
    view.appendChild(scroller);
    layer.appendChild(view);
    doc.documentElement.appendChild(layer);

    let page = { root: false, title: "", items: [], more: false };
    let items = [];
    let links = [];
    const cards = new Map();
    let index = 0;
    let more = null; // {count, deadline}
    let moreTimer = 0;
    let lastObserved = "";
    let destroyed = false;

    function store() {
      try {
        return (typeof o.history === "function" && o.history()) || { entries: {} };
      } catch (_err) {
        return { entries: {} };
      }
    }

    // The page's tiles with Leanback's own progress where it has it (as on
    // Home: one merged reading per video).
    function model() {
      const s = store();
      return page.items.map((it) => {
        const key = H ? H.keyOf(it.href) : null;
        const mine = key && s.entries[key] ? H.progressOf(s, key) : null;
        const fraction = mine !== null ? mine : it.percent !== null ? it.percent / 100 : null;
        const extra = { fraction };
        if (o.badges === false) extra.badge = "";
        return Object.assign({}, it, extra);
      });
    }

    function current() {
      return links[index] || null;
    }

    function ready() {
      return links.length > 0;
    }

    // -- scrolling (TV style, as on Home) ---------------------------------------

    function applyScroll() {
      const row = Math.floor(index / COLUMNS);
      let y = 0;
      const card = links[index] ? links[index].parentNode : null;
      if (row > 0 && card) {
        const anchor = Math.round((win.innerHeight || 0) * ROW_ANCHOR);
        y = Math.max(0, card.offsetTop - anchor);
      }
      const t = y ? `translateY(${-y}px)` : "";
      if (scroller.style.transform !== t) scroller.style.transform = t;
      C().setAttr(layer, "data-tenfoot-scrolled", y ? "true" : null);
    }

    // -- more tiles ---------------------------------------------------------------

    function wantMore() {
      if (more || !page.more) return;
      const link = qs(R.more, doc);
      if (!link) return;
      more = { count: page.items.length, deadline: Date.now() + MORE_TIMEOUT_MS };
      moreBox.hidden = false;
      try {
        link.click();
      } catch (_err) { /* the timer below gives up */ }
      moreTimer = win.setTimeout(endMore, MORE_TIMEOUT_MS);
    }

    function endMore() {
      more = null;
      if (moreTimer) {
        win.clearTimeout(moreTimer);
        moreTimer = 0;
      }
      moreBox.hidden = true;
    }

    // -- selection ------------------------------------------------------------------

    function settle() {
      const rows = Math.ceil(links.length / COLUMNS);
      if (Math.floor(index / COLUMNS) >= rows - 1 - PREFETCH_ROWS) wantMore();
      applyScroll();
      const target = current();
      return target ? { el: target } : { edge: "none" };
    }

    /**
     * Move the selection. Returns {el} for the element to focus, or {edge}
     * when there is nothing further that way ("left" is the caller's cue to
     * enter the rail).
     */
    function move(dir) {
      const n = links.length;
      if (!n) return { edge: "none" };
      const col = index % COLUMNS;
      if (dir === "left") {
        if (col === 0) return { edge: "left" };
        index -= 1;
      } else if (dir === "right") {
        if (col === COLUMNS - 1 || index === n - 1) return { edge: "right" };
        index += 1;
      } else if (dir === "up") {
        if (index < COLUMNS) return { edge: "up" };
        index -= COLUMNS;
      } else if (dir === "down") {
        const lastRow = Math.floor((n - 1) / COLUMNS);
        if (Math.floor(index / COLUMNS) >= lastRow) {
          wantMore();
          return { edge: "down" };
        }
        // Into a shorter last row: its last card.
        index = Math.min(index + COLUMNS, n - 1);
      } else return { edge: "none" };
      return settle();
    }

    function initialTarget() {
      if (!ready()) return null;
      index = 0;
      settle();
      return current();
    }

    /** Point the model at an element (a click, or focus coming back). */
    function select(target) {
      const i = links.indexOf(target);
      if (i < 0) return false;
      index = i;
      settle();
      return true;
    }

    // -- refresh ------------------------------------------------------------------

    /**
     * Re-read Dropout's page and redraw what changed. The selection stays on
     * the same card (by key), or on the nearest when it has gone.
     */
    function refresh() {
      if (destroyed) return null;
      const before = items[index] ? items[index].key : null;
      page = readPage(doc, R);
      C().setText(titleEl, o.title || page.title);
      C().setAttr(layer, "aria-label", o.title || page.title || null);
      items = model();
      links = C().reconcile(doc, grid, cards, items);
      if (more && (page.items.length > more.count || !page.more)) endMore();
      const keep = before ? items.findIndex((it) => it.key === before) : -1;
      index = keep >= 0 ? keep : Math.min(index, Math.max(0, links.length - 1));
      if (ready()) layer.hidden = false;
      applyScroll();
      observe();
      return current();
    }

    // Tell the history what Dropout's progress bars say, once per change.
    function observe() {
      if (typeof o.onObserve !== "function" || !H) return;
      const seen = [];
      for (const it of page.items) {
        if (it.percent === null) continue;
        const key = H.keyOf(it.href);
        if (key) seen.push({ key, url: it.href, percent: it.percent, duration: it.duration, title: it.title, image: it.image });
      }
      const sig = seen.map((i) => `${i.key}:${i.percent}`).join("|");
      if (!seen.length || sig === lastObserved) return;
      lastObserved = sig;
      o.onObserve(seen);
    }

    function destroy() {
      destroyed = true;
      endMore();
      layer.remove();
    }

    function snapshot() {
      return {
        kind: "screen",
        ready: ready(),
        shown: !layer.hidden,
        title: titleEl.textContent,
        count: links.length,
        index,
        columns: COLUMNS,
        loading: Boolean(more),
        more: page.more
      };
    }

    return Object.freeze({
      refresh, move, select, initialTarget, destroy, snapshot,
      element: layer,
      get current() { return current(); },
      get ready() { return ready(); },
      contains: (node) => layer.contains(node)
    });
  }

  globalThis.TenfootScreen = Object.freeze({ createScreen, readPage, COLUMNS, LAYER_CLASS });
})();
