// Leanback for Dropout — the Home screen. Home is Leanback's own screen, drawn
// from what Dropout renders on the page: the featured banner's slides and the
// rows of tiles, with the same links. Dropout's page stays underneath,
// untouched — this file only reads it, and draws a layer of its own over it
// as a child of <html>, outside the site's React tree. Nothing Dropout owns
// is moved, re-parented or rewritten.
//
// The selection model is rows and columns, not geometry: the featured banner's
// buttons, then one row per shelf. ▼ slides the next row up to the same place
// near the top every time (TV style); ◀ ▶ keep the selected card in the same
// slot while the row moves under it. Rows arrive as the selection goes down:
// Dropout draws a few at a time, and this presses its own "Show more".
//
// Site-specific selectors come from sites/dropout.json → home.

(function () {
  const LAYER_CLASS = "tenfoot-home";
  const CONTINUE_KEY = "continue-watching";
  const VIEW_ALL_KEY = "view-all";
  const HERO = -1;
  const PREFETCH_ROWS = 2;
  const MORE_TIMEOUT_MS = 6000;
  const MORE_SCROLL_AFTER_MS = 2500;
  const ROW_ANCHOR = 0.07; // the selected row's top, as a share of the viewport height

  // ---------------------------------------------------------------------------
  // reading the site
  // ---------------------------------------------------------------------------

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

  const C = globalThis.TenfootCards;
  const { textOf, hrefOf, parseDuration, tidyDuration, percentOf, clock } = C;

  // -- the data a tile was drawn from ---------------------------------------
  //
  // Firefox shows a content script the DOM's native face; what the page's own
  // scripts attached to an element (React's fiber, and with it the data the
  // tile was drawn from) is behind wrappedJSObject. Only plain data properties
  // are read: a getter is page code, and is never run.

  function pageView(o) {
    return (o && o.wrappedJSObject) || o;
  }

  function own(obj, key) {
    if (obj === null || (typeof obj !== "object" && typeof obj !== "function")) return undefined;
    try {
      const d = Object.getOwnPropertyDescriptor(obj, key);
      return d && "value" in d ? d.value : undefined;
    } catch (_err) {
      return undefined;
    }
  }

  let fiberKey = null; // "__reactFiber$<random>", the same for every element

  function fiberOf(el) {
    const w = pageView(el);
    if (fiberKey) {
      const f = own(w, fiberKey);
      if (f) return f;
    }
    let keys;
    try {
      keys = Object.keys(w);
    } catch (_err) {
      return null;
    }
    const k = keys.find((x) => x.startsWith("__reactFiber$") || x.startsWith("__reactInternalInstance$"));
    if (!k) return null;
    fiberKey = k;
    return own(w, k);
  }

  /**
   * A value from the props of the component that drew `el`, or of one of the
   * few components above it, by a dotted path ("data.thumbnail.medium").
   */
  function propOf(el, path) {
    const parts = String(path || "").split(".").filter(Boolean);
    if (!parts.length) return undefined;
    let f = fiberOf(el);
    for (let i = 0; f && i < 6; i++, f = own(f, "return")) {
      let v = own(f, "memoizedProps");
      for (const p of parts) v = own(v, p);
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  }

  // A show's tile carries a tall poster; the wide picture, the one its own
  // page uses, is in the tile's data (rules: itemPoster, itemWideArt). Found
  // once per tile and poster.
  const wideCache = new WeakMap(); // tile element → {poster, wide}
  let wideMissing = false;

  function wideArtOf(item, poster, rules) {
    const hit = wideCache.get(item);
    if (hit && hit.poster === poster) return hit.wide;
    const v = propOf(item, rules.itemWideArt);
    const wide = typeof v === "string" && /^https:\/\//.test(v) ? v : "";
    wideCache.set(item, { poster, wide });
    if (!wide && !wideMissing) {
      wideMissing = true;
      console.warn("[leanback-for-dropout] a show's wide picture is not in its tile's data; its poster is used");
    }
    return wide;
  }

  /**
   * Everything Home draws, read off Dropout's page.
   * @param {Document} doc
   * @param {object} R — the rules' "home" object
   */
  function readSite(doc, R) {
    const rules = R || {};
    const root = qs(rules.root, doc);
    const out = { root: Boolean(root), slides: [], rows: [], more: false };
    if (!root) return out;
    qsa(rules.slide, root).forEach((slide, i) => {
      const title = textOf(qs(rules.slideTitle, slide));
      const link = qs(rules.slideLink, slide);
      const img = qs(rules.slideImage, slide);
      const buttons = qsa(rules.slideButtons, slide).map((el, j) => {
        const label = textOf(el) || el.getAttribute("aria-label") || "";
        const href = el.tagName === "A" ? hrefOf(el) : "";
        return {
          index: j,
          label,
          href,
          ariaLabel: el.getAttribute("aria-label") || label,
          listed: Boolean(rules.slideListed && el.matches && safeMatches(el, rules.slideListed))
        };
      }).filter((b) => b.label);
      if (!title && !buttons.length) return;
      out.slides.push({
        key: hrefOf(link) || `slide-${i}`,
        index: i,
        title,
        subtitle: textOf(qs(rules.slideSubtitle, slide)),
        description: textOf(qs(rules.slideDescription, slide)),
        image: img ? img.getAttribute("src") || "" : "",
        href: hrefOf(link),
        buttons
      });
    });
    const keys = new Set();
    qsa(rules.row, root).forEach((row, i) => {
      const titleEl = qs(rules.rowTitle, row);
      const title = textOf(titleEl);
      const viewAll = hrefOf(qs(rules.rowViewAll, row)) || hrefOf(titleEl);
      let key = viewAll || `row-${title || i}`;
      if (keys.has(key)) key = `${key}#${i}`;
      keys.add(key);
      const seen = new Set();
      const items = [];
      for (const item of qsa(rules.item, row)) {
        const link = qs(rules.itemLink, item);
        const href = hrefOf(link);
        if (!href || seen.has(href)) continue;
        seen.add(href);
        const img = qs(rules.itemImage, item);
        const durationText = tidyDuration(textOf(qs(rules.itemDuration, item)));
        let image = img ? img.getAttribute("src") || "" : "";
        if (rules.itemPoster && rules.itemWideArt && qs(rules.itemPoster, item)) {
          image = wideArtOf(item, image, rules) || image;
        }
        items.push({
          key: href,
          href,
          title: textOf(qs(rules.itemTitle, item)) || (img && img.getAttribute("alt")) || "",
          subtitle: textOf(qs(rules.itemSubtext, item)),
          image,
          duration: parseDuration(durationText),
          durationText,
          percent: percentOf(qs(rules.itemProgress, item)),
          badge: textOf(qs(rules.itemBadge, item))
        });
      }
      if (!items.length) return;
      out.rows.push({ key, title, viewAll, items });
    });
    out.more = Boolean(qs(rules.showMore, doc));
    return out;
  }

  function safeMatches(el, sel) {
    try {
      return el.matches(sel);
    } catch (_err) {
      return false;
    }
  }

  // Per-row adjustments from the rules: a heading of Leanback's own, no
  // badges, or not drawn at all (hidden). home.rowOverrides is keyed by the
  // path of the row's View all link; home.rowTitleOverrides by the row's
  // heading, in any case, for a row whose address is not certain.
  function rowOverride(R, key, title) {
    return byPath(R && R.rowOverrides, key) || byTitle(R && R.rowTitleOverrides, title);
  }

  function byPath(all, key) {
    if (!all || typeof all !== "object") return null;
    try {
      const o = all[new URL(key).pathname.replace(/\/+$/, "")];
      return o && typeof o === "object" ? o : null;
    } catch (_err) {
      return null; // a row with no View all link has no address
    }
  }

  function byTitle(all, title) {
    if (!all || typeof all !== "object" || !title) return null;
    const want = String(title).trim().toLowerCase();
    const k = Object.keys(all).find((t) => t.trim().toLowerCase() === want);
    const o = k ? all[k] : null;
    return o && typeof o === "object" ? o : null;
  }

  // ---------------------------------------------------------------------------
  // the screen
  // ---------------------------------------------------------------------------

  /**
   * @param {Document} doc
   * @param {{
   *   rules: object,                        // sites/dropout.json → home
   *   history?: () => object,               // the watch-history store (lib/history.js)
   *   continueWatching?: boolean,           // draw the Continue Watching row (Home, not hubs)
   *   onObserve?: (items: object[]) => void // Dropout's progress bars, for the history
   * }} opts
   */
  function createHome(doc, opts) {
    const o = opts || {};
    const R = o.rules || {};
    const H = globalThis.TenfootHistory;
    const win = doc.defaultView || globalThis;
    const pageSize = typeof R.rowPageSize === "number" ? R.rowPageSize : 12;

    let layer = doc.querySelector(`.${LAYER_CLASS}`);
    if (layer) layer.remove();
    layer = doc.createElement("div");
    layer.className = LAYER_CLASS;
    layer.setAttribute("role", "main");
    layer.setAttribute("aria-label", "Home");
    layer.hidden = true;
    const view = el("div", "tenfoot-home-view");
    const scroller = el("div", "tenfoot-home-scroll");
    const heroBox = el("section", "tenfoot-hero");
    heroBox.hidden = true;
    const rowsBox = el("div", "tenfoot-rows");
    const moreBox = el("p", "tenfoot-home-more");
    moreBox.textContent = "Loading more…";
    moreBox.hidden = true;
    scroller.append(heroBox, rowsBox, moreBox);
    view.appendChild(scroller);
    layer.appendChild(view);
    doc.documentElement.appendChild(layer);

    // Hero parts that survive a slide change, so the selection on them does.
    const heroArt = el("img", "tenfoot-hero-art");
    heroArt.alt = "";
    const heroScrim = el("div", "tenfoot-hero-scrim");
    const heroBody = el("div", "tenfoot-hero-body");
    const heroLabel = el("p", "tenfoot-hero-label");
    heroLabel.textContent = "Featured";
    const heroTitle = el("h1", "tenfoot-hero-title");
    const heroMeta = el("p", "tenfoot-hero-meta");
    const heroText = el("p", "tenfoot-hero-text");
    const heroActions = el("div", "tenfoot-hero-actions");
    const heroDots = el("div", "tenfoot-hero-dots");
    heroDots.setAttribute("aria-hidden", "true");
    const nextSlideBtn = el("button", "tenfoot-hero-button tenfoot-hero-next");
    nextSlideBtn.type = "button";
    nextSlideBtn.setAttribute("aria-label", "Next featured");
    nextSlideBtn.textContent = "›";
    nextSlideBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      stepSlide(1);
    });
    heroBody.append(heroLabel, heroTitle, heroMeta, heroText, heroActions, heroDots);
    heroBox.append(heroArt, heroScrim, heroBody);

    let site = { root: false, slides: [], rows: [], more: false };
    let rows = []; // [{key, title, items, section, titleEl, track, cards: Map, links: [], x}]
    const rowEls = new Map();
    let heroButtons = []; // the current slide's buttons, then the next-slide button
    let slide = 0;
    let pos = { row: HERO, col: 0 };
    let heroCol = 0;
    let awaitingHero = false; // landed on a card only because the banner was not drawn yet
    const memory = new Map(); // row key → card key
    let lastObserved = "";
    let more = null; // {rows, deadline, scrolled}
    let moreTimer = 0;
    let destroyed = false;

    function el(tag, cls) {
      const e = doc.createElement(tag);
      if (cls) e.className = cls;
      return e;
    }

    const { setText, setAttr } = C;

    function store() {
      try {
        return (typeof o.history === "function" && o.history()) || { entries: {} };
      } catch (_err) {
        return { entries: {} };
      }
    }

    // -- the model -------------------------------------------------------------

    function continueRow() {
      if (!o.continueWatching || !H) return null;
      const list = H.continueWatching(store());
      if (!list.length) return null;
      return {
        key: CONTINUE_KEY,
        title: "Continue Watching",
        items: list.map((c) => {
          // The time left goes on the picture, where other cards show the
          // running time.
          const left = c.duration ? `${clock(c.duration - c.position)} left` : "";
          return {
            key: c.url,
            href: c.url,
            title: c.title,
            subtitle: c.series,
            durationText: left,
            image: c.image,
            fraction: c.fraction
          };
        })
      };
    }

    function siteRow(r) {
      const s = store();
      const tweak = rowOverride(R, r.key, r.title) || {};
      const title = typeof tweak.title === "string" && tweak.title ? tweak.title : r.title;
      const items = r.items.map((it) => {
        const key = H ? H.keyOf(it.href) : null;
        const mine = key && s.entries[key] ? H.progressOf(s, key) : null;
        const fraction = mine !== null ? mine : it.percent !== null ? it.percent / 100 : null;
        const extra = { fraction };
        if (tweak.badges === false) extra.badge = "";
        return Object.assign({}, it, extra);
      });
      if (r.items.length >= pageSize && r.viewAll) {
        items.push({ key: VIEW_ALL_KEY, href: r.viewAll, title: "View all", subtitle: title, viewAll: true });
      }
      return { key: r.key, title, items };
    }

    function model() {
      const list = [];
      const cw = continueRow();
      if (cw) list.push(cw);
      for (const r of site.rows) {
        const tweak = rowOverride(R, r.key, r.title);
        if (!(tweak && tweak.hidden === true)) list.push(siteRow(r));
      }
      return list;
    }

    // -- drawing ---------------------------------------------------------------

    function makeRow(r) {
      const section = el("section", "tenfoot-row");
      const titleEl = el("h2", "tenfoot-row-title");
      const clip = el("div", "tenfoot-row-view");
      const track = el("div", "tenfoot-track");
      clip.appendChild(track);
      section.append(titleEl, clip);
      return { key: r.key, section, titleEl, track, cards: new Map(), links: [], items: [], x: 0 };
    }

    function renderRows(list) {
      const seen = new Set();
      let prev = null;
      const next = [];
      for (const r of list) {
        let row = rowEls.get(r.key);
        if (!row) {
          row = makeRow(r);
          rowEls.set(r.key, row);
        }
        seen.add(r.key);
        setAttr(row.section, "data-tenfoot-row", r.key);
        setText(row.titleEl, r.title);
        row.title = r.title;
        renderCards(row, r.items);
        const ref = prev ? prev.nextSibling : rowsBox.firstChild;
        if (row.section !== ref) rowsBox.insertBefore(row.section, ref);
        prev = row.section;
        next.push(row);
      }
      for (const [k, row] of rowEls) {
        if (!seen.has(k)) {
          row.section.remove();
          rowEls.delete(k);
        }
      }
      rows = next;
    }

    function renderCards(row, items) {
      row.links = C.reconcile(doc, row.track, row.cards, items);
      row.items = items;
    }

    function renderHero() {
      const slides = site.slides;
      heroBox.hidden = !slides.length;
      if (!slides.length) {
        heroButtons = [];
        return;
      }
      if (slide >= slides.length) slide = 0;
      const s = slides[slide];
      if (s.image && heroArt.getAttribute("src") !== s.image) heroArt.setAttribute("src", s.image);
      setText(heroTitle, s.title);
      setText(heroMeta, s.subtitle);
      heroMeta.hidden = !s.subtitle;
      setText(heroText, s.description);
      heroText.hidden = !s.description;
      // Buttons: reuse the elements that are there, so a selection on one
      // survives the site redrawing it (My list toggling, say).
      const existing = Array.from(heroActions.querySelectorAll(".tenfoot-hero-action"));
      const buttons = [];
      s.buttons.forEach((b, i) => {
        const tag = b.href ? "A" : "BUTTON";
        let node = existing[i];
        if (!node || node.tagName !== tag) {
          const fresh = el(b.href ? "a" : "button", "tenfoot-hero-button tenfoot-hero-action");
          if (!b.href) {
            fresh.type = "button";
            fresh.addEventListener("click", onProxyClick);
          }
          if (node) node.remove();
          node = fresh;
        }
        setAttr(node, "href", b.href || null);
        setAttr(node, "aria-label", b.ariaLabel);
        setAttr(node, "data-tenfoot-slide-button", String(b.index));
        setAttr(node, "data-tenfoot-listed", b.listed ? "true" : null);
        node.classList.toggle("tenfoot-hero-primary", i === 0);
        setText(node, b.label);
        buttons.push(node);
      });
      for (const extra of existing.slice(s.buttons.length)) extra.remove();
      // The next-featured button sits right after the first (Watch now), so
      // the way through the slides is one step from where the selection lands.
      const order = buttons.slice(0, 1);
      if (slides.length > 1) order.push(nextSlideBtn);
      else if (nextSlideBtn.parentNode) nextSlideBtn.remove();
      order.push(...buttons.slice(1));
      // Only what is out of place moves: moving an element drops its focus.
      order.forEach((node, k) => {
        if (heroActions.children[k] !== node) heroActions.insertBefore(node, heroActions.children[k] || null);
      });
      heroButtons = order;
      // Where we are among the featured slides.
      while (heroDots.children.length > slides.length) heroDots.lastChild.remove();
      while (heroDots.children.length < slides.length) heroDots.appendChild(el("span", "tenfoot-hero-dot"));
      Array.from(heroDots.children).forEach((d, i) => d.classList.toggle("tenfoot-hero-dot--on", i === slide));
      heroDots.hidden = slides.length < 2;
    }

    // A button Dropout handles itself (My list): press the real one, on the
    // same slide. Its new state comes back through refresh().
    function onProxyClick(e) {
      e.preventDefault();
      e.stopPropagation();
      const j = Number(e.currentTarget.getAttribute("data-tenfoot-slide-button"));
      const s = site.slides[slide];
      const root = qs(R.root, doc);
      const real = s && root ? qsa(R.slideButtons, qsa(R.slide, root)[s.index])[j] : null;
      if (real) {
        try {
          real.click();
        } catch (_err) { /* nothing to press */ }
      }
    }

    function stepSlide(delta) {
      const n = site.slides.length;
      if (n < 2) return false;
      slide = (slide + delta + n) % n;
      renderHero();
      // The selection stays on the next-slide button, so OK can keep going.
      heroCol = heroButtons.indexOf(nextSlideBtn);
      if (pos.row === HERO) pos.col = heroCol;
      return true;
    }

    // -- scrolling -------------------------------------------------------------

    function applyScroll() {
      let y = 0;
      if (pos.row !== HERO && rows[pos.row]) {
        const anchor = Math.round((win.innerHeight || 0) * ROW_ANCHOR);
        y = Math.max(0, rows[pos.row].section.offsetTop - anchor);
      }
      const t = y ? `translateY(${-y}px)` : "";
      if (scroller.style.transform !== t) scroller.style.transform = t;
      // With a row selected, home.css fades out everything above its heading.
      setAttr(layer, "data-tenfoot-scrolled", y ? "true" : null);
      const row = rows[pos.row];
      if (row) {
        const card = row.links[pos.col] ? row.links[pos.col].parentNode : null;
        const clip = row.track.parentNode;
        const maxX = Math.max(0, row.track.scrollWidth - (clip ? clip.clientWidth : 0));
        row.x = card ? Math.min(Math.max(0, card.offsetLeft), maxX) : 0;
        const tx = row.x ? `translateX(${-row.x}px)` : "";
        if (row.track.style.transform !== tx) row.track.style.transform = tx;
      }
    }

    // -- rows arriving -----------------------------------------------------------

    function wantMore() {
      if (more || !site.more) return;
      const btn = qs(R.showMore, doc);
      if (!btn) return;
      more = { rows: site.rows.length, deadline: Date.now() + MORE_TIMEOUT_MS, scrolled: false };
      moreBox.hidden = false;
      try {
        btn.click();
      } catch (_err) { /* the scroll below is the fallback */ }
      // Dropout also loads on scroll. If the button did nothing, scroll the
      // page underneath to its end, which is what a mouse user would do.
      moreTimer = win.setTimeout(() => {
        moreTimer = 0;
        if (!more || destroyed) return;
        more.scrolled = true;
        try {
          win.scrollTo(0, doc.documentElement.scrollHeight);
        } catch (_err) { /* nothing else to try */ }
        moreTimer = win.setTimeout(() => {
          moreTimer = 0;
          endMore();
        }, Math.max(0, more.deadline - Date.now()));
      }, MORE_SCROLL_AFTER_MS);
    }

    function endMore() {
      more = null;
      if (moreTimer) {
        win.clearTimeout(moreTimer);
        moreTimer = 0;
      }
      moreBox.hidden = true;
    }

    // -- selection ---------------------------------------------------------------

    function current() {
      if (pos.row === HERO) return heroButtons[pos.col] || null;
      const row = rows[pos.row];
      return row ? row.links[pos.col] || null : null;
    }

    function remember() {
      const row = rows[pos.row];
      if (row && row.items[pos.col]) memory.set(row.key, row.items[pos.col].key);
      if (pos.row === HERO) heroCol = pos.col;
    }

    function enterRow(i) {
      const row = rows[i];
      if (!row || !row.links.length) return null;
      const key = memory.get(row.key);
      const col = key ? row.items.findIndex((it) => it.key === key) : -1;
      pos = { row: i, col: col >= 0 ? col : 0 };
      if (i >= rows.length - 1 - PREFETCH_ROWS) wantMore();
      return settle();
    }

    function settle() {
      remember();
      applyScroll();
      const target = current();
      return target ? { el: target } : { edge: "none" };
    }

    /**
     * Move the selection. Returns {el} for the element to focus, or {edge}
     * when there is nothing further that way ("left" is the caller's cue to
     * enter the rail).
     */
    function along(delta, count, edge) {
      const col = pos.col + delta;
      if (col < 0 || col >= count) return { edge };
      pos.col = col;
      return settle();
    }

    function move(dir) {
      awaitingHero = false;
      if (pos.row === HERO) {
        if (dir === "left") return along(-1, heroButtons.length, "left");
        if (dir === "right") return along(1, heroButtons.length, "right");
        if (dir === "down") return enterRow(0) || { edge: "down" };
        return { edge: "up" };
      }
      const row = rows[pos.row];
      if (!row) return initial() ? settle() : { edge: "none" };
      if (dir === "left") return along(-1, row.links.length, "left");
      if (dir === "right") return along(1, row.links.length, "right");
      if (dir === "up") {
        if (pos.row > 0) return enterRow(pos.row - 1) || { edge: "up" };
        if (heroButtons.length) {
          pos = { row: HERO, col: Math.min(heroCol, heroButtons.length - 1) };
          return settle();
        }
        return { edge: "up" };
      }
      if (dir === "down") {
        if (pos.row < rows.length - 1) return enterRow(pos.row + 1) || { edge: "down" };
        wantMore();
        return { edge: "down" };
      }
      return { edge: "none" };
    }

    // Where the selection starts: the featured banner's first button (Watch
    // now), else the first card. Dropout draws the banner after Home is up
    // (Continue Watching is ready at once), so a start on a card waits for the
    // banner and moves there when it arrives, unless the viewer moved first.
    function initial() {
      awaitingHero = false;
      if (heroButtons.length) {
        pos = { row: HERO, col: 0 };
        return true;
      }
      if (rows.length && rows[0].links.length) {
        pos = { row: 0, col: 0 };
        awaitingHero = true;
        return true;
      }
      return false;
    }

    function initialTarget() {
      if (!ready()) return null;
      if (!initial()) return null;
      settle();
      return current();
    }

    /** Point the model at an element (a click, or focus coming back). */
    function select(target) {
      if (!target) return false;
      // Leanback's own focus lands here too; only somewhere else is the viewer.
      if (target !== current()) awaitingHero = false;
      const h = heroButtons.indexOf(target);
      if (h >= 0) {
        pos = { row: HERO, col: h };
        settle();
        return true;
      }
      for (let i = 0; i < rows.length; i++) {
        const c = rows[i].links.indexOf(target);
        if (c >= 0) {
          pos = { row: i, col: c };
          settle();
          return true;
        }
      }
      return false;
    }

    function ready() {
      return Boolean(heroButtons.length || rows.some((r) => r.links.length));
    }

    // -- refresh -------------------------------------------------------------------

    /**
     * Re-read Dropout's page and redraw what changed. The selection stays on
     * the same card (by key), or moves to its nearest neighbour when the card
     * has gone. Returns the element the selection is on now.
     */
    function refresh() {
      if (destroyed) return null;
      const before = selectionKeys();
      site = readSite(doc, R);
      renderHero();
      renderRows(model());
      if (more && (site.rows.length > more.rows || !site.more)) endMore();
      if (awaitingHero && heroButtons.length) initial();
      else restore(before);
      if (ready()) layer.hidden = false;
      applyScroll();
      observe();
      return current();
    }

    function selectionKeys() {
      if (pos.row === HERO) return { row: HERO, col: pos.col };
      const row = rows[pos.row];
      return row ? { rowKey: row.key, itemKey: row.items[pos.col] ? row.items[pos.col].key : null, row: pos.row, col: pos.col } : null;
    }

    function restore(k) {
      if (!k) return;
      if (k.row === HERO) {
        if (heroButtons.length) pos = { row: HERO, col: Math.min(k.col, heroButtons.length - 1) };
        else if (rows.length) pos = { row: 0, col: 0 };
        return;
      }
      let i = rows.findIndex((r) => r.key === k.rowKey);
      if (i < 0) i = Math.min(k.row, rows.length - 1);
      if (i < 0) {
        pos = { row: HERO, col: 0 };
        return;
      }
      const row = rows[i];
      let c = k.itemKey ? row.items.findIndex((it) => it.key === k.itemKey) : -1;
      if (c < 0) c = Math.min(k.col, row.links.length - 1);
      pos = { row: i, col: Math.max(0, c) };
    }

    // Tell the history what Dropout's progress bars say, once per change.
    function observe() {
      if (typeof o.onObserve !== "function" || !H) return;
      const items = [];
      for (const r of site.rows) {
        for (const it of r.items) {
          if (it.percent === null) continue;
          const key = H.keyOf(it.href);
          if (!key) continue;
          items.push({ key, url: it.href, percent: it.percent, duration: it.duration, title: it.title, image: it.image });
        }
      }
      const sig = items.map((i) => `${i.key}:${i.percent}`).join("|");
      if (!items.length || sig === lastObserved) return;
      lastObserved = sig;
      o.onObserve(items);
    }

    function destroy() {
      destroyed = true;
      endMore();
      layer.remove();
    }

    function snapshot() {
      const row = rows[pos.row];
      return {
        ready: ready(),
        shown: !layer.hidden,
        row: pos.row === HERO ? "hero" : row ? row.key : null,
        col: pos.col,
        slide,
        slides: site.slides.length,
        rows: rows.map((r) => ({ key: r.key, title: r.title, count: r.items.length, viewAll: r.items.some((it) => it.viewAll) })),
        loading: Boolean(more),
        more: site.more
      };
    }

    return Object.freeze({
      refresh, move, select, initialTarget, destroy, snapshot, stepSlide,
      element: layer,
      get current() { return current(); },
      get ready() { return ready(); },
      contains: (node) => layer.contains(node)
    });
  }

  globalThis.TenfootHome = Object.freeze({ createHome, readSite, rowOverride, LAYER_CLASS });
})();
