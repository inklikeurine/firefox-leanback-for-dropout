// Leanback for Dropout — the on-screen keyboard: a panel along the bottom of
// the screen, over the box being typed in, which stays visible above it.
// The page script routes keys to it while it is open (as for a question,
// nav/ask.js): ◀ ▶ ▲ ▼ move the selection between keys, OK types the key, Menu
// takes out the letter before the cursor, Back (Escape) closes it without an
// answer. Held keys repeat as the browser repeats them; the page script
// already slows held moves.
//
// The keys sit on a grid, so ▲ ▼ go straight up and down. Every layout but the
// number pad has a row of digits, then letters (QWERTY) or a page of symbols;
// an action column at the end of every row holds Backspace and Done, so ◀ from
// the left edge reaches them at once. A layout says what else there is: "text"
// (Space), "email" (a row of whole endings, @ and .com, on top), "password"
// (Space and a Show / Hide key that turns the box between hidden and readable),
// or "digits" (a number pad, for a PIN; a PIN's separate digit boxes are given
// as a group, and each digit goes into the next empty one).
//
// Shift has three steps: off, one capital, caps lock.
//
// Typing goes into any <input> at the cursor, with beforeinput and input
// events, so a box that mirrors into the site's own (search) keeps working.
// Some boxes (type=email) have no cursor to read, so the keyboard keeps its
// own cursor, taken from the box when it has one, and shows the text with it
// on the panel's top line.

