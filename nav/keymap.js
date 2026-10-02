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
// Media keys are kept for remotes that have them (the W1 does not). They are
// remote-class keys, not keyboard shortcuts.

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

  /**
   * @param {KeyboardEvent|{key:string,ctrlKey?:boolean,altKey?:boolean,metaKey?:boolean}} event
   * @param {{editable?: boolean, atStart?: boolean}} ctx — atStart: the text
   *   cursor sits at the very start of the field, with nothing selected
   * @returns {string|null} action name, or null when the key is not ours
   */
  function actionFor(event, ctx) {
    if (!event || typeof event.key !== "string") return null;
    if (event.ctrlKey || event.altKey || event.metaKey) return null;
    const key = event.key;
    if (ctx && ctx.editable) {
      // Typing: the back button leaves the field, and so does ◀ when the
      // cursor cannot go further left. Everything else is the field's,
      // including "/".
      if (key === "Escape" || key === "BrowserBack") return "back";
      return key === "ArrowLeft" && ctx.atStart ? "left" : null;
    }
    if (Object.prototype.hasOwnProperty.call(REMOTE, key)) return REMOTE[key];
    if (Object.prototype.hasOwnProperty.call(KEYBOARD_EXCEPTIONS, key)) return KEYBOARD_EXCEPTIONS[key];
    return null;
  }

  // Actions the page hands to the player frame rather than acting on itself.
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

  // True when the text cursor is at the very start of a field and nothing is
  // selected: the one place ◀ has nothing left to do inside it.
  function caretAtStart(el) {
    try {
      return Boolean(el) && el.selectionStart === 0 && el.selectionEnd === 0;
    } catch (_err) {
      return false; // a field type without a text cursor
    }
  }

  globalThis.TenfootKeymap = Object.freeze({ actionFor, isEditable, caretAtStart, PLAYER_ACTIONS, REMOTE, KEYBOARD_EXCEPTIONS });
})();
