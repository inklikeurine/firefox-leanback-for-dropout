/* global browser, chrome */
// 10-Foot Dropout — player script, every frame on embed.vhx.tv.
// The Dropout player is a cross-origin iframe wrapping Vimeo's runtime, so
// keys pressed while it has focus arrive here, not on the page. This script
// registers with the background (player:hello), finds the <video>, handles
// keys while the frame has focus, executes player:command messages and
// reports state changes back to the page through the background relay.
// Idempotent: html[data-tenfoot-player] marks a document already wired.

(function () {
  const API = typeof browser !== "undefined" ? browser : chrome;
  const LOG = "[10-foot-dropout]";
  const MARK = "tenfootPlayer";
  const MUTATION_DEBOUNCE_MS = 100;
  const DEFAULT_RULES = { video: "video", captionsButton: "button[aria-label*='aption'], button[aria-label*='ubtitle']" };

  const root = document.documentElement;
  if (!root || root.dataset[MARK]) return;
  root.dataset[MARK] = "on";

  const Settings = globalThis.TenfootSettings;
  const Keymap = globalThis.TenfootKeymap;

  const state = {
    settings: Settings.normalize(null),
    rules: DEFAULT_RULES,
    video: null,
    observer: null,
    mutationTimer: 0,
    registered: false
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
          url: typeof v.url === "string" ? v.url : null
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
        if (v.paused) play(v);
        else v.pause();
        break;
      case "play":
        if (!v) return noVideo();
        play(v);
        break;
      case "pause":
        if (!v) return noVideo();
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
    switch (action) {
      case "select":
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
        send({ type: "page:focus", hint: "below" });
        return true;
      case "back":
        send({ type: "page:focus", hint: "back" });
        return true;
      case "next":
      case "channel_down":
        send({ type: "page:episode", delta: 1 });
        return true;
      case "previous":
      case "channel_up":
        send({ type: "page:episode", delta: -1 });
        return true;
      case "info":
        send({ type: "page:info", state: currentState() });
        return true;
      case "home":
      case "search":
      case "menu":
        send({ type: "page:action", action });
        return true;
      case "up":
        return true; // reserved; absorbed so the frame does not scroll
      default:
        return false;
    }
  }

  function onKeyDown(e) {
    if (!state.settings.enabled) return;
    const action = Keymap.actionFor(e, { inPlayer: true, editable: Keymap.isEditable(e.target) });
    if (!action) return;
    if (!dispatch(action)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function focusPlayer() {
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

  function report() {
    send({ type: "player:state", state: currentState() });
  }

  function onEnded() {
    const d = ottData();
    send({ type: "player:ended", upNext: d ? d.upNext : null });
    report();
  }

  function attach(v) {
    if (state.video === v) return;
    if (state.video) detach(state.video);
    state.video = v;
    v.addEventListener("play", report);
    v.addEventListener("pause", report);
    v.addEventListener("loadedmetadata", report);
    v.addEventListener("durationchange", report);
    v.addEventListener("ended", onEnded);
    report();
  }

  function detach(v) {
    v.removeEventListener("play", report);
    v.removeEventListener("pause", report);
    v.removeEventListener("loadedmetadata", report);
    v.removeEventListener("durationchange", report);
    v.removeEventListener("ended", onEnded);
    if (state.video === v) state.video = null;
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
      case "player:command":
        sendResponse(execute(msg.cmd, msg.by));
        return false;
      case "player:focus":
        sendResponse({ ok: focusPlayer(), state: currentState() });
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
    Settings.watch(API, (s) => { state.settings = s; });
    API.runtime.onMessage.addListener(onMessage);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pagehide", () => { send({ type: "player:bye" }); });
    findVideo();
    state.observer = new MutationObserver(() => {
      if (state.mutationTimer) return;
      state.mutationTimer = setTimeout(() => {
        state.mutationTimer = 0;
        findVideo();
      }, MUTATION_DEBOUNCE_MS);
    });
    state.observer.observe(root, { childList: true, subtree: true });
    await hello();
  }

  init().catch((err) => console.error(LOG, "player script failed to start:", err));
})();
