// Leanback for Dropout — the screens Leanback draws: Home and the hubs,
// Browse, My List and the lists, a show's page, a special, search and an
// episode's page. The page is only read: Dropout's page stays underneath,
// untouched, and Leanback's layer covers it, a child of <html> outside the
// site's tree, drawn with the cards of content/cards.js.
//
// What a screen holds comes from a reader, as a description (a "model"):
//   head      — a plain page title (Browse, My List, a list), or
//   hero      — a banner: picture, kicker, title, meta, description and
//               buttons (a show's page, a special: content/show.js); with
//               `slides`, one of several, › stepping through them (Home's
//               featured: content/home.js); on an episode's page, a place for
//               the player (dock) in place of the picture, which page.js
//               puts Dropout's player over;
//   field     — a search box: Leanback's own, whose text is typed into
//               Dropout's (search);
//   pills     — a row of choices (a show's seasons, newest first; search's
//               filters, which press Dropout's own);
//   sections  — groups of cards, each a grid of its own columns or a row
//               that slides sideways (`layout: "row"`, Home's);
//   empty     — what to say when there are no cards (Dropout's own words);
//   more      — Dropout's own Load More, pressed near the end (at once and
//               until it is gone, with loadAll: a season run newest first;
//               with moreScroll, the page underneath scrolled to its end if
//               that does nothing, as Home's);
//   start     — the key of the card or button the selection starts on
//               (waited for, with waitForStart: Home's Watch now).
// This file reads collection pages, search and an episode's page itself
// (readPage, searchModel, episodeModel; sites/dropout.json → screen);
// show.js reads shows and specials, home.js Home.
//
// The selection moves over rows: the search box, the buttons, the seasons
// or filters, then each section's cards in rows of its columns. ◀ ▶ move
// along a row and stop at its ends ({edge: "left"} is the cue for the rail);
// ▲ ▼ move a row, keeping the column between rows of a grid, and landing
// where a row was left (the season on screen, at first). Each row of cards
// slides up to the same place near the top; down to the first, the screen
// is shown from the top (Home, scroll "rows": every row slides up).

