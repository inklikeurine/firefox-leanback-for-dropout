// Leanback for Dropout — keys to actions. Site-agnostic and pure.
//
// THE RULE: only what a TV remote's face sends is mapped. No keyboard
// shortcuts, with exactly one noted exception — "/" opens the search field,
// because searching needs typing anyway. Arrow keys are for navigation and
// nothing else; no feature is ever reachable only by pressing a letter.
//
// The remote's face, and what each button arrives as:
//
//   ▲ ▼ ◀ ▶   Arrow*            navigation (in the player: ◀ ▶ move the
//                               playhead, ▼ leaves the player for the page)
//   OK        Enter             select
//   back      BrowserBack       back   (Escape too: many remotes send it)
//   menu      ContextMenu       menu   — opens the settings: the playback
//                               panel during playback, Leanback's elsewhere
//   home      BrowserHome       RESERVED — never mapped; the shell owns it
//   volume    AudioVolume*      never intercepted; the desktop owns it
//
// Media keys are kept for remotes that have them (many air mice do not). They are
// remote-class keys, not keyboard shortcuts.
//
// Taught buttons (Accessibility → Remote Buttons, settings.buttons) add to
// this: a button the viewer taught Leanback does its job. Only buttons that
// don't type can be taught, never the browser's or the system's, and never
// one the remote's face already uses, so the rule above still holds and a
// taught button can never take a job away.

(function () {
  const REMOTE = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    Enter: "select",
    Escape: "back",
    BrowserBack: "back",
    ContextMenu: "menu",
    BrowserSearch: "search",
    MediaPlayPause: "play_pause",
    MediaPlay: "play_pause",
    MediaPause: "play_pause",
    MediaStop: "stop",
    MediaTrackNext: "next",
    MediaTrackPrevious: "previous",
    MediaFastForward: "fast_forward",
    MediaRewind: "rewind"
  };

  // The one documented keyboard exception. Search needs a keyboard from the
  // moment it opens, so reaching it with one is no extra burden.
  const KEYBOARD_EXCEPTIONS = { "/": "search" };

  // Taught buttons: never these (the system's, or no button at all).
  const RESERVED = new Set(["BrowserHome", "AudioVolumeUp", "AudioVolumeDown", "AudioVolumeMute", "Power", "PowerOff", "Standby", "WakeUp", "Dead", "Process"]);
  const MODIFIERS = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "OS", "Super", "Hyper", "Fn", "FnLock", "CapsLock", "NumLock", "ScrollLock", "Symbol", "SymbolLock"]);
  const TYPING = new Set(["Backspace", "Delete", "Tab", "Insert"]);
  // Friendlier words for some remote keys.
  const NAMES = {
    ColorF0Red: "Red", ColorF1Green: "Green", ColorF2Yellow: "Yellow", ColorF3Blue: "Blue",
    ChannelUp: "Channel +", ChannelDown: "Channel −", Info: "Info", Guide: "Guide",
    Subtitle: "Subtitles", ClosedCaptionToggle: "CC", Favorites: "Favourites"
  };

  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  /** How a button is stored when taught: its key, or its code when the key is unknown. */
  function keyId(event) {
    if (!event) return null;
    if (typeof event.key === "string" && event.key && event.key !== "Unidentified") return event.key;
    return typeof event.code === "string" && event.code ? `code:${event.code}` : null;
  }

  /** A taught button's name, as the viewer sees it. */
  function keyName(id) {
    const s = String(id || "");
    if (s.startsWith("code:")) return s.slice(5);
    return own(NAMES, s) ? NAMES[s] : s;
  }

  /**
   * Can this key press be taught? {ok: true, id, name}, or {ok: false,
   * reason: "modifier" | "typing" | "system" | "builtin" | "taught" | "unknown",
   * action?} (the job it already does, for builtin and taught).
   */
  function learnable(event, learned) {
    const id = keyId(event);
    if (!id) return { ok: false, reason: "unknown" };
    const key = String(event.key || "");
    if (MODIFIERS.has(key) || event.ctrlKey || event.altKey || event.metaKey) return { ok: false, reason: "modifier" };
    if (key.length === 1 || TYPING.has(key)) return { ok: false, reason: "typing" };
    if (RESERVED.has(key)) return { ok: false, reason: "system" };
    if (own(REMOTE, key)) return { ok: false, reason: "builtin", action: REMOTE[key] };
    if (learned && own(learned, id)) return { ok: false, reason: "taught", action: learned[id] };
    return { ok: true, id, name: keyName(id) };
  }

  /**
   * @param {KeyboardEvent|{key:string,ctrlKey?:boolean,altKey?:boolean,metaKey?:boolean}} event
   * @param {{editable?: boolean, atStart?: boolean, singleLine?: boolean}} ctx —
   *   atStart: the text cursor sits at the very start of the field, with
   *   nothing selected; singleLine: a one-line field (a search box), where ▼
   *   and ▲ have nothing to do
   * @param {object} [learned] taught buttons, { "<key>": "<action>" }
   * @returns {string|null} action name, or null when the key is not ours
   */
  function actionFor(event, ctx, learned) {
    if (!event || typeof event.key !== "string") return null;
    if (event.ctrlKey || event.altKey || event.metaKey) return null;
    const key = event.key;
    if (ctx && ctx.editable) {
      // Typing: the back button leaves the field, and so does ◀ when the
      // cursor cannot go further left, and ▼ or ▲ from a one-line field
      // (there is no line below or above to go to). Everything else is the
      // field's, including "/".
      if (key === "Escape" || key === "BrowserBack") return "back";
      if (key === "ArrowDown" && ctx.singleLine) return "down";
      if (key === "ArrowUp" && ctx.singleLine) return "up";
      return key === "ArrowLeft" && ctx.atStart ? "left" : null;
    }
    if (Object.prototype.hasOwnProperty.call(REMOTE, key)) return REMOTE[key];
    if (Object.prototype.hasOwnProperty.call(KEYBOARD_EXCEPTIONS, key)) return KEYBOARD_EXCEPTIONS[key];
    if (learned && typeof learned === "object" && key.length !== 1) {
      const id = keyId(event);
      if (id && own(learned, id)) return learned[id];
    }
    return null;
  }

  // Actions the page hands to the player frame rather than acting on itself.
  const PLAYER_ACTIONS = new Set([
    "play_pause", "stop", "next", "previous", "fast_forward", "rewind", "seek_forward", "seek_back", "captions"
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

  // True for a one-line text field: an <input>, not a textarea or editable text.
  function isSingleLine(el) {
    return isEditable(el) && el.tagName === "INPUT";
  }

  // True when the text cursor is at the very start of a field and nothing is
  // selected: the one place ◀ has nothing left to do inside it.
  function caretAtStart(el) {
    try {
      return Boolean(el) && el.selectionStart === 0 && el.selectionEnd === 0;
    } catch (_err) {
      return false; // a field type without a text cursor
    }
  }

  globalThis.TenfootKeymap = Object.freeze({ actionFor, isEditable, isSingleLine, caretAtStart, keyId, keyName, learnable, PLAYER_ACTIONS, REMOTE, KEYBOARD_EXCEPTIONS });
})();
