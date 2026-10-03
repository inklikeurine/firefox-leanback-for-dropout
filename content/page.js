/* global browser, chrome */
// Leanback for Dropout — page script, top frame of watch.dropout.tv.
// Classifies the URL into a page kind (sites/dropout.json → routes), then
// wires keys → actions → spatial navigation, the focus ring, the hint bar,
// the Home screen (content/home.js), a show's page (content/show.js), the
// icon rail, the theater layout, layered Back, load-more, the season a show
// opens on, the episode details the watch history keeps, and the player relay
// (the player is a cross-origin iframe; see content/player.js).
// Idempotent: html[data-tenfoot] marks a document that is already wired.

(function () {
  const API = typeof browser !== "undefined" ? browser : chrome;
  const LOG = "[leanback-for-dropout]";
  const MARK = "tenfoot";
  const THEATER_CLASS = "tenfoot-theater";
  const EPISODES_KEY = "tenfoot.episodes";
  const MOVE_THROTTLE_MS = 80;
  const MUTATION_DEBOUNCE_MS = 100;
  const INITIAL_FOCUS_TIMEOUT_MS = 10000;
  const LOAD_MORE_TIMEOUT_MS = 6000;
  const AUTOPLAY_DELAY_MS = 1200;
  const HINT_PLAYBACK_MS = 3000;
  const NUDGE_STEP_MS = 260;
  const MAX_NUDGES = 8;
  const ARROW_SCOPE_DEPTH = 3;
  const MENU_REFOCUS_LIMIT = 4;
  const HOME_REFOCUS_LIMIT = 4;
  const NOTICE_MS = 3000;
  const BACK_FALLBACK_MS = 800; // how long Firefox gets to act on BrowserBack before Leanback does

  if (window.top !== window) return;
  const root = document.documentElement;
  if (root.dataset[MARK]) return;
  root.dataset[MARK] = "init";

  const Settings = globalThis.TenfootSettings;
  const Keymap = globalThis.TenfootKeymap;
  const Rules = globalThis.TenfootSiteRules;
  const Spatial = globalThis.TenfootSpatial;
  const Ring = globalThis.TenfootFocusRing;
  const Panel = globalThis.TenfootPanel;
  const Rail = globalThis.TenfootRail;
  const Home = globalThis.TenfootHome;
  const Screen = globalThis.TenfootScreen;
  const History = globalThis.TenfootHistory;
  const Trail = globalThis.TenfootTrail;
  const Show = globalThis.TenfootShow;

  // The rail's own entries, top to bottom. The site's links (rules →
  // rail.links) come after Browse, and the gear sits at the foot.
  const RAIL_ITEMS = [
    { id: "search", label: "Search", icon: "search" },
    { id: "home", label: "Home", icon: "home" },
    { id: "browse", label: "Browse", icon: "grid" }
  ];
  const RAIL_SETTINGS = { id: "settings", label: "Leanback settings", icon: "gear", end: true };

  const state = {
    settings: Settings.normalize(null),
    rules: null,
    kind: "other",
    page: {},
    enabled: false,
    ring: null,
    hints: null,
    memory: new Map(),
    lastFocus: null,
    lastMove: -Infinity,
    theater: false,
    playerFocused: false,
    playerReady: false,
    playerState: null,
    pendingPlayerFocus: false,
    modal: null,
    modalReturn: null,
    menu: null,
    menuReturn: null,
    offerShowing: false,
    levels: [], // the settings panel's stack: the list, then a choice's values
    engaged: null,
    engagedIndex: 0,
    home: null,
    homeRefocus: 0,
    show: null,
    rail: null,
    railActive: false,
    railReturn: null,
    history: { entries: {} },
    metaSent: null,
    forgetArmed: false,
    pendingInitialFocus: 0,
    initialFocusTimer: 0,
    menuRefocus: 0,
    trail: [],
    backFallback: 0,
    unloading: false,
    pendingLoadMore: null,
    href: location.href,
    lastNavigation: null,
    leaving: false,
    observer: null,
    mutationTimer: 0,
    nudgeTimer: 0
  };

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  function qs(sel, scope) {
    if (!sel) return null;
    try {
      return (scope || document).querySelector(sel);
    } catch (_err) {
      return null;
    }
  }

  function qsa(sel, scope) {
    if (!sel) return [];
    try {
      return Array.from((scope || document).querySelectorAll(sel));
    } catch (_err) {
      return [];
    }
  }

  function firstVisible(sel, scope) {
    return qsa(sel, scope).find((el) => Spatial.isVisible(el, window)) || null;
  }

  function click(el) {
    if (!el) return false;
    try {
      el.click();
      return true;
    } catch (_err) {
      return false;
    }
  }

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

  function samePath(a, b) {
    try {
      const ua = new URL(a, location.href);
      const ub = new URL(b, location.href);
      return ua.origin === ub.origin && ua.pathname.replace(/\/$/, "") === ub.pathname.replace(/\/$/, "");
    } catch (_err) {
      return false;
    }
  }

  function reducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_err) {
      return false;
    }
  }

  function viewport() {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  function rowOf(el) {
    const sel = Rules.selector(state.page.rows);
    return sel && el && el.closest ? el.closest(sel) : null;
  }

  function ringStyle() {
    const s = state.settings;
    return { color: s.ringColor, width: s.ringWidth, zoom: s.focusZoom };
  }

  function homeRules() {
    return (state.rules && state.rules.home) || {};
  }

  // Leanback's own elements: the Home screen, the rail, the options panel.
  function ownUi(el) {
    if (!el) return false;
    return Boolean((state.home && state.home.contains(el)) || (state.rail && state.rail.contains(el)) || (state.menu && state.menu.contains(el)));
  }

  function clockText(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  }

  function notice(label) {
    state.hints.show([{ keys: "", label }], NOTICE_MS, true);
  }

  async function send(msg) {
    if (state.leaving) return { ok: false, error: "Page is unloading" };
    try {
      const r = await API.runtime.sendMessage(msg);
      return r === undefined ? { ok: false, error: "No reply" } : r;
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  }

  // ---------------------------------------------------------------------------
  // page kind, candidates, focus
  // ---------------------------------------------------------------------------

  function classifyPage() {
    state.engaged = null;
    if (state.menu) state.menu.close();
    state.menuReturn = null;
    state.kind = Rules.classify(state.rules, location.pathname);
    // A hub (/dimension-20) has a one-segment address like a show, but it is
    // drawn by the same component as Home, and gets the same screen.
    if (state.kind === "series" && qs(homeRules().root)) state.kind = "hub";
    state.page = Rules.pageRules(state.rules, state.kind === "hub" ? "browse" : state.kind);
    state.href = location.href;
    state.memory = new Map();
    state.playerFocused = false;
    state.playerReady = false;
    state.playerState = null;
    state.pendingPlayerFocus = false;
    state.pendingLoadMore = null;
  }

  function modalRules() {
    return { focusable: ["a[href]", "button", "[role='button']", "input", "select", "textarea", "[tabindex]:not([tabindex='-1'])"] };
  }

  function collect() {
    const scope = state.modal || document;
    const extra = [];
    if (state.kind === "video" && !state.modal) {
      const mount = qs(state.page.playerMount);
      if (mount) extra.push(mount);
    }
    const common = state.modal ? [] : Rules.selectorList(state.rules.common && state.rules.common.focusable);
    return Spatial.collect(scope, state.modal ? modalRules() : state.page, { win: window, extra, common });
  }

  // The element the ring is on: the active element when it is a real target,
  // else the last element we focused (the site may have blurred it).
  function currentEl() {
    const a = document.activeElement;
    if (a && a !== document.body && a !== root && a.tagName !== "IFRAME") return a;
    if (state.lastFocus && state.lastFocus.isConnected) return state.lastFocus;
    return null;
  }

  function focusEl(el, opts) {
    const o = opts || {};
    if (!el || !el.isConnected) return false;
    state.playerFocused = false;
    try {
      el.focus({ preventScroll: true });
    } catch (_err) { /* not focusable yet */ }
    if (document.activeElement !== el) {
      el.setAttribute("tabindex", "-1");
      try {
        el.focus({ preventScroll: true });
      } catch (_err) { /* give up; the ring still marks it */ }
    }
    state.lastFocus = el;
    const row = rowOf(el);
    if (row) state.memory.set(row, el);
    // Leanback's own screens place themselves; scrolling the page under them
    // would only move the site.
    if (o.scroll !== false && !ownUi(el)) keepOnScreen(el, row);
    state.ring.follow(el);
    return true;
  }

  function keepOnScreen(el, row) {
    const smooth = !reducedMotion();
    try {
      el.scrollIntoView({ block: "center", inline: "center", behavior: smooth ? "smooth" : "auto" });
    } catch (_err) {
      el.scrollIntoView();
    }
    if (!row) return;
    // A row that moves by transform instead of scrolling ignores
    // scrollIntoView entirely, so the focused tile would stay off screen and
    // the page would look frozen. Click the row's own arrows instead, once
    // per page of tiles, until the tile is inside the row's box.
    nudgeRow(el, row, 0);
  }

  function nudgeRow(el, row, attempt) {
    if (state.nudgeTimer) {
      clearTimeout(state.nudgeTimer);
      state.nudgeTimer = 0;
    }
    if (attempt > MAX_NUDGES || !el.isConnected || !row.isConnected || state.lastFocus !== el) return;
    const rr = row.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const left = Math.max(rr.left, 0);
    const right = Math.min(rr.right, window.innerWidth);
    let arrow = null;
    if (er.right > right + 1) arrow = rowControl(row, state.page.scrollNext);
    else if (er.left < left - 1) arrow = rowControl(row, state.page.scrollPrev);
    if (!arrow) {
      state.ring.refresh();
      return;
    }
    const before = er.left;
    click(arrow);
    state.nudgeTimer = setTimeout(() => {
      state.nudgeTimer = 0;
      state.ring.refresh();
      // The arrow did nothing (disabled, or the row is already at its end):
      // stop rather than clicking forever.
      if (!el.isConnected || el.getBoundingClientRect().left === before) return;
      nudgeRow(el, row, attempt + 1);
    }, NUDGE_STEP_MS);
  }

  // The scroll arrows may live inside the row or beside it in a wrapping
  // carousel, so look outwards a few levels before giving up.
  function rowControl(row, sel) {
    const selector = Rules.selector(sel);
    if (!selector) return null;
    let scope = row;
    for (let i = 0; i <= ARROW_SCOPE_DEPTH && scope; i++) {
      const found = qsa(selector, scope).find((el) => Spatial.isVisible(el, window) && el.getAttribute("aria-disabled") !== "true");
      if (found) return found;
      scope = scope.parentElement;
    }
    return null;
  }

  function markVideoElements() {
    const p = state.page;
    const theaterRoot = qs(p.theaterRoot);
    if (theaterRoot) theaterRoot.setAttribute("data-tenfoot-theater-root", "");
    const mount = qs(p.playerMount);
    if (mount) {
      mount.setAttribute("data-tenfoot-player", "");
      if (!mount.hasAttribute("tabindex")) mount.setAttribute("tabindex", "-1");
    }
    for (const sel of Rules.selectorList(p.theaterHide)) for (const el of qsa(sel)) el.setAttribute("data-tenfoot-hide", "");
    return { theaterRoot, mount, frame: qs(p.playerFrame) };
  }

  // Dropout's own top bar and footer (rules: common.chrome) are hidden on every
  // page but sign-in, account, help and legal (`other`), which keep them.
  function stampChrome() {
    const want = state.enabled && state.kind !== "other";
    for (const sel of Rules.selectorList(state.rules.common && state.rules.common.chrome)) {
      for (const el of qsa(sel)) {
        if (want) el.setAttribute("data-tenfoot-chrome", "");
        else el.removeAttribute("data-tenfoot-chrome");
      }
    }
  }

  // A page whose results the site lays out for a desktop (search: a narrow
  // centred column of small pictures) is marked so content/home.css can
  // spread it across a television: rules → pages.<kind>.tvGrid.
  const TV_GRID_PARTS = {
    container: "data-tenfoot-grid-container",
    wrap: "data-tenfoot-grid-wrap",
    grid: "data-tenfoot-grid",
    item: "data-tenfoot-grid-item",
    title: "data-tenfoot-grid-title",
    subtitle: "data-tenfoot-grid-sub"
  };

  function stampTvGrid() {
    const g = state.page && state.page.tvGrid;
    if (!g || typeof g !== "object") return;
    for (const [part, attr] of Object.entries(TV_GRID_PARTS)) {
      for (const el of qsa(Rules.selector(g[part]))) if (!el.hasAttribute(attr)) el.setAttribute(attr, "");
    }
  }

  // One deferred retry at the deadline, so a page that stops mutating still
  // gets a focused element rather than none.
  function clearInitialFocusTimer() {
    if (!state.initialFocusTimer) return;
    clearTimeout(state.initialFocusTimer);
    state.initialFocusTimer = 0;
  }

  function armInitialFocusTimer() {
    if (state.initialFocusTimer || !state.pendingInitialFocus) return;
    const wait = Math.max(0, state.pendingInitialFocus - Date.now()) + 50;
    state.initialFocusTimer = setTimeout(() => {
      state.initialFocusTimer = 0;
      tryInitialFocus();
    }, wait);
  }

  function tryInitialFocus() {
    if (!state.enabled || !state.pendingInitialFocus) return;
    const giveUp = () => {
      if (Date.now() > state.pendingInitialFocus) {
        state.pendingInitialFocus = 0;
        if (state.kind !== "other") console.warn(LOG, "no initial focus target on page kind", state.kind);
      }
    };
    if (state.kind === "video") {
      const v = markVideoElements();
      if (!v.mount) return giveUp();
      // enterPlayer() parks the ring on the mount until the frame exists.
      if (state.settings.theater === "auto") enterPlayer();
      else focusEl(v.mount, { scroll: false });
      state.pendingInitialFocus = 0;
      return;
    }
    if (state.home) {
      const target = state.home.initialTarget();
      if (target) {
        state.pendingInitialFocus = 0;
        focusEl(target, { scroll: false });
        return;
      }
      if (Date.now() <= state.pendingInitialFocus) {
        armInitialFocusTimer();
        return;
      }
      // Nothing to draw Home from: leave Dropout's page as it is, driven the
      // ordinary way.
      console.warn(LOG, "Home found nothing to draw; showing the site's own page");
      stopHome();
      state.pendingInitialFocus = Date.now() + INITIAL_FOCUS_TIMEOUT_MS;
    }
    if (state.kind === "other") {
      state.pendingInitialFocus = 0;
      const a = document.activeElement;
      if (a && a !== document.body && a !== root) state.ring.follow(a);
      return;
    }
    // A show starts on the episode to watch next (content/show.js).
    let target = state.show ? state.show.startEpisode() : null;
    if (!target) target = firstVisible(Rules.selector(state.page.initialFocus));
    if (!target && Rules.selector(state.page.initialFocus) && Date.now() <= state.pendingInitialFocus) {
      // The search field is rendered after the framework starts, and the
      // fallback below would spend our one shot on whatever nav link happened
      // to exist first. Wait for the real target; the observer calls us again
      // when it appears, and the timer covers a page that then goes quiet.
      armInitialFocusTimer();
      return;
    }
    if (!target) {
      const { candidates } = collect();
      const vp = viewport();
      const onScreen = candidates.find((c) => c.rect.top >= 0 && c.rect.top < vp.height && !(state.rules.common && c.el.closest(state.rules.common.header || "\0")));
      target = onScreen ? onScreen.el : null;
    }
    if (!target) return giveUp();
    focusEl(target);
    state.pendingInitialFocus = 0;
  }

  // ---------------------------------------------------------------------------
  // actions
  // ---------------------------------------------------------------------------

  function dispatch(action, ctx) {
    const c = ctx || {};
    if (c.editable) {
      if (action === "back") return blurField();
      if (action === "down") return leaveFieldBelow();
      return action === "left" ? leaveField() : false;
    }
    if (state.menu.isOpen) return dispatchInMenu(action);
    if (state.engaged) return dispatchEngaged(action);
    if (state.modal) return dispatchInModal(action);
    if (state.railActive) return dispatchInRail(action);
    switch (action) {
      case "up":
      case "down":
      case "left":
      case "right":
        return move(action);
      case "select":
        return activate();
      case "back":
        return askPlayerFirst();
      case "menu":
        return openMenu();
      case "search":
        return state.kind === "search" ? leaveSearch() : goTop(state.rules.searchUrl || "/search");
      default:
        return Keymap.PLAYER_ACTIONS.has(action) ? playerAction(action) : false;
    }
  }

  function move(dir) {
    state.lastMove = performance.now();
    if (state.home && !state.modal) return moveHome(dir);
    const cur = currentEl();
    const { candidates, rows } = collect();
    let target = null;
    if (cur) {
      const curCand = candidates.find((c) => c.el === cur);
      if (curCand && curCand.row) {
        target = Spatial.rowPick(dir, curCand, rows, state.memory, viewport());
        if (!target && dir === "left" && enterRail()) return true;
        if (!target && (dir === "left" || dir === "right")) return true; // row ends: no wrap
      }
      if (!target) {
        target = Spatial.pick(dir, Ring.unscaledRect(cur), candidates.filter((c) => c.el !== cur));
        // Coming into a row from outside it lands where that row was left —
        // on a show's seasons, the season on screen until another is picked.
        if (target && target.row && !(curCand && curCand.row === target.row)) {
          const remembered = state.memory.get(target.row);
          const hit = remembered && candidates.find((c) => c.el === remembered);
          if (hit) target = hit;
        }
      }
      // ◀ stays on the line it started on. Anything not level with the
      // selection (a header link up and to the left) means the edge, and the
      // rail beyond it.
      if (dir === "left" && !state.modal && railShown() && (!target || !level(Ring.unscaledRect(cur), target.rect))) {
        return enterRail() || true;
      }
    } else {
      const vp = viewport();
      target = candidates.find((c) => c.rect.top >= 0 && c.rect.top < vp.height) || candidates[0] || null;
    }
    // On a video page the player is one huge target above everything else.
    // Geometry alone lets ▲ skip past it to the header when the page is
    // scrolled, so coming up from below the player always returns to it.
    if (state.kind === "video" && dir === "up" && !state.modal) {
      const mount = qs(state.page.playerMount);
      if (mount && cur && cur !== mount) {
        const m = mount.getBoundingClientRect();
        const c = Ring.unscaledRect(cur);
        const startedBelow = c.top >= m.top + Spatial.EDGE_TOLERANCE;
        // Still somewhere in the content under the player? Ordinary move.
        // Anything else means the next step up is the player itself — even
        // when the page is scrolled and a sticky header is nearer.
        const staysBelow = target && target.el !== mount
          && target.rect.top >= m.bottom - Spatial.EDGE_TOLERANCE;
        if (startedBelow && !staysBelow) return enterPlayer();
      }
    }
    if (!target) {
      if (dir === "down" && !state.modal) tryLoadMore();
      return true;
    }
    focusEl(target.el);
    return true;
  }

  function level(a, b) {
    return Boolean(a && b) && b.top < a.bottom - Spatial.EDGE_TOLERANCE && b.bottom > a.top + Spatial.EDGE_TOLERANCE;
  }

  function moveHome(dir) {
    const r = state.home.move(dir);
    if (r && r.el) focusEl(r.el, { scroll: false });
    else if (r && r.edge === "left") enterRail();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Leanback's screens (Home, and the pages it draws) and the rail
  // ---------------------------------------------------------------------------
  //
  // state.home is Leanback's own screen on this page, when it draws one: Home
  // (content/home.js) on Home and the hubs, or the page screen
  // (content/screen.js) on Browse, My List and the lists. Both answer the
  // same calls, so the rest of this file treats them alike.

  function screenRules() {
    return (state.rules && state.rules.screen) || {};
  }

  // "home", "page", or null for a page Leanback does not draw.
  function screenKind() {
    if (state.kind === "browse" || state.kind === "hub") return "home";
    if (state.kind === "grid") return "page";
    if (state.kind === "series" && Show && Show.layoutOf(document, state.page.show) === "list") return "page";
    return null;
  }

  function startHome() {
    const which = screenKind();
    if (state.home || !which) return;
    if (which === "home") {
      if (!Home || !qs(homeRules().root)) return;
      state.home = Home.createHome(document, {
        rules: homeRules(),
        history: () => state.history,
        continueWatching: state.kind === "browse",
        onObserve: (items) => send({ type: "history:observe", items })
      });
    } else {
      if (!Screen || !qs(screenRules().root)) return;
      // A page the rail links to goes by the rail's name (My List); the New
      // Releases list carries no "New" badges, as its row on Home does not.
      const link = railLinks().find((l) => samePath(l.url, location.href));
      const tweak = Home && Home.rowOverride ? Home.rowOverride(homeRules(), location.href, "") : null;
      const kinds = state.rules.rail && Array.isArray(state.rules.rail.kinds) ? state.rules.rail.kinds : [];
      state.home = Screen.createScreen(document, {
        rules: screenRules(),
        title: link ? link.label : "",
        rail: kinds.includes(state.kind),
        badges: !(tweak && tweak.badges === false),
        history: () => state.history,
        onObserve: (items) => send({ type: "history:observe", items })
      });
    }
    root.dataset.tenfootHome = "on";
    state.homeRefocus = 0;
    state.home.refresh();
  }

  function stopHome() {
    if (!state.home) return;
    state.home.destroy();
    state.home = null;
    delete root.dataset.tenfootHome;
  }

  function refreshHome() {
    if (!state.home) return;
    const before = currentEl();
    const target = state.home.refresh();
    if (state.pendingInitialFocus || state.railActive || state.menu.isOpen || state.modal || !target) return;
    // The card the selection was on went away, or the site took the focus:
    // put it on the card Home now has selected.
    if (!before || !before.isConnected || before !== target) focusEl(target, { scroll: false });
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

  function setupRail() {
    const kinds = state.rules.rail && Array.isArray(state.rules.rail.kinds) ? state.rules.rail.kinds : [];
    const on = state.enabled && kinds.includes(state.kind);
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
      if (state.home) state.home.select(r);
      focusEl(r, { scroll: !state.home });
      return true;
    }
    const target = state.home ? state.home.current || state.home.initialTarget() : null;
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
        if (state.kind === "browse" && state.home) {
          // Already Home: back to the top of it.
          state.railActive = false;
          state.railReturn = null;
          const t = state.home.initialTarget();
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

  // ---------------------------------------------------------------------------
  // a show's page (content/show.js)
  // ---------------------------------------------------------------------------

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

  function startShow() {
    if (!Show || state.kind !== "series" || state.show) return;
    state.show = Show.createShow(document, {
      rules: state.page.show,
      history: () => state.history,
      onSeason: onSeasonChosen
    });
    // Coming up into the seasons lands on the one on screen.
    const row = state.show.row;
    const cur = state.show.currentSeason;
    if (row && cur) state.memory.set(row, cur);
  }

  function stopShow() {
    if (!state.show) return;
    state.show.destroy();
    state.show = null;
  }

  // OK on a season: its page, replacing this one, so Back leaves the show
  // rather than stepping back through the seasons. The season already on
  // screen takes the selection down to its episodes instead.
  function onSeasonChosen(url, current) {
    if (!current) {
      goSideways(url);
      return;
    }
    const t = state.show && state.show.startEpisode();
    if (t) focusEl(t);
  }

  // content/early.css keeps a show's page blank until this is set, so Season 1
  // never flashes up before openSeason() moves on from it.
  function markReady() {
    root.setAttribute("data-tenfoot-ready", "");
  }

  // ---------------------------------------------------------------------------
  // watch history: what the episode page knows
  // ---------------------------------------------------------------------------

  function sendHistoryMeta() {
    if (state.kind !== "video" || !History || state.metaSent === location.href) return;
    const key = History.keyOf(location.href);
    if (!key) return;
    state.metaSent = location.href;
    const img = qs(state.page.videoImage);
    const d = episodeDetails();
    send(Object.assign({
      type: "history:meta",
      key,
      url: location.href,
      title: d.title,
      series: d.series,
      image: img ? img.getAttribute("content") || "" : ""
    }, episodeInfo()));
  }

  // The episode page's own words: its title and the show's name, with the
  // season and episode numbers.
  function episodeDetails() {
    const text = (el) => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "");
    const info = episodeInfo();
    return {
      title: text(qs(state.page.videoTitle)),
      series: text(qs(state.page.seriesLink)),
      season: info.season === undefined ? null : info.season,
      episode: info.episode === undefined ? null : info.episode
    };
  }

  // Which show, season and episode this is. Dropout links the season as
  // "Season 2, Episode 1" even at /videos/<slug>, and its canonical address
  // names the show and season too.
  function episodeInfo() {
    const out = {};
    for (const a of qsa(Rules.selector(state.page.episodeInfo))) {
      const m = /Episode\s+(\d+)/i.exec(a.textContent || "");
      const season = History.seasonOf(a.href);
      if (!m || season === null) continue;
      out.show = seriesSlug(a.href);
      out.season = season;
      out.episode = Number(m[1]);
      break;
    }
    const canonical = qs(state.page.canonical);
    const url = canonical ? canonical.getAttribute("content") || "" : "";
    if (!out.show && History.showOf(url)) out.show = History.showOf(url);
    if (out.season === undefined && History.seasonOf(url) !== null) out.season = History.seasonOf(url);
    return out;
  }

  // A <select> is a two-step control on a remote: Enter engages it, Left/Right
  // then change the value, Enter commits and Escape puts the old value back.
  // Arrows only step the options while it is engaged — otherwise Left/Right
  // could never carry the ring past a dropdown to the control beside it. The
  // change event fires once, on commit, because the site navigates on it.
  function engageSelect(sel) {
    state.engaged = sel;
    state.engagedIndex = sel.selectedIndex;
    state.ring.refresh();
    return true;
  }

  function dispatchEngaged(action) {
    switch (action) {
      case "left":
        return stepEngaged(-1);
      case "right":
        return stepEngaged(1);
      case "select":
        return commitEngaged();
      case "back":
        return cancelEngaged();
      case "up":
      case "down":
        return true; // absorbed: leaving is a deliberate commit or cancel
      default:
        return false;
    }
  }

  function stepEngaged(delta) {
    const sel = state.engaged;
    if (!sel || !sel.isConnected) return disengage();
    const n = sel.options ? sel.options.length : 0;
    if (!n) return true;
    const i = Math.min(n - 1, Math.max(0, sel.selectedIndex + delta));
    if (i !== sel.selectedIndex) sel.selectedIndex = i;
    state.ring.refresh();
    return true;
  }

  // A select whose options are addresses (the season and sort controls) is
  // a way sideways: go there directly, replacing this page, rather than let
  // the site add a page to the history for it.
  function commitEngaged() {
    const sel = state.engaged;
    const changed = sel && sel.isConnected && sel.selectedIndex !== state.engagedIndex;
    disengage();
    if (!changed) return true;
    const url = optionUrl(sel.value);
    if (url) return goSideways(url);
    sel.dispatchEvent(new Event("input", { bubbles: true }));
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function optionUrl(value) {
    if (typeof value !== "string" || !/^(https?:\/\/|\/|\?)/.test(value)) return null;
    try {
      const u = new URL(value, location.href);
      return u.origin === location.origin ? u.href : null;
    } catch (_err) {
      return null;
    }
  }

  function cancelEngaged() {
    const sel = state.engaged;
    if (sel && sel.isConnected && sel.selectedIndex !== state.engagedIndex) sel.selectedIndex = state.engagedIndex;
    disengage();
    return true;
  }

  function disengage() {
    state.engaged = null;
    state.ring.refresh();
    return true;
  }

  function activate() {
    const cur = currentEl();
    if (!cur) return move("down");
    if (state.kind === "video" && cur.hasAttribute("data-tenfoot-player")) return enterPlayer();
    if (cur.tagName === "SELECT") return engageSelect(cur);
    click(cur);
    return true;
  }

  // The transport bar and the settings panel live in the player frame, so when
  // Back (Escape) arrives here the frame gets first refusal. Only what it
  // cannot close is a layer for this page to walk.
  function askPlayerFirst() {
    if (state.kind !== "video" || !qs(state.page.playerFrame)) return goBack();
    send({ type: "player:back" }).then((r) => {
      if (!r || !r.consumed) goBack();
    });
    return true;
  }

  function goBack() {
    if (state.modal) return closeModal();
    if (state.kind === "video" && state.theater) {
      setTheater(false);
      const mount = qs(state.page.playerMount);
      if (mount) focusEl(mount);
      return true;
    }
    return stepBack();
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
    if (Trail && Trail.depth(state.trail) > 0) return goBackTo(-1, state.trail[state.trail.length - 2].url);
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

  // -- Leanback's settings, in the panel (nav/panel.js) ------------------------
  //
  // The list is the one every settings panel shows (lib/settings.js → ROWS),
  // then Clear Continue Watching and Turn Leanback Off. ▲ ▼ move; OK or ▶ take
  // an entry: an on/off flips, a choice opens its short list, where OK picks
  // one (ticked) and goes back up; ◀ or Back go back out, and at the top close
  // the panel. state.levels is the stack: the list, then a choice's values.

  function topEntries() {
    const s = state.settings;
    const entries = Settings.ROWS.map((r) => (r.kind === "toggle"
      ? { id: r.id, label: r.label, kind: "toggle", on: Boolean(s[r.id]) }
      : { id: r.id, label: r.label, kind: "choice", value: Settings.valueText(r, s[r.id]) }));
    entries.push({ id: "forget", label: "Clear Continue Watching", kind: "action", value: state.forgetArmed ? "OK again to clear" : "", separator: true });
    entries.push({ id: "disable", label: "Turn Leanback Off", kind: "action" });
    return entries;
  }

  function levelView(level) {
    if (level.kind === "choice") {
      const cur = state.settings[level.row.id];
      return {
        title: level.row.label,
        index: level.index,
        entries: level.values.map((v) => ({ id: String(v), label: Settings.valueText(level.row, v), kind: "option", checked: v === cur }))
      };
    }
    return { title: "Leanback Settings", index: level.index, entries: topEntries() };
  }

  function currentLevel() {
    return state.levels[state.levels.length - 1] || null;
  }

  function renderSettings() {
    const level = currentLevel();
    if (level) state.menu.render(levelView(level));
  }

  function openSettings() {
    state.forgetArmed = false;
    state.levels = [{ kind: "top", index: 0 }];
    // Open, then draw: drawing moves the focus into the panel, and a panel
    // that is not open yet would let the rail think the selection left it.
    state.menu.open();
    renderSettings();
    showHints();
    return true;
  }

  function openMenu() {
    if (state.menu.isOpen) return closeMenu();
    // On a video the options button belongs to the player's settings panel,
    // which holds its settings and Leanback's together. Everywhere else, and
    // when the player does not answer, it opens Leanback's settings here.
    // Remember where the ring was, so closing whatever opens puts it back.
    state.menuReturn = state.playerFocused ? null : currentEl();
    if (state.kind === "video" && qs(state.page.playerFrame)) {
      send({ type: "player:settings" }).then((r) => {
        if (!r || !r.ok) openSettings();
      });
      return true;
    }
    return openSettings();
  }

  function closeMenu() {
    if (!state.menu.close()) return false;
    state.levels = [];
    state.forgetArmed = false;
    if (state.menuReturn && state.menuReturn.isConnected) focusEl(state.menuReturn);
    else if (state.playerFocused || state.theater) enterPlayer();
    state.menuReturn = null;
    showHints();
    return true;
  }

  function dispatchInMenu(action) {
    const level = currentLevel();
    if (!level) return closeMenu();
    switch (action) {
      case "up":
      case "down": {
        const n = levelView(level).entries.length;
        const next = Math.min(n - 1, Math.max(0, level.index + (action === "up" ? -1 : 1)));
        if (next !== level.index) {
          level.index = next;
          state.forgetArmed = false;
          renderSettings();
        }
        return true;
      }
      case "select":
        return takeSetting(level, false);
      case "right":
        return takeSetting(level, true);
      case "back":
      case "left":
        // ◀ is the way out, as Back is: one level, then the panel.
        if (state.levels.length > 1) {
          state.levels.pop();
          renderSettings();
          return true;
        }
        return closeMenu();
      case "menu":
        return closeMenu();
      default:
        return false;
    }
  }

  // OK (and ▶, which never runs an action) on the entry under the selection.
  function takeSetting(level, byRight) {
    if (level.kind === "choice") {
      const v = level.values[level.index];
      saveSetting(level.row.id, v);
      state.levels.pop();
      renderSettings();
      return true;
    }
    const entry = topEntries()[level.index];
    if (!entry) return true;
    const row = Settings.rowOf(entry.id);
    if (row && row.kind === "toggle") {
      saveSetting(row.id, !state.settings[row.id]);
      renderSettings();
      return true;
    }
    if (row && row.kind === "choice") {
      const values = Settings.choicesOf(row, state.settings[row.id]);
      state.levels.push({ kind: "choice", row, values, index: Math.max(0, values.indexOf(state.settings[row.id])) });
      renderSettings();
      return true;
    }
    if (byRight) return true;
    onMenuItem(entry.id);
    return true;
  }

  function saveSetting(id, value) {
    if (state.settings[id] === value) return;
    state.settings = Object.assign({}, state.settings, { [id]: value });
    send({ type: "settings:set", patch: { [id]: value } });
  }

  // A click on an entry (a mouse): the same as moving there and pressing OK.
  function onPanelPick(i) {
    const level = currentLevel();
    if (!level) return;
    level.index = i;
    takeSetting(level, false);
  }

  // Clearing cannot be undone, so it takes OK twice.
  function forgetHistory() {
    if (!state.forgetArmed) {
      state.forgetArmed = true;
      renderSettings();
      return;
    }
    state.forgetArmed = false;
    renderSettings();
    send({ type: "history:clear" });
    notice("Continue Watching cleared");
  }

  // The actions at the foot of the list.
  function onMenuItem(id) {
    switch (id) {
      case "forget":
        forgetHistory();
        return;
      case "disable":
        closeMenu();
        send({ type: "settings:set", patch: { enabled: false } });
        return;
      default:
        closeMenu();
    }
  }

  // "/" is a toggle: it opens search, and on the search page it closes it and
  // puts you back where you were.
  function leaveSearch() {
    if (Trail && Trail.depth(state.trail) > 0) return goBackTo(-1, state.trail[state.trail.length - 2].url);
    return goHome();
  }

  // ◀ with the text cursor at the start of a field: out of it, to whatever is
  // on its left. On the search page that is the rail.
  function leaveField() {
    if (railShown()) return enterRail();
    const el = document.activeElement;
    if (!el || el === document.body) return false;
    const { candidates } = collect();
    const t = Spatial.pick("left", Ring.unscaledRect(el), candidates.filter((c) => c.el !== el));
    if (!t) return false;
    focusEl(t.el);
    return true;
  }

  // ▼ from a one-line field (the search box): out of it, to what is below —
  // the search results. With nothing below, the key stays the field's.
  function leaveFieldBelow() {
    const el = document.activeElement;
    if (!el || el === document.body) return false;
    const { candidates } = collect();
    const t = Spatial.pick("down", Ring.unscaledRect(el), candidates.filter((c) => c.el !== el));
    if (!t) return false;
    focusEl(t.el);
    return true;
  }

  function blurField() {
    const el = document.activeElement;
    if (el && el.blur) el.blur();
    const { candidates } = collect();
    const t = candidates.find((c) => c.el !== el);
    if (t) focusEl(t.el);
    else state.ring.hide();
    return true;
  }

  function playerAction(action) {
    if (state.kind !== "video") return false;
    if (action === "next") return goEpisode(1);
    if (action === "previous") return goEpisode(-1);
    const step = state.settings.seekStep;
    const commands = {
      play_pause: { cmd: "toggle" },
      stop: { cmd: "stop" },
      fast_forward: { cmd: "seek", by: 3 * step },
      rewind: { cmd: "seek", by: -3 * step },
      subtitle: { cmd: "captions" },
      mute: { cmd: "mute" }
    };
    const c = commands[action];
    if (!c) return false;
    send(Object.assign({ type: "player:command" }, c));
    return true;
  }

  function tryLoadMore() {
    const btn = firstVisible(Rules.selector(state.page.loadMore));
    if (!btn) return false;
    if (state.pendingLoadMore) return true;
    state.pendingLoadMore = { before: collect().candidates.length, deadline: Date.now() + LOAD_MORE_TIMEOUT_MS };
    click(btn);
    return true;
  }

  function continueLoadMore() {
    const p = state.pendingLoadMore;
    if (!p) return;
    if (collect().candidates.length > p.before) {
      state.pendingLoadMore = null;
      move("down");
      showHints();
    } else if (Date.now() > p.deadline) {
      state.pendingLoadMore = null;
    }
  }

  // ---------------------------------------------------------------------------
  // modals
  // ---------------------------------------------------------------------------

  function findModal() {
    const common = state.rules.common || {};
    for (const sel of Rules.selectorList(common.modals)) {
      const el = firstVisible(sel);
      if (el) return el;
    }
    return null;
  }

  function syncModal() {
    const m = findModal();
    if (m === state.modal) return;
    state.pendingLoadMore = null;
    if (m) root.dataset.tenfootModal = "on";
    else delete root.dataset.tenfootModal;
    if (m) {
      state.modalReturn = currentEl();
      state.modal = m;
      const { candidates } = collect();
      if (candidates.length) focusEl(candidates[0].el, { scroll: false });
      showHints();
    } else {
      state.modal = null;
      const r = state.modalReturn;
      state.modalReturn = null;
      if (r && r.isConnected) focusEl(r);
    }
  }

  function dispatchInModal(action) {
    switch (action) {
      case "up":
      case "down":
      case "left":
      case "right":
        return move(action);
      case "select": {
        const cur = currentEl();
        if (cur && state.modal.contains(cur)) {
          click(cur);
          return true;
        }
        return move("down");
      }
      case "back":
        return closeModal();
      default:
        return false;
    }
  }

  function closeModal() {
    if (!state.modal) return false;
    const common = state.rules.common || {};
    const btn = firstVisible(Rules.selector(common.modalClose), state.modal);
    if (btn) click(btn);
    // No close control (a consent dialog): Back is absorbed; the user picks a button.
    return true;
  }

  // ---------------------------------------------------------------------------
  // video page and player relay
  // ---------------------------------------------------------------------------

  // Theater is not a history entry of its own: Back from an episode is the
  // browser's Back, and one more entry would make it take two presses.
  function setTheater(on) {
    const want = Boolean(on) && state.kind === "video";
    if (state.theater === want) return;
    state.theater = want;
    root.classList.toggle(THEATER_CLASS, want);
    if (want) {
      state.hints.hide();
      state.ring.hide();
    } else {
      state.ring.refresh();
    }
  }

  function enterPlayer() {
    const v = markVideoElements();
    if (!v.frame) {
      state.pendingPlayerFocus = true;
      if (v.mount) focusEl(v.mount, { scroll: false });
      return true;
    }
    state.pendingPlayerFocus = false;
    if (state.settings.theater !== "off") setTheater(true);
    try {
      v.frame.focus();
    } catch (_err) { /* the frame will still get keys once the user clicks it */ }
    state.playerFocused = true;
    state.hints.hide();
    if (v.mount) state.lastFocus = v.mount;
    if (state.theater) state.ring.hide();
    else if (v.mount) state.ring.follow(v.mount);
    send({ type: "player:focus" }).then((r) => {
      if (!r || !r.ok) state.pendingPlayerFocus = !state.playerReady;
    });
    return true;
  }

  function leavePlayer(hint) {
    state.playerFocused = false;
    if (hint === "back") return goBack();
    // "below": the page must be visible for the ring to mean anything.
    setTheater(false);
    // The link back to the show is what someone leaving the player wants far
    // more often than whatever markup sits closest under the video (the
    // metadata tags do), so it wins over the geometric pick.
    const series = firstVisible(Rules.selector(state.page.seriesLink));
    if (series) {
      focusEl(series);
      return true;
    }
    const mount = qs(state.page.playerMount);
    const { candidates } = collect();
    const others = candidates.filter((c) => c.el !== mount);
    const t = mount ? Spatial.pick("down", Ring.unscaledRect(mount), others) : others[0];
    if (t) focusEl(t.el);
    else if (mount) focusEl(mount);
    return true;
  }

  // Remember the series page exactly as it was — season and sort included —
  // so Back from an episode returns there rather than to the series' default
  // season, and so next/previous know the running order.
  function captureEpisodeOrder() {
    const urls = qsa(Rules.selector(state.page.episodeLinks)).map((a) => a.href).filter(Boolean);
    if (!urls.length) return;
    try {
      sessionStorage.setItem(EPISODES_KEY, JSON.stringify({ series: location.pathname, href: location.href, urls }));
    } catch (_err) { /* storage disabled: next/previous falls back to up-next only */ }
  }

  function readEpisodeOrder() {
    try {
      const v = JSON.parse(sessionStorage.getItem(EPISODES_KEY) || "null");
      return v && Array.isArray(v.urls) ? v : null;
    } catch (_err) {
      return null;
    }
  }

  function episodeUrl(delta) {
    const up = state.playerState && state.playerState.upNext;
    if (delta > 0 && up && typeof up.url === "string" && up.url) return up.url;
    const list = readEpisodeOrder();
    if (!list) return null;
    const i = list.urls.findIndex((u) => samePath(u, location.href));
    if (i < 0) return null;
    return list.urls[i + delta] || null;
  }

  // The site's own "up next" card, when the page renders it rather than the
  // player frame. Taking it is better than navigating: it keeps the site's
  // own resume behaviour.
  function pageUpNext() {
    const sel = Rules.selector(state.page.upNextOverlay);
    if (!sel) return null;
    for (const el of qsa(sel)) {
      if (Spatial.isVisible(el, window)) return el;
    }
    return null;
  }

  function takePageUpNext() {
    const overlay = pageUpNext();
    if (!overlay) return false;
    const control = qsa("a[href], button, [role='button']", overlay).find((el) => Spatial.isVisible(el, window));
    return click(control || overlay);
  }

  function syncUpNextOffer() {
    if (state.kind !== "video") return;
    const showing = Boolean(pageUpNext());
    if (showing === state.offerShowing) return;
    state.offerShowing = showing;
    send({ type: "player:offer", showing });
  }

  function goEpisode(delta) {
    if (delta > 0 && takePageUpNext()) return true;
    const url = episodeUrl(delta);
    if (!url) {
      state.hints.show([{ keys: delta > 0 ? "▶▶" : "◀◀", label: delta > 0 ? "No next episode" : "No previous episode" }], 2500, true);
      return true;
    }
    return goSideways(url);
  }

  // The viewer hid the up-next card (`dismissed`): nothing plays by itself.
  function onPlayerEnded(msg) {
    const upNext = msg && msg.upNext ? msg.upNext : state.playerState && state.playerState.upNext;
    state.playerState = Object.assign({}, state.playerState, { ended: true, paused: true, upNext: upNext || null });
    if (!state.settings.autoplayNext || (msg && msg.dismissed === true)) return;
    const href = location.href;
    setTimeout(() => {
      // The site may advance on its own (up-next overlay); only act if it did not.
      if (location.href === href && state.enabled) goEpisode(1);
    }, AUTOPLAY_DELAY_MS);
  }

  // ---------------------------------------------------------------------------
  // hints
  // ---------------------------------------------------------------------------

  function hintItems() {
    const step = state.settings.seekStep;
    if (state.modal) return [{ keys: "◀ ▶ ▲ ▼", label: "Move" }, { keys: "OK", label: "Select" }, { keys: "Back", label: "Close" }];
    if (state.kind === "video") {
      if (state.playerFocused) {
        const offering = state.playerState && state.playerState.upNextShowing;
        // With Leanback's up-next card up, ◀ hides it rather than skipping.
        const card = state.playerState && state.playerState.upNextCard;
        return [
          { keys: "OK", label: offering ? "Play next episode" : "Play / pause" },
          card ? { keys: "◀", label: "Hide up next" } : { keys: "◀ ▶", label: `−${step} s / +${step} s` },
          { keys: "▼", label: "Player controls" },
          { keys: "Menu", label: "Settings" },
          { keys: "Back", label: state.theater ? "Leave" : "Back" }
        ];
      }
      return [
        { keys: "▲ ▼", label: "Move" },
        { keys: "OK", label: "Open" },
        { keys: "Back", label: state.theater ? "Leave" : "Back" }
      ];
    }
    if (state.menu.isOpen) {
      return [
        { keys: "▲ ▼", label: "Move" },
        { keys: "OK", label: "Change" },
        { keys: "◀", label: "Back" }
      ];
    }
    if (state.engaged) return [{ keys: "◀ ▶", label: "Change" }, { keys: "OK", label: "Confirm" }, { keys: "Back", label: "Cancel" }];
    if (state.railActive) return [{ keys: "▲ ▼", label: "Move" }, { keys: "OK", label: "Open" }, { keys: "▶", label: "Back" }];
    const cur = currentEl();
    if (cur && cur.tagName === "SELECT") return [{ keys: "OK", label: "Change this" }, { keys: "◀ ▶ ▲ ▼", label: "Move" }, { keys: "Back", label: "Back" }];
    const items = [{ keys: "◀ ▶ ▲ ▼", label: "Move" }, { keys: "OK", label: "Open" }];
    if (state.kind !== "browse") items.push({ keys: "Back", label: "Back" });
    else if (state.settings.exitHook === "close-tab") items.push({ keys: "Back", label: "Exit" });
    items.push({ keys: "Menu", label: "Options" });
    return items;
  }

  // The hint bar stays on screen so the keys are always readable from the
  // sofa. Playback is the exception: nothing covers the picture, so there it
  // appears on a keypress and goes away again.
  function showHints() {
    const playing = state.theater || state.playerFocused;
    state.hints.show(hintItems(), playing ? HINT_PLAYBACK_MS : 0);
  }

  // ---------------------------------------------------------------------------
  // events
  // ---------------------------------------------------------------------------

  function isMove(action) {
    return action === "up" || action === "down" || action === "left" || action === "right";
  }

  function onKeyDown(e) {
    if (!state.enabled) return;
    const editable = Keymap.isEditable(e.target);
    const atStart = editable && Keymap.caretAtStart(e.target);
    const singleLine = editable && Keymap.isSingleLine(e.target);
    const action = Keymap.actionFor(e, { inPlayer: false, editable, atStart, singleLine });
    if (!action) return;
    if (action === "back" && e.key === "BrowserBack") {
      browserBack();
      return;
    }
    if (e.repeat && isMove(action) && performance.now() - state.lastMove < MOVE_THROTTLE_MS) {
      e.preventDefault();
      return;
    }
    const consumed = dispatch(action, { editable });
    if (!consumed) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    showHints();
  }

  function onContextMenu(e) {
    // The remote's menu button arrives as a ContextMenu key and would open the
    // browser's context menu; a real right-click (button 2) is left alone.
    if (state.enabled && e.button !== 2) e.preventDefault();
  }

  function onFocusIn(e) {
    if (!state.enabled) return;
    const t = e.target;
    if (!t || t === document.body || t === root) return;
    if (t.tagName === "IFRAME") {
      if (state.kind === "video") {
        state.playerFocused = true;
        if (state.theater) state.ring.hide();
      }
      return;
    }
    if (state.playerFocused) state.playerFocused = false;
    if (state.engaged && t !== state.engaged) cancelEngaged();
    if (state.home && !state.modal && !state.menu.isOpen) {
      if (state.home.contains(t)) {
        // A click, or the focus coming back: the model follows.
        state.home.select(t);
        state.homeRefocus = 0;
      } else if (!ownUi(t)) {
        // Dropout's page is underneath and still moves the focus about.
        // Take it back — a bounded number of times, never a tug of war.
        if (state.homeRefocus < HOME_REFOCUS_LIMIT && state.home.current) {
          state.homeRefocus += 1;
          focusEl(state.home.current, { scroll: false });
        }
        return;
      }
    }
    if (state.railActive && !state.rail.contains(t) && !state.menu.isOpen) state.railActive = false;
    if (state.menu.isOpen) {
      // Keys are read at window capture, so the panel does not need the focus
      // to work — it only needs it to look selected, and it stamps that
      // itself. Dropout moves the focus on its own (React re-renders, focus
      // traps), and closing the panel on that made "Leanback settings" shut
      // itself the instant it opened. Take the focus back, and stop trying
      // rather than fight a focus trap for ever.
      if (state.menu.contains(t)) {
        // The panel marks its own selection: no ring round it, no zoom on it.
        state.menuRefocus = 0;
        state.ring.hide();
        return;
      }
      if (state.menuRefocus < MENU_REFOCUS_LIMIT) {
        state.menuRefocus += 1;
        state.menu.refocus();
      }
      return;
    }
    if (t !== state.lastFocus) {
      state.lastFocus = t;
      const row = rowOf(t);
      if (row) state.memory.set(row, t);
    }
    if (!state.theater) state.ring.follow(t);
    if (!state.theater && !state.playerFocused) showHints();
  }

  // The site changing its address without a page load (the search app).
  function onPopState() {
    if (state.leaving || !state.enabled) return;
    clearBackFallback();
    if (location.href !== state.href) onNavigate();
  }

  // ---------------------------------------------------------------------------
  // the trail (nav/trail.js)
  // ---------------------------------------------------------------------------

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

  function onNavigate() {
    if (!state.enabled) return;
    setTheater(false);
    classifyPage();
    setupPage();
  }

  function onMutations() {
    state.mutationTimer = 0;
    if (!state.enabled) return;
    if (location.href !== state.href) {
      onNavigate();
      return;
    }
    syncModal();
    refreshHome();
    if (state.show) state.show.refresh();
    stampTvGrid();
    stampChrome();
    if (state.pendingInitialFocus) tryInitialFocus();
    if (state.pendingLoadMore) continueLoadMore();
    if (state.kind === "video") {
      markVideoElements();
      syncUpNextOffer();
      if (state.pendingPlayerFocus && qs(state.page.playerFrame)) enterPlayer();
    }
    if (state.lastFocus && !state.lastFocus.isConnected && !state.playerFocused && !state.home) {
      state.lastFocus = null;
      state.pendingInitialFocus = Date.now() + 2000;
      tryInitialFocus();
    } else {
      state.ring.refresh();
    }
  }

  // Changes inside Leanback's own elements (the ring moving, a card redrawn)
  // are not the site changing, and must not set off another redraw.
  function ours(record) {
    const t = record.target;
    const el = t && t.nodeType === 1 ? t : t && t.parentElement;
    if (!el) return false;
    return ownUi(el) || el === state.ring.element || el === state.hints.element || state.hints.element.contains(el);
  }

  function startObserver() {
    state.observer = new MutationObserver((records) => {
      if (records.every(ours)) return;
      if (state.mutationTimer) return;
      state.mutationTimer = setTimeout(onMutations, MUTATION_DEBOUNCE_MS);
    });
    state.observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "aria-hidden", "src", "style"]
    });
  }

  function computedTransform(el) {
    try {
      const t = window.getComputedStyle(el).transform;
      return t && t !== "none" ? t : null;
    } catch (_err) {
      return null;
    }
  }

  function snapshot() {
    const cur = state.playerFocused ? null : currentEl();
    const describe = (el) => ({
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      href: el.getAttribute("href") || null,
      value: "value" in el && (el.tagName === "SELECT" || el.tagName === "INPUT") ? String(el.value) : null,
      text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60),
      rect: (({ left, top, width, height }) => ({ left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height) }))(Ring.unscaledRect(el)),
      color: window.getComputedStyle(el).color
    });
    return {
      ok: true,
      enabled: state.enabled,
      kind: state.kind,
      theater: state.theater,
      playerFocused: state.playerFocused,
      playerReady: state.playerReady,
      modal: Boolean(state.modal),
      menu: state.menu.isOpen ? Array.from(state.menu.element.querySelectorAll("[data-tenfoot-item]")).map((b) => b.dataset.tenfootItem) : null,
      menuItem: state.menu.isOpen && state.menu.current ? state.menu.current.dataset.tenfootItem : null,
      engaged: state.engaged ? (state.engaged.id || state.engaged.className || "select") : null,
      focused: cur ? describe(cur) : null,
      navigation: state.lastNavigation,
      // Whether the selection is actually drawn bigger: measured from the
      // computed transform, not assumed.
      zoomed: cur ? computedTransform(cur) : null,
      ring: Boolean(state.ring) && !state.ring.element.hidden,
      hints: Boolean(state.hints) && state.hints.visible,
      home: state.home ? state.home.snapshot() : null,
      show: state.show ? state.show.snapshot() : null,
      rail: railShown() ? { active: state.railActive, item: state.rail.currentId, page: railPage() } : null
    };
  }

  function onMessage(msg, _sender, sendResponse) {
    const reply = (v) => {
      try {
        sendResponse(v);
      } catch (_err) { /* channel closed */ }
    };
    if (!msg || typeof msg.type !== "string") {
      reply({ ok: false, error: "Invalid message" });
      return false;
    }
    switch (msg.type) {
      case "player:ready":
        state.playerReady = true;
        if (state.enabled && state.pendingPlayerFocus) enterPlayer();
        reply({ ok: true });
        return false;
      case "player:state": {
        const was = state.playerState && state.playerState.upNextShowing;
        const wasCard = Boolean(state.playerState && state.playerState.upNextCard);
        state.playerState = msg.state && typeof msg.state === "object" ? msg.state : null;
        // The site is offering the next episode: say which key takes it.
        const ps = state.playerState;
        if (state.enabled && ps && ((ps.upNextShowing && !was) || Boolean(ps.upNextCard) !== wasCard)) showHints();
        reply({ ok: true });
        return false;
      }
      case "player:ended":
        onPlayerEnded(msg);
        reply({ ok: true });
        return false;
      case "player:resumed":
        if (state.enabled && Number(msg.at) > 0) notice(`Resumed at ${clockText(msg.at)}`);
        reply({ ok: true });
        return false;
      case "page:focus":
        reply({ ok: true, done: state.enabled ? leavePlayer(msg.hint === "back" ? "back" : "below") : false });
        if (state.enabled) showHints();
        return false;
      case "page:episode":
        reply({ ok: true, done: state.enabled ? goEpisode(Number(msg.delta) < 0 ? -1 : 1) : false });
        return false;
      case "page:state":
        reply(snapshot());
        return false;
      case "page:info":
        // The player asks what the episode page knows, for its title.
        reply(state.kind === "video" && state.rules ? Object.assign({ ok: true }, episodeDetails()) : { ok: false, error: "Not an episode page" });
        return false;
      case "page:action": {
        // BrowserBack pressed while the player had the keys: the same as on
        // the page.
        if (msg.action === "browser-back") {
          if (state.enabled) browserBack();
          reply(Object.assign(snapshot(), { consumed: false }));
          return false;
        }
        const consumed = state.enabled ? dispatch(String(msg.action || ""), {}) : false;
        if (consumed) showHints();
        reply(Object.assign(snapshot(), { consumed }));
        return false;
      }
      default:
        reply({ ok: false, error: "Unknown message" });
        return false;
    }
  }

  // ---------------------------------------------------------------------------
  // lifecycle
  // ---------------------------------------------------------------------------

  function setupPage() {
    clearInitialFocusTimer();
    state.href = location.href;
    clearBackFallback();
    stopShow();
    if (openSeason()) return;
    state.pendingInitialFocus = Date.now() + INITIAL_FOCUS_TIMEOUT_MS;
    if (state.kind === "series" && screenKind() !== "page") {
      startShow();
      captureEpisodeOrder();
    }
    stampChrome();
    if (state.kind === "video") {
      markVideoElements();
      if (state.settings.theater === "auto") setTheater(true);
      sendHistoryMeta();
    }
    state.railActive = false;
    state.railReturn = null;
    if (screenKind()) startHome();
    else stopHome();
    setupRail();
    stampTvGrid();
    recordTrail();
    syncModal();
    tryInitialFocus();
    if (!state.theater && !state.playerFocused) showHints();
    markReady();
  }

  function applyEnabled(on) {
    state.enabled = Boolean(on);
    root.dataset[MARK] = state.enabled ? "on" : "off";
    if (!state.enabled) {
      clearInitialFocusTimer();
      state.menu.close();
      state.ring.hide();
      state.hints.hide();
      setTheater(false);
      stopHome();
      stopShow();
      setupRail();
      state.pendingInitialFocus = 0;
      markReady();
      return;
    }
    classifyPage();
    setupPage();
  }

  function onSettingsChanged(s) {
    const prev = state.settings;
    state.settings = s;
    state.ring.setStyle(ringStyle());
    state.hints.setEnabled(s.hintBar);
    if (prev.enabled !== s.enabled) applyEnabled(s.enabled);
  }

  function installSiteStyle() {
    const sels = Rules.selectorList(state.rules.common && state.rules.common.hoverSuppress);
    if (!sels.length) return;
    const style = document.createElement("style");
    style.id = "tenfoot-site-style";
    style.textContent = `html[data-tenfoot="on"] :is(${sels.join(", ")}) { display: none !important; }`;
    root.appendChild(style);
  }

  async function init() {
    const [settings, rulesReply] = await Promise.all([Settings.load(API), send({ type: "rules:get" })]);
    state.settings = settings;
    if (arrive(false, settings.enabled)) return;
    state.rules = rulesReply && rulesReply.ok && rulesReply.rules && typeof rulesReply.rules === "object" ? rulesReply.rules : null;
    if (!state.rules) {
      console.warn(LOG, "site rules unavailable; navigation is off on this page:", rulesReply && rulesReply.error);
      root.dataset[MARK] = "off";
      markReady();
      return;
    }
    state.ring = Ring.createRing(document, ringStyle());
    state.hints = Ring.createHintBar(document, { enabled: settings.hintBar });
    state.menu = Panel.createPanel(document, { label: "Leanback settings", onPick: onPanelPick });
    if (History) {
      state.history = await History.load(API);
      History.watch(API, (store) => {
        state.history = store;
        refreshHome();
        if (state.show) state.show.refresh();
      });
    }
    installSiteStyle();
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("contextmenu", onContextMenu, true);
    window.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("beforeunload", () => {
      state.unloading = true;
      clearBackFallback();
    });
    window.addEventListener("pagehide", () => { state.leaving = true; });
    // Back to a page Firefox kept in memory: the scripts are still running,
    // so pick up from where the history now is.
    window.addEventListener("pageshow", (e) => {
      if (!e.persisted) return;
      state.leaving = false;
      state.unloading = false;
      if (arrive(true, state.enabled)) return;
      state.href = location.href;
      recordTrail();
      if (state.ring) state.ring.refresh();
    });
    API.runtime.onMessage.addListener(onMessage);
    Settings.watch(API, onSettingsChanged);
    startObserver();
    applyEnabled(settings.enabled);
  }

  init().catch((err) => {
    console.error(LOG, "page script failed to start:", err);
    root.dataset[MARK] = "off";
    markReady();
  });
})();
