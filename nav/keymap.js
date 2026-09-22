// 10-Foot Dropout — keys to actions. Site-agnostic and pure: a keyboard, an
// HID remote and a gamepad-to-key mapper all arrive here as key events and
// leave as one action name (the vocabulary in docs/keymap.md). Each context
// then decides what the action does. Keys not listed are never intercepted.

(function () {
  // Keys that mean the same thing everywhere.
  const GLOBAL = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    Enter: "select",
    Escape: "back",
    BrowserBack: "back",
    ContextMenu: "menu",
    F2: "menu",
    BrowserSearch: "search",
    BrowserHome: "home",
    MediaPlayPause: "play_pause",
    MediaPlay: "play_pause",
    MediaPause: "play_pause",
    MediaStop: "stop",
    MediaTrackNext: "next",
    MediaTrackPrevious: "previous",
    MediaFastForward: "fast_forward",
    MediaRewind: "rewind"
  };

  // Keys that only mean something while the user is not typing in a field.
  const NOT_EDITABLE = {
    Backspace: "back",
    " ": "select",
    i: "info",
    I: "info",
    "/": "search",
    Home: "home",
    PageUp: "channel_up",
    PageDown: "channel_down"
  };

  // Keys that only mean something while the player frame has focus.
  const IN_PLAYER = {
    " ": "play_pause",
    k: "play_pause",
    K: "play_pause",
    n: "next",
    N: "next",
    p: "previous",
    P: "previous",
    PageDown: "next",
    PageUp: "previous",
    l: "fast_forward",
    L: "fast_forward",
    j: "rewind",
    J: "rewind",
    c: "subtitle",
    C: "subtitle",
    s: "subtitle",
    S: "subtitle",
    m: "mute",
    M: "mute"
  };

  /**
   * @param {KeyboardEvent|{key:string,ctrlKey?:boolean,altKey?:boolean,metaKey?:boolean}} event
   * @param {{inPlayer?: boolean, editable?: boolean}} ctx
   * @returns {string|null} action name, or null when the key is not ours
   */
  function actionFor(event, ctx) {
    if (!event || typeof event.key !== "string") return null;
    if (event.ctrlKey || event.altKey || event.metaKey) return null;
    const c = ctx || {};
    const key = event.key;
    if (c.editable) {
      // Typing: only Escape leaves the field. Everything else is the field's.
      return key === "Escape" ? "back" : null;
    }
    if (c.inPlayer && Object.prototype.hasOwnProperty.call(IN_PLAYER, key)) return IN_PLAYER[key];
    if (Object.prototype.hasOwnProperty.call(GLOBAL, key)) return GLOBAL[key];
    if (Object.prototype.hasOwnProperty.call(NOT_EDITABLE, key)) return NOT_EDITABLE[key];
    return null;
  }

  const PLAYER_ACTIONS = new Set([
    "play_pause", "stop", "next", "previous", "fast_forward", "rewind", "subtitle", "mute"
  ]);

  // True for an element the user types into: our keys must not steal from it.
  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
      const t = (el.getAttribute("type") || "text").toLowerCase();
      return !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image"].includes(t);
    }
    if (el.isContentEditable) return true;
    return false;
  }

  globalThis.TenfootKeymap = Object.freeze({ actionFor, isEditable, PLAYER_ACTIONS });
})();
