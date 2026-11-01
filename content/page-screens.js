// Leanback for Dropout — Leanback's screens and the rail, for content/page.js:
// which screen a page gets (content/screen.js, its models read by
// content/readers.js, content/show.js and content/home.js), starting,
// stopping and redrawing it, moves on it, the rail and its focus region, and
// the season a show opens on (the profiles are content/page-profiles.js).
// Installed into the page script's shared context.

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
    const Readers = globalThis.TenfootReaders;
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
    const go = (...a) => P.go(...a);
    const startWatching = (...a) => P.startWatching(...a);
    const clearProgress = (...a) => P.clearProgress(...a);
    const isLive = (...a) => P.isLive(...a);
    const pageLook = (...a) => P.pageLook(...a);
    const formRules = (...a) => P.formRules(...a);
    const pickerForm = (...a) => P.pickerForm(...a);
    const editPicture = (...a) => P.editPicture(...a);
    const cancelProfile = (...a) => P.cancelProfile(...a);
    const deleteProfile = (...a) => P.deleteProfile(...a);
    const syncPicker = (...a) => P.syncPicker(...a);
    const signOut = (...a) => P.signOut(...a);
    // Theme This Page's Card Size: how many cards across a grid.
    const GRID_COLUMNS = { small: 6, medium: 5, large: 4 };

    // The rail's own entries, top to bottom. Signed in, the profile watching
    // comes first, set apart (signed out, Sign in does); the site's links
    // (rules → rail.links) come after Browse, and the gear sits at the foot.
    const RAIL_PROFILE = { id: "profile", label: "Switch profile", icon: "person", start: true };
    const RAIL_SIGNIN = { id: "signin", label: "Sign in", icon: "person", start: true };
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
    // "search", "episode" (an episode's details page), "profiles" (the
    // profile picker and Manage profiles), "welcome" (the front page signed
    // out), or null for a page Leanback does not draw.
    function screenKind() {
      if (state.kind === "browse" || state.kind === "hub") return "home";
      if (state.kind === "profiles") return pickerForm() ? null : "profiles";
      if (state.kind === "profileEdit") return "profileForm";
      if (state.kind === "welcome") return "welcome";
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
          read: () => Home.homeModel(document, homeRules(), { history: state.history, continueWatching: state.kind === "browse", banner: pageLook().banner }),
          history: () => state.history,
          onObserve: observe
        });
      } else {
        const readers = {
          detail: () => Show.readDetail(document, state.page.show, { history: state.history, href: location.href, smartOrder: state.settings.seasonStart !== "first" }),
          search: () => Readers.searchModel(document, screenRules().search),
          episode: () => Readers.episodeModel(document, screenRules().episode, { history: state.history, href: location.href, live: isLive() }),
          page: () => Readers.collectionModel(document, screenRules(), {
            empty: railPage() === "my-list" ? "Nothing in My List yet. Add a show or a video to it with Add to My List on its page." : ""
          }),
          // The picker, or its Add Profile form.
          profiles: () => Readers.profilesModel(document, screenRules().profiles, { current: state.profile, signOut, editPicture }) ||
            Readers.profileFormModel(document, formRules().add),
          profileForm: () => Readers.profileFormModel(document, formRules().edit),
          welcome: () => Readers.welcomeModel(document, screenRules().welcome, {
            signinUrl: state.rules.signinUrl,
            browseUrl: state.rules.browseUrl,
            legal: Array.isArray(state.rules.legal) ? state.rules.legal : []
          })
        };
        const read = readers[which];
        // Nothing to draw from: Dropout's page stays, driven as it is. The
        // picker and Edit Profile are drawn by Dropout's scripts after the
        // page loads: their screens wait for them, the way Home's waits for
        // its rows.
        if (which !== "profiles" && which !== "profileForm" && !read()) return;
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
          columns: () => GRID_COLUMNS[pageLook().cards] || null,
          onPill: (pill) => onSeasonChosen(pill.key, Boolean(pill.current)),
          onFieldDone: () => leaveFieldBelow(),
          // An episode's Watch (or Resume), Start Over and Clear Progress; a
          // profile's Delete Profile.
          onRun: (what) => {
            if (what === "clear") return clearProgress();
            if (what === "ask:delete") return deleteProfile();
            if (what === "ask:cancel") return cancelProfile();
            return startWatching(what === "restart");
          }
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
      if (state.kind === "profiles" && state.enabled) syncPicker();
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

    function profileRules() {
      return (state.rules && state.rules.rail && state.rules.rail.profile) || {};
    }

    // The profile watching, as Dropout's header shows it: its picture, set as
    // a background. Null when signed out (no picture there); "" when the
    // header has the place but no picture.
    function profilePicture() {
      const el = qs(profileRules().picture);
      if (!el) return null;
      const m = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec((el.style && el.style.backgroundImage) || el.getAttribute("style") || "");
      return m ? m[1] : "";
    }

    // An episode's page has the rail beside its details page, and not when
    // it is Dropout's own page.
    function setupRail() {
      const kinds = state.rules.rail && Array.isArray(state.rules.rail.kinds) ? state.rules.rail.kinds : [];
      const on = state.enabled && kinds.includes(state.kind) && (state.kind !== "video" || Boolean(state.screen));
      if (!state.rail && on && Rail) {
        const links = railLinks().map((l) => ({ id: l.id, label: l.label, icon: l.icon || "tv" }));
        const picture = profileRules().url ? profilePicture() : null;
        const signedOut = Boolean(state.rules.signinUrl && qs(state.rules.common && state.rules.common.signedOut));
        const top = picture !== null ? [Object.assign({}, RAIL_PROFILE, { picture })] : signedOut ? [RAIL_SIGNIN] : [];
        state.rail = Rail.createRail(document, [...top, ...RAIL_ITEMS, ...links, RAIL_SETTINGS], { onActivate: onRailItem });
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
      else if (state.screen && state.screen.isEmpty()) {
        // Nothing on the screen to go to: the selection stays on the rail.
        state.railActive = true;
        if (state.rail.current) focusEl(state.rail.current, { scroll: false });
      } else {
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
        case "profile":
          // A page of its own on top, so Back comes back here if nobody
          // is picked.
          go(profileRules().url);
          return;
        case "signin":
          go(state.rules.signinUrl);
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
