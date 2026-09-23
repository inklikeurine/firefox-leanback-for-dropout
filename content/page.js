/* global browser, chrome */
// 10-Foot Dropout — page script, top frame of watch.dropout.tv.
// Classifies the URL into a page kind (sites/dropout.json → routes), then
// wires keys → actions → spatial navigation, the focus ring, the hint bar,
// the theater layout, layered Back, load-more, season switching and the
// player relay (the player is a cross-origin iframe; see content/player.js).
// Idempotent: html[data-tenfoot] marks a document that is already wired.

(function () {
  const API = typeof browser !== "undefined" ? browser : chrome;
  const LOG = "[10-foot-dropout]";
  const MARK = "tenfoot";
  const THEATER_CLASS = "tenfoot-theater";
  const EPISODES_KEY = "tenfoot.episodes";
  const MOVE_THROTTLE_MS = 80;
  const MUTATION_DEBOUNCE_MS = 100;
  const INITIAL_FOCUS_TIMEOUT_MS = 10000;
  const LOAD_MORE_TIMEOUT_MS = 6000;
  const AUTOPLAY_DELAY_MS = 1200;
  const INFO_MS = 6000;

  if (window.top !== window) return;
  const root = document.documentElement;
  if (root.dataset[MARK]) return;
  root.dataset[MARK] = "init";

  const Settings = globalThis.TenfootSettings;
  const Keymap = globalThis.TenfootKeymap;
  const Rules = globalThis.TenfootSiteRules;
  const Spatial = globalThis.TenfootSpatial;
  const Ring = globalThis.TenfootFocusRing;

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
    headerReturn: null,
    pendingInitialFocus: 0,
    pendingLoadMore: null,
    href: location.href,
    lastNavigation: null,
    observer: null,
    mutationTimer: 0
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

  function matchesAny(el, sels) {
    const s = Rules.selector(sels);
    if (!s || !el || !el.matches) return false;
    try {
      return el.matches(s);
    } catch (_err) {
      return false;
    }
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
    return { color: s.ringColor, width: s.ringWidth, scale: s.ringScale };
  }

  async function send(msg) {
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
    state.kind = Rules.classify(state.rules, location.pathname);
    state.page = Rules.pageRules(state.rules, state.kind);
    state.href = location.href;
    state.memory = new Map();
    state.playerFocused = false;
    state.playerReady = false;
    state.playerState = null;
    state.pendingPlayerFocus = false;
    state.pendingLoadMore = null;
    state.headerReturn = null;
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
    // Carousels that move by transform rather than by scrolling: nudge the arrows.
    setTimeout(() => {
      if (!el.isConnected || state.lastFocus !== el) return;
      const rr = row.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      if (er.right > Math.min(rr.right, window.innerWidth) + 1) click(firstVisible(state.page.scrollNext, row));
      else if (er.left < Math.max(rr.left, 0) - 1) click(firstVisible(state.page.scrollPrev, row));
      state.ring.refresh();
    }, smooth ? 400 : 50);
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
    if (!target) {
      const { candidates } = collect();
      const vp = viewport();
      const onScreen = candidates.find((c) => c.rect.top >= 0 && c.rect.top < vp.height && !(state.rules.common && c.el.closest(state.rules.common.header || "\0")));
      target = onScreen ? onScreen.el : null;
    }
    if (!target) return giveUp();
    focusEl(target, { scroll: false });
    state.pendingInitialFocus = 0;
  }

  // ---------------------------------------------------------------------------
  // actions
  // ---------------------------------------------------------------------------

  function dispatch(action, ctx) {
    const c = ctx || {};
    if (c.editable) return action === "back" ? blurField() : false;
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
        return goBack();
      case "menu":
        return toggleHeader();
      case "info":
        return info();
      case "search":
        return state.kind === "search" ? focusSearchField() : go(state.rules.searchUrl || "/search");
      case "home":
        return state.kind === "browse" ? move("up") : go(state.rules.browseUrl || "/browse");
      case "channel_up":
        return channel(-1);
      case "channel_down":
        return channel(1);
      default:
        return Keymap.PLAYER_ACTIONS.has(action) ? playerAction(action) : false;
    }
  }

  function move(dir) {
    state.lastMove = performance.now();
    const cur = currentEl();
    if (cur && cur.tagName === "SELECT" && (dir === "left" || dir === "right") && matchesAny(cur, state.page.selectStep)) {
      return stepSelect(cur, dir === "right" ? 1 : -1);
    }
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
    if (!target) {
      if (dir === "down" && !state.modal) tryLoadMore();
      return true;
    }
    focusEl(target.el);
    return true;
  }

  function stepSelect(sel, delta) {
    const n = sel.options ? sel.options.length : 0;
    if (!n) return true;
    const i = Math.min(n - 1, Math.max(0, sel.selectedIndex + delta));
    if (i === sel.selectedIndex) return true;
    sel.selectedIndex = i;
    sel.dispatchEvent(new Event("input", { bubbles: true }));
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function activate() {
    const cur = currentEl();
    if (!cur) return move("down");
    if (state.kind === "video" && cur.hasAttribute("data-tenfoot-player")) return enterPlayer();
    if (cur.tagName === "SELECT") return false;
    click(cur);
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
    if (history.length > 1) {
      history.back();
      return true;
    }
    return go(structuralParent());
  }

  function structuralParent() {
    if (state.kind === "video") {
      const a = qs(state.page.seriesLink);
      if (a && a.href) return a.href;
    }
    return state.rules.browseUrl || "/browse";
  }

  async function exit() {
    const r = await send({ type: "exit" });
    if (!r || r.action !== "close-tab") state.hints.show([{ keys: "Back", label: "Nothing to go back to" }], 2000);
  }

  function toggleHeader() {
    const common = state.rules.common || {};
    const header = qs(common.header);
    if (!header) return false;
    const cur = currentEl();
    if (cur && header.contains(cur)) {
      if (state.headerReturn && state.headerReturn.isConnected) focusEl(state.headerReturn);
      else {
        state.pendingInitialFocus = Date.now() + 1000;
        tryInitialFocus();
      }
      return true;
    }
    const link = firstVisible(common.headerLinks || "a[href]", header);
    if (!link) return false;
    state.headerReturn = cur;
    focusEl(link);
    return true;
  }

  // Info: show the hints now (with title and time on a video page); again hides them.
  function info() {
    if (state.hints.visible) {
      state.hints.hide();
      return true;
    }
    if (state.kind === "video") {
      send({ type: "player:command", cmd: "state" }).then((r) => {
        showOsd(r && r.ok && r.state ? r.state : null);
      });
    } else {
      state.hints.force(hintItems(), INFO_MS);
    }
    return true;
  }

  function focusSearchField() {
    const field = firstVisible(Rules.selector(state.page.initialFocus));
    if (!field) return false;
    focusEl(field);
    return true;
  }

  function channel(delta) {
    if (state.kind === "browse") return move(delta < 0 ? "up" : "down");
    window.scrollBy({ top: delta * window.innerHeight * 0.8, behavior: reducedMotion() ? "auto" : "smooth" });
    state.ring.refresh();
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
      case "info":
        return info();
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

  function setTheater(on) {
    const want = Boolean(on) && state.kind === "video";
    if (state.theater === want) return;
    state.theater = want;
    root.classList.toggle(THEATER_CLASS, want);
    if (want) state.ring.hide();
    else state.ring.refresh();
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
    const mount = qs(state.page.playerMount);
    const { candidates } = collect();
    const others = candidates.filter((c) => c.el !== mount);
    const t = mount ? Spatial.pick("down", Ring.unscaledRect(mount), others) : others[0];
    if (t) focusEl(t.el);
    else if (mount) focusEl(mount);
    return true;
  }

  function captureEpisodeOrder() {
    const urls = qsa(Rules.selector(state.page.episodeLinks)).map((a) => a.href).filter(Boolean);
    if (!urls.length) return;
    try {
      sessionStorage.setItem(EPISODES_KEY, JSON.stringify({ series: location.pathname, urls }));
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

  function goEpisode(delta) {
    const url = episodeUrl(delta);
    if (!url) {
      state.hints.show([{ keys: delta > 0 ? "▶▶" : "◀◀", label: delta > 0 ? "No next episode" : "No previous episode" }], 2500);
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

  function formatTime(s) {
    const n = Math.max(0, Math.floor(Number(s) || 0));
    const h = Math.floor(n / 3600);
    const m = Math.floor((n % 3600) / 60);
    const sec = n % 60;
    const mm = h ? String(m).padStart(2, "0") : String(m);
    return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
  }

  function showOsd(st) {
    if (!st) {
      state.hints.force(hintItems(), INFO_MS);
      return;
    }
    const parts = [];
    if (st.title) parts.push(st.title);
    if (typeof st.currentTime === "number" && typeof st.duration === "number" && st.duration > 0) parts.push(`${formatTime(st.currentTime)} / ${formatTime(st.duration)}`);
    if (st.paused) parts.push("Paused");
    state.hints.setOsd(parts.join(" · "));
    state.hints.force(hintItems(), INFO_MS);
  }

  // ---------------------------------------------------------------------------
  // hints
  // ---------------------------------------------------------------------------

  function hintItems() {
    const step = state.settings.seekStep;
    if (state.modal) return [{ keys: "◀ ▶ ▲ ▼", label: "Move" }, { keys: "OK", label: "Select" }, { keys: "Back", label: "Close" }];
    if (state.kind === "video") {
      if (state.playerFocused) {
        return [
          { keys: "OK", label: "Play / pause" },
          { keys: "◀ ▶", label: `−${step} s / +${step} s` },
          { keys: "▼", label: "Page" },
          { keys: "Back", label: state.theater ? "Leave" : "Back" }
        ];
      }
      return [
        { keys: "▲ ▼", label: "Move" },
        { keys: "OK", label: "Open" },
        { keys: "Back", label: state.theater ? "Leave" : "Back" }
      ];
    }
    const cur = currentEl();
    if (cur && cur.tagName === "SELECT") return [{ keys: "◀ ▶", label: "Change" }, { keys: "▲ ▼", label: "Move" }, { keys: "Back", label: "Back" }];
    const items = [{ keys: "◀ ▶ ▲ ▼", label: "Move" }, { keys: "OK", label: "Open" }];
    if (state.kind !== "browse") items.push({ keys: "Back", label: "Back" });
    else if (state.settings.exitHook === "close-tab") items.push({ keys: "Back", label: "Exit" });
    return items;
  }

  function showHints() {
    state.hints.show(hintItems());
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
    if (action !== "info") showHints();
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
    if (t !== state.lastFocus) {
      state.lastFocus = t;
      const row = rowOf(t);
      if (row) state.memory.set(row, t);
    }
    if (!state.theater) state.ring.follow(t);
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
      focused: cur ? describe(cur) : null,
      navigation: state.lastNavigation,
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
      case "player:state":
        state.playerState = msg.state && typeof msg.state === "object" ? msg.state : null;
        reply({ ok: true });
        return false;
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
      case "page:info":
        if (state.enabled) {
          if (state.hints.visible) state.hints.hide();
          else showOsd(msg.state);
        }
        reply({ ok: true });
        return false;
      case "page:state":
        reply(snapshot());
        return false;
      case "page:action": {
        const consumed = state.enabled ? dispatch(String(msg.action || ""), {}) : false;
        if (consumed && msg.action !== "info") showHints();
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
    state.pendingInitialFocus = Date.now() + INITIAL_FOCUS_TIMEOUT_MS;
    if (state.kind === "series") captureEpisodeOrder();
    if (state.kind === "video") {
      markVideoElements();
      if (state.settings.theater === "auto") setTheater(true);
    }
    syncModal();
    tryInitialFocus();
  }

  function applyEnabled(on) {
    state.enabled = Boolean(on);
    root.dataset[MARK] = state.enabled ? "on" : "off";
    if (!state.enabled) {
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
    installSiteStyle();
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("contextmenu", onContextMenu, true);
    window.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("popstate", onNavigate);
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