(function () {
  const LETTERS = {
    text: ["q w e r t y u i o p", "a s d f g h j k l '", "z x c v b n m , ."],
    email: ["q w e r t y u i o p", "a s d f g h j k l .", "z x c v b n m - _"]
  };
  const DIGITS = "1 2 3 4 5 6 7 8 9 0";
  const SYMBOLS = ["- / : ; ( ) $ & @ \"", ". , ? ! ' _ # % + =", "* ~ ^ | \\ < > [ ] {"];
  const DOMAINS = ["@gmail.com", "@outlook.com", "@icloud.com"];
  const ICONS = {
    shift: "M12 4l8 9h-5v7H9v-7H4z",
    backspace: "M21 5H9l-6 7 6 7h12z M12 9.5l5 5 M17 9.5l-5 5",
    left: "M15 5l-7 7 7 7",
    right: "M9 5l7 7-7 7"
  };
  const SHIFT_NAMES = { off: "Shift", once: "Shift: one capital", lock: "Caps lock" };
  const NEXT_SHIFT = { off: "once", once: "lock", lock: "off" };
  const HINTS = [["OK", "Type"], ["Menu", "Delete"], ["Back", "Close"]];
  const PRESSED_MS = 120;

  const key = (id, label, w, extra) => Object.assign({ id, label, w }, extra);
  const ch = (c, w) => key(`c:${c}`, c, w || 1, { kind: "char", value: c });
  const chars = (line) => line.split(" ").map((c) => ch(c));

  // The rows of one page for a layout, as [{id, label, w, kind, value?}]. A key
  // that spans rows is the same object in each of them.
  function rowsFor(layout, page) {
    if (layout === "digits") {
      return [
        chars("1 2 3"),
        chars("4 5 6"),
        chars("7 8 9"),
        [key("backspace", "", 1, { kind: "backspace", icon: "backspace", aria: "Backspace" }), ch("0"), key("done", "Done", 1, { kind: "done" })]
      ];
    }
    const symbols = page === "symbols";
    const email = layout === "email";
    const letters = LETTERS[email ? "email" : "text"];
    const rows = [chars(DIGITS)];
    if (symbols) rows.push(...SYMBOLS.map(chars));
    else {
      rows.push(chars(letters[0]), chars(letters[1]));
      rows.push([key("shift", "", 1, { kind: "shift", icon: "shift", aria: SHIFT_NAMES.off }), ...chars(letters[2])]);
    }
    const left = key("left", "", 1, { kind: "left", icon: "left", aria: "Cursor left" });
    const right = key("right", "", 1, { kind: "right", icon: "right", aria: "Cursor right" });
    const pageKey = (w) => key("page", symbols ? "abc" : "#+=", w, { kind: "page", aria: symbols ? "Letters" : "Symbols" });
    const space = (w) => key("space", "space", w, { kind: "char", value: " ", aria: "Space" });
    if (email) {
      rows.unshift([...DOMAINS.map((d) => ch(d, 2)), ch("@", 2), ch(".com", 2)]);
      rows.push([pageKey(4), Object.assign(left, { w: 3 }), Object.assign(right, { w: 3 })]);
    } else if (layout === "password") {
      rows.push([pageKey(2), space(3), key("show", "Show", 3, { kind: "show" }), left, right]);
    } else {
      rows.push([pageKey(2), space(6), left, right]);
    }
    // The action column: Backspace above, Done in the bottom three rows.
    const back = key("backspace", "", 1, { kind: "backspace", icon: "backspace", aria: "Backspace", action: true });
    const done = key("done", "Done", 1, { kind: "done", action: true });
    return rows.map((row, r) => [...row, r < rows.length - 3 ? back : done]);
  }

  // Where the selection starts: the middle of the keys, one press from most.
  function startOf(layout) {
    return layout === "digits" ? "c:5" : "c:g";
  }

  /**
   * @param {Document} doc
   * @param {{onFocus?: (el: Element) => void}} [opts] — told of each key as it
   *   is selected
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
    const hint = el("div", "tenfoot-kb-hint");
    for (const [name, what] of HINTS) {
      const item = el("span", "tenfoot-kb-hint-item");
      const k = el("b", "tenfoot-kb-hint-key");
      k.textContent = name;
      item.append(k, doc.createTextNode(what));
      hint.appendChild(item);
    }
    panel.append(preview, grid, hint);
    layer.appendChild(panel);
    (doc.documentElement || doc.body).appendChild(layer);

    let input = null;
    let group = null; // a PIN's digit boxes, in order, when it has several
    let layout = "text";
    let page = "letters";
    let shift = "off"; // "off", "once" (one capital) or "lock" (caps lock)
    let caret = 0;
    let shown = false; // a password box turned readable
    let origType = "";
    let settle = null;
    let rows = []; // [{keys: [{spec, el, x}], width}]
    let at = { r: 0, i: 0 };
    let column = null; // the x the selection keeps on ▲ ▼ across rows
    let pressedEl = null;
    let pressedTimer = null;

    // ----- the text ----------------------------------------------------------

    function value() {
      return input ? String(input.value || "") : "";
    }

    // What the panel's top line shows: all of a PIN's boxes together.
    function shownValue() {
      return group ? group.map((b) => String(b.value || "")).join("") : value();
    }

    // With a group, the box a digit goes into (the first empty one) or comes
    // out of (the last filled one); the cursor goes to the end of it.
    function aim(remove) {
      if (!group) return true;
      let box = null;
      if (remove) {
        for (let i = group.length - 1; i >= 0 && !box; i -= 1) if (group[i].value) box = group[i];
        box = box || group[0];
      } else {
        box = group.find((b) => !b.value) || null;
        if (!box) return false; // all filled: another digit has no place
      }
      input = box;
      caret = value().length;
      return true;
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
      if (!aim(remove)) return;
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

    // A text box starts a name with a capital, and after a space. Caps lock
    // stays on; otherwise what was typed puts Shift back.
    function autoShift() {
      return layout === "text" && (caret === 0 || /\s/.test(value()[caret - 1] || "")) ? "once" : "off";
    }

    function afterEdit() {
      syncCaret();
      if (shift !== "lock") shift = autoShift();
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
      if (spec.kind === "char" && spec.id.startsWith("c:") && /^[a-z]$/.test(spec.value)) return shift !== "off" ? spec.value.toUpperCase() : spec.value;
      if (spec.kind === "show") return shown ? "Hide" : "Show";
      return spec.label;
    }

    function refreshKeys() {
      for (const row of rows) {
        for (const k of row.keys) {
          const text = labelOf(k.spec);
          if (!k.spec.icon && k.el.textContent !== text) k.el.textContent = text;
          if (k.spec.kind === "shift") {
            k.el.setAttribute("aria-pressed", shift !== "off" ? "true" : "false");
            k.el.setAttribute("aria-label", SHIFT_NAMES[shift]);
            k.el.dataset.tenfootShift = shift;
          }
        }
      }
      const v = shownValue();
      const masked = (layout === "password" && !shown) || layout === "digits" ? "•".repeat(v.length) : v;
      const c = group ? masked.length : Math.max(0, Math.min(masked.length, caret));
      preview.textContent = "";
      const before = el("span", "tenfoot-kb-text");
      before.textContent = masked.slice(0, c);
      const bar = el("span", "tenfoot-kb-caret");
      const after = el("span", "tenfoot-kb-text");
      after.textContent = masked.slice(c);
      preview.append(before, bar, after);
    }

    function classOf(spec) {
      const kinds = [`tenfoot-kb-key--${spec.kind}`];
      if (spec.id === "space" || spec.kind === "show" || spec.kind === "page" || spec.kind === "shift" || spec.kind === "backspace" || spec.kind === "left" || spec.kind === "right") kinds.push("tenfoot-kb-key--fn");
      if (spec.kind === "char" && /^\d$/.test(spec.value)) kinds.push("tenfoot-kb-key--digit");
      if (spec.kind === "char" && spec.value.length > 1) kinds.push("tenfoot-kb-key--chip");
      if (spec.action) kinds.push("tenfoot-kb-key--action");
      return `tenfoot-kb-key ${kinds.join(" ")}`;
    }

    function makeKey(spec, r, x) {
      const b = el("button", classOf(spec));
      b.type = "button";
      b.dataset.tenfootKey = spec.id;
      b.style.gridColumn = `${x + 1} / span ${spec.w}`;
      b.style.gridRowStart = String(r + 1);
      if (spec.aria) b.setAttribute("aria-label", spec.aria);
      if (spec.icon) b.appendChild(Common.svgIcon(doc, ICONS[spec.icon], { strokeWidth: 2.5 }));
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        for (let row = 0; row < rows.length; row += 1) {
          const i = rows[row].keys.findIndex((k) => k.el === b);
          if (i >= 0) {
            markCurrent(b);
            at = { r: row, i };
            break;
          }
        }
        column = null;
        press(spec);
      });
      grid.appendChild(b);
      return b;
    }

    function draw() {
      grid.textContent = "";
      const made = new Map(); // a key spanning rows is one button
      const specs = rowsFor(layout, page);
      rows = specs.map((row, r) => {
        let x = 0;
        const keys = row.map((spec) => {
          let k = made.get(spec);
          if (!k) {
            k = { spec, el: makeKey(spec, r, x), x: x + spec.w / 2, from: r };
            made.set(spec, k);
          } else k.el.style.gridRowEnd = String(r + 2);
          x += spec.w;
          return k;
        });
        return { keys, width: x };
      });
      grid.style.setProperty("--tf-kb-cols", String(rows.length ? rows[0].width : 1));
      refreshKeys();
    }

    // ----- the selection -----------------------------------------------------

    function markCurrent(b) {
      for (const stale of grid.querySelectorAll("[data-tenfoot-current]")) if (stale !== b) stale.removeAttribute("data-tenfoot-current");
      if (b) b.setAttribute("data-tenfoot-current", "true");
    }

    // The key's centre, counted from the middle of its row.
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
      markCurrent(b);
      try {
        b.focus({ preventScroll: true });
      } catch (_err) { /* the selection still shows */ }
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

    // ◀ ▶ go along the row and round its ends; ▲ ▼ go to the key nearest the
    // same place in the next row, past a key that spans rows, and stop at the
    // top and the bottom.
    function move(action) {
      const row = rows[at.r];
      const n = row.keys.length;
      if (action === "left") focusAt(at.r, (at.i - 1 + n) % n);
      else if (action === "right") focusAt(at.r, (at.i + 1) % n);
      else {
        const d = action === "down" ? 1 : -1;
        const from = row.keys[at.i];
        if (column === null) column = centre(at.r, at.i);
        for (let r = at.r + d; r >= 0 && r < rows.length; r += d) {
          const i = nearest(r);
          if (rows[r].keys[i] !== from) {
            focusAt(r, i, true);
            return;
          }
        }
      }
    }

    // ----- pressing keys -----------------------------------------------------

    function clearPressed() {
      if (pressedTimer !== null) win.clearTimeout(pressedTimer);
      pressedTimer = null;
      if (pressedEl) pressedEl.removeAttribute("data-tenfoot-pressed");
      pressedEl = null;
    }

    // The key answers the press for a moment.
    function showPressed(b) {
      clearPressed();
      pressedEl = b;
      b.setAttribute("data-tenfoot-pressed", "true");
      pressedTimer = win.setTimeout(clearPressed, PRESSED_MS);
    }

    function press(spec) {
      const k = rows[at.r] && rows[at.r].keys[at.i];
      if (k && k.spec === spec) showPressed(k.el);
      switch (spec.kind) {
        case "char":
          edit(shift !== "off" && /^[a-z]$/.test(spec.value) ? spec.value.toUpperCase() : spec.value, false);
          break;
        case "backspace":
          edit("", true);
          break;
        case "shift":
          shift = NEXT_SHIFT[shift];
          refreshKeys();
          break;
        case "page": {
          const was = rows[at.r].keys[at.i].spec.id;
          page = page === "letters" ? "symbols" : "letters";
          draw();
          const r = rows.findIndex((row) => row.keys.some((k2) => k2.spec.id === was));
          const i = r >= 0 ? rows[r].keys.findIndex((k2) => k2.spec.id === was) : 0;
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
      clearPressed();
      if (input && shown) {
        try {
          input.type = origType || "password";
        } catch (_err) { /* nothing to put back */ }
      }
      const done = settle;
      const box = group ? group.find((b) => !b.value) || group[group.length - 1] : input;
      settle = null;
      input = null;
      group = null;
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
     * @param {{layout?: "text"|"email"|"password"|"digits", page?: "letters"|"symbols", boxes?: HTMLInputElement[]}} [how] —
     *   boxes: a PIN's digit boxes, when it has several
     * @returns {Promise<"done"|null>}
     */
    function open(box, how) {
      finish(null);
      const h = how || {};
      input = box;
      group = Array.isArray(h.boxes) && h.boxes.length > 1 ? h.boxes : null;
      layout = ["text", "email", "password", "digits"].includes(h.layout) ? h.layout : "text";
      page = h.page === "symbols" ? "symbols" : "letters";
      origType = box && box.type ? box.type : "";
      shown = false;
      caret = value().length;
      syncCaret();
      shift = autoShift();
      column = null;
      draw();
      layer.hidden = false;
      const answer = new Promise((resolve) => { settle = resolve; });
      const start = startOf(layout);
      const r = Math.max(0, rows.findIndex((row) => row.keys.some((k) => k.spec.id === start)));
      focusAt(r, Math.max(0, rows[r].keys.findIndex((k) => k.spec.id === start)));
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
        case "menu":
          edit("", true);
          return true;
        case "back":
          finish(null);
          return true;
        default:
          return true; // nothing else gets past an open keyboard
      }
    }

    /** A real keyboard's key, while open: a character, or "Backspace". */
    function typed(c) {
      if (layer.hidden) return false;
      if (c === "Backspace") edit("", true);
      else edit(c, false);
      return true;
    }

    return Object.freeze({
      open,
      key: keyDown,
      typed,
      close: () => finish(null),
      refocus: () => focusAt(at.r, at.i, true),
      contains: (n) => Boolean(n) && layer.contains(n),
      get isOpen() { return !layer.hidden; },
      get current() { return layer.hidden || !rows[at.r] ? null : rows[at.r].keys[at.i].el; },
      get state() {
        return {
          layout, page, shift, shifted: shift !== "off", caret, shown,
          key: rows[at.r] ? rows[at.r].keys[at.i].spec.id : null,
          rows: rows.map((row) => row.keys.map((k) => k.spec.id))
        };
      },
      element: layer
    });
  }

  globalThis.TenfootKeyboard = Object.freeze({ createKeyboard });
})();
