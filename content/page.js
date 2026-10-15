/* global browser, chrome */
// Leanback for Dropout — page script, top frame of watch.dropout.tv.
// Classifies the URL into a page kind (sites/dropout.json → routes), then
// wires keys → actions → spatial navigation, the focus ring, the hint bar,
// load-more, dialogs, the two-step <select>, Leanback's settings panel, the
// page's messages and its life cycle. Three parts of it are files of their
// own, installed into one shared context (P) before it starts:
// content/page-back.js (Back and every navigation), content/page-video.js
// (an episode's details page, the video playing and the player relay; the
// player is a cross-origin iframe, see content/player.js),
// content/page-screens.js (Leanback's screens and the rail) and
// content/page-live.js (Dropout 24/7 played on its own page).
// Idempotent: html[data-tenfoot] marks a document that is already wired.

(function () {
  const API = typeof browser !== "undefined" ? browser : chrome;
  const LOG = "[leanback-for-dropout]";
  const MARK = "tenfoot";
  const MOVE_THROTTLE_MS = 80;
  const MUTATION_DEBOUNCE_MS = 100;
  const INITIAL_FOCUS_TIMEOUT_MS = 10000;
  const LOAD_MORE_TIMEOUT_MS = 6000;
  const HINT_PLAYBACK_MS = 3000;
  const NUDGE_STEP_MS = 260;
  const MAX_NUDGES = 8;
  const ARROW_SCOPE_DEPTH = 3;
  const MENU_REFOCUS_LIMIT = 4;
  const SCREEN_REFOCUS_LIMIT = 4;
  const NOTICE_MS = 3000;

  if (window.top !== window) return;
  const root = document.documentElement;
  if (root.dataset[MARK]) return;
  root.dataset[MARK] = "init";

  const Settings = globalThis.TenfootSettings;
  const Common = globalThis.TenfootCommon;
  const Keymap = globalThis.TenfootKeymap;
  const Rules = globalThis.TenfootSiteRules;
  const Spatial = globalThis.TenfootSpatial;
  const Ring = globalThis.TenfootFocusRing;
  const Panel = globalThis.TenfootPanel;
  const SettingsMenu = globalThis.TenfootSettingsMenu;
  const History = globalThis.TenfootHistory;

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
    // An episode's page: "details" or "playing" (content/page-video.js).
    watch: null,
    restartPending: false,
    watchGesture: false,
    ownResumeNotice: false,
    arrivedFrom: null,
    // The words to the player frame, numbered; the check after Watch.
    holdSeq: 0,
    playChecks: 0,
    playCheckTimer: 0,
    // A live stream played over this page (content/page-live.js).
    inPlace: null,
    inPlaceLoading: false,
    playerFocused: false,
    playerReady: false,
    playerState: null,
    pendingPlayerFocus: false,
    modal: null,
    modalReturn: null,
    menu: null,
    menuReturn: null,
    offerShowing: false,
    settingsMenu: null,
    engaged: null,
    engagedIndex: 0,
    home: null,
    screenRefocus: 0,
    historyLength: 0,
    rail: null,
    railActive: false,
    railReturn: null,
    history: { entries: {} },
    metaSent: null,
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

  // The context the page script's parts share: this file's state and the
  // functions the others call, then each part installs its own.
  const P = { state };
  Object.assign(P, {
    send, dispatch, showHints, notice, click, firstVisible, collect, currentEl, focusEl,
    goBack, samePath, openMenu, openSettings, leaveFieldBelow
  });
  for (const part of [globalThis.TenfootPageBack, globalThis.TenfootPageVideo, globalThis.TenfootPageScreens, globalThis.TenfootPageLive]) part.install(P);
  // From page-back.js.
  const goSideways = (...a) => P.goSideways(...a);
  const goTop = (...a) => P.goTop(...a);
  const stepBack = (...a) => P.stepBack(...a);
  const leaveSearch = (...a) => P.leaveSearch(...a);
  const browserBack = (...a) => P.browserBack(...a);
  const clearBackFallback = (...a) => P.clearBackFallback(...a);
  const arrive = (...a) => P.arrive(...a);
  const recordTrail = (...a) => P.recordTrail(...a);
  const followSearchHistory = (...a) => P.followSearchHistory(...a);
  const leavePlay = (...a) => P.leavePlay(...a);
  // From page-video.js.
  const markVideoElements = (...a) => P.markVideoElements(...a);
  const setupWatch = (...a) => P.setupWatch(...a);
  const syncPlayer = (...a) => P.syncPlayer(...a);
  const showDetails = (...a) => P.showDetails(...a);
  const followPlay = (...a) => P.followPlay(...a);
  const setTheater = (...a) => P.setTheater(...a);
  const enterPlayer = (...a) => P.enterPlayer(...a);
  const leavePlayer = (...a) => P.leavePlayer(...a);
  const captureEpisodeOrder = (...a) => P.captureEpisodeOrder(...a);
  const sendHistoryMeta = (...a) => P.sendHistoryMeta(...a);
  const episodeDetails = (...a) => P.episodeDetails(...a);
  const syncUpNextOffer = (...a) => P.syncUpNextOffer(...a);
  const goEpisode = (...a) => P.goEpisode(...a);
  const onPlayerEnded = (...a) => P.onPlayerEnded(...a);
  const playerAction = (...a) => P.playerAction(...a);
  // From page-screens.js.
  const homeRules = (...a) => P.homeRules(...a);
  const screenKind = (...a) => P.screenKind(...a);
  const startScreen = (...a) => P.startScreen(...a);
  const stopScreen = (...a) => P.stopScreen(...a);
  const refreshScreen = (...a) => P.refreshScreen(...a);
  const moveScreen = (...a) => P.moveScreen(...a);
  const railShown = (...a) => P.railShown(...a);
  const railPage = (...a) => P.railPage(...a);
  const setupRail = (...a) => P.setupRail(...a);
  const enterRail = (...a) => P.enterRail(...a);
  const dispatchInRail = (...a) => P.dispatchInRail(...a);
  const openSeason = (...a) => P.openSeason(...a);
  const setPending = (...a) => P.setPending(...a);
  const inScreen = (...a) => P.inScreen(...a);
  // From page-live.js.
  const isLiveLink = (...a) => P.isLiveLink(...a);
  const playInPlace = (...a) => P.playInPlace(...a);
  const syncInPlace = (...a) => P.syncInPlace(...a);
  const closeInPlace = (...a) => P.closeInPlace(...a);
  const backInPlace = (...a) => P.backInPlace(...a);
  const followInPlace = (...a) => P.followInPlace(...a);
  const inPlaceInfo = (...a) => P.inPlaceInfo(...a);

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  const { qs, qsa, clock } = Common;

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

  // Leanback's own elements: the Home screen, the rail, the options panel.
  function ownUi(el) {
    if (!el) return false;
    return Boolean((state.screen && state.screen.contains(el)) || (state.rail && state.rail.contains(el)) || (state.menu && state.menu.contains(el)));
  }

  function notice(label) {
    state.hints.show([{ keys: "", label }], NOTICE_MS, true);
  }

  function send(msg) {
    if (state.leaving) return Promise.resolve({ ok: false, error: "Page is unloading" });
    return Common.send(msg);
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
    state.watch = null;
    state.restartPending = false;
    state.watchGesture = false;
    state.ownResumeNotice = false;
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
    // An episode playing: the selection is the player. Its details page is
    // a screen like any other.
    if (state.kind === "video" && state.watch !== "details") {
      const v = markVideoElements();
      if (!v.mount) return giveUp();
      // enterPlayer() parks the ring on the mount until the frame exists.
      enterPlayer();
      state.pendingInitialFocus = 0;
      return;
    }
    if (state.screen) {
      const target = state.screen.initialTarget();
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
      stopScreen();
      state.pendingInitialFocus = Date.now() + INITIAL_FOCUS_TIMEOUT_MS;
    }
    if (state.kind === "other") {
      state.pendingInitialFocus = 0;
      const a = document.activeElement;
      if (a && a !== document.body && a !== root) state.ring.follow(a);
      return;
    }
    let target = firstVisible(Rules.selector(state.page.initialFocus));
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
      // Back from the search box Leanback draws: down to the results, or,
      // with none, Back as anywhere else.
      if (action === "back") return inScreen(document.activeElement) ? leaveFieldBelow() || goBack() : blurField();
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
    if (state.screen && !state.modal) return moveScreen(dir);
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

  // ---------------------------------------------------------------------------
  // the first paint
  // ---------------------------------------------------------------------------

  // content/early.css keeps a show's page blank until this is set, so Season 1
  // never flashes up before openSeason() moves on from it.
  function markReady() {
    root.setAttribute("data-tenfoot-ready", "");
  }

  // ---------------------------------------------------------------------------
  // the two-step <select>
  // ---------------------------------------------------------------------------

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
    // Dropout 24/7's Watch: the stream played on this page.
    if (cur.tagName === "A" && isLiveLink(cur.href)) return playInPlace(cur.href);
    click(cur);
    return true;
  }

  // The transport bar and the settings panel live in the player frame, so when
  // Back (Escape) arrives here the frame gets first refusal. Only what it
  // cannot close is a layer for this page to walk.
  function askPlayerFirst() {
    const playing = state.inPlace || (state.kind === "video" && state.watch === "playing" && qs(state.page.playerFrame));
    if (!playing) return goBack();
    send({ type: "player:back" }).then((r) => {
      if (!r || !r.consumed) goBack();
    });
    return true;
  }

  // Back while an episode plays is its details page: Back off the step the
  // video added to the history (the popstate calls showDetails). On
  // Dropout's own page, the page under the video.
  function goBack() {
    if (state.modal) return closeModal();
    if (state.inPlace) return backInPlace();
    if (state.kind === "video" && state.watch === "playing") {
      if (leavePlay() || showDetails()) return true;
      if (state.theater) {
        setTheater(false);
        const mount = qs(state.page.playerMount);
        if (mount) focusEl(mount);
        return true;
      }
    }
    return stepBack();
  }

  // -- Leanback's settings, in the panel (nav/panel.js) ------------------------
  //
  // The menu is nav/settings-menu.js, the same as in the playback panel;
  // this page draws it, hands it the keys, and closes the panel when ◀ or
  // Back leave its top. A clear is confirmed with a notice.

  function renderSettings() {
    if (state.menu.isOpen) state.menu.render(state.settingsMenu.view());
  }

  function openSettings() {
    state.settingsMenu.open();
    // Open, then draw: drawing moves the focus into the panel, and a panel
    // that is not open yet would let the rail think the selection left it.
    state.menu.open();
    renderSettings();
    showHints();
    return true;
  }

  function openMenu() {
    if (state.menu.isOpen) return closeMenu();
    // While a video plays the options button belongs to the player's
    // settings panel, which holds its settings and Leanback's together.
    // Everywhere else — an episode's details page too — and when the player
    // does not answer, it opens Leanback's settings here. Remember where the
    // ring was, so closing whatever opens puts it back.
    state.menuReturn = state.playerFocused ? null : currentEl();
    if (state.inPlace || (state.kind === "video" && state.watch === "playing" && qs(state.page.playerFrame))) {
      send({ type: "player:settings" }).then((r) => {
        if (!r || !r.ok) openSettings();
      });
      return true;
    }
    return openSettings();
  }

  function closeMenu() {
    if (!state.menu.close()) return false;
    if (state.menuReturn && state.menuReturn.isConnected) focusEl(state.menuReturn);
    else if (state.playerFocused || state.theater) enterPlayer();
    state.menuReturn = null;
    showHints();
    return true;
  }

  function dispatchInMenu(action) {
    if (action === "menu") return closeMenu();
    const r = state.settingsMenu.key(action);
    if (r === "out") return closeMenu();
    if (r) renderSettings();
    return Boolean(r);
  }

  function saveSetting(patch) {
    if (Object.keys(patch).every((k) => state.settings[k] === patch[k])) return;
    state.settings = Object.assign({}, state.settings, patch);
    send({ type: "settings:set", patch });
  }

  function createSettingsMenu() {
    return SettingsMenu.create({
      settings: () => state.settings,
      save: saveSetting,
      onClear: () => {
        send({ type: "history:clear" });
        notice("Continue Watching cleared");
      },
      onDisable: () => {
        closeMenu();
        send({ type: "settings:set", patch: { enabled: false } });
      }
    });
  }

  // A click on an entry (a mouse): the same as moving there and pressing OK.
  function onPanelPick(i) {
    state.settingsMenu.pick(i);
    renderSettings();
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
    if (inScreen(el)) {
      const r = state.screen.move("down");
      if (!r || !r.el) return false;
      focusEl(r.el, { scroll: false });
      return true;
    }
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
  // hints
  // ---------------------------------------------------------------------------

  function hintItems() {
    const step = state.settings.seekStep;
    if (state.modal) return [{ keys: "◀ ▶ ▲ ▼", label: "Move" }, { keys: "OK", label: "Select" }, { keys: "Back", label: "Close" }];
    if ((state.kind === "video" || state.inPlace) && state.playerFocused) {
      const offering = state.playerState && state.playerState.upNextShowing;
      // With Leanback's up-next card up, ◀ hides it rather than skipping.
      const card = state.playerState && state.playerState.upNextCard;
      return [
        { keys: "OK", label: offering ? "Play next episode" : "Play / pause" },
        card ? { keys: "◀", label: "Hide up next" } : { keys: "◀ ▶", label: `−${step} s / +${step} s` },
        { keys: "▼", label: "Player controls" },
        { keys: "Menu", label: "Settings" },
        { keys: "Back", label: "Back" }
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
    const playing = state.theater || state.playerFocused || Boolean(state.inPlace);
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
      if (state.kind === "video" && state.watch === "details") {
        // The player is held behind the details page; the selection stays
        // on the page (bounded, as below).
        if (state.screen && state.screenRefocus < SCREEN_REFOCUS_LIMIT && state.screen.current) {
          state.screenRefocus += 1;
          focusEl(state.screen.current, { scroll: false });
        }
      } else if (state.kind === "video" || state.inPlace) {
        state.playerFocused = true;
        if (state.theater || state.inPlace) state.ring.hide();
      }
      return;
    }
    if (state.playerFocused) state.playerFocused = false;
    if (state.engaged && t !== state.engaged) cancelEngaged();
    if (state.screen && !state.modal && !state.menu.isOpen) {
      if (state.screen.contains(t)) {
        // A click, or the focus coming back: the model follows.
        state.screen.select(t);
        state.screenRefocus = 0;
      } else if (!ownUi(t) && !(state.kind === "video" && state.watch === "playing" && t.closest("[data-tenfoot-theater-root]"))) {
        // Dropout's page is underneath and still moves the focus about.
        // Take it back — a bounded number of times, never a tug of war.
        if (state.screenRefocus < SCREEN_REFOCUS_LIMIT && state.screen.current) {
          state.screenRefocus += 1;
          focusEl(state.screen.current, { scroll: false });
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

  // The site changing its address without a page load (the search app), or
  // the history moving between an episode's details page and the step its
  // video added above it.
  function onPopState() {
    if (state.leaving || !state.enabled) return;
    clearBackFallback();
    if (location.href !== state.href) onNavigate(true);
    else if (state.inPlace) followInPlace();
    else if (state.kind === "video") followPlay();
  }

  function onNavigate(popped) {
    if (!state.enabled) return;
    // The search app puts the words in the address as you type: the same
    // page, the same screen, the selection left in the box.
    if (state.kind === "search" && state.screen && Rules.classify(state.rules, location.pathname) === "search") {
      followSearchHistory(Boolean(popped));
      state.href = location.href;
      refreshScreen();
      return;
    }
    closeInPlace();
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
    refreshScreen();
    stampChrome();
    if (state.pendingInitialFocus) tryInitialFocus();
    if (state.pendingLoadMore) continueLoadMore();
    if (state.kind === "video") {
      markVideoElements();
      syncUpNextOffer();
      if (state.pendingPlayerFocus && qs(state.page.playerFrame)) enterPlayer();
    }
    if (state.lastFocus && !state.lastFocus.isConnected && !state.playerFocused && !state.screen) {
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
      watch: state.watch,
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
      home: state.screen ? state.screen.snapshot() : null,
      show: (state.screen && state.screen.snapshot().show) || null,
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
        if (state.enabled) {
          syncPlayer();
          syncInPlace();
        }
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
        // Resume on the details page says so itself (page-video.js); held
        // behind it, the video picking up is not news yet.
        if (state.enabled && state.watch === "playing" && !state.ownResumeNotice && Number(msg.at) > 0) notice(`Resumed at ${clock(msg.at)}`);
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
        // The player asks what the episode page knows, for its title, and
        // whether the details page is holding it.
        if (state.inPlace) {
          reply(inPlaceInfo());
          return false;
        }
        reply(state.kind === "video" && state.rules
          ? Object.assign({ ok: true, hold: state.enabled && state.watch === "details" }, episodeDetails())
          : { ok: false, error: "Not an episode page" });
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
    state.historyLength = history.length;
    clearBackFallback();
    if (openSeason()) return;
    state.pendingInitialFocus = Date.now() + INITIAL_FOCUS_TIMEOUT_MS;
    if (state.kind === "series") captureEpisodeOrder();
    stampChrome();
    if (state.kind === "video") {
      markVideoElements();
      sendHistoryMeta();
    }
    state.railActive = false;
    state.railReturn = null;
    if (screenKind()) startScreen();
    else stopScreen();
    // The page described on its trail entry before an episode playing adds
    // its own above it.
    recordTrail();
    setupWatch();
    setupRail();
    syncModal();
    // Dropout's page shows from here on (content/early.css), unless a screen
    // of Leanback's is still to come; and it must, before anything in it can
    // take the focus.
    setPending(Boolean(state.screen && !state.screen.ready));
    markReady();
    tryInitialFocus();
    if (!state.theater && !state.playerFocused) showHints();
  }

  function applyEnabled(on) {
    state.enabled = Boolean(on);
    root.dataset[MARK] = state.enabled ? "on" : "off";
    if (!state.enabled) {
      closeInPlace();
      clearInitialFocusTimer();
      state.menu.close();
      state.ring.hide();
      state.hints.hide();
      setTheater(false);
      // Dropout's player is its own again: nothing holds it.
      if (state.kind === "video") {
        state.holdSeq += 1;
        send({ type: "player:hold", on: false, seq: state.holdSeq });
      }
      state.watch = null;
      stopScreen();
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
    state.settingsMenu = createSettingsMenu();
    if (History) {
      state.history = await History.load(API);
      History.watch(API, (store) => {
        state.history = store;
        refreshScreen();
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
    // An unload listener keeps the page out of Firefox's back-forward cache,
    // so Back always loads it afresh. A page restored from that cache did not
    // get the keyboard back: every key went nowhere until a reload.
    window.addEventListener("unload", () => {});
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
