// Leanback for Dropout — the pages at a one-word address: a show, a special
// (a movie and its extras) or a list (Trending, a show's New Episodes…). Which
// one a page is comes from the page itself (sites/<site>.json →
// pages.series.show.layouts), never from its address or the show's name, so
// every show works the same way, including ones added tomorrow.
//
// Dropout's page stays underneath and keeps its nodes. On a show, Leanback
// adds a row of seasons, newest first, built from Dropout's own season list;
// choosing one goes to that season's page, which is how Dropout switches
// seasons too. It adds the show's main button, which picks the show up where
// you left it ("Resume S9 E3", "Play S9 E4"). It also marks what Leanback
// hides, and stamps each episode watched or in progress from the watch
// history and Dropout's own bars. content/page.js drives it; content/show.css
// draws it.

(function () {
  const LAYOUT_ATTR = "data-tenfoot-show";
  const OMIT_ATTR = "data-tenfoot-omit";
  const ROW_ATTR = "data-tenfoot-seasons";
  const SEASON_ATTR = "data-tenfoot-season";
  const WATCH_ATTR = "data-tenfoot-watch";
  const RESUME_ATTR = "data-tenfoot-resume";
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

  /** The main button's words: "Resume S9 E3", "Play S9 E4", "Play E1", "Play". */
  function pickUpLabel(p) {
    const has = (v) => typeof v === "number" && Number.isFinite(v);
    const where = [has(p.season) ? `S${p.season}` : "", has(p.episode) ? `E${p.episode}` : ""].filter(Boolean).join(" ");
    const verb = p.action === "resume" ? "Resume" : "Play";
    return where ? `${verb} ${where}` : verb;
  }

  // Dropout's own progress bar on a tile (Roku and Android plays), as a
  // percentage, or null.
  function barPercent(el) {
    if (!el) return null;
    const w = el.style && el.style.width ? el.style.width : "";
    const m = /^(\d+(?:\.\d+)?)%$/.exec(w.trim());
    return m ? Math.min(100, Number(m[1])) : null;
  }

  // -- what a show's page holds (shared by the drawn screen and the restyle) --

  function episodeTiles(doc, rules) {
    const section = qs(rules && rules.episodes, doc);
    return section ? qsa(rules.episode, section) : [];
  }

  // What the history and Dropout's bar say about one tile.
  function tileStateOf(li, rules, store) {
    const H = globalThis.TenfootHistory;
    const link = qs(rules.episodeLink, li);
    if (!link || !H) return { link, status: "unstarted", fraction: null };
    const key = H.keyOf(link.href);
    const saved = key && store && store.entries ? store.entries[key] : null;
    const e = Object.assign({ key }, saved || {});
    const pct = barPercent(qs(rules.episodeProgress, li));
    if (pct !== null && !e.dropout) e.dropout = { percent: pct, at: 0 };
    const status = key ? H.status(e) : "unstarted";
    const fraction = key ? H.progressOf({ entries: { [key]: e } }, key) : null;
    return { link, status, fraction };
  }

  /**
   * Where the selection starts on a show (S12), as an index into the tiles'
   * states: the episode you are partway through, else the first one after the
   * last you finished, else Episode 1. A season finished all the way through
   * starts on Episode 1 again. -1 with no tiles.
   */
  function startIndex(states) {
    if (!states.length) return -1;
    let anchor = -1;
    states.forEach((x, i) => {
      if (x.status !== "unstarted") anchor = i;
    });
    if (anchor < 0) return 0;
    if (states[anchor].status === "in-progress") return anchor;
    const next = states.findIndex((x, i) => i > anchor && x.status !== "watched");
    return next >= 0 ? next : 0;
  }

  // The episodes on screen, in page order, as the watch history reads them:
  // address, season (from the address, else the season on screen), episode
  // number ("Episode 3"), title and Dropout's own bar.
  function episodesOf(doc, rules, seasons) {
    const cur = (seasons || []).find((s) => s.current) || null;
    const out = [];
    for (const li of episodeTiles(doc, rules)) {
      const link = qs(rules.episodeLink, li);
      if (!link || !link.href) continue;
      const numberEl = qs(rules.episodeNumber, li);
      const m = numberEl ? /(\d+)/.exec(numberEl.textContent || "") : null;
      const titleEl = qs(rules.episodeTitle, li);
      const season = seasonNumber(link.href);
      out.push({
        url: link.href,
        season: season !== null ? season : cur ? cur.number : null,
        episode: m ? Number(m[1]) : null,
        title: titleEl ? clean(titleEl.textContent, NAME_MAX) : "",
        percent: barPercent(qs(rules.episodeProgress, li))
      });
    }
    return out;
  }

  function showSlugOf(doc) {
    const path = doc.location ? doc.location.pathname : "";
    return path.split("/").filter(Boolean)[0] || null;
  }

  /**
   * What the show's main button plays (S8): the most recent episode in
   * progress, else the one after the last finished, else the first on
   * screen.
   */
  function pickUpOf(doc, rules, seasons, store) {
    const H = globalThis.TenfootHistory;
    const eps = episodesOf(doc, rules, seasons);
    const hit = H && H.pickUp ? H.pickUp(store, showSlugOf(doc), eps) : null;
    if (hit && hit.url) return hit;
    const first = eps[0];
    return first ? { action: "first", url: first.url, season: first.season, episode: first.episode, title: first.title } : null;
  }

  function safeMatches(el, sel) {
    try {
      return Boolean(sel) && el.matches(sel);
    } catch (_err) {
      return false;
    }
  }

  // A tile as a card for the screen: picture, title, "Episode 3", running
  // time; a tick when watched, a bar when partway.
  function tileItem(li, rules, state) {
    const C = globalThis.TenfootCards;
    const link = qs(rules.episodeLink, li);
    const img = qs(rules.episodeImage, li);
    const numberEl = qs(rules.episodeNumber, li);
    const titleEl = qs(rules.episodeTitle, li);
    const durEl = qs(rules.episodeDuration, li);
    const dur = durEl ? clean(durEl.textContent, LABEL_MAX) : "";
    return {
      key: link.href,
      href: link.href,
      title: (titleEl && clean(titleEl.textContent, NAME_MAX)) || (img && clean(img.getAttribute("alt"), NAME_MAX)) || "",
      subtitle: numberEl ? clean(numberEl.textContent, LABEL_MAX) : "",
      image: img ? img.getAttribute("src") || "" : "",
      durationText: C ? C.tidyDuration(dur) : dur,
      badge: "",
      fraction: state.status === "in-progress" ? state.fraction : null,
      watch: state.status === "unstarted" ? null : state.status
    };
  }

  /**
   * A show's page or a special, as the screen Leanback draws for it
   * (content/screen.js): a banner like Home's — the show's wide picture, its
   * name, the season count, the description and its buttons (S8's yellow
   * Resume / Play, or Watch Movie; Trailer; My List) — then, on a show, the
   * row of seasons (newest first) and the season's episodes five across; on
   * a special, the movie and its extras. Null for any other page.
   * @param {Document} doc
   * @param {object} rules — pages.series.show
   * @param {{history?: object, href?: string, smartOrder?: boolean}} [opts] —
   *   the watch-history store; the address; smartOrder: the setting "Shows
   *   open on" is "newest", so the episodes may run newest first
   */
  function readDetail(doc, rules, opts) {
    const o = opts || {};
    const r = rules || {};
    const layout = layoutOf(doc, r);
    if (layout !== "show" && layout !== "special") return null;
    const textOf = (el) => clean(el ? el.textContent : "", NAME_MAX);
    const title = textOf(qs(r.heroTitle, doc));
    if (!title) return null;
    const store = o.history || null;
    const seasons = layout === "show" ? readSeasons(doc, r, o.href) : [];
    const cur = seasons.find((x) => x.current) || null;
    const art = qsa(r.heroImage, doc);
    const actions = [];
    if (layout === "show") {
      const p = pickUpOf(doc, r, seasons, store);
      if (p) {
        const label = pickUpLabel(p);
        actions.push({ key: "resume", label, href: p.url, primary: true, ariaLabel: p.title ? `${label}: ${p.title}` : label, pick: p.action });
      }
    } else {
      const watch = qs(r.primaryAction, doc);
      if (watch && watch.href) actions.push({ key: "primary", label: clean(watch.textContent, LABEL_MAX) || "Watch", href: watch.href, primary: true });
    }
    const trailer = qs(r.trailerAction, doc);
    if (trailer) actions.push({ key: "trailer", label: clean(trailer.textContent, LABEL_MAX) || "Trailer", proxy: trailer });
    const list = qs(r.listAction, doc);
    if (list) actions.push({ key: "mylist", label: "My List", proxy: list, listed: safeMatches(list, r.listed) });
    const sections = [];
    let start = null;
    let newestFirst = false;
    if (layout === "show") {
      const tiles = episodeTiles(doc, r).filter((li) => qs(r.episodeLink, li));
      const states = tiles.map((li) => tileStateOf(li, r, store));
      const items = tiles.map((li, i) => tileItem(li, r, states[i]));
      const si = startIndex(states);
      start = si >= 0 ? items[si].key : actions.length ? actions[0].key : null;
      // With "Shows open on: newest", the episodes run whichever way puts
      // the one to watch next nearer the top: newest first once it is past
      // the middle of the season (caught up with a running season), Episode
      // 1 first before that (a season not started, or one being binged).
      newestFirst = Boolean(o.smartOrder) && items.length > 1 && si > (items.length - 1) / 2;
      const countEl = qs(r.episodeCount, doc);
      sections.push({ key: "episodes", title: cur ? cur.name : "", sub: countEl ? clean(countEl.textContent, LABEL_MAX) : "", columns: 5, items: newestFirst ? items.slice().reverse() : items });
    } else {
      for (const [key, sel, columns] of [["movie", r.movieSection, 5], ["extras", r.extrasSection, 5]]) {
        const section = qs(sel, doc);
        if (!section) continue;
        const tiles = qsa(r.episode, section).filter((li) => qs(r.episodeLink, li));
        if (!tiles.length) continue;
        const items = tiles.map((li) => tileItem(li, r, tileStateOf(li, r, store)));
        sections.push({ key, title: textOf(qs(r.sectionTitle, section)), sub: "", columns, items });
      }
      start = actions.length ? actions[0].key : null;
    }
    return {
      kind: layout,
      head: "",
      hero: {
        title,
        meta: clean(qs(r.heroStats, doc) ? qs(r.heroStats, doc).textContent : "", LABEL_MAX),
        description: clean(qs(r.heroDescription, doc) ? qs(r.heroDescription, doc).textContent : "", 400),
        image: art.length ? art[art.length - 1].getAttribute("src") || "" : "",
        actions
      },
      pills: seasons.length >= 2
        ? { items: seasons.slice().sort((a, b) => b.number - a.number).map((x) => ({ key: x.url, label: x.label, title: x.name, current: x.current })) }
        : null,
      sections,
      more: qs(r.more, doc),
      // Newest first needs the whole season: Dropout's Load More is pressed
      // until every episode is on the page.
      loadAll: newestFirst,
      newestFirst,
      start,
      current: cur ? cur.label : null
    };
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
    let resume = null; // the show's main button

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

    const store = () => (typeof o.history === "function" ? o.history() : null);

    function tileState(li) {
      return tileStateOf(li, rules, store());
    }

    function episodeItems() {
      return episodeTiles(doc, rules);
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

    function pickUp() {
      return pickUpOf(doc, rules, seasons, store());
    }

    // First among the show's buttons, in the yellow of a primary action.
    // Written only when something changed.
    function placeResume() {
      const p = layout === "show" ? pickUp() : null;
      if (!p) {
        if (resume) resume.remove();
        resume = null;
        return;
      }
      if (!resume) {
        resume = doc.createElement("a");
        resume.className = "tenfoot-resume";
        resume.setAttribute("data-tenfoot-action", "primary");
        const box = qs(rules.actionsBox, doc);
        if (box) box.insertBefore(resume, box.firstChild);
        else if (block && block.parentNode) block.parentNode.insertBefore(resume, block);
        else {
          resume = null;
          return;
        }
      }
      const label = pickUpLabel(p);
      mark(resume, "href", p.url);
      mark(resume, RESUME_ATTR, p.action);
      mark(resume, "aria-label", p.title ? `${label}: ${p.title}` : label);
      if (resume.textContent !== label) resume.textContent = label;
    }

    /** Re-read what may have changed: new tiles (load more), the history. */
    function refresh() {
      omitAll();
      stampParts();
      if (layout !== "show") return;
      for (const li of episodeItems()) stamp(li, tileState(li));
      placeResume();
    }

    // Where the selection starts on a show (S12).
    function startEpisode() {
      if (layout !== "show") return null;
      const eps = episodeItems().map(tileState).filter((x) => x.link);
      const i = startIndex(eps);
      return i >= 0 ? eps[i].link : null;
    }

    function currentSeasonButton() {
      return row ? row.querySelector("[aria-current='true']") : null;
    }

    function destroy() {
      if (block) block.remove();
      if (resume) resume.remove();
      block = null;
      row = null;
      resume = null;
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
      get resume() { return resume; },
      get currentSeason() { return currentSeasonButton(); },
      contains: (el) => Boolean(block && el && block.contains(el)),
      snapshot: () => ({
        layout,
        seasons: row ? Array.from(row.children).map((b) => b.textContent) : [],
        current: (seasons.find((s) => s.current) || {}).label || null,
        heading: block ? clean(block.querySelector(".tenfoot-season-heading").textContent, NAME_MAX) : null,
        resume: resume ? { label: resume.textContent, href: resume.getAttribute("href"), action: resume.getAttribute(RESUME_ATTR) } : null,
        watched: episodeItems().filter((li) => li.getAttribute(WATCH_ATTR) === "watched").length,
        inProgress: episodeItems().filter((li) => li.getAttribute(WATCH_ATTR) === "in-progress").length
      })
    });
  }

  globalThis.TenfootShow = Object.freeze({ createShow, readDetail, layoutOf, readSeasons, seasonTarget, seasonNumber, namesSeason, pickUpLabel });
})();
