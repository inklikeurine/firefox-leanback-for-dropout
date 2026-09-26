/* global browser, chrome */
// Leanback for Dropout — page script, top frame of watch.dropout.tv.
// Classifies the URL into a page kind (sites/dropout.json → routes), then
// wires keys → actions → spatial navigation, the focus ring, the hint bar,
// the theater layout, layered Back, load-more, season switching and the
// player relay (the player is a cross-origin iframe; see content/player.js).
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
  const BACK_DEDUPE_MS = 150; // Firefox's popstate follows its own keydown at once

  if (window.top !== window) return;
  const root = document.documentElement;
  if (root.dataset[MARK]) return;
  root.dataset[MARK] = "init";

  const Settings = globalThis.TenfootSettings;
  const Keymap = globalThis.TenfootKeymap;
  const Rules = globalThis.TenfootSiteRules;
  const Spatial = globalThis.TenfootSpatial;
  const Ring = globalThis.TenfootFocusRing;
  const Menu = globalThis.TenfootMenu;

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
    settingRow: null,
    offerShowing: false,
    settingBefore: null,
    engaged: null,
    engagedIndex: 0,
    pendingInitialFocus: 0,
    initialFocusTimer: 0,
    menuRefocus: 0,
    guard: false,
    lastBack: 0,
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

  function go(url) {
    try {
      const target = new URL(url, location.href).href;
      state.lastNavigation = target;
      location.assign(target);
    } catch (_err) {
      console.warn(LOG, "bad navigation target", url);
    }
    return true;
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
    state.page = Rules.pageRules(state.rules, state.kind);
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
    if (o.scroll !== false) keepOnScreen(el, row);
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
    // Whichever layer ends up handling it, note that Back has just been dealt
    // with: if Firefox also acts on the key, the popstate that follows must
    // not run the same press a second time.
    if (action === "back") state.lastBack = Date.now();
    if (c.editable) return action === "back" ? blurField() : false;
    if (state.menu.isOpen) return dispatchInMenu(action);
    if (state.engaged) return dispatchEngaged(action);
    if (state.modal) return dispatchInModal(action);
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
        return state.kind === "search" ? leaveSearch() : go(state.rules.searchUrl || "/search");
      default:
        return Keymap.PLAYER_ACTIONS.has(action) ? playerAction(action) : false;
    }
  }

  function move(dir) {
    state.lastMove = performance.now();
    const cur = currentEl();
    const { candidates, rows } = collect();
    let target = null;
    if (cur) {
      const curCand = candidates.find((c) => c.el === cur);
      if (curCand && curCand.row) {
        target = Spatial.rowPick(dir, curCand, rows, state.memory, viewport());
        if (!target && (dir === "left" || dir === "right")) return true; // row ends: no wrap
      }
      if (!target) {
        target = Spatial.pick(dir, Ring.unscaledRect(cur), candidates.filter((c) => c.el !== cur));
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

  function commitEngaged() {
    const sel = state.engaged;
    const changed = sel && sel.isConnected && sel.selectedIndex !== state.engagedIndex;
    disengage();
    if (changed) {
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
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
  // Back arrives here — because Firefox acted on the remote's key and our guard
  // caught it — the frame gets first refusal. Only what it cannot close is a
  // layer for this page to walk.
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
    if (state.kind === "browse") {
      exit();
      return true;
    }
    // Structural, never historical. history.back() returns you to whatever you
    // happened to look at last, which is not what Back means on a remote: it
    // means one layer up. Episode → the season you were in → Browse.
    return go(structuralParent());
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

  // id → how a value is shown and stepped. Every one is a short list or a
  // number with a step, so ◀ ▶ can walk it.
  const SETTING_ROWS = [
    { id: "theater", label: "Theater layout", values: ["auto", "manual", "off"], show: { auto: "every video", manual: "on OK", off: "never" } },
    { id: "seekStep", label: "Seek step", values: Settings.SEEK_STEPS, suffix: " s" },
    { id: "autoplayNext", label: "Play next episode", bool: true },
    { id: "startMuted", label: "Start videos muted", bool: true },
    { id: "hintBar", label: "Button hints", bool: true },
    { id: "ringWidth", label: "Ring width", min: 2, max: 12, step: 1, suffix: " px" },
    { id: "ringColor", label: "Ring colour", values: ["#feea3b", "#ffffff", "#ff4081", "#41d6c3", "#ff8a3d"], show: { "#feea3b": "yellow", "#ffffff": "white", "#ff4081": "pink", "#41d6c3": "teal", "#ff8a3d": "orange" } },
    { id: "focusZoom", label: "Enlarge selection", min: 0, max: 25, step: 5, suffix: "%" },
    { id: "skipMarketingSite", label: "Skip dropout.tv home", bool: true },
    { id: "exitHook", label: "Back on Browse", values: ["none", "close-tab"], show: { none: "does nothing", "close-tab": "closes the tab" } }
  ];

  function settingRow(id) {
    return SETTING_ROWS.find((r) => r.id === id) || null;
  }

  function settingText(row) {
    const v = state.settings[row.id];
    if (row.bool) return v ? "on" : "off";
    if (row.show) return row.show[v] || String(v);
    if (row.id === "focusZoom" && v === 0) return "off";
    return `${v}${row.suffix || ""}`;
  }

  // The few things that are not settings — where to go, and the way out — come
  // along at the foot of the list.
  function settingItems() {
    const items = SETTING_ROWS.map((r) => ({ id: r.id, label: r.label, value: settingText(r) }));
    items.push({ id: "browse", label: "Browse" });
    items.push({ id: "search", label: "Search", detail: "needs a keyboard" });
    items.push({ id: "disable", label: "Turn Leanback off" });
    return items;
  }

  function stepSetting(row, delta) {
    const cur = state.settings[row.id];
    let next;
    if (row.bool) next = !cur;
    else if (row.values) {
      const list = row.values;
      const i = list.indexOf(cur);
      const j = Math.min(list.length - 1, Math.max(0, (i < 0 ? 0 : i) + delta));
      next = list[j];
    } else {
      next = Math.min(row.max, Math.max(row.min, Number(cur) + delta * row.step));
    }
    if (next === cur) return true;
    state.settings = Object.assign({}, state.settings, { [row.id]: next });
    state.menu.setValue(row.id, settingText(row));
    send({ type: "settings:set", patch: { [row.id]: next } });
    return true;
  }

  function openSettings() {
    state.settingRow = null;
    state.menu.open(settingItems(), { title: "Leanback settings" });
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
    state.settingRow = null;
    if (state.menuReturn && state.menuReturn.isConnected) focusEl(state.menuReturn);
    else if (state.playerFocused || state.theater) enterPlayer();
    state.menuReturn = null;
    showHints();
    return true;
  }

  function dispatchInMenu(action) {
    // A settings row being changed takes the arrows, exactly like an engaged
    // dropdown on the page: OK starts, ◀ ▶ change, OK confirms, back undoes.
    if (state.settingRow) {
      switch (action) {
        case "left":
          return stepSetting(state.settingRow, -1);
        case "right":
          return stepSetting(state.settingRow, 1);
        case "select":
          return disengageSetting();
        case "back":
          return cancelSetting();
        case "up":
        case "down":
          return true; // absorbed: leaving is a deliberate OK or back
        default:
          return false;
      }
    }
    switch (action) {
      case "up":
        state.menu.move(-1);
        return true;
      case "down":
        state.menu.move(1);
        return true;
      case "select":
        state.menu.activate();
        return true;
      case "back":
        return closeMenu();
      case "menu":
        return closeMenu();
      case "left":
      case "right":
        return true; // absorbed: the panel is a single column
      default:
        return false;
    }
  }

  function engageSetting(row) {
    state.settingRow = row;
    state.settingBefore = state.settings[row.id];
    if (state.menu.current) state.menu.current.dataset.tenfootEngaged = "true";
    showHints();
    return true;
  }

  function disengageSetting() {
    if (state.menu.current) delete state.menu.current.dataset.tenfootEngaged;
    state.settingRow = null;
    showHints();
    return true;
  }

  function cancelSetting() {
    const row = state.settingRow;
    if (row && state.settings[row.id] !== state.settingBefore) {
      state.settings = Object.assign({}, state.settings, { [row.id]: state.settingBefore });
      state.menu.setValue(row.id, settingText(row));
      send({ type: "settings:set", patch: { [row.id]: state.settingBefore } });
    }
    return disengageSetting();
  }

  function onMenuItem(id) {
    const row = settingRow(id);
    if (row) {
      engageSetting(row);
      return;
    }
    // Not a setting: one of the actions at the foot of the list.
    switch (id) {
      case "browse":
        closeMenu();
        go(state.rules.browseUrl || "/browse");
        return;
      case "search":
        closeMenu();
        go(state.rules.searchUrl || "/search");
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
  // "/" is a toggle, so this one really does mean "back where I was" — unlike
  // the Back button, which is structural. The guard entry sits on top of the
  // history, so stepping over it takes two.
  function leaveSearch() {
    const steps = state.guard ? 2 : 1;
    if (history.length > steps) {
      state.guard = false;
      state.lastBack = Date.now();
      history.go(-steps);
      return true;
    }
    return go(state.rules.browseUrl || "/browse");
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

  // The remote's back button is intercepted in the capture phase and runs the
  // layered back (docs/keymap.md). Theater is not a history entry of its own:
  // one would make the browser's history-back land on the wrong page after a
  // season switch. The single guard entry (pushGuard) is all Leanback keeps.
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
    return go(url);
  }

  function onPlayerEnded(msg) {
    const upNext = msg && msg.upNext ? msg.upNext : state.playerState && state.playerState.upNext;
    state.playerState = Object.assign({}, state.playerState, { ended: true, paused: true, upNext: upNext || null });
    if (!state.settings.autoplayNext) return;
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
        return [
          { keys: "OK", label: offering ? "Play next episode" : "Play / pause" },
          { keys: "◀ ▶", label: `−${step} s / +${step} s` },
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
    if (state.settingRow) return [{ keys: "◀ ▶", label: "Change" }, { keys: "OK", label: "Done" }, { keys: "Back", label: "Undo" }];
    if (state.menu.isOpen) {
      return [
        { keys: "▲ ▼", label: "Move" },
        { keys: "OK", label: "Change" },
        { keys: "Back", label: "Close" }
      ];
    }
    if (state.engaged) return [{ keys: "◀ ▶", label: "Change" }, { keys: "OK", label: "Confirm" }, { keys: "Back", label: "Cancel" }];
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
    const action = Keymap.actionFor(e, { inPlayer: false, editable });
    if (!action) return;
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
    if (state.menu.isOpen) {
      // Keys are read at window capture, so the panel does not need the focus
      // to work — it only needs it to look selected, and it stamps that
      // itself. Dropout moves the focus on its own (React re-renders, focus
      // traps), and closing the panel on that made "Leanback settings" shut
      // itself the instant it opened. Take the focus back, and stop trying
      // rather than fight a focus trap for ever.
      if (state.menu.contains(t)) state.menuRefocus = 0;
      else {
        if (state.menuRefocus < MENU_REFOCUS_LIMIT) {
          state.menuRefocus += 1;
          state.menu.refocus();
        }
        return;
      }
    }
    if (t !== state.lastFocus) {
      state.lastFocus = t;
      const row = rowOf(t);
      if (row) state.memory.set(row, t);
    }
    if (!state.theater) state.ring.follow(t);
    if (!state.theater && !state.playerFocused) showHints();
  }

  // The remote's back button reaches Firefox as a browser-level key, and
  // Firefox navigates on it before this document can cancel the event. One
  // same-document entry of ours sits on top of the history, so that navigation
  // lands here instead of leaving the page; we put it straight back and do
  // what Back actually means.
  function pushGuard() {
    if (state.guard || !state.enabled) return;
    try {
      history.pushState({ tenfoot: "guard" }, "");
      state.guard = true;
    } catch (_err) { /* the layering still works from the key itself */ }
  }

  function onPopState() {
    if (state.leaving || !state.enabled) return;
    if (location.href !== state.href) {
      onNavigate();
      return;
    }
    state.guard = false;
    pushGuard();
    // The key handler may have run for the same press; do not act twice.
    if (Date.now() - state.lastBack < BACK_DEDUPE_MS) return;
    dispatch("back", {});
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
    if (state.pendingInitialFocus) tryInitialFocus();
    if (state.pendingLoadMore) continueLoadMore();
    if (state.kind === "video") {
      markVideoElements();
      syncUpNextOffer();
      if (state.pendingPlayerFocus && qs(state.page.playerFrame)) enterPlayer();
    }
    if (state.lastFocus && !state.lastFocus.isConnected && !state.playerFocused) {
      state.lastFocus = null;
      state.pendingInitialFocus = Date.now() + 2000;
      tryInitialFocus();
    } else {
      state.ring.refresh();
    }
  }

  function startObserver() {
    state.observer = new MutationObserver(() => {
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
      text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60)
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
      hints: Boolean(state.hints) && state.hints.visible
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
        state.playerState = msg.state && typeof msg.state === "object" ? msg.state : null;
        // The site is offering the next episode: say which key takes it.
        if (state.enabled && state.playerState && state.playerState.upNextShowing && !was) showHints();
        reply({ ok: true });
        return false;
      }
      case "player:ended":
        onPlayerEnded(msg);
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
      case "page:action": {
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
    state.guard = false;
    pushGuard();
    state.pendingInitialFocus = Date.now() + INITIAL_FOCUS_TIMEOUT_MS;
    if (state.kind === "series") captureEpisodeOrder();
    if (state.kind === "video") {
      markVideoElements();
      if (state.settings.theater === "auto") setTheater(true);
    }
    syncModal();
    tryInitialFocus();
    if (!state.theater && !state.playerFocused) showHints();
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
      state.pendingInitialFocus = 0;
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
    state.rules = rulesReply && rulesReply.ok && rulesReply.rules && typeof rulesReply.rules === "object" ? rulesReply.rules : null;
    if (!state.rules) {
      console.warn(LOG, "site rules unavailable; navigation is off on this page:", rulesReply && rulesReply.error);
      root.dataset[MARK] = "off";
      return;
    }
    state.ring = Ring.createRing(document, ringStyle());
    state.hints = Ring.createHintBar(document, { enabled: settings.hintBar });
    state.menu = Menu.createMenu(document, { onActivate: onMenuItem });
    installSiteStyle();
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("contextmenu", onContextMenu, true);
    window.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("pagehide", () => { state.leaving = true; });
    API.runtime.onMessage.addListener(onMessage);
    Settings.watch(API, onSettingsChanged);
    startObserver();
    applyEnabled(settings.enabled);
  }

  init().catch((err) => {
    console.error(LOG, "page script failed to start:", err);
    root.dataset[MARK] = "off";
  });
})();
