// Leanback for Dropout — Home, read off Dropout's page: the featured banner's
// slides and the rows of tiles, with the same links. Dropout's page stays
// underneath, untouched; content/screen.js draws Home from homeModel(), as
// it draws every screen: the banner's buttons, then one sliding row per shelf,
// each sliding up to the same place near the top as the selection goes down.
// Rows arrive as the selection goes down: Dropout draws a few at a time, and
// the screen presses its own "Show more".
//
// Site-specific selectors come from sites/dropout.json → home.

(function () {
  const CONTINUE_KEY = "continue-watching";
  const VIEW_ALL_KEY = "view-all";

  // ---------------------------------------------------------------------------
  // reading the site
  // ---------------------------------------------------------------------------

  const Common = globalThis.TenfootCommon;
  const C = globalThis.TenfootCards;
  const { textOf, clock } = Common;
  // Only ever inside the scope given: no scope, no match.
  const qs = (sel, scope) => (scope ? Common.qs(sel, scope) : null);
  const qsa = (sel, scope) => (scope ? Common.qsa(sel, scope) : []);
  const { hrefOf, parseDuration, tidyDuration, percentOf } = C;

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
          listed: Common.matches(el, rules.slideListed)
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
  // the model content/screen.js draws
  // ---------------------------------------------------------------------------

  // A slide's buttons, as the banner's: a link is copied, a button (My list)
  // presses the real one on the same slide, looked up when pressed, as React
  // may have drawn it again since. Keyed by place, so a selection on one
  // survives the slide changing.
  function slideActions(doc, R, s) {
    return s.buttons.map((b, i) => {
      const a = { key: `slide-${i}`, label: b.label, ariaLabel: b.ariaLabel, listed: b.listed, primary: i === 0 };
      if (b.href) a.href = b.href;
      else {
        a.proxy = () => {
          const root = qs(R.root, doc);
          const slideEl = root ? qsa(R.slide, root)[s.index] : null;
          return slideEl ? qsa(R.slideButtons, slideEl)[b.index] || null : null;
        };
      }
      return a;
    });
  }

  function continueSection(store) {
    const H = globalThis.TenfootHistory;
    const list = H ? H.continueWatching(store) : [];
    if (!list.length) return null;
    return {
      key: CONTINUE_KEY,
      title: "Continue Watching",
      layout: "row",
      items: list.map((c) => ({
        key: c.url,
        href: c.url,
        title: c.title,
        subtitle: c.series,
        // The time left goes on the picture, where other cards show the
        // running time.
        durationText: c.duration ? `${clock(c.duration - c.position)} left` : "",
        image: c.image,
        fraction: c.fraction
      }))
    };
  }

  /**
   * Home as a screen model (content/screen.js): the featured banner's slides,
   * Continue Watching (Home, not hubs), then Dropout's rows as sliding rows,
   * with a View all card on a full row. Null when the page holds no Home.
   * @param {Document} doc
   * @param {object} R — the rules' "home" object
   * @param {{history?: object, continueWatching?: boolean}} [opts]
   */
  function homeModel(doc, R, opts) {
    const o = opts || {};
    const rules = R || {};
    const site = readSite(doc, rules);
    if (!site.root) return null;
    const pageSize = typeof rules.rowPageSize === "number" ? rules.rowPageSize : 12;
    const sections = [];
    const cw = o.continueWatching ? continueSection(o.history || { entries: {} }) : null;
    if (cw) sections.push(cw);
    for (const r of site.rows) {
      const tweak = rowOverride(rules, r.key, r.title) || {};
      if (tweak.hidden === true) continue;
      const title = typeof tweak.title === "string" && tweak.title ? tweak.title : r.title;
      const items = r.items.slice();
      if (r.items.length >= pageSize && r.viewAll) {
        items.push({ key: VIEW_ALL_KEY, href: r.viewAll, title: "View all", subtitle: title, viewAll: true });
      }
      sections.push({ key: r.key, title, layout: "row", badges: tweak.badges === false ? false : undefined, items });
    }
    return {
      kind: "home",
      head: "",
      hero: site.slides.length ? {
        kicker: "Featured",
        slides: site.slides.map((s) => ({ title: s.title, meta: s.subtitle, description: s.description, image: s.image, actions: slideActions(doc, rules, s) }))
      } : null,
      pills: null,
      sections,
      // A hidden row is still read, so its bars still reach the history.
      observed: [].concat(...site.rows.map((r) => r.items)),
      more: site.more ? qs(rules.showMore, doc) : null,
      moreCount: site.rows.length,
      moreScroll: true,
      scroll: "rows",
      // Watch now, which Dropout draws after the rows: waited for.
      start: "slide-0",
      waitForStart: true
    };
  }

  globalThis.TenfootHome = Object.freeze({ homeModel, readSite, rowOverride });
})();
