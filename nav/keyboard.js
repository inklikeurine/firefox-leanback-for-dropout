// Leanback for Dropout — the on-screen keyboard: a panel along the bottom of
// the screen, over the box being typed in, which stays visible above it.
// The page script routes keys to it while it is open (as for a question,
// nav/ask.js): ◀ ▶ ▲ ▼ move the selection between keys, OK types the key,
// Back (Escape) closes it without an answer. Held keys repeat as the
// browser repeats them; the page script already slows held moves.
//
// Pages: letters (QWERTY, with Shift), then digits and symbols. A layout says
// what the bottom row holds: "text" (comma, Space, full stop), "email" (@, a
// full stop, .com), "password" (Space and a Show / Hide key that turns the box
// between hidden and readable), or "digits" (a number pad, for a PIN).
//
// Typing goes into any <input> at the cursor, with beforeinput and input
// events, so a box that mirrors into the site's own (search) keeps working.
// Some boxes (type=email) have no cursor to read, so the keyboard keeps its
// own cursor, taken from the box when it has one, and shows the text with it
// on the panel's top line.

(function () {
  const UNIT = 2; // a letter key is two units wide
  const LETTERS = [
    "q w e r t y u i o p".split(" "),
    "a s d f g h j k l".split(" "),
    "z x c v b n m".split(" ")
  ];
  const SYMBOLS = [
    "1 2 3 4 5 6 7 8 9 0".split(" "),
    ["-", "/", ":", ";", "(", ")", "$", "&", "@", "\""],
    [".", ",", "?", "!", "'", "_", "#", "%"]
  ];
  const ICONS = {
    shift: "M12 19V6M6 12l6-6 6 6",
    backspace: "M21 5H9l-6 7 6 7h12z M12 9.5l5 5 M17 9.5l-5 5",
    left: "M15 5l-7 7 7 7",
    right: "M9 5l7 7-7 7"
  };

  const key = (id, label, w, extra) => Object.assign({ id, label, w }, extra);
  const ch = (c) => key(`c:${c}`, c, UNIT, { kind: "char", value: c });

  // The rows of one page for a layout, as [{id, label, w, kind, value?}].
  function rowsFor(layout, page) {
    if (layout === "digits") {
      const pad = (c) => key(`c:${c}`, c, 3, { kind: "char", value: c });
      return [
        ["1", "2", "3"].map(pad),
        ["4", "5", "6"].map(pad),
        ["7", "8", "9"].map(pad),
        [key("backspace", "", 3, { kind: "backspace", icon: "backspace", aria: "Backspace" }), pad("0"), key("done", "Done", 3, { kind: "done" })]
      ];
    }
    const symbols = page === "symbols";
    const base = symbols ? SYMBOLS : LETTERS;
    const rows = base.map((r) => r.map(ch));
    const back = key("backspace", "", symbols ? 4 : 3, { kind: "backspace", icon: "backspace", aria: "Backspace" });
    if (symbols) rows[2].push(back);
    else rows[2] = [key("shift", "", 3, { kind: "shift", icon: "shift", aria: "Shift" }), ...rows[2], back];
    const pageKey = key("page", symbols ? "abc" : "123", 3, { kind: "page", aria: symbols ? "Letters" : "Digits and symbols" });
    const left = key("left", "", UNIT, { kind: "left", icon: "left", aria: "Cursor left" });
    const right = key("right", "", UNIT, { kind: "right", icon: "right", aria: "Cursor right" });
    const done = key("done", "Done", 3, { kind: "done" });
    let bottom;
    if (layout === "email") {
      bottom = [pageKey, ch("@"), ch("."), key("c:.com", ".com", 4, { kind: "char", value: ".com" }), left, right, done];
    } else if (layout === "password") {
      bottom = [pageKey, key("space", "space", 6, { kind: "char", value: " ", aria: "Space" }), key("show", "Show", 4, { kind: "show" }), left, right, done];
    } else {
      bottom = [pageKey, ch(","), key("space", "space", 6, { kind: "char", value: " ", aria: "Space" }), ch("."), left, right, done];
    }
    return [...rows, bottom];
  }

  /**
   * @param {Document} doc
   * @param {{onFocus?: (el: Element) => void}} [opts] — told of each key as it
   *   is selected (for the ring)
   */
  function createKeyboard(doc, opts) {
    const o = opts || {};
    const Common = globalThis.TenfootCommon;
    const win = doc.defaultView || globalThis;
    const el = (tag, cls) => Common.el(doc, tag, cls);

    const layer = el("div", "tenfoot-kb");
    layer.hidden = true;
    layer.setAttribute("role", "dialog");
    layer.setAttribute("aria-label", "Keyboard");
    const panel = el("div", "tenfoot-kb-panel");
    const preview = el("div", "tenfoot-kb-preview");
    preview.setAttribute("aria-hidden", "true");
    const grid = el("div", "tenfoot-kb-keys");
    panel.append(preview, grid);
    layer.appendChild(panel);
    (doc.documentElement || doc.body).appendChild(layer);

    let input = null;
    let layout = "text";
    let page = "letters";
    let shifted = false;
    let caret = 0;
    let shown = false; // a password box turned readable
    let origType = "";
    let settle = null;
    let rows = []; // [{keys: [{spec, el}], }]
    let at = { r: 0, i: 0 };
    let column = null; // the x the selection keeps on ▲ ▼ across rows

    // ----- the text ----------------------------------------------------------

    function value() {
      return input ? String(input.value || "") : "";
    }

    // The cursor: the box's own when it has one, else the keyboard's.
    function syncCaret() {
      let c = null;
      try {
        c = input.selectionStart;
      } catch (_err) { /* a type with no cursor */ }
      if (typeof c === "number") caret = c;
      caret = Math.max(0, Math.min(value().length, caret));
    }

    function placeCaret() {
      try {
        input.setSelectionRange(caret, caret);
      } catch (_err) { /* a type with no cursor */ }
    }

    function fire(type, data, inputType, cancelable) {
      const Ev = win.InputEvent || win.Event;
      return input.dispatchEvent(new Ev(type, { bubbles: true, cancelable, data, inputType }));
    }

    function setValue(v) {
      try {
        const desc = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value");
        if (desc && desc.set) desc.set.call(input, v);
        else input.value = v;
      } catch (_err) {
        input.value = v;
      }
    }

    // `text` at the cursor, or the character before it taken out: with
    // beforeinput first (a page may cancel it), then the value, then input.
    function edit(text, remove) {
      if (!input || !input.isConnected) return;
      syncCaret();
      const v = value();
      if (remove) {
        if (caret <= 0) return;
        if (!fire("beforeinput", null, "deleteContentBackward", true)) return;
        setValue(v.slice(0, caret - 1) + v.slice(caret));
        caret -= 1;
        placeCaret();
        fire("input", null, "deleteContentBackward", false);
      } else {
        if (!fire("beforeinput", text, "insertText", true)) return;
        setValue(v.slice(0, caret) + text + v.slice(caret));
        caret += text.length;
        placeCaret();
        fire("input", text, "insertText", false);
      }
      afterEdit();
    }

    // A text box starts a name with a capital, and after a space; Shift is
    // for the rest. A letter typed puts Shift back.
    function afterEdit() {
      syncCaret();
      shifted = layout === "text" && (caret === 0 || /\s/.test(value()[caret - 1] || ""));
      refreshKeys();
    }

    function moveCaret(d) {
      syncCaret();
      caret = Math.max(0, Math.min(value().length, caret + d));
      placeCaret();
      refreshKeys();
    }

    function toggleShow() {
      if (!input) return;
      shown = !shown;
      try {
        input.type = shown ? "text" : origType || "password";
      } catch (_err) { /* the box keeps its type */ }
      refreshKeys();
    }

    // ----- drawing -----------------------------------------------------------

    function labelOf(spec) {
      if (spec.kind === "char" && spec.id.startsWith("c:") && /^[a-z]$/.test(spec.value)) return shifted ? spec.value.toUpperCase() : spec.value;
      if (spec.kind === "show") return shown ? "Hide" : "Show";
      return spec.label;
    }

    function refreshKeys() {
      for (const row of rows) {
        for (const k of row.keys) {
          const text = labelOf(k.spec);
          if (!k.spec.icon && k.el.textContent !== text) k.el.textContent = text;
          if (k.spec.kind === "shift") k.el.setAttribute("aria-pressed", shifted ? "true" : "false");
        }
      }
      const v = value();
      const masked = layout === "password" && !shown ? "•".repeat(v.length) : v;
      const c = Math.max(0, Math.min(masked.length, caret));
      preview.textContent = "";
      const before = el("span", "tenfoot-kb-text");
      before.textContent = masked.slice(0, c);
      const bar = el("span", "tenfoot-kb-caret");
      const after = el("span", "tenfoot-kb-text");
      after.textContent = masked.slice(c);
      preview.append(before, bar, after);
    }

    function draw() {
      grid.textContent = "";
      rows = rowsFor(layout, page).map((specs, r) => {
        const row = el("div", "tenfoot-kb-row");
        let x = 0;
        const keys = specs.map((spec) => {
          const b = el("button", `tenfoot-kb-key tenfoot-kb-key--${spec.kind}`);
          b.type = "button";
          b.dataset.tenfootKey = spec.id;
          b.style.setProperty("--tf-kb-w", String(spec.w));
          if (spec.aria) b.setAttribute("aria-label", spec.aria);
          if (spec.icon) b.appendChild(Common.svgIcon(doc, ICONS[spec.icon], { strokeWidth: 2.5 }));
          b.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            at = { r, i: keys.findIndex((k) => k.el === b) };
            column = null;
            press(spec);
          });
          row.appendChild(b);
          const k = { spec, el: b, x: x + spec.w / 2 };
          x += spec.w;
          return k;
        });
        grid.appendChild(row);
        return { keys, width: x };
      });
      refreshKeys();
    }

    // ----- the selection -----------------------------------------------------

    // The key's centre, counted from the middle of its row, so rows of
    // different lengths line up as they are drawn (centred).
    function centre(r, i) {
      const row = rows[r];
      return row.keys[i].x - row.width / 2;
    }

    function focusAt(r, i, keepColumn) {
      r = Math.max(0, Math.min(rows.length - 1, r));
      const row = rows[r];
      if (!row || !row.keys.length) return;
      i = Math.max(0, Math.min(row.keys.length - 1, i));
      at = { r, i };
      if (!keepColumn) column = centre(r, i);
      const b = row.keys[i].el;
      try {
        b.focus({ preventScroll: true });
      } catch (_err) { /* the ring still marks it */ }
      if (typeof o.onFocus === "function") o.onFocus(b);
    }

    function nearest(r) {
      const row = rows[r];
      let best = 0;
      for (let i = 1; i < row.keys.length; i += 1) {
        if (Math.abs(centre(r, i) - column) < Math.abs(centre(r, best) - column)) best = i;
      }
      return best;
    }

    // ◀ ▶ go along the row and round its ends; ▲ ▼ go to the key nearest
    // the same place in the next row and stop at the top and the bottom.
    function move(action) {
      const row = rows[at.r];
      const n = row.keys.length;
      if (action === "left") focusAt(at.r, (at.i - 1 + n) % n);
      else if (action === "right") focusAt(at.r, (at.i + 1) % n);
      else {
        const r = at.r + (action === "down" ? 1 : -1);
        if (r < 0 || r >= rows.length) return;
        if (column === null) column = centre(at.r, at.i);
        focusAt(r, nearest(r), true);
      }
    }

    // ----- pressing keys -----------------------------------------------------

    function press(spec) {
      switch (spec.kind) {
        case "char":
          edit(shifted && /^[a-z]$/.test(spec.value) ? spec.value.toUpperCase() : spec.value, false);
          break;
        case "backspace":
          edit("", true);
          break;
        case "shift":
          shifted = !shifted;
          refreshKeys();
          break;
        case "page": {
          const was = rows[at.r].keys[at.i].spec.id;
          page = page === "letters" ? "symbols" : "letters";
          draw();
          const r = rows.findIndex((row) => row.keys.some((k) => k.spec.id === was));
          const i = r >= 0 ? rows[r].keys.findIndex((k) => k.spec.id === was) : 0;
          focusAt(r >= 0 ? r : rows.length - 1, i);
          break;
        }
        case "left":
          moveCaret(-1);
          break;
        case "right":
          moveCaret(1);
          break;
        case "show":
          toggleShow();
          break;
        case "done":
          finish("done");
          break;
        default:
          break;
      }
    }

    // ----- opening and closing -----------------------------------------------

    function finish(answer) {
      if (layer.hidden) return;
      layer.hidden = true;
      if (input && shown) {
        try {
          input.type = origType || "password";
        } catch (_err) { /* nothing to put back */ }
      }
      const done = settle;
      const box = input;
      settle = null;
      input = null;
      shown = false;
      if (done) done(answer);
      // The selection goes back to the box.
      if (box && box.isConnected) {
        try {
          box.focus({ preventScroll: true });
        } catch (_err) { /* the page puts it back */ }
      }
    }

    /**
     * Open for a box. Resolves with "done" when Done is pressed, or null when
     * it is closed otherwise (Back, or another box taking it over).
     * @param {HTMLInputElement} box
     * @param {{layout?: "text"|"email"|"password"|"digits", page?: "letters"|"symbols"}} [how]
     * @returns {Promise<"done"|null>}
     */
    function open(box, how) {
      finish(null);
      const h = how || {};
      input = box;
      layout = ["text", "email", "password", "digits"].includes(h.layout) ? h.layout : "text";
      page = h.page === "symbols" ? "symbols" : "letters";
      origType = box && box.type ? box.type : "";
      shown = false;
      caret = value().length;
      syncCaret();
      shifted = layout === "text" && (caret === 0 || /\s/.test(value()[caret - 1] || ""));
      column = null;
      draw();
      layer.hidden = false;
      const answer = new Promise((resolve) => { settle = resolve; });
      // The selection starts on the first letter (a digit, on the number pad).
      focusAt(0, 0);
      return answer;
    }

    /** A key, while open: true when it was the keyboard's. */
    function keyDown(action) {
      if (layer.hidden) return false;
      switch (action) {
        case "left":
        case "right":
        case "up":
        case "down":
          move(action);
          return true;
        case "select": {
          const k = rows[at.r] && rows[at.r].keys[at.i];
          if (k) press(k.spec);
          return true;
        }
        case "back":
          finish(null);
          return true;
        default:
          return true; // nothing else gets past an open keyboard
      }
    }

    return Object.freeze({
      open,
      key: keyDown,
      close: () => finish(null),
      refocus: () => focusAt(at.r, at.i, true),
      contains: (n) => Boolean(n) && layer.contains(n),
      get isOpen() { return !layer.hidden; },
      get current() { return layer.hidden || !rows[at.r] ? null : rows[at.r].keys[at.i].el; },
      get state() { return { layout, page, shifted, caret, shown, key: rows[at.r] ? rows[at.r].keys[at.i].spec.id : null }; },
      element: layer
    });
  }

  globalThis.TenfootKeyboard = Object.freeze({ createKeyboard });
})();
