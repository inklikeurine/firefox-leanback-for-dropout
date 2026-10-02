// Leanback for Dropout — the pages at a one-word address: a show, a special
// (a movie and its extras) or a list (Trending, a show's New Episodes…). Which
// one a page is comes from the page itself (sites/<site>.json →
// pages.series.show.layouts), never from its address or the show's name, so
// every show works the same way, including ones added tomorrow.
//
// Dropout's page stays underneath and keeps its nodes. On a show, Leanback
// adds a row of seasons, newest first, built from Dropout's own season list;
// choosing one goes to that season's page, which is how Dropout switches
// seasons too. It also marks what Leanback hides, and stamps each episode
// watched or in progress from the watch history and Dropout's own bars.
// content/page.js drives it; content/show.css draws it.

(function () {
  const LAYOUT_ATTR = "data-tenfoot-show";
  const OMIT_ATTR = "data-tenfoot-omit";
  const ROW_ATTR = "data-tenfoot-seasons";
  const SEASON_ATTR = "data-tenfoot-season";
  const WATCH_ATTR = "data-tenfoot-watch";
  // The parts of Dropout's page content/show.css restyles, stamped so the
  // stylesheet never names Dropout's classes.
  const PART_ATTRS = ["data-tenfoot-action", "data-tenfoot-ep-grid", "data-tenfoot-ep", "data-tenfoot-ep-link", "data-tenfoot-ep-art", "data-tenfoot-ep-text"];
  const LABEL_MAX = 40;
  const NAME_MAX = 120;

  const R = () => globalThis.TenfootSiteRules;

  function qs(sel, scope) {
    if (!sel) return null;
    try {
      return scope.querySelector(sel);
    } catch (_err) {
      return null;
    }
  }

  function qsa(sel, scope) {
    if (!sel) return [];
    try {
      return Array.from(scope.querySelectorAll(sel));
    } catch (_err) {
      return [];
    }
  }

  function clean(text, max) {
    return String(text || "").replace(/\s+/g, " ").trim().slice(0, max);
  }

  /**
   * "show", "special" or "list" — the first layout whose marker the page
   * has — or null.
   * @param {Document} doc
   * @param {{layouts?: Object<string, string>}} rules — pages.series.show
   */
  function layoutOf(doc, rules) {
    const layouts = rules && rules.layouts && typeof rules.layouts === "object" ? rules.layouts : {};
    for (const name of ["show", "special", "list"]) {
      if (typeof layouts[name] === "string" && qs(layouts[name], doc)) return name;
    }
    return null;
  }

  /** The season number in an address ("/game-changer/season:3" → 3), or null. */
  function seasonNumber(url) {
    const m = /\/season:(\d+)(?:[/?#]|$)/.exec(String(url || ""));
    return m ? Number(m[1]) : null;
  }

  /** True when an address names its season. */
  function namesSeason(url) {
    return seasonNumber(url) !== null;
  }

  // "Season 1: All About "A Crown Of Candy"" → "Season 1". The rest of a long
  // name heads the episodes instead.
  function labelOf(name) {
    const i = name.indexOf(":");
    return clean(i > 0 ? name.slice(0, i) : name, LABEL_MAX);
  }

  /**
   * The show's seasons, as Dropout lists them in its season control: each
   * option's value is the season's own page. `current` is the season on
   * screen: the one the address names, else the one Dropout has selected.
   * @returns {{url: string, number: number, name: string, label: string, current: boolean}[]}
   */
  function readSeasons(doc, rules, href) {
    const sel = qs(rules && rules.seasonSelect, doc);
    if (!sel || !sel.options) return [];
    let base;
    try {
      base = new URL(href || (doc.location && doc.location.href) || "");
    } catch (_err) {
      return [];
    }
    const out = [];
    Array.from(sel.options).forEach((o, i) => {
      let url;
      try {
        url = new URL(o.value, base);
      } catch (_err) {
        return;
      }
      if (url.origin !== base.origin) return;
      const number = seasonNumber(url.pathname);
      const name = clean(o.textContent, NAME_MAX);
      if (number === null || !name) return;
      out.push({ url: url.href, number, name, label: labelOf(name), current: false, selected: i === sel.selectedIndex });
    });
    const named = seasonNumber(base.pathname);
    const cur = out.find((s) => (named !== null ? s.number === named : s.selected));
    for (const s of out) {
      s.current = s === cur;
      delete s.selected;
    }
    return out;
  }

  /**
   * The season a show should open on, when the page is not already showing
   * it: `pref` "latest" is the highest-numbered season, "first" the lowest.
   * null when there is nothing to change (one season, or already there).
   */
  function seasonTarget(seasons, pref) {
    if (!Array.isArray(seasons) || seasons.length < 2) return null;
    const pick = seasons.reduce((best, s) => {
      if (!best) return s;
      return pref === "first" ? (s.number < best.number ? s : best) : (s.number > best.number ? s : best);
    }, null);
    return pick && !pick.current ? pick.url : null;
  }

  // Dropout's own progress bar on a tile (Roku and Android plays), as a
  // percentage, or null.
  function barPercent(el) {
    if (!el) return null;
    const w = el.style && el.style.width ? el.style.width : "";
    const m = /^(\d+(?:\.\d+)?)%$/.exec(w.trim());
    return m ? Math.min(100, Number(m[1])) : null;
  }

  /**
   * @param {Document} doc
   * @param {{
   *   rules: object,                          pages.series.show
   *   history: () => object,                  the watch history store
   *   onSeason?: (url: string, current: boolean) => void
   * }} opts
   */
  function createShow(doc, opts) {
    const o = opts || {};
    const rules = o.rules || {};
    const H = globalThis.TenfootHistory;
    const root = doc.documentElement;
    const layout = layoutOf(doc, rules);
    const seasons = layout === "show" ? readSeasons(doc, rules) : [];
    const omitted = [];
    let block = null;
    let row = null;

    function omit(list) {
      for (const sel of R().selectorList(list)) {
        for (const el of qsa(sel, doc)) {
          if (el.hasAttribute(OMIT_ATTR)) continue;
          el.setAttribute(OMIT_ATTR, "");
          omitted.push(el);
        }
      }
    }

    function mark(el, attr, value) {
      if (el && el.getAttribute(attr) !== value) el.setAttribute(attr, value);
    }

    // The header's buttons on every layout; the episode grid on a show.
    function stampParts() {
      const primary = R().selector(rules.primaryAction);
      for (const el of qsa(R().selector(rules.actions), doc)) {
        if (el.hasAttribute(OMIT_ATTR)) continue;
        let isPrimary = false;
        try {
          isPrimary = Boolean(primary) && el.matches(primary);
        } catch (_err) { /* a bad selector marks nothing primary */ }
        mark(el, "data-tenfoot-action", isPrimary ? "primary" : "");
      }
      if (layout !== "show") return;
      for (const li of episodeItems()) {
        mark(li.parentElement, "data-tenfoot-ep-grid", "");
        mark(li, "data-tenfoot-ep", "");
        mark(qs(rules.episodeLink, li), "data-tenfoot-ep-link", "");
        mark(qs(rules.episodeArt, li), "data-tenfoot-ep-art", "");
        mark(qs(rules.episodeText, li), "data-tenfoot-ep-text", "");
      }
    }

    function omitAll() {
      const lists = rules.omit && typeof rules.omit === "object" ? rules.omit : {};
      omit(lists.all);
      if (layout === "show") omit(lists.show);
    }

    function buildSeasons() {
      const section = qs(rules.episodes, doc);
      if (!section) return;
      const cur = seasons.find((s) => s.current) || null;
      const countEl = qs(rules.episodeCount, doc);
      const count = countEl ? clean(countEl.textContent, LABEL_MAX) : "";
      if (!cur && !count && seasons.length < 2) return;
      block = doc.createElement("div");
      block.className = "tenfoot-show-seasons";
      if (seasons.length >= 2) {
        row = doc.createElement("div");
        row.className = "tenfoot-season-row";
        row.setAttribute(ROW_ATTR, "");
        row.setAttribute("role", "list");
        // Newest first: Dropout lists them oldest first.
        for (const s of seasons.slice().sort((a, b) => b.number - a.number)) {
          const b = doc.createElement("button");
          b.type = "button";
          b.className = "tenfoot-season";
          b.setAttribute(SEASON_ATTR, s.url);
          b.setAttribute("role", "listitem");
          b.title = s.name;
          b.textContent = s.label;
          if (s.current) b.setAttribute("aria-current", "true");
          b.addEventListener("click", (e) => {
            // Dropout's own handlers never see it: the season is changed by
            // going to its page, the way page.js goes anywhere.
            e.preventDefault();
            e.stopPropagation();
            if (typeof o.onSeason === "function") o.onSeason(s.url, s.current);
          });
          row.appendChild(b);
        }
        block.appendChild(row);
      }
      const heading = doc.createElement("h2");
      heading.className = "tenfoot-season-heading";
      if (cur) {
        const name = doc.createElement("span");
        name.className = "tenfoot-season-name";
        name.textContent = cur.name;
        heading.appendChild(name);
      }
      if (count) {
        const c = doc.createElement("span");
        c.className = "tenfoot-season-count";
        c.textContent = count;
        heading.appendChild(c);
      }
      block.appendChild(heading);
      const controls = qs(rules.seasonControls, section);
      section.insertBefore(block, controls && controls.parentNode === section ? controls : section.firstChild);
    }

    // What the history and Dropout's bar say about one tile.
    function tileState(li) {
      const link = qs(rules.episodeLink, li);
      if (!link || !H) return { link, status: "unstarted", fraction: null };
      const key = H.keyOf(link.href);
      const store = typeof o.history === "function" ? o.history() : null;
      const saved = key && store && store.entries ? store.entries[key] : null;
      const e = Object.assign({ key }, saved || {});
      const pct = barPercent(qs(rules.episodeProgress, li));
      if (pct !== null && !e.dropout) e.dropout = { percent: pct, at: 0 };
      const status = key ? H.status(e) : "unstarted";
      const fraction = key ? H.progressOf({ entries: { [key]: e } }, key) : null;
      return { link, status, fraction };
    }

    function episodeItems() {
      const section = qs(rules.episodes, doc);
      return section ? qsa(rules.episode, section) : [];
    }

    // Watched: a tick. In progress: a bar. Written only when it changed, so
    // the page's mutation observer does not come back round for nothing.
    function stamp(li, st) {
      const want = st.status === "unstarted" ? "" : st.status;
      if ((li.getAttribute(WATCH_ATTR) || "") !== want) {
        if (want) li.setAttribute(WATCH_ATTR, want);
        else li.removeAttribute(WATCH_ATTR);
      }
      const art = qs(rules.episodeArt, li);
      if (!art) return;
      let bar = art.querySelector(":scope > .tenfoot-ep-bar");
      const pct = st.status === "in-progress" && st.fraction ? `${Math.round(st.fraction * 1000) / 10}%` : "";
      if (!pct) {
        if (bar) bar.remove();
      } else {
        if (!bar) {
          bar = doc.createElement("span");
          bar.className = "tenfoot-ep-bar";
          bar.setAttribute("aria-hidden", "true");
          const fill = doc.createElement("span");
          fill.className = "tenfoot-ep-fill";
          bar.appendChild(fill);
          art.appendChild(bar);
        }
        const fill = bar.firstChild;
        if (fill.style.width !== pct) fill.style.width = pct;
      }
      let tick = art.querySelector(":scope > .tenfoot-ep-tick");
      if (st.status === "watched" && !tick) {
        tick = doc.createElement("span");
        tick.className = "tenfoot-ep-tick";
        tick.setAttribute("aria-hidden", "true");
        art.appendChild(tick);
      } else if (st.status !== "watched" && tick) tick.remove();
    }

    /** Re-read what may have changed: new tiles (load more), the history. */
    function refresh() {
      omitAll();
      stampParts();
      if (layout !== "show") return;
      for (const li of episodeItems()) stamp(li, tileState(li));
    }

    /**
     * Where the selection starts on a show (S12): the episode you are partway
     * through, else the first one after the last you finished, else Episode 1.
     * A season finished all the way through starts on Episode 1 again.
     */
    function startEpisode() {
      if (layout !== "show") return null;
      const eps = episodeItems().map(tileState).filter((x) => x.link);
      if (!eps.length) return null;
      let anchor = -1;
      eps.forEach((x, i) => {
        if (x.status !== "unstarted") anchor = i;
      });
      if (anchor < 0) return eps[0].link;
      if (eps[anchor].status === "in-progress") return eps[anchor].link;
      const next = eps.slice(anchor + 1).find((x) => x.status !== "watched");
      return next ? next.link : eps[0].link;
    }

    function currentSeasonButton() {
      return row ? row.querySelector("[aria-current='true']") : null;
    }

    function destroy() {
      if (block) block.remove();
      block = null;
      row = null;
      for (const el of omitted) el.removeAttribute(OMIT_ATTR);
      omitted.length = 0;
      for (const attr of [WATCH_ATTR, ...PART_ATTRS]) {
        for (const el of qsa(`[${attr}]`, doc)) el.removeAttribute(attr);
      }
      for (const el of qsa(".tenfoot-ep-bar, .tenfoot-ep-tick", doc)) el.remove();
      root.removeAttribute(LAYOUT_ATTR);
    }

    if (layout) root.setAttribute(LAYOUT_ATTR, layout);
    if (layout === "show") buildSeasons();
    refresh();

    return Object.freeze({
      layout,
      seasons,
      refresh,
      startEpisode,
      destroy,
      get row() { return row; },
      get currentSeason() { return currentSeasonButton(); },
      contains: (el) => Boolean(block && el && block.contains(el)),
      snapshot: () => ({
        layout,
        seasons: row ? Array.from(row.children).map((b) => b.textContent) : [],
        current: (seasons.find((s) => s.current) || {}).label || null,
        heading: block ? clean(block.querySelector(".tenfoot-season-heading").textContent, NAME_MAX) : null,
        watched: episodeItems().filter((li) => li.getAttribute(WATCH_ATTR) === "watched").length,
        inProgress: episodeItems().filter((li) => li.getAttribute(WATCH_ATTR) === "in-progress").length
      })
    });
  }

  globalThis.TenfootShow = Object.freeze({ createShow, layoutOf, readSeasons, seasonTarget, seasonNumber, namesSeason, labelOf });
})();