(function () {
  const LAYER_CLASS = "tenfoot-home";
  const COLUMNS = 5;
  const PREFETCH_ROWS = 2;
  const MORE_TIMEOUT_MS = 6000;
  const MORE_SCROLL_AFTER_MS = 2500;
  const ROW_ANCHOR = 0.07; // the selected row's top, as a share of the viewport height

  const C = () => globalThis.TenfootCards;
  const Common = globalThis.TenfootCommon;
  const { textOf } = Common;
  // Only ever inside the scope given: no scope, no match.
  const qs = (sel, scope) => (scope ? Common.qs(sel, scope) : null);
  const qsa = (sel, scope) => (scope ? Common.qsa(sel, scope) : []);

  /**
   * What a collection page holds: its title, its tiles in page order (one per
   * link), and whether Dropout has more to load.
   * @param {Document} doc
   * @param {object} R — the rules' "screen" object
   */
  function readPage(doc, R) {
    const rules = R || {};
    const { hrefOf, tidyDuration, parseDuration, percentOf } = C();
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
   * Dropout's search page as a screen model: Leanback's own search box, the
   * type filters (All, Videos, Collections) as pills, the results as cards.
   * Null when Dropout's search box is not on the page.
   * @param {Document} doc
   * @param {object} R — the rules' "screen.search" object
   */
  function searchModel(doc, R) {
    const rules = R || {};
    const input = qs(rules.input, doc);
    if (!input) return null;
    const page = readPage(doc, rules);
    const filters = qsa(rules.filter, doc).map((b, i) => (
      { key: b.getAttribute("data-filter-type") || `filter-${i}`, label: textOf(b), current: Common.matches(b, rules.filterSelected), proxy: b }
    )).filter((f) => f.label);
    return {
      kind: "search",
      head: "",
      hero: null,
      field: { value: String(input.value || ""), placeholder: input.getAttribute("placeholder") || "Search", proxy: input },
      pills: filters.length ? { items: filters } : null,
      sections: [{ key: "results", title: "", sub: "", columns: COLUMNS, items: page.items }],
      empty: textOf(qs(rules.empty, doc)),
      more: qs(rules.more, doc),
      start: "field"
    };
  }

  /**
   * Type `value` into one of the site's text boxes as if typed there: its
   * own value setter (past a framework's watcher on the element), then an
   * input event, which is what a React box listens for.
   */
  function typeInto(input, value) {
    if (!input || !input.isConnected) return;
    const win = input.ownerDocument.defaultView || globalThis;
    try {
      const desc = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value");
      if (desc && desc.set) desc.set.call(input, value);
      else input.value = value;
    } catch (_err) {
      input.value = value;
    }
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
  }

  /**
   * An episode's page, under its player, as a screen model: the player's
   * place with the episode beside it — the show, the title, "Season 2,
   * Episode 1 · 28-Feb-2020", the description, and Play, Episodes and My
   * List — then Dropout's "Up Next in Season N" as cards. Null when the page
   * has no title to show.
   * @param {Document} doc
   * @param {object} R — the rules' "screen.episode" object
   */
  function episodeModel(doc, R) {
    const rules = R || {};
    const { hrefOf } = C();
    const title = textOf(qs(rules.title, doc));
    if (!title) return null;
    const actions = [{ key: "play", label: "Play", run: "player", primary: true }];
    const back = hrefOf(qs(rules.season, doc)) || hrefOf(qs(rules.show, doc));
    if (back) actions.push({ key: "episodes", label: "Episodes", href: back });
    const list = qs(rules.listAction, doc);
    if (list) actions.push({ key: "mylist", label: "My List", proxy: list, listed: Common.matches(list, rules.listed) });
    const page = readPage(doc, rules);
    return {
      kind: "episode",
      head: "",
      hero: {
        dock: true,
        kicker: textOf(qs(rules.show, doc)),
        title,
        meta: textOf(qs(rules.info, doc)).replace(/\s*•\s*/g, " · "),
        description: textOf(qs(rules.description, doc)),
        image: "",
        actions
      },
      pills: null,
      sections: page.items.length ? [{ key: "upnext", title: textOf(qs(rules.upNextTitle, doc)) || "Up Next", sub: "", columns: COLUMNS, items: page.items }] : [],
      more: null,
      start: "play"
    };
  }

  /** A collection page as a screen model: its title over a grid of cards. */
  function collectionModel(doc, R) {
    const page = readPage(doc, R);
    if (!page.root) return null;
    return {
      kind: "collection",
      head: page.title,
      hero: null,
      pills: null,
      sections: [{ key: "items", title: "", sub: "", columns: COLUMNS, items: page.items }],
      more: page.more ? qs(R.more, doc) : null,
      start: null
    };
  }

  /**
   * @param {Document} doc
   * @param {{
   *   read: () => object|null,              // the model, read afresh on every refresh
   *   home?: boolean,                       // Home's own layer: labelled "Home", no screen title
   *   title?: string,                       // in place of the model's head
   *   rail?: boolean,                       // the rail is beside it (room is left)
   *   badges?: boolean,                     // false: no badges on the cards
   *   history?: () => object,               // the watch-history store
   *   onObserve?: (items: object[]) => void,// Dropout's progress bars, for the history
   *   onPill?: (pill: object) => void,      // OK on a pill (a season); a pill with a proxy presses it instead
   *   onFieldDone?: () => void,             // Enter in the search box
   *   onRun?: (what: string) => void,       // OK on a button that runs something ("player")
   *   onLayout?: () => void                 // the screen moved (the player's place with it)
   * }} opts
   */
  function createScreen(doc, opts) {
    const o = opts || {};
    const H = globalThis.TenfootHistory;
    const win = doc.defaultView || globalThis;
    const { setText, setAttr } = C();

    const el = (tag, cls) => {
      const e = doc.createElement(tag);
      if (cls) e.className = cls;
      return e;
    };

    let layer = doc.querySelector(`.${LAYER_CLASS}`);
    if (layer) layer.remove();
    layer = el("div", o.home ? LAYER_CLASS : `${LAYER_CLASS} tenfoot-screen`);
    layer.setAttribute("role", "main");
    if (o.home) layer.setAttribute("aria-label", "Home");
    layer.hidden = true;
    if (o.rail === false) layer.dataset.tenfootNorail = "true";
    const view = el("div", "tenfoot-home-view");
    const scroller = el("div", "tenfoot-home-scroll");
    const head = el("div", "tenfoot-screen-head");
    const titleEl = el("h1", "tenfoot-screen-title");
    head.appendChild(titleEl);
    head.hidden = true;
    // The banner. Its parts survive a redraw, and a change of slide, so the
    // selection on its buttons does.
    const hero = el("section", o.home ? "tenfoot-hero" : "tenfoot-hero tenfoot-screen-hero");
    hero.hidden = true;
    const heroArt = el("img", "tenfoot-hero-art");
    heroArt.alt = "";
    const heroScrim = el("div", "tenfoot-hero-scrim");
    // Where the player goes on an episode's page: an empty box the size of
    // the video, which page.js puts Dropout's own player over.
    const heroDock = el("div", "tenfoot-screen-player");
    heroDock.hidden = true;
    const heroBody = el("div", "tenfoot-hero-body");
    const heroKicker = el("p", "tenfoot-hero-label");
    const heroTitle = el("h1", "tenfoot-hero-title");
    const heroMeta = el("p", "tenfoot-hero-meta");
    const heroText = el("p", "tenfoot-hero-text");
    const heroActions = el("div", "tenfoot-hero-actions");
    // Where we are among a banner's slides (Home's featured).
    const heroDots = el("div", "tenfoot-hero-dots");
    heroDots.setAttribute("aria-hidden", "true");
    heroDots.hidden = true;
    heroBody.append(heroKicker, heroTitle, heroMeta, heroText, heroActions, heroDots);
    hero.append(heroArt, heroScrim, heroDock, heroBody);
    // The next slide, beside the first button: OK steps on, and the selection
    // stays on it so OK can keep going.
    const nextSlideBtn = el("button", "tenfoot-hero-button tenfoot-hero-next");
    nextSlideBtn.type = "button";
    nextSlideBtn.setAttribute("aria-label", "Next featured");
    nextSlideBtn.textContent = "›";
    nextSlideBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      stepSlide(1);
    });
    // The search box: Leanback's own, typed into; its text goes on to the
    // site's box, whose results come back as a change to the page.
    const fieldBox = el("div", "tenfoot-screen-field");
    fieldBox.hidden = true;
    const field = el("input", "tenfoot-screen-field-input");
    field.type = "search";
    field.autocomplete = "off";
    field.spellcheck = false;
    field.setAttribute("aria-label", "Search");
    field.setAttribute("data-tenfoot-nozoom", "");
    fieldBox.appendChild(field);
    field.addEventListener("input", () => {
      if (model && model.field) typeInto(model.field.proxy, field.value);
    });
    field.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (typeof o.onFieldDone === "function") o.onFieldDone();
    });
    const pillRow = el("div", "tenfoot-season-row tenfoot-screen-pills");
    pillRow.setAttribute("role", "list");
    pillRow.hidden = true;
    const sectionsBox = el("div", o.home ? "tenfoot-rows" : "tenfoot-screen-sections");
    const emptyBox = el("p", "tenfoot-screen-empty");
    emptyBox.hidden = true;
    const moreBox = el("p", "tenfoot-home-more");
    moreBox.textContent = "Loading more…";
    moreBox.hidden = true;
    scroller.append(head, hero, fieldBox, pillRow, sectionsBox, emptyBox, moreBox);
    view.appendChild(scroller);
    layer.appendChild(view);
    doc.documentElement.appendChild(layer);

    let model = null;
    let slide = 0;
    let actionEls = new Map(); // key → element
    let pillEls = new Map();
    const sectionEls = new Map(); // key → {box, layout, grid|track, cards: Map, links, items, columns}
    let rows = []; // [{key, kind: "field"|"actions"|"pills"|"cards", section, els, keys}]
    let pos = { row: 0, col: 0 };
    let started = false;
    let awaitingStart = false; // started on a card only because model.start was not drawn yet
    const memory = new Map(); // row key → item key
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

    // A card's progress: what the reader says, else Leanback's own reading,
    // else Dropout's bar (one merged reading per video).
    function withProgress(it, section) {
      const noBadge = o.badges === false || (section && section.badges === false);
      if (it.fraction !== undefined) return noBadge ? Object.assign({}, it, { badge: "" }) : it;
      const s = store();
      const key = H ? H.keyOf(it.href) : null;
      const mine = key && s.entries[key] ? H.progressOf(s, key) : null;
      const pct = typeof it.percent === "number" ? it.percent : null;
      const fraction = mine !== null ? mine : pct !== null ? pct / 100 : null;
      const extra = { fraction };
      if (noBadge) extra.badge = "";
      return Object.assign({}, it, extra);
    }

    // The banner as shown: the model's, or its slide on screen.
    function heroView() {
      const h = model && model.hero;
      if (!h || !Array.isArray(h.slides)) return h || null;
      if (!h.slides.length) return null;
      if (slide >= h.slides.length) slide = 0;
      return Object.assign({}, h, h.slides[slide]);
    }

    function slideCount() {
      const h = model && model.hero;
      return h && Array.isArray(h.slides) ? h.slides.length : 0;
    }

    // -- drawing --------------------------------------------------------------

    function renderHead() {
      const text = o.title || (model && model.head) || "";
      setText(titleEl, text);
      head.hidden = !text || Boolean(model && model.hero);
      if (!o.home) setAttr(layer, "aria-label", text || (model && model.hero ? (heroView() || {}).title : null));
    }

    function renderHero() {
      const h = heroView();
      hero.hidden = !h;
      if (!h) {
        for (const node of actionEls.values()) node.remove();
        actionEls = new Map();
        if (nextSlideBtn.parentNode) nextSlideBtn.remove();
        heroDots.hidden = true;
        return;
      }
      if (h.image && heroArt.getAttribute("src") !== h.image) heroArt.setAttribute("src", h.image);
      if (!h.image) setAttr(heroArt, "src", null);
      setAttr(hero, "data-tenfoot-dock", h.dock ? "true" : null);
      heroDock.hidden = !h.dock;
      setText(heroKicker, h.kicker || "");
      heroKicker.hidden = !h.kicker;
      setText(heroTitle, h.title);
      setText(heroMeta, h.meta);
      heroMeta.hidden = !h.meta;
      setText(heroText, h.description);
      heroText.hidden = !h.description;
      const next = new Map();
      const order = [];
      (h.actions || []).forEach((a) => {
        const tag = a.href ? "A" : "BUTTON";
        let node = actionEls.get(a.key);
        if (!node || node.tagName !== tag) {
          if (node) node.remove();
          node = el(a.href ? "a" : "button", "tenfoot-hero-button tenfoot-hero-action");
          if (!a.href) {
            node.type = "button";
            node.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              const cur = heroView();
              const act = cur ? (cur.actions || []).find((x) => x.key === node.dataset.tenfootAction) : null;
              const proxy = act && (typeof act.proxy === "function" ? act.proxy() : act.proxy);
              if (proxy) {
                try {
                  proxy.click();
                } catch (_err) { /* nothing to press */ }
              } else if (act && act.run && typeof o.onRun === "function") o.onRun(act.run);
            });
          }
        }
        node.dataset.tenfootAction = a.key;
        setAttr(node, "href", a.href || null);
        setAttr(node, "aria-label", a.ariaLabel || a.label);
        setAttr(node, "data-tenfoot-listed", a.listed ? "true" : null);
        node.classList.toggle("tenfoot-hero-primary", Boolean(a.primary));
        setText(node, a.label);
        next.set(a.key, node);
        order.push(node);
      });
      for (const [k, node] of actionEls) if (!next.has(k)) node.remove();
      actionEls = next;
      // The next slide sits right after the first button, one step from where
      // the selection lands.
      const n = slideCount();
      if (n > 1 && order.length) order.splice(1, 0, nextSlideBtn);
      else if (nextSlideBtn.parentNode) nextSlideBtn.remove();
      // Only what is out of place moves: moving an element drops its focus.
      order.forEach((node, k) => {
        if (heroActions.children[k] !== node) heroActions.insertBefore(node, heroActions.children[k] || null);
      });
      while (heroDots.children.length > n) heroDots.lastChild.remove();
      while (heroDots.children.length < n) heroDots.appendChild(el("span", "tenfoot-hero-dot"));
      Array.from(heroDots.children).forEach((d, i) => d.classList.toggle("tenfoot-hero-dot--on", i === slide));
      heroDots.hidden = n < 2;
    }

    // The banner's buttons in order, the next-slide button among them.
    function heroButtons() {
      return Array.from(heroActions.children);
    }

    function heroKeys() {
      return heroButtons().map((b) => (b === nextSlideBtn ? "next-slide" : b.dataset.tenfootAction));
    }

    function renderPills() {
      const p = model && model.pills;
      pillRow.hidden = !p || !p.items.length;
      const next = new Map();
      ((p && p.items) || []).forEach((it, i) => {
        let b = pillEls.get(it.key);
        if (!b) {
          b = el("button", "tenfoot-season");
          b.type = "button";
          b.setAttribute("role", "listitem");
          b.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const pill = model && model.pills ? model.pills.items.find((x) => x.key === b.dataset.tenfootPill) : null;
            if (pill && pill.proxy) {
              try {
                pill.proxy.click();
              } catch (_err) { /* nothing to press */ }
            } else if (pill && typeof o.onPill === "function") o.onPill(pill);
          });
        }
        b.dataset.tenfootPill = it.key;
        setAttr(b, "title", it.title || null);
        setAttr(b, "aria-current", it.current ? "true" : null);
        setText(b, it.label);
        if (pillRow.children[i] !== b) pillRow.insertBefore(b, pillRow.children[i] || null);
        next.set(it.key, b);
      });
      for (const [k, b] of pillEls) if (!next.has(k)) b.remove();
      pillEls = next;
    }

    // The box shows the site's text unless it is being typed in, so a search
    // opened from an address (?q=) shows its words, and typing is never
    // overwritten by a slower page.
    function renderField() {
      const f = model && model.field;
      fieldBox.hidden = !f;
      if (!f) return;
      setAttr(field, "placeholder", f.placeholder || null);
      if (doc.activeElement !== field && field.value !== f.value) field.value = f.value;
    }

    function renderEmpty() {
      const text = (model && model.empty) || "";
      setText(emptyBox, text);
      emptyBox.hidden = !text || cardCount() > 0;
    }

    // A section of cards: a grid of its columns (the default), or a row that
    // slides sideways (Home's rows).
    function makeSection(layout) {
      if (layout === "row") {
        const box = el("section", "tenfoot-row");
        const titleBox = el("h2", "tenfoot-row-title");
        const clip = el("div", "tenfoot-row-view");
        const track = el("div", "tenfoot-track");
        clip.appendChild(track);
        box.append(titleBox, clip);
        return { layout, box, titleBox, track, holder: track, cards: new Map(), links: [], items: [], x: 0 };
      }
      const box = el("section", "tenfoot-screen-section");
      const titleBox = el("h2", "tenfoot-row-title tenfoot-screen-section-title");
      const name = el("span", "tenfoot-screen-section-name");
      const sub = el("span", "tenfoot-screen-section-sub");
      titleBox.append(name, sub);
      const grid = el("div", "tenfoot-screen-grid");
      box.append(titleBox, grid);
      return { layout: "grid", box, titleBox, name, sub, grid, holder: grid, cards: new Map(), links: [], items: [] };
    }

    function renderSections() {
      const list = (model && model.sections) || [];
      const seen = new Set();
      let prev = null;
      for (const s of list) {
        const layout = s.layout === "row" ? "row" : "grid";
        let sec = sectionEls.get(s.key);
        if (sec && sec.layout !== layout) {
          sec.box.remove();
          sec = null;
        }
        if (!sec) {
          sec = makeSection(layout);
          sectionEls.set(s.key, sec);
        }
        seen.add(s.key);
        if (layout === "row") {
          setAttr(sec.box, "data-tenfoot-row", s.key);
          setText(sec.titleBox, s.title || "");
          sec.columns = Infinity;
        } else {
          sec.box.dataset.tenfootSection = s.key;
          setText(sec.name, s.title || "");
          setText(sec.sub, s.sub || "");
          sec.titleBox.hidden = !s.title && !s.sub;
          const cols = Math.max(1, s.columns || COLUMNS);
          sec.grid.style.setProperty("--tf-cols", String(cols));
          sec.columns = cols;
        }
        sec.title = s.title || "";
        sec.badges = s.badges;
        sec.links = C().reconcile(doc, sec.holder, sec.cards, s.items.map((it) => withProgress(it, s)));
        sec.items = s.items;
        const ref = prev ? prev.nextSibling : sectionsBox.firstChild;
        if (sec.box !== ref) sectionsBox.insertBefore(sec.box, ref);
        prev = sec.box;
      }
      for (const [k, sec] of sectionEls) {
        if (!seen.has(k)) {
          sec.box.remove();
          sectionEls.delete(k);
        }
      }
    }

    // The rows the selection moves over, top to bottom.
    function buildRows() {
      const next = [];
      if (model && model.field) next.push({ key: "field", kind: "field", els: [field], keys: ["field"] });
      if (model && model.hero && actionEls.size) next.push({ key: "actions", kind: "actions", els: heroButtons(), keys: heroKeys() });
      if (pillEls.size) next.push({ key: "pills", kind: "pills", els: Array.from(pillEls.values()), keys: Array.from(pillEls.keys()) });
      for (const s of (model && model.sections) || []) {
        const sec = sectionEls.get(s.key);
        if (!sec) continue;
        const step = Number.isFinite(sec.columns) ? sec.columns : Math.max(1, sec.links.length);
        for (let i = 0; i < sec.links.length; i += step) {
          next.push({
            key: `${s.key}:${i / step}`,
            kind: "cards",
            section: s.key,
            els: sec.links.slice(i, i + step),
            keys: sec.items.slice(i, i + step).map((it) => it.key)
          });
        }
      }
      rows = next;
    }

    function layoutOf(row) {
      const sec = row && row.kind === "cards" ? sectionEls.get(row.section) : null;
      return sec ? sec.layout : null;
    }

    // -- scrolling ---------------------------------------------------------------

    // Down the screen: the selected row's top goes to the same place near the
    // top every time. With model.scroll "rows" (Home) that is every row of
    // cards, and the banner scrolls away; otherwise the buttons, the seasons
    // and the first row of cards stay where they are. Along a sliding row
    // (Home's), the selected card sits at the row's left edge until the
    // row's end is on screen.
    function applyScroll() {
      const row = rows[pos.row];
      const node = row ? row.els[pos.col] : null;
      const sec = row && row.kind === "cards" ? sectionEls.get(row.section) : null;
      const anchor = Math.round((win.innerHeight || 0) * ROW_ANCHOR);
      let y = 0;
      if (sec && node) {
        const target = sec.layout === "row" ? sec.box : node.parentNode;
        const firstCards = rows.findIndex((r) => r.kind === "cards");
        if (model && model.scroll === "rows") y = Math.max(0, target.offsetTop - anchor);
        else if (pos.row !== firstCards) y = Math.max(0, target.offsetTop - anchor);
      }
      const t = y ? `translateY(${-y}px)` : "";
      if (scroller.style.transform !== t) {
        scroller.style.transform = t;
        if (typeof o.onLayout === "function") o.onLayout();
      }
      setAttr(layer, "data-tenfoot-scrolled", y ? "true" : null);
      if (sec && sec.layout === "row") {
        const card = node ? node.parentNode : null;
        const clip = sec.track.parentNode;
        const maxX = Math.max(0, sec.track.scrollWidth - (clip ? clip.clientWidth : 0));
        sec.x = card ? Math.min(Math.max(0, card.offsetLeft), maxX) : 0;
        const tx = sec.x ? `translateX(${-sec.x}px)` : "";
        if (sec.track.style.transform !== tx) sec.track.style.transform = tx;
      }
      // A long row of seasons slides sideways to keep the selection in it.
      if (row && row.kind === "pills" && node) {
        const left = node.offsetLeft - pillRow.offsetLeft;
        const right = left + node.offsetWidth;
        if (left < pillRow.scrollLeft) pillRow.scrollLeft = Math.max(0, left - 12);
        else if (right > pillRow.scrollLeft + pillRow.clientWidth) pillRow.scrollLeft = right - pillRow.clientWidth + 12;
      }
    }

    // -- more ----------------------------------------------------------------------

    // How much there is, to tell when Dropout has drawn more: the reader's
    // count (Home: its rows), else the cards.
    function moreCount() {
      return model && typeof model.moreCount === "number" ? model.moreCount : cardCount();
    }

    function wantMore() {
      const link = model && model.more;
      if (more || !link || !link.isConnected) return;
      more = { count: moreCount(), deadline: Date.now() + MORE_TIMEOUT_MS };
      moreBox.hidden = false;
      try {
        link.click();
      } catch (_err) { /* the timer below gives up */ }
      if (!model.moreScroll) {
        moreTimer = win.setTimeout(endMore, MORE_TIMEOUT_MS);
        return;
      }
      // The page also loads more on scroll (Home). If the button did nothing,
      // scroll the page underneath to its end, as a mouse user would.
      moreTimer = win.setTimeout(() => {
        moreTimer = 0;
        if (!more || destroyed) return;
        try {
          win.scrollTo(0, doc.documentElement.scrollHeight);
        } catch (_err) { /* nothing else to try */ }
        moreTimer = win.setTimeout(endMore, Math.max(0, more.deadline - Date.now()));
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

    function cardCount() {
      let n = 0;
      for (const sec of sectionEls.values()) n += sec.links.length;
      return n;
    }

    // -- selection -----------------------------------------------------------------

    function current() {
      const row = rows[pos.row];
      return row ? row.els[pos.col] || null : null;
    }

    function remember() {
      const row = rows[pos.row];
      if (!row) return;
      memory.set(row.kind === "cards" ? `section:${row.section}` : row.key, row.keys[pos.col]);
    }

    // `entered`: the selection has just come into this row. A grid asks for
    // more near its end on every move; a sliding row (Home's) only when it
    // is entered.
    function settle(entered) {
      remember();
      const row = rows[pos.row];
      const lastCards = rows.length - 1;
      if (row && row.kind === "cards" && pos.row >= lastCards - PREFETCH_ROWS && (entered || layoutOf(row) !== "row")) wantMore();
      applyScroll();
      const target = current();
      return target ? { el: target } : { edge: "none" };
    }

    // Where a row is entered from another: the season on screen or where the
    // row was left; between rows of a grid, the same column. A sliding row
    // not visited yet starts at its first card.
    function entryCol(row, from) {
      if (row.kind === "cards" && from && from.kind === "cards" && from.section === row.section) {
        return Math.min(pos.col, row.els.length - 1);
      }
      const key = memory.get(row.kind === "cards" ? `section:${row.section}` : row.key);
      let i = key ? row.keys.indexOf(key) : -1;
      if (i < 0 && row.kind === "pills") i = row.els.findIndex((b) => b.getAttribute("aria-current") === "true");
      if (i < 0 && row.kind === "cards" && layoutOf(row) !== "row" && from && from.kind === "cards") i = Math.min(pos.col, row.els.length - 1);
      return Math.max(0, i);
    }

    /**
     * Move the selection. Returns {el} for the element to focus, or {edge}
     * when there is nothing further that way ("left" is the caller's cue to
     * enter the rail).
     */
    function move(dir) {
      awaitingStart = false;
      const row = rows[pos.row];
      if (!row) return initial() ? settle() : { edge: "none" };
      if (dir === "left") {
        if (pos.col === 0) return { edge: "left" };
        pos.col -= 1;
        return settle();
      }
      if (dir === "right") {
        if (pos.col >= row.els.length - 1) return { edge: "right" };
        pos.col += 1;
        return settle();
      }
      if (dir === "up" || dir === "down") {
        const to = pos.row + (dir === "up" ? -1 : 1);
        if (to < 0) return { edge: "up" };
        if (to >= rows.length) {
          wantMore();
          return { edge: "down" };
        }
        const target = rows[to];
        // Into a section of cards from outside it: back to the card last
        // selected there, in whichever of its rows.
        if (target.kind === "cards" && !(row.kind === "cards" && row.section === target.section)) {
          const key = memory.get(`section:${target.section}`);
          const at = key ? find(key, target.section) : null;
          if (at) {
            pos = at;
            return settle(true);
          }
        }
        pos = { row: to, col: entryCol(target, row) };
        return settle(true);
      }
      return { edge: "none" };
    }

    // Where a key is, in a given section when one is named (Home has the
    // same video on more than one row).
    function find(key, section) {
      for (let r = 0; r < rows.length; r += 1) {
        if (section && rows[r].section !== section) continue;
        const c = rows[r].keys.indexOf(key);
        if (c >= 0) return { row: r, col: c };
      }
      return null;
    }

    // Where the selection starts: the model's start, else the first card,
    // else the first row. A start not drawn yet (Home's banner, which
    // Dropout draws after its rows) is waited for, unless the viewer moves.
    function initial() {
      awaitingStart = false;
      if (!rows.length) return false;
      const at = (model && model.start && find(model.start)) || null;
      if (at) pos = at;
      else {
        const firstCards = rows.findIndex((r) => r.kind === "cards");
        pos = { row: firstCards >= 0 ? firstCards : 0, col: 0 };
        awaitingStart = Boolean(model && model.start && model.waitForStart);
      }
      started = true;
      return true;
    }

    function initialTarget() {
      if (!ready() || !initial()) return null;
      settle();
      return current();
    }

    /** Point the model at an element (a click, or focus coming back). */
    function select(target) {
      if (!target) return false;
      // Leanback's own focus lands here too; only somewhere else is the viewer.
      if (target !== current()) awaitingStart = false;
      for (let r = 0; r < rows.length; r += 1) {
        const c = rows[r].els.indexOf(target);
        if (c >= 0) {
          pos = { row: r, col: c };
          settle();
          return true;
        }
      }
      return false;
    }

    function ready() {
      return rows.length > 0;
    }

    /** The next (1) or previous (-1) slide of the banner, the selection kept on ›. */
    function stepSlide(delta) {
      const n = slideCount();
      if (n < 2) return false;
      slide = (slide + delta + n) % n;
      const onHero = rows[pos.row] && rows[pos.row].kind === "actions";
      renderHero();
      buildRows();
      const at = find("next-slide");
      if (at && onHero) pos = at;
      memory.set("actions", "next-slide");
      return true;
    }

    // -- refresh -------------------------------------------------------------------

    /**
     * Read the page again and redraw what changed. The selection stays on the
     * same card or button (by key; on the same row first), else the nearest.
     */
    function refresh() {
      if (destroyed) return null;
      const before = rows[pos.row] ? { rowKey: rows[pos.row].key, key: rows[pos.row].keys[pos.col], row: pos.row, col: pos.col } : null;
      try {
        model = typeof o.read === "function" ? o.read() : null;
      } catch (err) {
        console.warn("[leanback-for-dropout] the page could not be read:", err && err.message);
        model = null;
      }
      renderHead();
      renderHero();
      renderField();
      renderPills();
      renderSections();
      renderEmpty();
      buildRows();
      if (more && (moreCount() > more.count || !(model && model.more))) endMore();
      if (model && model.loadAll) wantMore();
      if (awaitingStart && model && model.start && find(model.start)) initial();
      else if (before) restore(before);
      if (ready()) layer.hidden = false;
      applyScroll();
      observe();
      if (typeof o.onLayout === "function") o.onLayout();
      return current();
    }

    function restore(before) {
      const r = rows.findIndex((x) => x.key === before.rowKey);
      const c = r >= 0 && before.key !== undefined ? rows[r].keys.indexOf(before.key) : -1;
      const at = (c >= 0 && { row: r, col: c }) || (before.key !== undefined && find(before.key));
      if (at) pos = at;
      else if (r >= 0) pos = { row: r, col: Math.max(0, Math.min(before.col, rows[r].els.length - 1)) };
      else if (rows.length) {
        const i = Math.min(before.row, rows.length - 1);
        pos = { row: i, col: Math.max(0, Math.min(before.col, rows[i].els.length - 1)) };
      }
    }

    // Tell the history what Dropout's progress bars say, once per change:
    // every tile the reader saw (model.observed: Home's hidden rows too),
    // else every card.
    function observe() {
      if (typeof o.onObserve !== "function" || !H || !model) return;
      const items = Array.isArray(model.observed) ? model.observed : [].concat(...(model.sections || []).map((s) => s.items));
      const seen = [];
      for (const it of items) {
        if (typeof it.percent !== "number") continue;
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

    function homeSnapshot() {
      const row = rows[pos.row];
      return {
        ready: ready(),
        shown: !layer.hidden,
        row: !row ? null : row.kind === "actions" ? "hero" : row.section || row.key,
        col: pos.col,
        slide,
        slides: slideCount(),
        rows: ((model && model.sections) || []).map((s) => ({ key: s.key, title: s.title, count: s.items.length, viewAll: s.items.some((it) => it.viewAll) })),
        loading: Boolean(more),
        more: Boolean(model && model.more)
      };
    }

    function snapshot() {
      if (o.home) return homeSnapshot();
      const row = rows[pos.row];
      const cards = cardCount();
      const out = {
        kind: "screen",
        layout: model ? model.kind : null,
        ready: ready(),
        shown: !layer.hidden,
        title: (model && model.hero && model.hero.title) || titleEl.textContent,
        count: cards,
        row: row ? row.kind : null,
        index: row && row.kind === "cards" ? rows.slice(0, pos.row).filter((r) => r.kind === "cards" && r.section === row.section).reduce((n, r) => n + r.els.length, 0) + pos.col : null,
        columns: COLUMNS,
        loading: Boolean(more),
        more: Boolean(model && model.more)
      };
      if (model && model.field) {
        out.search = {
          text: field.value,
          site: model.field.value,
          filters: model.pills ? model.pills.items.map((p) => p.label) : [],
          filter: model.pills ? (model.pills.items.find((p) => p.current) || {}).label || null : null,
          empty: emptyBox.hidden ? null : emptyBox.textContent
        };
      }
      if (model && model.hero) {
        const actions = model.hero.actions || [];
        const resume = actions.find((a) => a.key === "resume") || null;
        if (model.kind === "episode") {
          out.episode = {
            show: model.hero.kicker || null,
            title: model.hero.title,
            meta: model.hero.meta || null,
            actions: actions.map((a) => a.label),
            upNext: model.sections[0] ? model.sections[0].title : null
          };
        }
        out.show = {
          layout: model.kind,
          actions: actions.map((a) => a.label),
          resume: resume ? { label: resume.label, href: resume.href, action: resume.pick } : null,
          seasons: model.pills ? model.pills.items.map((p) => p.label) : [],
          current: model.current || null,
          heading: (model.sections[0] && [model.sections[0].title, model.sections[0].sub].filter(Boolean).join(" · ")) || null,
          order: model.newestFirst ? "newest-first" : "episode-1-first",
          sections: model.sections.map((s) => s.title || s.key),
          watched: model.sections.reduce((n, s) => n + s.items.filter((it) => it.watch === "watched").length, 0),
          inProgress: model.sections.reduce((n, s) => n + s.items.filter((it) => it.watch === "in-progress").length, 0)
        };
      }
      return out;
    }

    return Object.freeze({
      refresh, move, select, initialTarget, destroy, snapshot, stepSlide,
      element: layer,
      // The player's place on an episode's page, while it is drawn.
      get dock() { return model && model.hero && model.hero.dock && !layer.hidden ? heroDock : null; },
      get current() { return current(); },
      get ready() { return ready(); },
      get started() { return started; },
      contains: (node) => layer.contains(node)
    });
  }

  globalThis.TenfootScreen = Object.freeze({ createScreen, readPage, collectionModel, searchModel, episodeModel });
})();
