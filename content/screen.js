// Leanback for Dropout — the screens Leanback draws for the pages that are not
// Home. Like Home (content/home.js), the page is only read: Dropout's page
// stays underneath, untouched, and Leanback's layer covers it, a child of
// <html> outside the site's tree. It is drawn as Home is — the same layer, the
// same cards (content/cards.js), the same scrolling.
//
// What a screen holds comes from a reader, as a description (a "model"):
//   head      — a plain page title (Browse, My List, a list), or
//   hero      — a banner like Home's: picture, title, meta, description and
//               buttons (a show's page, a special: content/show.js); on an
//               episode's page, a place for the player (dock) in place of
//               the picture, which page.js puts Dropout's player over;
//   field     — a search box: Leanback's own, whose text is typed into
//               Dropout's (search);
//   pills     — a row of choices (a show's seasons, newest first; search's
//               filters, which press Dropout's own);
//   sections  — groups of cards, each with its own title and columns;
//   empty     — what to say when there are no cards (Dropout's own words);
//   more      — Dropout's own Load More, pressed near the end;
//   start     — the key of the card or button the selection starts on.
// This file reads collection pages, search and an episode's page itself
// (readPage, searchModel, episodeModel; sites/dropout.json → screen);
// show.js reads shows and specials.
//
// The selection moves over rows: the search box, the buttons, the seasons
// or filters, then each section's cards in rows of its columns. ◀ ▶ move along a row and stop at
// its ends ({edge: "left"} is the cue for the rail); ▲ ▼ move a row, keeping
// the column between rows of cards, and landing where a row was left (the
// season on screen, at first). Down to the first row of cards the screen is
// shown from the top; each row of cards after it slides up to the same place
// near the top, as Home's rows do.

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
    const { textOf } = C();
    const page = readPage(doc, rules);
    const filters = qsa(rules.filter, doc).map((b, i) => {
      let current = false;
      try {
        current = Boolean(rules.filterSelected) && b.matches(rules.filterSelected);
      } catch (_err) { /* a bad selector marks none */ }
      return { key: b.getAttribute("data-filter-type") || `filter-${i}`, label: textOf(b), current, proxy: b };
    }).filter((f) => f.label);
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
    const { textOf, hrefOf } = C();
    const title = textOf(qs(rules.title, doc));
    if (!title) return null;
    const actions = [{ key: "play", label: "Play", run: "player", primary: true }];
    const back = hrefOf(qs(rules.season, doc)) || hrefOf(qs(rules.show, doc));
    if (back) actions.push({ key: "episodes", label: "Episodes", href: back });
    const list = qs(rules.listAction, doc);
    if (list) {
      let listed = false;
      try {
        listed = Boolean(rules.listed) && list.matches(rules.listed);
      } catch (_err) { /* a bad selector: not listed */ }
      actions.push({ key: "mylist", label: "My List", proxy: list, listed });
    }
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
    layer = el("div", `${LAYER_CLASS} tenfoot-screen`);
    layer.setAttribute("role", "main");
    layer.hidden = true;
    if (o.rail === false) layer.dataset.tenfootNorail = "true";
    const view = el("div", "tenfoot-home-view");
    const scroller = el("div", "tenfoot-home-scroll");
    const head = el("div", "tenfoot-screen-head");
    const titleEl = el("h1", "tenfoot-screen-title");
    head.appendChild(titleEl);
    head.hidden = true;
    // The banner, as Home's (its parts survive a redraw, so does the selection).
    const hero = el("section", "tenfoot-hero tenfoot-screen-hero");
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
    heroBody.append(heroKicker, heroTitle, heroMeta, heroText, heroActions);
    hero.append(heroArt, heroScrim, heroDock, heroBody);
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
    const sectionsBox = el("div", "tenfoot-screen-sections");
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
    let actionEls = new Map(); // key → element
    let pillEls = new Map();
    const sectionEls = new Map(); // key → {box, titleEl, subEl, grid, cards: Map}
    let rows = []; // [{key, kind: "field"|"actions"|"pills"|"cards", section, els, keys}]
    let pos = { row: 0, col: 0 };
    let started = false;
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
    // else Dropout's bar (as on Home: one merged reading per video).
    function withProgress(it) {
      if (it.fraction !== undefined) return o.badges === false ? Object.assign({}, it, { badge: "" }) : it;
      const s = store();
      const key = H ? H.keyOf(it.href) : null;
      const mine = key && s.entries[key] ? H.progressOf(s, key) : null;
      const pct = typeof it.percent === "number" ? it.percent : null;
      const fraction = mine !== null ? mine : pct !== null ? pct / 100 : null;
      const extra = { fraction };
      if (o.badges === false) extra.badge = "";
      return Object.assign({}, it, extra);
    }

    // -- drawing --------------------------------------------------------------

    function renderHead() {
      const text = o.title || (model && model.head) || "";
      setText(titleEl, text);
      head.hidden = !text || Boolean(model && model.hero);
      setAttr(layer, "aria-label", text || (model && model.hero ? model.hero.title : null));
    }

    function renderHero() {
      const h = model && model.hero;
      hero.hidden = !h;
      if (!h) {
        actionEls = new Map();
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
      (h.actions || []).forEach((a, i) => {
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
              const act = model && model.hero ? (model.hero.actions || []).find((x) => x.key === node.dataset.tenfootAction) : null;
              if (act && act.proxy) {
                try {
                  act.proxy.click();
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
        if (heroActions.children[i] !== node) heroActions.insertBefore(node, heroActions.children[i] || null);
        next.set(a.key, node);
      });
      for (const [k, node] of actionEls) if (!next.has(k)) node.remove();
      actionEls = next;
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

    function renderSections() {
      const list = (model && model.sections) || [];
      const seen = new Set();
      let prev = null;
      for (const s of list) {
        let sec = sectionEls.get(s.key);
        if (!sec) {
          const box = el("section", "tenfoot-screen-section");
          const titleBox = el("h2", "tenfoot-row-title tenfoot-screen-section-title");
          const name = el("span", "tenfoot-screen-section-name");
          const sub = el("span", "tenfoot-screen-section-sub");
          titleBox.append(name, sub);
          const grid = el("div", "tenfoot-screen-grid");
          box.append(titleBox, grid);
          sec = { box, titleBox, name, sub, grid, cards: new Map(), links: [] };
          sectionEls.set(s.key, sec);
        }
        seen.add(s.key);
        sec.box.dataset.tenfootSection = s.key;
        setText(sec.name, s.title || "");
        setText(sec.sub, s.sub || "");
        sec.titleBox.hidden = !s.title && !s.sub;
        const cols = Math.max(1, s.columns || COLUMNS);
        sec.grid.style.setProperty("--tf-cols", String(cols));
        sec.columns = cols;
        sec.links = C().reconcile(doc, sec.grid, sec.cards, s.items.map(withProgress));
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
      if (model && model.hero && actionEls.size) {
        next.push({ key: "actions", kind: "actions", els: Array.from(actionEls.values()), keys: Array.from(actionEls.keys()) });
      }
      if (pillEls.size) next.push({ key: "pills", kind: "pills", els: Array.from(pillEls.values()), keys: Array.from(pillEls.keys()) });
      for (const s of (model && model.sections) || []) {
        const sec = sectionEls.get(s.key);
        if (!sec) continue;
        for (let i = 0; i < sec.links.length; i += sec.columns) {
          next.push({
            key: `${s.key}:${i / sec.columns}`,
            kind: "cards",
            section: s.key,
            els: sec.links.slice(i, i + sec.columns),
            keys: sec.items.slice(i, i + sec.columns).map((it) => it.key)
          });
        }
      }
      rows = next;
    }

    // -- scrolling ---------------------------------------------------------------

    // The buttons, the seasons and the first row of cards stay where they
    // are; every row of cards after that slides up to the same place near the
    // top, as Home's rows do.
    function applyScroll() {
      const row = rows[pos.row];
      const node = row ? row.els[pos.col] : null;
      const firstCards = rows.findIndex((r) => r.kind === "cards");
      let y = 0;
      if (row && row.kind === "cards" && node && pos.row !== firstCards) {
        y = Math.max(0, node.parentNode.offsetTop - Math.round((win.innerHeight || 0) * ROW_ANCHOR));
      }
      const t = y ? `translateY(${-y}px)` : "";
      if (scroller.style.transform !== t) {
        scroller.style.transform = t;
        if (typeof o.onLayout === "function") o.onLayout();
      }
      setAttr(layer, "data-tenfoot-scrolled", y ? "true" : null);
      // A long row of seasons slides sideways to keep the selection in it.
      if (row && row.kind === "pills" && node) {
        const left = node.offsetLeft - pillRow.offsetLeft;
        const right = left + node.offsetWidth;
        if (left < pillRow.scrollLeft) pillRow.scrollLeft = Math.max(0, left - 12);
        else if (right > pillRow.scrollLeft + pillRow.clientWidth) pillRow.scrollLeft = right - pillRow.clientWidth + 12;
      }
    }

    // -- more ----------------------------------------------------------------------

    function wantMore() {
      const link = model && model.more;
      if (more || !link || !link.isConnected) return;
      more = { count: cardCount(), deadline: Date.now() + MORE_TIMEOUT_MS };
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

    function settle() {
      remember();
      const lastCards = rows.length - 1;
      if (rows[pos.row] && rows[pos.row].kind === "cards" && pos.row >= lastCards - PREFETCH_ROWS) wantMore();
      applyScroll();
      const target = current();
      return target ? { el: target } : { edge: "none" };
    }

    // Where a row is entered from another: the season on screen or where the
    // row was left; between rows of cards, the same column.
    function entryCol(row, from) {
      if (row.kind === "cards" && from && from.kind === "cards" && from.section === row.section) {
        return Math.min(pos.col, row.els.length - 1);
      }
      const key = memory.get(row.kind === "cards" ? `section:${row.section}` : row.key);
      let i = key ? row.keys.indexOf(key) : -1;
      if (i < 0 && row.kind === "pills") i = row.els.findIndex((b) => b.getAttribute("aria-current") === "true");
      if (i < 0 && row.kind === "cards" && from && from.kind === "cards") i = Math.min(pos.col, row.els.length - 1);
      return Math.max(0, i);
    }

    /**
     * Move the selection. Returns {el} for the element to focus, or {edge}
     * when there is nothing further that way ("left" is the caller's cue to
     * enter the rail).
     */
    function move(dir) {
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
          const at = key ? find(key) : null;
          if (at && rows[at.row].section === target.section) {
            pos = at;
            return settle();
          }
        }
        pos = { row: to, col: entryCol(target, row) };
        return settle();
      }
      return { edge: "none" };
    }

    function find(key) {
      for (let r = 0; r < rows.length; r += 1) {
        const c = rows[r].keys.indexOf(key);
        if (c >= 0) return { row: r, col: c };
      }
      return null;
    }

    // Where the selection starts: the model's start, else the first card,
    // else the first row.
    function initial() {
      if (!rows.length) return false;
      const at = (model && model.start && find(model.start)) || null;
      if (at) pos = at;
      else {
        const firstCards = rows.findIndex((r) => r.kind === "cards");
        pos = { row: firstCards >= 0 ? firstCards : 0, col: 0 };
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

    // -- refresh -------------------------------------------------------------------

    /**
     * Read the page again and redraw what changed. The selection stays on the
     * same card or button (by key), or the nearest when it has gone.
     */
    function refresh() {
      if (destroyed) return null;
      const before = rows[pos.row] ? { key: rows[pos.row].keys[pos.col], row: pos.row, col: pos.col } : null;
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
      if (more && (cardCount() > more.count || !(model && model.more))) endMore();
      const at = before && before.key ? find(before.key) : null;
      if (at) pos = at;
      else if (before && rows.length) {
        const r = Math.min(before.row, rows.length - 1);
        pos = { row: r, col: Math.min(before.col, rows[r].els.length - 1) };
      }
      if (ready()) layer.hidden = false;
      applyScroll();
      observe();
      if (typeof o.onLayout === "function") o.onLayout();
      return current();
    }

    // Tell the history what Dropout's progress bars say, once per change.
    function observe() {
      if (typeof o.onObserve !== "function" || !H || !model) return;
      const seen = [];
      for (const s of model.sections || []) {
        for (const it of s.items) {
          if (typeof it.percent !== "number") continue;
          const key = H.keyOf(it.href);
          if (key) seen.push({ key, url: it.href, percent: it.percent, duration: it.duration, title: it.title, image: it.image });
        }
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
          sections: model.sections.map((s) => s.title || s.key),
          watched: model.sections.reduce((n, s) => n + s.items.filter((it) => it.watch === "watched").length, 0),
          inProgress: model.sections.reduce((n, s) => n + s.items.filter((it) => it.watch === "in-progress").length, 0)
        };
      }
      return out;
    }

    return Object.freeze({
      refresh, move, select, initialTarget, destroy, snapshot,
      element: layer,
      // The player's place on an episode's page, while it is drawn.
      get dock() { return model && model.hero && model.hero.dock && !layer.hidden ? heroDock : null; },
      get current() { return current(); },
      get ready() { return ready(); },
      get started() { return started; },
      contains: (node) => layer.contains(node)
    });
  }

  globalThis.TenfootScreen = Object.freeze({ createScreen, readPage, collectionModel, searchModel, episodeModel, typeInto, COLUMNS, LAYER_CLASS });
})();
