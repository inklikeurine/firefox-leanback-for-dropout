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

    // The layout a box gets, or null for a box Leanback does not open the
    // keyboard for.
    function layoutFor(el) {
      if (!el || el.tagName !== "INPUT") return null;
      const sign = P.signinLayoutFor(el);
      if (sign) return sign;
      if (state.screen && el.classList.contains("tenfoot-screen-field-input")) return "text";
      return null;
    }

    // What Enter in the box does, for Done: sign-in's Email goes on to
    // Password and its Password (and the reset's Email) press the button; the
    // search box leaves for the results.
    function enterIn(box) {
      if (P.inSignin(box)) return P.signinEnter(box);
      if (state.screen && state.screen.contains(box)) return P.leaveFieldBelow();
      return false;
    }

    function openFor(box) {
      const layout = layoutFor(box);
      if (!layout || !state.keyboard || state.keyboard.isOpen) return false;
      root.setAttribute("data-tenfoot-keyboard", "on");
      state.keyboard.open(box, { layout }).then((answer) => {
        root.removeAttribute("data-tenfoot-keyboard");
        state.typedBox = null;
        if (answer === "done") enterIn(box);
      });
      return true;
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

    Object.assign(P, { onBoxKey, onClick, onSelect });
  }

  globalThis.TenfootPageKeyboard = Object.freeze({ install });
})();
