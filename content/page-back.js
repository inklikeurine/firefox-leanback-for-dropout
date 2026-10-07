// Leanback for Dropout — Back and the ways Leanback leaves a page, for
// content/page.js: every navigation it starts (push, sideways, back down the
// history, Home, a top-level page), the trail behind the page (nav/trail.js),
// Back past the page, the remote's BrowserBack, the structural parent and the
// exit hook. Installed into the page script's shared context.

(function () {
  function install(P) {
    const { state } = P;
    const LOG = "[leanback-for-dropout]";
    const BACK_FALLBACK_MS = 800; // how long Firefox gets to act on BrowserBack before Leanback does
    const Trail = globalThis.TenfootTrail;
    const { qs } = globalThis.TenfootCommon;

    // From the rest of the page script.
    const send = (...a) => P.send(...a);
    const dispatch = (...a) => P.dispatch(...a);
    const showHints = (...a) => P.showHints(...a);
    const railShown = (...a) => P.railShown(...a);
    const readEpisodeOrder = (...a) => P.readEpisodeOrder(...a);

    function sessionStore() {
      try {
        return window.sessionStorage;
      } catch (_err) {
        return null;
      }
    }

    // Every page Leanback opens goes through here, and says how: "push" (one
    // level down), "replace" (sideways). The next page reads that to keep the
    // trail — and so the browser's history — in the shape Back should follow.
    function navigate(url, how) {
      let target;
      try {
        target = new URL(url, location.href).href;
      } catch (_err) {
        console.warn(LOG, "bad navigation target", url);
        return true;
      }
      state.lastNavigation = target;
      if (Trail) Trail.setIntent(sessionStore(), how, target);
      if (how === "replace") location.replace(target);
      else location.assign(target);
      return true;
    }

    function go(url) {
      return navigate(url, "push");
    }

    // Sideways: another episode, another season, another top-level page. It
    // replaces this page in the history, so Back skips it.
    function goSideways(url) {
      return navigate(url, "replace");
    }

    // Back to an earlier page of the trail through the history itself, so the
    // pages above it are left behind rather than piled on. `delta` < 0.
    function goBackTo(delta, url) {
      state.lastNavigation = `history:${delta}`;
      if (Trail) Trail.setIntent(sessionStore(), "back", new URL(url, location.href).href);
      history.go(delta);
      return true;
    }

    function homeUrl() {
      return new URL((state.rules && state.rules.browseUrl) || "/browse", location.href).href;
    }

    // Home: back down the history to it when it is behind this page, else open it.
    function goHome() {
      const j = Trail ? Trail.indexBelow(state.trail, homeUrl()) : -1;
      if (j >= 0) return goBackTo(j - (state.trail.length - 1), homeUrl());
      return go(homeUrl());
    }

    // A top-level page (Browse, Search, Dropout 24/7): one level down from
    // Home, sideways from another top-level page, so Back from any of them is
    // Home.
    function goTop(url) {
      if (state.kind !== "browse" && railShown()) return goSideways(url);
      return go(url);
    }

    // The first path segment is the series: "/game-changer/season:3" and
    // "/game-changer" are the same show.
    function seriesSlug(url) {
      try {
        return new URL(url, location.href).pathname.split("/").filter(Boolean)[0] || null;
      } catch (_err) {
        return null;
      }
    }

    // The newest entry of the trail below this page that is another page, or
    // -1. Only search has entries of its own page below it: one per search the
    // app recorded, which Back goes past all at once.
    function backIndex() {
      if (!Trail) return -1;
      for (let j = state.trail.length - 2; j >= 0; j--) if (!Trail.same(state.trail[j].url, location.href)) return j;
      return -1;
    }

    // Back past this page. With pages of the site behind it, that is the
    // browser's own Back — the same as the remote's BrowserBack, which Firefox
    // acts on whatever the page does. Leanback keeps the history in the shape
    // Back should follow (sideways moves replace the page), and a landing on a
    // sibling carries on by itself (arrive()). With nothing behind it — a tab
    // opened straight on this page — Back walks up the site instead, replacing
    // this page rather than adding one: episode → its season → Home → the exit
    // hook.
    function stepBack() {
      const j = backIndex();
      if (j >= 0) return goBackTo(j - (state.trail.length - 1), state.trail[j].url);
      if (state.kind === "browse") {
        exit();
        return true;
      }
      return goSideways(structuralParent());
    }

    // Firefox goes back on the remote's BrowserBack whatever the page does with
    // the key (T2), so Leanback lets it. Only when there is no page of the site
    // behind this one can Firefox have nowhere to go; then, if the page is still
    // here a moment later, Leanback does what Back means itself.
    function browserBack() {
      if (Trail && Trail.depth(state.trail) > 0) return;
      clearBackFallback();
      state.backFallback = setTimeout(() => {
        state.backFallback = 0;
        if (state.leaving || state.unloading || !state.enabled) return;
        if (dispatch("back", {})) showHints();
      }, BACK_FALLBACK_MS);
    }

    function clearBackFallback() {
      if (!state.backFallback) return;
      clearTimeout(state.backFallback);
      state.backFallback = 0;
    }

    function structuralParent() {
      if (state.kind === "video") {
        const a = qs(state.page.seriesLink);
        if (a && a.href) {
          // The series link drops the season, so prefer the season page we came
          // from when it is the same show.
          const stored = readEpisodeOrder();
          const slug = seriesSlug(a.href);
          if (stored && stored.href && slug && seriesSlug(stored.href) === slug) return stored.href;
          return a.href;
        }
      }
      return state.rules.browseUrl || "/browse";
    }

    async function exit() {
      const r = await send({ type: "exit" });
      if (!r || r.action !== "close-tab") state.hints.show([{ keys: "Back", label: "Nothing to go back to" }], 2000, true);
    }

    // "/" is a toggle: it opens search, and on the search page it closes it and
    // puts you back where you were.
    function leaveSearch() {
      const j = backIndex();
      if (j >= 0) return goBackTo(j - (state.trail.length - 1), state.trail[j].url);
      return goHome();
    }

    // The search app adds a step to the tab's history for every search it runs
    // (history.pushState), without a page load. The trail follows: an entry
    // for each new step, cut back to the step Firefox's Back returned to, the
    // top's address updated otherwise — so going back down to Home counts
    // every step.
    function followSearchHistory(popped) {
      if (!Trail || !state.trail.length) return;
      const href = location.href;
      let t = state.trail.slice();
      const top = t[t.length - 1];
      if (popped) {
        let j = -1;
        for (let i = t.length - 2; i >= 0; i--) if (t[i].url === href) { j = i; break; }
        if (j >= 0) t = t.slice(0, j + 1);
        else t[t.length - 1] = Object.assign({}, top, { url: href });
      } else if (history.length > state.historyLength) {
        t.push(Object.assign({}, top, { url: href }));
      } else {
        t[t.length - 1] = Object.assign({}, top, { url: href });
      }
      state.historyLength = history.length;
      state.trail = t;
      Trail.save(sessionStore(), t);
    }

    // Where this page sits in the tab's history. Returns true when it was
    // reached by Back and is only a sibling of the page left — the previous
    // episode, after Dropout went on to the next by itself — in which case Back
    // carries on past it to the page before the siblings.
    function arrive(persisted, allowSkip) {
      if (!Trail) return false;
      const store = sessionStore();
      let type = persisted ? "back_forward" : "navigate";
      if (!persisted) {
        try {
          const nav = performance.getEntriesByType("navigation")[0];
          if (nav && nav.type) type = nav.type;
        } catch (_err) { /* treated as a new page */ }
      }
      const r = Trail.arrive(Trail.load(store), location.href, type, Trail.takeIntent(store));
      state.trail = r.trail;
      Trail.save(store, r.trail);
      const delta = allowSkip && r.left ? Trail.skipSiblings(r.trail, r.left) : null;
      if (!delta) return false;
      const to = r.trail[r.trail.length - 1 + delta];
      Trail.setIntent(store, "back", to.url);
      state.leaving = true;
      history.go(delta);
      return true;
    }

    // What this page is, kept on its trail entry: its kind, the show it
    // belongs to (episodes and seasons of one show are siblings), and the page
    // Back leads to when nothing is behind it.
    function recordTrail() {
      if (!Trail || !state.trail.length) return;
      let group = null;
      if (state.kind === "video") {
        const a = qs(state.page.seriesLink);
        group = a && a.href ? seriesSlug(a.href) : null;
      } else if (state.kind === "series") group = seriesSlug(location.href);
      state.trail = Trail.describe(state.trail, {
        kind: state.kind,
        group,
        parent: state.kind === "browse" ? null : structuralParent()
      });
      Trail.save(sessionStore(), state.trail);
    }

    Object.assign(P, {
      sessionStore, navigate, go, goSideways, goBackTo, homeUrl, goHome, goTop, seriesSlug,
      backIndex, stepBack, browserBack, clearBackFallback, structuralParent, exit, leaveSearch,
      followSearchHistory, arrive, recordTrail
    });
  }

  globalThis.TenfootPageBack = Object.freeze({ install });
})();
