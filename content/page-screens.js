// Leanback for Dropout — Leanback's screens and the rail, for content/page.js:
// which screen a page gets (content/screen.js and its readers), starting,
// stopping and redrawing it, moves on it, the rail and its focus region, and
// the season a show opens on. Installed into the page script's shared
// context.

(function () {
  function install(P) {
    const { state } = P;
    // state.screen is Leanback's own screen on this page, when it draws one, a
    // screen of content/screen.js: Home and the hubs (content/home.js reads
    // them), Browse, My List and the lists (a grid of cards), a show's page
    // and a special (a banner, the seasons, sections of cards: content/show.js
    // reads them). Every screen answers the same calls, so the page script
    // treats them alike.
    const root = document.documentElement;
    const Rail = globalThis.TenfootRail;
    const Home = globalThis.TenfootHome;
    const Screen = globalThis.TenfootScreen;
    const Show = globalThis.TenfootShow;
    const { qs } = globalThis.TenfootCommon;

    // From the rest of the page script.
    const send = (...a) => P.send(...a);
    const collect = (...a) => P.collect(...a);
    const currentEl = (...a) => P.currentEl(...a);
    const focusEl = (...a) => P.focusEl(...a);
    const samePath = (...a) => P.samePath(...a);
    const openMenu = (...a) => P.openMenu(...a);
    const openSettings = (...a) => P.openSettings(...a);
    const leaveFieldBelow = (...a) => P.leaveFieldBelow(...a);
    const goHome = (...a) => P.goHome(...a);
    const goSideways = (...a) => P.goSideways(...a);
    const goTop = (...a) => P.goTop(...a);
    const startWatching = (...a) => P.startWatching(...a);
    const isLive = (...a) => P.isLive(...a);

    // The rail's own entries, top to bottom. The site's links (rules →
    // rail.links) come after Browse, and the gear sits at the foot.
    const RAIL_ITEMS = [
      { id: "search", label: "Search", icon: "search" },
      { id: "home", label: "Home", icon: "home" },
      { id: "browse", label: "Browse", icon: "grid" }
    ];
    const RAIL_SETTINGS = { id: "settings", label: "Leanback settings", icon: "gear", end: true };

    function homeRules() {
      return (state.rules && state.rules.home) || {};
    }

    function screenRules() {
      return (state.rules && state.rules.screen) || {};
    }

    // "home", "page" (a grid of cards), "detail" (a show or a special),
    // "search", "episode" (an episode's details page), or null for a page
    // Leanback does not draw.
    function screenKind() {
      if (state.kind === "browse" || state.kind === "hub") return "home";
      if (state.kind === "grid") return "page";
      if (state.kind === "search") return "search";
      if (state.kind === "video") return "episode";
      if (state.kind === "series" && Show) {
        const layout = Show.layoutOf(document, state.page.show);
        if (layout === "list") return "page";
        if (layout === "show" || layout === "special") return "detail";
      }
      return null;
    }

    function startScreen() {
      const which = screenKind();
      if (state.screen || !which || !Screen) return;
      const observe = (items) => send({ type: "history:observe", items });
      if (which === "home") {
        // Home's rows come after the page is up: the screen starts as soon as
        // the page holds Home, and fills in as they arrive.
        if (!Home || !qs(homeRules().root)) return;
        state.screen = Screen.createScreen(document, {
          home: true,
          read: () => Home.homeModel(document, homeRules(), { history: state.history, continueWatching: state.kind === "browse" }),
          history: () => state.history,
          onObserve: observe
        });
      } else {
        const readers = {
          detail: () => Show.readDetail(document, state.page.show, { history: state.history, href: location.href, smartOrder: state.settings.seasonStart !== "first" }),
          search: () => Screen.searchModel(document, screenRules().search),
          episode: () => Screen.episodeModel(document, screenRules().episode, { history: state.history, href: location.href, live: isLive() }),
          page: () => Screen.collectionModel(document, screenRules())
        };
        const read = readers[which];
        // Nothing to draw from: Dropout's page stays, driven as it is.
        if (!read()) return;
        // A page the rail links to goes by the rail's name (My List); the New
        // Releases list carries no "New" badges, as its row on Home does not.
        const link = railLinks().find((l) => samePath(l.url, location.href));
        const tweak = Home ? Home.rowOverride(homeRules(), location.href, "") : null;
        const kinds = state.rules.rail && Array.isArray(state.rules.rail.kinds) ? state.rules.rail.kinds : [];
        state.screen = Screen.createScreen(document, {
          read,
          title: link ? link.label : "",
          rail: kinds.includes(state.kind),
          badges: !(tweak && tweak.badges === false),
          history: () => state.history,
          onObserve: observe,
          onPill: (pill) => onSeasonChosen(pill.key, Boolean(pill.current)),
          onFieldDone: () => leaveFieldBelow(),
          // An episode's Watch (or Resume) and Start Over.
          onRun: (what) => startWatching(what === "restart")
        });
      }
      root.dataset.tenfootHome = "on";
      state.screenRefocus = 0;
      state.screen.refresh();
    }

    function stopScreen() {
      if (!state.screen) return;
      state.screen.destroy();
      state.screen = null;
      delete root.dataset.tenfootHome;
      setPending(false);
    }

    function refreshScreen() {
      if (!state.screen) return;
      const before = currentEl();
      const target = state.screen.refresh();
      if (state.screen.ready) setPending(false);
      if (state.pendingInitialFocus || state.railActive || state.menu.isOpen || state.modal || state.playerFocused || state.theater || state.inPlace || !target) return;
      // The card the selection was on went away, or the site took the focus:
      // put it on the card Home now has selected. Still there, it may have
      // changed size (Watch becoming Resume): the ring follows.
      if (!before || !before.isConnected || before !== target) focusEl(target, { scroll: false });
      else state.ring.refresh();
    }

    function moveScreen(dir) {
      const r = state.screen.move(dir);
      if (r && r.el) focusEl(r.el, { scroll: false });
      else if (r && r.edge === "left") enterRail();
      return true;
    }

    function railShown() {
      return Boolean(state.rail) && state.rail.visible;
    }

    function railLinks() {
      const links = state.rules && state.rules.rail && Array.isArray(state.rules.rail.links) ? state.rules.rail.links : [];
      return links.filter((l) => l && typeof l.id === "string" && typeof l.url === "string" && typeof l.label === "string");
    }

    // The rail entry for the page on screen. A hub looks like Home but is not
    // it, so nothing is lit there unless the rail links to it.
    function railPage() {
      const link = railLinks().find((l) => samePath(l.url, location.href));
      if (link) return link.id;
      if (state.kind === "browse") return "home";
      if (state.kind === "grid") return "browse";
      if (state.kind === "search") return "search";
      return null;
    }

    // An episode's page has the rail beside its details page, and not when
    // it is Dropout's own page.
    function setupRail() {
      const kinds = state.rules.rail && Array.isArray(state.rules.rail.kinds) ? state.rules.rail.kinds : [];
      const on = state.enabled && kinds.includes(state.kind) && (state.kind !== "video" || Boolean(state.screen));
      if (!state.rail && on && Rail) {
        const links = railLinks().map((l) => ({ id: l.id, label: l.label, icon: l.icon || "tv" }));
        state.rail = Rail.createRail(document, [...RAIL_ITEMS, ...links, RAIL_SETTINGS], { onActivate: onRailItem });
      }
      if (!state.rail) return;
      state.rail.setCurrent(railPage());
      // With nothing lit, entering the rail lands on Home.
      if (!railPage()) state.rail.select(state.rail.item("home"));
      state.rail.show(on);
      if (on) root.dataset.tenfootRail = "on";
      else delete root.dataset.tenfootRail;
      if (!on) state.railActive = false;
    }

    function enterRail() {
      if (!railShown()) return false;
      state.railReturn = currentEl();
      state.railActive = true;
      const el = state.rail.current;
      if (el) focusEl(el, { scroll: false });
      return true;
    }

    // Back to exactly where the selection came from (H3).
    function leaveRail() {
      state.railActive = false;
      const r = state.railReturn;
      state.railReturn = null;
      if (r && r.isConnected) {
        if (state.screen) state.screen.select(r);
        focusEl(r, { scroll: !state.screen });
        return true;
      }
      const target = state.screen ? state.screen.current || state.screen.initialTarget() : null;
      if (target) focusEl(target, { scroll: false });
      else {
        const { candidates } = collect();
        if (candidates.length) focusEl(candidates[0].el);
      }
      return true;
    }

    function dispatchInRail(action) {
      switch (action) {
        case "up":
        case "down": {
          const el = state.rail.move(action === "up" ? -1 : 1);
          if (el) focusEl(el, { scroll: false });
          return true;
        }
        case "right":
        case "back":
          return leaveRail();
        case "left":
          return true; // the rail is the left edge
        case "select": {
          const id = state.rail.currentId;
          if (id) onRailItem(id);
          return true;
        }
        case "menu":
          return openMenu();
        case "search":
          return goTop(state.rules.searchUrl || "/search");
        default:
          return false;
      }
    }

    function onRailItem(id) {
      const el = state.rail && state.rail.item(id);
      if (el) state.rail.select(el);
      const link = railLinks().find((l) => l.id === id);
      if (link) {
        if (samePath(link.url, location.href)) leaveRail();
        else goTop(link.url);
        return;
      }
      switch (id) {
        case "home":
          if (state.kind === "browse" && state.screen) {
            // Already Home: back to the top of it.
            state.railActive = false;
            state.railReturn = null;
            const t = state.screen.initialTarget();
            if (t) focusEl(t, { scroll: false });
            return;
          }
          goHome();
          return;
        case "browse":
          // My List is a grid page too, but not Browse.
          if (railPage() === "browse") {
            leaveRail();
            return;
          }
          goTop(state.rules.gridUrl || "/series");
          return;
        case "search":
          if (state.kind === "search") {
            leaveRail();
            return;
          }
          goTop(state.rules.searchUrl || "/search");
          return;
        case "settings":
          state.menuReturn = el || currentEl();
          openSettings();
          return;
        default:
      }
    }

    // A show opens on the season the settings ask for, newest or first; Dropout
    // opens every show on Season 1. Only an address that names no season is
    // moved: one that does was chosen (a season picked, Back from an episode).
    // Replacing the page keeps Back where it was.
    function openSeason() {
      if (!Show || state.kind !== "series" || Show.namesSeason(location.pathname)) return false;
      const rules = state.page.show;
      if (Show.layoutOf(document, rules) !== "show") return false;
      const url = Show.seasonTarget(Show.readSeasons(document, rules, location.href), state.settings.seasonStart);
      if (!url) return false;
      goSideways(url);
      return true;
    }

    // OK on a season: its page, replacing this one, so Back leaves the show
    // rather than stepping back through the seasons. The season already on
    // screen takes the selection down to its episodes instead.
    function onSeasonChosen(url, current) {
      if (!current) {
        goSideways(url);
        return;
      }
      const t = state.screen ? state.screen.initialTarget() : null;
      if (t) focusEl(t, { scroll: false });
    }

    // A screen Leanback is still building keeps Dropout's page hidden under it
    // (content/page.css), so Dropout's page never shows first. Lifted when the
    // screen is up, or when it is given up (stopScreen).
    function setPending(on) {
      if (on) root.setAttribute("data-tenfoot-pending", "");
      else root.removeAttribute("data-tenfoot-pending");
    }

    function inScreen(el) {
      return Boolean(el && state.screen && !state.modal && state.screen.contains(el));
    }

    Object.assign(P, {
      homeRules, screenRules, screenKind, startScreen, stopScreen, refreshScreen, moveScreen,
      railShown, railLinks, railPage, setupRail, enterRail, leaveRail, dispatchInRail,
      onRailItem, openSeason, onSeasonChosen, setPending, inScreen
    });
  }

  globalThis.TenfootPageScreens = Object.freeze({ install });
})();
