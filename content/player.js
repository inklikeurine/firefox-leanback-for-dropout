/* global browser, chrome */
// Leanback for Dropout — player script, every frame on embed.vhx.tv.
// The Dropout player is a cross-origin iframe wrapping Vimeo's runtime, so
// keys pressed while it has focus arrive here, not on the page. This script
// registers with the background (player:hello), finds the <video>, handles
// keys while the frame has focus, executes player:command messages and
// reports state changes back to the page through the background relay.
// Idempotent: html[data-tenfoot-player] marks a document already wired.

(function () {
  const API = typeof browser !== "undefined" ? browser : chrome;
  const LOG = "[leanback-for-dropout]";
  const MARK = "tenfootPlayer";
  const MUTATION_DEBOUNCE_MS = 100;
  const MUTE_ENFORCE_MS = 15000;
  const UNMUTE_CHECK_MS = 250;
  const UNMUTE_SETTLE_MS = 100; // let the autoplay establish itself first
  const TRANSPORT_CLASS = "tenfoot-transport";
  const SAVE_EVERY_MS = 15000; // how often the watch history hears from a playing video
  const RESUME_SLACK_S = 5; // already this close to the saved point: leave it
  const DEFAULT_RULES = { video: "video", captionsButton: "button[aria-label*='aption'], button[aria-label*='ubtitle']" };
  const VISIBLE = (el) => Boolean(el) && Boolean(el.getClientRects && el.getClientRects().length);

  const root = document.documentElement;
  if (!root || root.dataset[MARK]) return;

  // embed.vhx.tv loads more than one frame, and the ones that are not the
  // player are short-lived. Registering from them means a runtime query in
  // flight when the frame goes away, which is what logs "Actor 'Conduits'
  // destroyed before query 'RuntimeMessage' was resolved" on every page load.
  function looksLikePlayer() {
    try {
      const w = window.wrappedJSObject || window;
      if (w.OTTData) return true;
    } catch (_err) { /* fall through to the DOM checks */ }
    return Boolean(document.querySelector("video, #app"));
  }
  if (!looksLikePlayer()) return;

  root.dataset[MARK] = "init";

  const Settings = globalThis.TenfootSettings;
  const Keymap = globalThis.TenfootKeymap;
  const Rules = globalThis.TenfootSiteRules;
  const Spatial = globalThis.TenfootSpatial;
  const Ring = globalThis.TenfootFocusRing;
  const Transport = globalThis.TenfootTransport;
  const History = globalThis.TenfootHistory;

  const state = {
    settings: Settings.normalize(null),
    rules: DEFAULT_RULES,
    video: null,
    observer: null,
    mutationTimer: 0,
    registered: false,
    upNextShowing: false,
    leaving: false,
    ring: null,
    transport: false,
    controls: [],
    controlIndex: 0,
    adjusted: new WeakSet(),
    enforceMuteUntil: 0,
    volumeTouched: false,
    bar: null,
    userPaused: false,
    autoplayBlocked: false,
    gesture: false,
    unmuteWhenPlaying: false,
    offerFromPage: false,
    lastSave: 0,
    // Picking up where the viewer left off: the point, whether it is still to
    // be applied, and whether it was (which is what offers Start Over).
    resume: { video: null, at: null, pending: false, resumed: false, told: false }
  };

  function qs(sel, scope) {
    if (!sel) return null;
    try {
      return (scope || document).querySelector(sel);
    } catch (_err) {
      return null;
    }
  }

  async function send(msg) {
    try {
      const r = await API.runtime.sendMessage(msg);
      return r === undefined ? { ok: false, error: "No reply" } : r;
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  }

  // What the site's embed shell knows about this video (window.OTTData in the
  // page world). Read through the Xray wrapper; copy only plain fields.
  function ottData() {
    try {
      const w = window.wrappedJSObject || window;
      const d = w.OTTData;
      if (!d || typeof d !== "object") return null;
      const v = d.video && typeof d.video === "object" ? d.video : null;
      return {
        video: v ? {
          id: v.id == null ? null : String(v.id),
          title: typeof v.title === "string" ? v.title : "",
          duration: typeof v.duration === "number" ? v.duration : 0,
          url: typeof v.url === "string" ? v.url : null,
          trailer: v.is_trailer === true || v.is_trailer === "true",
          live: Boolean(v.is_live_video)
        } : null,
        upNext: normalizeUpNext(d.up_next)
      };
    } catch (_err) {
      return null;
    }
  }

  function normalizeUpNext(u) {
    if (!u) return null;
    if (typeof u === "string") return { url: u, title: null };
    if (typeof u !== "object") return null;
    const inner = u.video && typeof u.video === "object" ? u.video : null;
    const url = [u.url, u.href, inner && inner.url].find((x) => typeof x === "string" && x);
    const title = [u.title, inner && inner.title].find((x) => typeof x === "string" && x);
    return url ? { url, title: title || null } : null;
  }

  // The site's own up-next overlay, if it is on screen. Its markup is not
  // verified (site-notes U7), so everything here degrades to "not found".
  // ".ott-up-next" matches several elements, only one of which is on screen.
  function upNextOverlay() {
    const sel = state.rules.upNextOverlay;
    if (!sel) return null;
    let els;
    try {
      els = document.querySelectorAll(sel);
    } catch (_err) {
      return null;
    }
    for (const el of els) if (VISIBLE(el)) return el;
    return null;
  }

  // The offer may be rendered by the page rather than inside this frame; the
  // page tells us when it sees it.
  function offerShowing() {
    return Boolean(upNextOverlay()) || state.offerFromPage;
  }

  // Something inside the overlay that starts the next episode.
  function upNextControl() {
    const overlay = upNextOverlay();
    if (!overlay) return null;
    if (state.rules.upNextButton) {
      const b = qs(state.rules.upNextButton, overlay);
      if (VISIBLE(b)) return b;
    }
    const candidates = overlay.querySelectorAll("button, a[href], [role='button']");
    for (const c of candidates) if (VISIBLE(c)) return c;
    return overlay;
  }

  // Start the next episode now: click the site's overlay when it is showing
  // (it resumes correctly and cancels its own countdown), otherwise ask the
  // page to navigate using the up-next URL or the episode order it captured.
  function playNext() {
    const control = upNextControl();
    if (control) {
      control.click();
      return true;
    }
    send({ type: "page:episode", delta: 1 });
    return true;
  }

  // The player's own control bar. Vimeo hides it when the pointer is idle and
  // shows it again on mouse movement, so wake it before looking. This is a
  // pointer event, not a key event — we never synthesise keys into a page.
  function wakeControls() {
    const root = qs(state.rules.transport) || document.body;
    if (!root) return;
    for (const type of ["mousemove", "mouseover"]) {
      try {
        root.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      } catch (_err) { /* the controls may already be showing */ }
    }
  }

  // Matches within `scope` only. The selectors here are broad substring
  // matches ("[class*='pip']"), so walking up past the control bar could hit
  // an ancestor and take the whole bar with it.
  function matchesWithin(el, list, scope) {
    const sel = Rules.selector(list);
    if (!sel || !el || !el.matches) return false;
    try {
      if (el.matches(sel)) return true;
      const hit = el.closest(sel);
      return Boolean(hit) && hit !== scope && scope.contains(hit);
    } catch (_err) {
      return false;
    }
  }

  // Stamp the controls that must never be seen, so CSS can remove them without
  // the stylesheet needing to know a single site selector. Scoped to inside
  // the control bar, and never the bar itself: a broad selector that matched
  // an ancestor would hide every control and make ▼ look like a dead key.
  // Everything in the bar that is not on the keep list goes. A list of things
  // to hide would miss any button it does not know, and the transcript button
  // has no class to know it by.
  function hideUnwantedControls(container) {
    const itemSel = Rules.selector(state.rules.transportItems) || "button";
    let items;
    try {
      items = Array.from(container.querySelectorAll(itemSel));
    } catch (_err) {
      return;
    }
    const keep = Rules.selector(state.rules.transportKeep);
    const menu = Rules.selector(state.rules.transportMenu);
    // The gear's popover lives *inside* the control bar, so its entries look
    // like control-bar buttons to a keep list. They are never hidden, or the
    // settings panel would read the menu empty.
    const inMenu = (el) => {
      if (el.getAttribute("role") === "menuitem") return true;
      if (!menu) return false;
      try {
        return Boolean(el.closest(menu));
      } catch (_err) {
        return false;
      }
    };
    const kept = [];
    for (const el of items) {
      if (el === container || el.contains(container) || inMenu(el)) continue;
      // Vimeo's gear button carries no label of its own — the label is on a
      // child — so a button counts as wanted if it or anything inside it
      // matches; otherwise the gear itself would be hidden.
      const wanted = keep ? (matchesSafe(el, keep) || Boolean(safeQuery(el, keep))) : true;
      if (wanted) kept.push(el);
    }
    // A keep list that matches nothing is a keep list that is wrong about this
    // player; leaving the bar alone beats emptying it.
    if (keep && !kept.length) return;
    for (const el of items) {
      if (el === container || el.contains(container) || inMenu(el)) continue;
      if (kept.includes(el)) el.removeAttribute("data-tenfoot-hide");
      else el.setAttribute("data-tenfoot-hide", "");
    }
    // Anything explicitly listed goes too, keep list or not.
    for (const sel of Rules.selectorList(state.rules.transportHide)) {
      let els;
      try {
        els = container.querySelectorAll(sel);
      } catch (_err) {
        continue;
      }
      for (const el of els) {
        if (el !== container && !el.contains(container) && !inMenu(el)) el.setAttribute("data-tenfoot-hide", "");
      }
    }
  }

  function matchesSafe(el, sel) {
    try {
      return el.matches(sel);
    } catch (_err) {
      return false;
    }
  }

  function safeQuery(el, sel) {
    try {
      return el.querySelector(sel);
    } catch (_err) {
      return null;
    }
  }

  // The controls are tidied the moment the bar first appears, not only once ▼
  // has been pressed, so volume and picture-in-picture never show.
  // "site" hands the player its own controls back: nothing of ours is drawn and
  // nothing of theirs is hidden. It is how you reach a part of the player's UI
  // that Leanback has no equivalent for — and the way out if our bar ever
  // breaks on a player redesign.
  function ownChrome() {
    return state.settings.playerChrome !== "site";
  }

  function tidyControls() {
    if (!state.settings.enabled || !ownChrome()) return;
    // Every piece of player chrome that should only show while the row is in
    // use — the control bar, and the overlay play button, which sits outside
    // the bar and would stay on screen if only the bar were hidden.
    for (const sel of Rules.selectorList(state.rules.chrome)) {
      let els;
      try {
        els = document.querySelectorAll(sel);
      } catch (_err) {
        continue;
      }
      for (const el of els) el.setAttribute("data-tenfoot-bar", "");
    }
    const container = qs(state.rules.transport);
    if (!container) return;
    hideUnwantedControls(container);
  }

  // ---------------------------------------------------------------------------
  // the transport bar
  //
  // Ours, not the player's. content/transport.js draws it and drives the
  // <video>; this file owns when it is open and what Back means while it is.
  // ---------------------------------------------------------------------------

  // Remembering who paused: the viewer, or Firefox taking the sound away.
  function notePlayback(paused) {
    state.userPaused = Boolean(paused);
  }

  function bar() {
    if (state.bar) return state.bar;
    if (!Transport) return null;
    state.bar = Transport.createTransport(document, {
      rules: state.rules,
      video: () => state.video,
      wake: wakeControls,
      onPlayback: notePlayback,
      settings: () => state.settings,
      nextEpisode: () => {
        // ottData() hands back an already-normalised upNext; there is no
        // up_next on it to normalise a second time.
        const d = ottData();
        const u = d && d.upNext;
        return u && u.url ? u : null;
      },
      onNext: () => playNext(),
      resumed: () => state.resume.resumed,
      onRestart: () => startOver(),
      onSetting: (patch) => {
        // Optimistic, so the panel redraws at once; the background broadcast
        // that follows is what makes it stick.
        state.settings = Object.assign({}, state.settings, patch);
        send({ type: "settings:set", patch });
      },
      onClose: () => leaveTransport(),
      onPanelFailed: (kind) => console.warn(LOG, "the player offered no", kind, "menu")
    });
    state.bar.setStyle(state.settings);
    return state.bar;
  }

  function ring() {
    if (!state.ring) state.ring = Ring.createRing(document, ringStyle(state.settings));
    return state.ring;
  }

  function ringStyle(s) {
    return { color: s.ringColor, width: s.ringWidth, scale: false };
  }

  // ▼ on a playing video opens the row; ◀ ▶ then walk it, OK takes a control,
  // back closes it and gives ◀ ▶ back to seeking.
  function enterTransport() {
    const live = state.video && state.video.isConnected ? state.video : findVideo();
    const b = live && ownChrome() ? bar() : null;
    if (!b) {
      // Nothing to drive: ▼ hands off to the page.
      send({ type: "page:focus", hint: "below" });
      return true;
    }
    state.transport = true;
    document.documentElement.classList.add(TRANSPORT_CLASS);
    // Back reaches the browser before this frame can cancel it. The page's
    // guard entry absorbs that, and the page asks this frame first what Back
    // means (player:command "back"), which closes the row.
    b.open();
    report();
    return true;
  }

  // This frame keeps no history entry of its own: the page holds the one
  // guard, and a second here would let one press pop both.
  function openSettingsPanel() {
    const live = state.video && state.video.isConnected ? state.video : findVideo();
    const b = live && ownChrome() ? bar() : null;
    if (!b) return false;
    if (!state.transport) {
      state.transport = true;
      document.documentElement.classList.add(TRANSPORT_CLASS);
    }
    b.openSettings();
    report();
    return true;
  }

  function backLayer() {
    if (!state.transport) return false;
    const b = state.bar;
    if (b && b.dispatch("back")) return true;
    return leaveTransport();
  }

  function leaveTransport() {
    if (!state.transport) return false;
    state.transport = false;
    document.documentElement.classList.remove(TRANSPORT_CLASS);
    if (state.bar) state.bar.close();
    if (state.ring) state.ring.hide();
    const v = state.video;
    if (v) {
      try {
        v.focus({ preventScroll: true });
      } catch (_err) { /* focus stays in the frame either way */ }
    }
    report();
    return true;
  }

  function currentState() {
    const v = state.video;
    const d = ottData();
    const dv = d && d.video;
    const dur = v && Number.isFinite(v.duration) && v.duration > 0 ? v.duration : dv ? dv.duration : 0;
    return {
      present: Boolean(v),
      paused: v ? Boolean(v.paused) : true,
      ended: v ? Boolean(v.ended) : false,
      muted: v ? Boolean(v.muted) : false,
      currentTime: v ? Number(v.currentTime) || 0 : 0,
      duration: dur,
      title: dv && dv.title ? dv.title : document.title || "",
      url: dv ? dv.url : null,
      upNext: d ? d.upNext : null,
      upNextShowing: offerShowing(),
      transport: state.transport,
      transportControls: state.transport ? state.controls.length : 0,
      resumed: state.resume.resumed,
      focused: typeof document.hasFocus === "function" ? document.hasFocus() : false
    };
  }

  function play(v) {
    let p;
    try {
      p = v.play();
    } catch (err) {
      console.warn(LOG, "play() threw:", err && err.message);
      return;
    }
    if (p && typeof p.catch === "function") p.catch((err) => console.warn(LOG, "play() refused:", err && err.name));
  }

  function execute(cmd, arg) {
    const v = state.video;
    const noVideo = () => ({ ok: false, error: "No video element", state: currentState() });
    switch (cmd) {
      case "state":
        return { ok: true, state: currentState() };
      case "toggle":
        if (!v) return noVideo();
        notePlayback(!v.paused);
        if (v.paused) play(v);
        else v.pause();
        break;
      case "play":
        if (!v) return noVideo();
        notePlayback(false);
        play(v);
        break;
      case "pause":
        if (!v) return noVideo();
        notePlayback(true);
        v.pause();
        break;
      case "seek": {
        if (!v) return noVideo();
        const by = Number(arg);
        if (!Number.isFinite(by)) return { ok: false, error: "seek needs a number", state: currentState() };
        const max = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : Infinity;
        v.currentTime = Math.max(0, Math.min(max, (Number(v.currentTime) || 0) + by));
        break;
      }
      case "mute":
        if (!v) return noVideo();
        // An explicit choice, so stop holding the startMuted preference — it
        // would otherwise undo this within its enforcement window.
        state.volumeTouched = true;
        v.muted = !v.muted;
        break;
      case "captions": {
        const b = qs(state.rules.captionsButton);
        if (!b) return { ok: false, error: "No captions control", state: currentState() };
        b.click();
        break;
      }
      case "stop":
        if (!v) return noVideo();
        v.pause();
        v.currentTime = 0;
        send({ type: "page:focus", hint: "back" });
        break;
      default:
        return { ok: false, error: "Unknown command" };
    }
    return { ok: true, state: currentState() };
  }

  function dispatch(action) {
    const step = state.settings.seekStep;
    if (state.transport) {
      // The bar answers everything it understands: ◀ ▶ along the row, OK on a
      // control, ▲ and back to close, and all four inside an open panel. ▲ is
      // handled there too because the remote's back button is a browser-level
      // key Firefox may act on before this frame can cancel it; ▲ is ours for
      // certain.
      const b = state.bar;
      if (b && b.dispatch(action)) return true;
      switch (action) {
        case "down":
          // The row sits at the bottom of the video, so carrying on down
          // continues past it to the page — video → row → page.
          leaveTransport();
          send({ type: "page:focus", hint: "below" });
          return true;
        case "back":
        case "up":
          return leaveTransport();
        default:
          break; // media keys and the menu button still work
      }
    }
    switch (action) {
      case "select":
        // While the site is offering the next episode — or once the video has
        // simply ended — OK takes the offer rather than toggling a finished
        // video, which is the convention every TV app uses.
        if (offerShowing() || (state.video && state.video.ended)) return playNext();
        execute("toggle");
        return true;
      case "play_pause":
        execute("toggle");
        return true;
      case "left":
        execute("seek", -step);
        return true;
      case "right":
        execute("seek", step);
        return true;
      case "rewind":
        execute("seek", -3 * step);
        return true;
      case "fast_forward":
        execute("seek", 3 * step);
        return true;
      case "stop":
        execute("stop");
        return true;
      case "subtitle":
        execute("captions");
        return true;
      case "mute":
        execute("mute");
        return true;
      case "down":
        // Into the player's own transport row; it falls back to leaving for
        // the page when there is no control bar to be found.
        return enterTransport();
      case "back":
        send({ type: "page:focus", hint: "back" });
        return true;
      case "next":
      case "channel_down":
        return playNext();
      case "previous":
      case "channel_up":
        send({ type: "page:episode", delta: -1 });
        return true;
      case "menu":
        // The options button is the way into the settings panel during
        // playback. With the site's own controls in use there is no panel of
        // ours to open, so it goes to the page.
        if (openSettingsPanel()) return true;
        send({ type: "page:action", action });
        return true;
      case "search":
        send({ type: "page:action", action });
        return true;
      case "up":
        // Arrows navigate and nothing else. Starting the next episode early is
        // the menu button's job (or OK while the site offers it).
        return true;
      default:
        return false;
    }
  }

  function onKeyDown(e) {
    if (!state.settings.enabled) return;
    const action = Keymap.actionFor(e, { inPlayer: true, editable: Keymap.isEditable(e.target) });
    if (!action) return;
    state.gesture = true;
    unmuteOnGesture();
    // Firefox goes back on the remote's BrowserBack whatever this frame does
    // with it (T2). The page decides whether that needs any help.
    if (action === "back" && e.key === "BrowserBack") {
      send({ type: "page:action", action: "browser-back" });
      return;
    }
    if (!dispatch(action)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onContextMenu(e) {
    if (state.settings.enabled && e.button !== 2) e.preventDefault();
  }

  function focusPlayer() {
    leaveTransport();
    const el = state.video || qs("#app") || document.body;
    if (!el) return false;
    if (el !== document.body && !el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    try {
      el.focus({ preventScroll: true });
    } catch (_err) {
      return false;
    }
    return true;
  }

  // Take our marks off the player's own chrome. Turning Leanback off has to
  // give the control bar straight back: the CSS is gated on the enabled state,
  // and the attributes go too so nothing of ours is left on the site's DOM.
  function clearStamps() {
    for (const attr of ["data-tenfoot-bar", "data-tenfoot-hide", "data-tenfoot-transport"]) {
      for (const el of document.querySelectorAll(`[${attr}]`)) el.removeAttribute(attr);
    }
  }

  function applyEnabled(on) {
    const enabled = Boolean(on);
    root.dataset[MARK] = enabled ? "on" : "off";
    if (enabled) {
      findVideo();
      tidyControls();
      return;
    }
    leaveTransport();
    clearStamps();
    if (state.ring) state.ring.hide();
  }

  // ---------------------------------------------------------------------------
  // watch history
  //
  // The background keeps it (lib/history.js); this frame reports where the
  // video is, and on the way in asks where it was left.
  // ---------------------------------------------------------------------------

  // The video's history key and the details kept with it, or null for what is
  // not worth remembering: a trailer, a live stream.
  function watchTarget() {
    const d = ottData();
    const v = d && d.video;
    if (!v || v.trailer || v.live || !History) return null;
    const key = History.keyOf(v.url);
    return key ? { key, url: v.url, title: v.title } : null;
  }

  function saveProgress(ended) {
    const v = state.video;
    if (!v || state.leaving || !state.settings.enabled) return;
    const t = watchTarget();
    const duration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    if (!t || !duration) return;
    state.lastSave = Date.now();
    send({
      type: "history:progress",
      key: t.key,
      url: t.url,
      title: t.title,
      position: Number(v.currentTime) || 0,
      duration,
      ended: Boolean(ended)
    });
  }

  function onTimeUpdate() {
    const v = state.video;
    if (!v || v.paused || Date.now() - state.lastSave < SAVE_EVERY_MS) return;
    saveProgress(false);
  }

  function onPause() {
    report();
    saveProgress(false);
  }

  function onSeeked() {
    saveProgress(false);
  }

  // Look up where this video was left, then go there once the player can seek.
  async function prepareResume(v) {
    state.resume = { video: v, at: null, pending: false, resumed: false, told: false };
    const t = watchTarget();
    if (!t || !History) return;
    const store = await History.load(API);
    if (state.video !== v || state.resume.video !== v) return;
    const at = History.resumePoint(store, t.key);
    if (!at) return;
    state.resume.at = at;
    state.resume.pending = true;
    applyResume();
  }

  // Runs on the metadata and once more when playback starts: the player may
  // put the video back to its own start point in between. It never touches
  // paused or muted, so the autoplay and the sound are left as they were.
  function applyResume() {
    const r = state.resume;
    const v = state.video;
    if (!r.pending || !v || r.video !== v || !state.settings.enabled) return;
    const duration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    if (!duration) return; // not seekable yet; the metadata will call again
    if (r.at >= duration - RESUME_SLACK_S) {
      r.pending = false;
      return;
    }
    if ((Number(v.currentTime) || 0) < r.at - RESUME_SLACK_S) {
      try {
        v.currentTime = r.at;
      } catch (_err) {
        return;
      }
      r.resumed = true;
      if (!r.told) {
        r.told = true;
        send({ type: "player:resumed", at: r.at });
      }
    }
    if (!v.paused) r.pending = false;
  }

  // "Start Over" in the playback panel.
  function startOver() {
    const v = state.video;
    state.resume.pending = false;
    state.resume.resumed = false;
    if (v) {
      try {
        v.currentTime = 0;
      } catch (_err) { /* nothing to rewind */ }
    }
    leaveTransport();
    report();
    return true;
  }

  function report() {
    if (state.leaving) return;
    send({ type: "player:state", state: currentState() });
  }

  // The site may set muted while it is still setting the video up, so apply
  // the preference again once the metadata is in.
  // Playback has started, which is the first moment turning the sound on can
  // work without costing the autoplay that just succeeded.
  function onPlay() {
    applyResume();
    const v = state.video;
    if (v && state.unmuteWhenPlaying && !state.volumeTouched && !state.autoplayBlocked) {
      // A beat after playback starts, so the autoplay is established before we
      // touch the sound; unmuting in the same tick can still be refused.
      setTimeout(() => {
        const cur = state.video;
        if (cur === v && !cur.paused && !cur.ended) applyMutePreference(cur, true);
      }, UNMUTE_SETTLE_MS);
    }
    report();
  }

  function onLoadedMetadata() {
    applyResume();
    const v = state.video;
    if (v) {
      state.enforceMuteUntil = Date.now() + MUTE_ENFORCE_MS;
      // Only re-asserts a mute, or arms the unmute; it will not unmute a video
      // that has not started, which would stop the autoplay.
      applyMutePreference(v, true);
    }
    report();
  }

  function onEnded() {
    saveProgress(true);
    const d = ottData();
    send({ type: "player:ended", upNext: d ? d.upNext : null });
    report();
  }

  // Dropout starts videos muted — Firefox blocks autoplay with sound, so the
  // site falls back to muted autoplay. Nothing here ever muted a video; this
  // undoes that default once per video, unless the user asked for muted.
  // Applied once, so a deliberate mute from the transport row sticks.
  // Dropout starts videos muted because that is the only way Firefox lets them
  // autoplay. Unmuting therefore has to be done carefully: an unmute without
  // user activation makes Firefox stop the video, and if we simply insist we
  // trade "starts muted" for "does not play at all".
  //
  // So: try it once, and if playback stops as a result, put it straight back
  // and wait for a keypress — by then there is user activation and it sticks.
  // Where the profile allows autoplay with sound (the kiosk case, see
  // docs/targets.md) nothing stops and the sound is on from the first frame.
  function applyMutePreference(v, force) {
    if (!v) return;
    const want = Boolean(state.settings.startMuted);
    if (v.muted === want) return;
    if (want) {
      // Muting is always safe.
      v.muted = true;
      return;
    }
    // **Never unmute without a user gesture.** The site sets muted precisely
    // so Firefox will autoplay; turning the sound on before the page has been
    // interacted with makes Firefox stop the video, and no amount of play()
    // gets it back. So the rule is simple: wait for a keypress. On a remote
    // that is the first button press, and in a profile that allows autoplay
    // with sound (docs/targets.md) hasBeenActive is irrelevant anyway.
    if (!hasUserGesture()) {
      state.unmuteWhenPlaying = true;
      return;
    }
    if (v.paused || v.ended) {
      state.unmuteWhenPlaying = true;
      return;
    }
    if (state.autoplayBlocked && !force) return;
    if (!force && state.adjusted.has(v)) return;
    state.adjusted.add(v);
    state.unmuteWhenPlaying = false;
    v.muted = false;
    // Only worth rescuing if it was actually running when we touched the sound.
    setTimeout(() => revertIfStopped(v), UNMUTE_CHECK_MS);
  }

  // Our own keypresses count, and so does anything the browser has already
  // seen; navigator.userActivation is not in every build, hence the fallback.
  // Firefox tells us outright whether this profile will allow sound without a
  // gesture. When it will, there is nothing to wait for.
  function autoplayWithSoundAllowed() {
    try {
      if (typeof navigator.getAutoplayPolicy !== "function") return false;
      return navigator.getAutoplayPolicy("mediaelement") === "allowed";
    } catch (_err) {
      return false;
    }
  }

  function hasUserGesture() {
    if (state.gesture) return true;
    if (autoplayWithSoundAllowed()) return true;
    try {
      return Boolean(navigator.userActivation && navigator.userActivation.hasBeenActive);
    } catch (_err) {
      return false;
    }
  }

  // Firefox stops a video that unmutes without user activation. This puts it
  // back — and nothing else. A video the *viewer* paused is not a video Firefox
  // stopped, and resuming that one made every button press restart playback.
  function revertIfStopped(v) {
    if (!v.isConnected || !v.paused || v.ended || v.muted) return;
    if (state.userPaused) return;
    // Firefox stopped it because we turned the sound on without a gesture.
    const resume = v.play();
    if (resume && typeof resume.then === "function") {
      resume.catch(() => {
        state.autoplayBlocked = true;
        state.unmuteWhenPlaying = true; // try again on the next keypress
        v.muted = true;
        const muted = v.play();
        if (muted && typeof muted.catch === "function") muted.catch(() => { /* the user's OK will start it */ });
      });
    }
  }

  // Any handled key is a user gesture, which is the moment an unmute will
  // stick. Cheap to attempt, and does nothing once the sound is already on.
  function unmuteOnGesture() {
    const v = state.video;
    if (!v || state.volumeTouched || Boolean(state.settings.startMuted) || !v.muted) return;
    if (v.paused || v.ended) {
      state.unmuteWhenPlaying = true; // nothing to unmute yet; when it plays
      return;
    }
    state.autoplayBlocked = false;
    applyMutePreference(v, true);
  }

  // A click anywhere is a gesture too, and costs nothing to notice.
  function onPointerDown() {
    state.gesture = true;
    unmuteOnGesture();
  }

  // A video you have watched before comes back muted: the site restores its
  // own remembered preference, sometimes well after the metadata has loaded.
  // Hold the setting for a few seconds after the video appears, then stop —
  // anything after that is the user's doing and is left alone, as is anything
  // they do on the transport row.
  function onVolumeChange() {
    const v = state.video;
    if (!v) return;
    // Re-apply while the site is still setting up (it restores a remembered
    // mute for a video you have seen before), but never while Firefox has
    // shown us it will stop playback for it.
    if (!state.volumeTouched && !state.autoplayBlocked && Date.now() < state.enforceMuteUntil) applyMutePreference(v, true);
    report();
  }

  function attach(v) {
    if (state.video === v) return;
    if (state.video) detach(state.video);
    state.video = v;
    state.enforceMuteUntil = Date.now() + MUTE_ENFORCE_MS;
    applyMutePreference(v);
    v.addEventListener("play", onPlay);
    v.addEventListener("playing", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("loadedmetadata", onLoadedMetadata);
    v.addEventListener("volumechange", onVolumeChange);
    v.addEventListener("durationchange", report);
    v.addEventListener("ended", onEnded);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("seeked", onSeeked);
    state.lastSave = Date.now();
    prepareResume(v);
    report();
  }

  function detach(v) {
    v.removeEventListener("play", onPlay);
    v.removeEventListener("playing", onPlay);
    v.removeEventListener("pause", onPause);
    v.removeEventListener("loadedmetadata", onLoadedMetadata);
    v.removeEventListener("volumechange", onVolumeChange);
    v.removeEventListener("durationchange", report);
    v.removeEventListener("ended", onEnded);
    v.removeEventListener("timeupdate", onTimeUpdate);
    v.removeEventListener("seeked", onSeeked);
    if (state.video === v) state.video = null;
  }

  function checkUpNext() {
    const showing = offerShowing();
    if (showing === state.upNextShowing) return;
    state.upNextShowing = showing;
    report();
  }

  function findVideo() {
    if (state.video && state.video.isConnected) return;
    if (state.video) detach(state.video);
    const v = qs(state.rules.video || "video");
    if (v) attach(v);
  }

  function onMessage(msg, _sender, sendResponse) {
    if (!msg || typeof msg.type !== "string") {
      sendResponse({ ok: false, error: "Invalid message" });
      return false;
    }
    switch (msg.type) {
      case "player:settings":
        sendResponse({ ok: state.settings.enabled ? openSettingsPanel() : false, state: currentState() });
        return false;
      case "player:back":
        // The page's guard caught the remote's back button. Whatever the row or
        // the panel can close, it closes; otherwise the page acts on it.
        sendResponse({ ok: true, consumed: state.settings.enabled ? backLayer() : false, state: currentState() });
        return false;
      case "player:command":
        sendResponse(execute(msg.cmd, msg.by));
        return false;
      case "player:focus":
        sendResponse({ ok: focusPlayer(), state: currentState() });
        return false;
      case "player:offer":
        state.offerFromPage = Boolean(msg.showing);
        sendResponse({ ok: true, state: currentState() });
        return false;
      default:
        sendResponse({ ok: false, error: "Unknown message" });
        return false;
    }
  }

  async function hello() {
    const d = ottData();
    const r = await send({
      type: "player:hello",
      videoId: d && d.video ? d.video.id : null,
      title: d && d.video ? d.video.title : document.title || "",
      duration: d && d.video ? d.video.duration : 0,
      hasVideo: Boolean(state.video)
    });
    state.registered = Boolean(r && r.ok);
    if (!state.registered) console.warn(LOG, "player frame could not register:", r && r.error);
  }

  async function init() {
    const [settings, rulesReply] = await Promise.all([Settings.load(API), send({ type: "rules:get" })]);
    state.settings = settings;
    const player = rulesReply && rulesReply.ok && rulesReply.rules && rulesReply.rules.player;
    if (player && typeof player === "object") state.rules = Object.assign({}, DEFAULT_RULES, player);
    Settings.watch(API, (s) => {
      const was = state.settings.enabled;
      const prevOwn = ownChrome();
      state.settings = s;
      if (prevOwn !== ownChrome()) {
        // Swapping between our chrome and the player's takes effect at once.
        if (ownChrome()) tidyControls();
        else {
          leaveTransport();
          clearStamps();
        }
      }
      if (state.ring) state.ring.setStyle(ringStyle(s));
      if (state.bar) {
        state.bar.setStyle(s);
        state.bar.refresh();
      }
      if (s.enabled !== was) applyEnabled(s.enabled);
    });
    API.runtime.onMessage.addListener(onMessage);
    window.addEventListener("keydown", onKeyDown, true);
    // The remote's menu button arrives as a ContextMenu key here too; without
    // this, Firefox's own menu would open over the video.
    window.addEventListener("contextmenu", onContextMenu, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    // No message on pagehide: a query from a context that is being destroyed
    // is what logs "Actor 'Conduits' destroyed before query 'RuntimeMessage'
    // was resolved" in the parent process. The registry heals itself — the
    // background drops a frame id the first time a relay to it fails, and
    // clears the tab's entry on tabs.onRemoved.
    window.addEventListener("pagehide", () => {
      state.leaving = true;
      leaveTransport();
    });
    // Back to a page Firefox kept in memory: this frame is live again.
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) state.leaving = false;
    });
    // If focus leaves this frame for any reason the row is no longer being
    // driven, and the player's bar must be allowed to hide itself again.
    // Losing the focus is also the moment to note where the video is: the
    // first Back on a video takes the focus to the page, and nothing can be
    // sent once the page is going away.
    window.addEventListener("blur", () => {
      if (state.transport) leaveTransport();
      saveProgress(false);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveProgress(false);
    });
    applyEnabled(settings.enabled);
    state.observer = new MutationObserver(() => {
      if (state.mutationTimer) return;
      state.mutationTimer = setTimeout(() => {
        state.mutationTimer = 0;
        if (!state.settings.enabled) return;
        findVideo();
        tidyControls();
        checkUpNext();
      }, MUTATION_DEBOUNCE_MS);
    });
    state.observer.observe(root, { childList: true, subtree: true });
    await hello();
  }

  init().catch((err) => console.error(LOG, "player script failed to start:", err));
})();
