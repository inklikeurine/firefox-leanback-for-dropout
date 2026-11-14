// Leanback for Dropout — opening the on-screen keyboard (nav/keyboard.js),
// for content/page.js. OK on a text box Leanback draws opens it: the sign-in
// and reset boxes and the search box. Typing on a real keyboard (or a phone's
// keyboard app) goes straight into the box without it, and after that Enter
// is the box's own again. Done does what Enter in the box does. Installed
// into the page script's shared context.

(function () {
  function install(P) {
    const { state } = P;
    const root = document.documentElement;
    const { qs, qsa } = globalThis.TenfootCommon;

    // A PIN-locked profile's PIN screen is Dropout's own form inside the
    // picker app, which Leanback steps aside for: its digit boxes
    // (rules → screen.profiles.pin), in page order, or none.
    function pinRules() {
      const profiles = state.rules && state.rules.screen && state.rules.screen.profiles;
      return (profiles && profiles.pin) || {};
    }

    function pinBoxes() {
      if (state.kind !== "profiles" || state.screen) return [];
      return qsa(pinRules().boxes).filter((b) => b.tagName === "INPUT" && !b.disabled && b.type !== "hidden");
    }

    // A box Leanback's keyboard types into. The system's own on-screen
    // keyboard (a TV's, such as Plasma's) would open over it as soon as it is
    // selected: Firefox is told the box takes no typing through the system
    // (content/keyboard.css, ime-mode), and inputmode="none" says the same to
    // any keyboard that reads it. A real keyboard still types. Dropout's own
    // PIN boxes are marked as they appear.
    function keyboardBox(input) {
      if (!input || input.hasAttribute("data-tenfoot-kb-box")) return;
      input.setAttribute("data-tenfoot-kb-box", "");
      input.setAttribute("inputmode", "none");
    }

    function markPinBoxes() {
      for (const b of pinBoxes()) keyboardBox(b);
    }

    // The layout a box gets, or null for a box Leanback does not open the
    // keyboard for.
    function layoutFor(el) {
      if (!el || el.tagName !== "INPUT") return null;
      const sign = P.signinLayoutFor(el);
      if (sign) return sign;
      if (pinBoxes().includes(el)) return "digits";
      if (state.screen && el.classList.contains("tenfoot-screen-field-input")) return "text";
      return null;
    }

    // What Enter in the box does, for Done: sign-in's Email goes on to
    // Password and its Password (and the reset's Email) press the button; the
    // search box leaves for the results.
    function enterIn(box) {
      if (P.inSignin(box)) return P.signinEnter(box);
      // A PIN: Dropout's own button, when it has one (it may go on by itself
      // once the last digit is in).
      if (pinBoxes().length) {
        const go = qs(pinRules().submit);
        if (go && !go.disabled) go.click();
        return true;
      }
      if (state.screen && state.screen.contains(box)) return P.leaveFieldBelow();
      return false;
    }

    function openFor(box) {
      const layout = layoutFor(box);
      if (!layout || !state.keyboard || state.keyboard.isOpen) return false;
      root.setAttribute("data-tenfoot-keyboard", "on");
      const boxes = layout === "digits" ? pinBoxes() : null;
      const answered = state.keyboard.open(box, { layout, boxes });
      answered.then((answer) => {
        root.removeAttribute("data-tenfoot-keyboard");
        state.typedBox = null;
        if (answer === "done") enterIn(box);
      });
      return true;
    }

    // The search page's keyboard: up as soon as the page is, with the search
    // box on it and the selection on its keys. The box on the screen stays
    // hidden, only what the keyboard types into.
    function dockKeyboard() {
      if (!state.keyboard || !state.screen || state.keyboard.isDocked) return false;
      const box = qs(".tenfoot-screen-field-input", state.screen.element);
      if (!box) return false;
      root.setAttribute("data-tenfoot-keyboard", "on");
      root.setAttribute("data-tenfoot-keyboard-docked", "on");
      state.pendingInitialFocus = 0;
      state.keyboard.open(box, { layout: "text", docked: true }).then(() => {
        root.removeAttribute("data-tenfoot-keyboard");
        root.removeAttribute("data-tenfoot-keyboard-docked");
      });
      return true;
    }

    function undockKeyboard() {
      if (state.keyboard && state.keyboard.isDocked) state.keyboard.close();
    }

    // Out to the results: the first when asked (Done), else where the selection
    // last was. Nothing to go to: it stays.
    function toResults(first) {
      const s = state.screen;
      if (!s) return false;
      state.keyboard.leave();
      const target = first || !s.started ? s.initialTarget() : s.current || s.initialTarget();
      if (!target) {
        state.keyboard.enter();
        return false;
      }
      P.focusEl(target, { scroll: false });
      return true;
    }

    // ◀ and ▶ past the docked keyboard's edges: the rail, the results.
    function keyboardEdge(dir) {
      if (dir === "right") return toResults(false);
      state.keyboard.leave();
      if (P.enterRail()) return true;
      state.keyboard.enter();
      return false;
    }

    // The selection is back on the docked keyboard: not on the rail any more.
    function keyboardEntered() {
      state.railActive = false;
      state.railReturn = null;
    }

    // A key in a text box, before the page script's own handling. Typing
    // marks the box as typed in (from then on Enter is its own); OK on one not
    // typed in opens the keyboard. True when it was the keyboard's.
    function onBoxKey(e) {
      const box = e.target;
      if (e.ctrlKey || e.altKey || e.metaKey) return false;
      if (e.key === "Enter") {
        if (state.typedBox === box) return false;
        return openFor(box);
      }
      if (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete") state.typedBox = box;
      return false;
    }

    // Text arriving in one of those boxes some other way than its key presses:
    // the system's own on-screen keyboard or input method (it sends the words,
    // not keys), a phone's keyboard app, a paste. The box counts as typed in,
    // as with a real keyboard, so the Enter that follows is the box's own (on
    // Password, Sign in) rather than opening Leanback's keyboard over it. What
    // Leanback's own keyboard types does not count.
    function onBoxInput(e) {
      if (!state.enabled) return;
      if (state.keyboard && (state.keyboard.isOpen || state.keyboard.isDocked)) return;
      if (layoutFor(e.target)) state.typedBox = e.target;
    }

    // A pointer click on one of those boxes (the air mouse has no keyboard).
    // A script's own click has no detail.
    function onClick(e) {
      if (!state.enabled || e.detail <= 0 || (state.keyboard && state.keyboard.isOpen)) return;
      if (!layoutFor(e.target)) return;
      e.preventDefault();
      openFor(e.target);
    }

    // The selection moved on: the next box starts untouched.
    function onSelect(el) {
      if (state.typedBox && state.typedBox !== el) state.typedBox = null;
    }

    Object.assign(P, { keyboardBox, markPinBoxes, onBoxInput, onBoxKey, onClick, onSelect, dockKeyboard, undockKeyboard, toResults, keyboardEdge, keyboardEntered });
  }

  globalThis.TenfootPageKeyboard = Object.freeze({ install });
})();
