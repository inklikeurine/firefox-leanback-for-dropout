// Leanback for Dropout — the on-screen keyboard: a panel down the left of the
// screen, beside the rail, with what is being typed in at its top and the page
// beside it. The page script routes keys to it while it has the selection (as
// for a question, nav/ask.js): ◀ ▶ ▲ ▼ move the selection between keys, OK types
// the key, Menu takes out the letter before the cursor, Back (Escape) closes it
// without an answer. Held keys repeat as the browser repeats them; the page
// script already slows held moves.
//
// The keys sit on a grid six across, so ▲ ▼ go straight up and down: the keys
// that act on the text, the letters (A to Z), a thin line, the digits, then Space
// and Done. A layout says what else there is: "text", "email" (a row of whole endings on top
// and .com in place of Space), "password" (a Show / Hide key that turns the box
// between hidden and readable), or "digits" (a number pad, for a PIN; a PIN's
// separate digit boxes are given as a group, and each digit goes into the next
// empty one).
//
// Shift has three steps: off, one capital, caps lock.
//
// Docked, it stays up beside the page, the search page's way of typing: the
// selection can leave it for the page and come back. ◀ and ▶ at its edges tell
// the page script, which moves on, and Done is the page script's too.
//
// Typing goes into any <input> at the cursor, with beforeinput and input
// events, so a box that mirrors into the site's own (search) keeps working.
// Some boxes (type=email) have no cursor to read, so the keyboard keeps its
// own cursor, taken from the box when it has one, and shows the text with it
// on the panel's top line.

(function () {
  const LETTERS = ["a b c d e f", "g h i j k l", "m n o p q r", "s t u v w x"];
  const LAST_LETTERS = { text: "y z . , ' -", email: "y z . - _ @" };
  const DIGITS = { text: ["1 2 3 4 5 6", "7 8 9 0 @ _"], email: ["1 2 3 4 5 6", "7 8 9 0 + '"] };
  const SYMBOLS = ["- / : ; ( )", "$ & @ \" . ,", "? ! ' _ # %", "+ = * ~ ^ |", "\\ < > [ ] {"];
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
  const DOCKED_HINTS = [["OK", "Type"], ["Menu", "Delete"], ["▶", "at the edge: results"]];
  const PRESSED_MS = 120;

  const key = (id, label, w, extra) => Object.assign({ id, label, w }, extra);
  const ch = (c, w) => key(`c:${c}`, c, w || 1, { kind: "char", value: c });
  const chars = (line) => line.split(" ").map((c) => ch(c));
  const isDigit = (spec) => spec.kind === "char" && /^\d$/.test(spec.value);

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
    const left = key("left", "", 1, { kind: "left", icon: "left", aria: "Cursor left" });
    const right = key("right", "", 1, { kind: "right", icon: "right", aria: "Cursor right" });
    const back = (w) => key("backspace", "", w, { kind: "backspace", icon: "backspace", aria: "Backspace" });
    const pageKey = key("page", symbols ? "abc" : "#+=", 1, { kind: "page", aria: symbols ? "Letters" : "Symbols" });
    const done = (w) => key("done", "Done", w, { kind: "done" });
    const space = (w) => key("space", "space", w, { kind: "char", value: " ", aria: "Space" });
    const rows = [];
    if (email) rows.push(DOMAINS.map((d) => ch(d, 2)));
    if (symbols) rows.push([pageKey, left, right, back(3)], ...SYMBOLS.map(chars));
    else {
      rows.push([key("shift", "", 1, { kind: "shift", icon: "shift", aria: SHIFT_NAMES.off }), pageKey, left, right, back(2)]);
      rows.push(...LETTERS.map(chars), chars(LAST_LETTERS[email ? "email" : "text"]));
    }
    rows.push(...DIGITS[email ? "email" : "text"].map(chars));
    if (email) rows.push([ch(".com", 3), done(3)]);
    else if (layout === "password") rows.push([space(2), key("show", "Show", 2, { kind: "show" }), done(2)]);
    else rows.push([space(3), done(3)]);
    return rows;
  }

  // Where the selection starts.
  function startOf(layout) {
    return layout === "digits" ? "c:5" : "c:a";
  }

  /**
   * @param {Document} doc
   * @param {{hints?: boolean, onFocus?: (el: Element) => void, onEdge?: (dir: "left"|"right") => void, onDone?: () => void, onEnter?: () => void}} [opts] —
   *   hints: false leaves out the line of keys along its foot (the Button Hints
   *   setting); onFocus: told of each key as it is selected; docked, onEdge: ◀
   *   or ▶ past its edge, onDone: Done pressed, onEnter: the selection came back to it
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
    hint.hidden = o.hints === false;
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
    let digitsAt = 0; // the row the digits start on, when there are keys above them
    let at = { r: 0, i: 0 };
    let column = null; // the x the selection keeps on ▲ ▼ across rows
    let pressedEl = null;
    let pressedTimer = null;
    let docked = false; // stays up beside the page
    let active = true; // has the selection (docked, it can leave)
    let seen = ""; // the text as last drawn

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
      seen = value();
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
      if (!masked && input && input.placeholder) {
        const words = el("span", "tenfoot-kb-placeholder");
        words.textContent = input.placeholder;
        preview.appendChild(words);
      }
      // A long text shows its end, where the cursor usually is.
      preview.scrollLeft = Math.max(0, bar.offsetLeft - preview.clientWidth + bar.offsetWidth + 2);
    }

    function drawHints() {
      hint.textContent = "";
      for (const [name, what] of docked ? DOCKED_HINTS : HINTS) {
        const item = el("span", "tenfoot-kb-hint-item");
        const k = el("b", "tenfoot-kb-hint-key");
        k.textContent = name;
        item.append(k, doc.createTextNode(what));
        hint.appendChild(item);
      }
    }

    function classOf(spec) {
      const kinds = [`tenfoot-kb-key--${spec.kind}`];
      if (spec.id === "space" || spec.kind === "show" || spec.kind === "page" || spec.kind === "shift" || spec.kind === "backspace" || spec.kind === "left" || spec.kind === "right") kinds.push("tenfoot-kb-key--fn");
      if (isDigit(spec)) kinds.push("tenfoot-kb-key--digit");
      if (spec.kind === "char" && spec.value.length > 1) kinds.push("tenfoot-kb-key--chip");
      return `tenfoot-kb-key ${kinds.join(" ")}`;
    }

    // The grid line a row starts on: the line above the digits has a slim row of
    // its own.
    function lineOf(r) {
      return r + 1 + (digitsAt && r >= digitsAt ? 1 : 0);
    }

    function makeKey(spec, r, x) {
      const b = el("button", classOf(spec));
      b.type = "button";
      b.dataset.tenfootKey = spec.id;
      b.style.gridColumn = `${x + 1} / span ${spec.w}`;
      b.style.gridRowStart = String(lineOf(r));
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
            if (docked && !active) {
              active = true;
              if (typeof o.onEnter === "function") o.onEnter();
            }
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
      digitsAt = Math.max(0, specs.findIndex((row) => row.some(isDigit)));
      rows = specs.map((row, r) => {
        let x = 0;
        const keys = row.map((spec) => {
          let k = made.get(spec);
          if (!k) {
            k = { spec, el: makeKey(spec, r, x), x: x + spec.w / 2, from: r };
            made.set(spec, k);
          } else k.el.style.gridRowEnd = String(lineOf(r) + 1);
          x += spec.w;
          return k;
        });
        return { keys, width: x };
      });
      grid.style.setProperty("--tf-kb-cols", String(rows.length ? rows[0].width : 1));
      grid.style.setProperty("--tf-kb-rows", String(rows.length || 1));
      if (digitsAt) {
        grid.style.setProperty("--tf-kb-above", String(digitsAt));
        grid.style.setProperty("--tf-kb-below", String(rows.length - digitsAt));
        const line = el("div", "tenfoot-kb-line");
        line.setAttribute("aria-hidden", "true");
        line.style.gridRowStart = String(digitsAt + 1);
        grid.appendChild(line);
      }
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

    // ◀ ▶ go along the row and round its ends (docked, past them, which the page
    // script takes up); ▲ ▼ go to the key nearest the same place in the next row,
    // past a key that spans rows, and round from the top to the bottom and back.
    function move(action) {
      const row = rows[at.r];
      const n = row.keys.length;
      if (action === "left" || action === "right") {
        const d = action === "left" ? -1 : 1;
        if (docked && (at.i + d < 0 || at.i + d >= n)) {
          if (typeof o.onEdge === "function") o.onEdge(action);
          return;
        }
        focusAt(at.r, (at.i + d + n) % n);
      } else {
        const d = action === "down" ? 1 : -1;
        const from = row.keys[at.i];
        if (column === null) column = centre(at.r, at.i);
        for (let step = 1; step < rows.length; step += 1) {
          const r = (at.r + d * step + rows.length) % rows.length;
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
          if (!docked) finish("done");
          else if (typeof o.onDone === "function") o.onDone();
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
      const wasDocked = docked;
      settle = null;
      input = null;
      group = null;
      shown = false;
      docked = false;
      active = true;
      layer.removeAttribute("data-tenfoot-docked");
      if (done) done(answer);
      // The selection goes back to the box.
      if (!wasDocked && box && box.isConnected) {
        try {
          box.focus({ preventScroll: true });
        } catch (_err) { /* the page puts it back */ }
      }
    }

    /**
     * Open for a box. Resolves with "done" when Done is pressed, or null when
     * it is closed otherwise (Back, or another box taking it over).
     * @param {HTMLInputElement} box
     * @param {{layout?: "text"|"email"|"password"|"digits", page?: "letters"|"symbols", boxes?: HTMLInputElement[], docked?: boolean}} [how] —
     *   boxes: a PIN's digit boxes, when it has several; docked: stays up beside
     *   the page until closed
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
      docked = Boolean(h.docked);
      active = true;
      if (docked) layer.setAttribute("data-tenfoot-docked", "true");
      layer.dataset.tenfootLayout = layout;
      draw();
      drawHints();
      layer.hidden = false;
      const answer = new Promise((resolve) => { settle = resolve; });
      const start = startOf(layout);
      const r = Math.max(0, rows.findIndex((row) => row.keys.some((k) => k.spec.id === start)));
      focusAt(r, Math.max(0, rows[r].keys.findIndex((k) => k.spec.id === start)));
      return answer;
    }

    /** A key, while open: true when it was the keyboard's. */
    function keyDown(action) {
      if (layer.hidden || !active) return false;
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
          if (docked) return false;
          finish(null);
          return true;
        default:
          return true; // nothing else gets past an open keyboard
      }
    }

    // Docked: the box's text changed by other means (a search from the address,
    // Firefox's Back through the searches).
    function refresh() {
      if (layer.hidden || !input || value() === seen) return;
      syncCaret();
      if (shift !== "lock") shift = autoShift();
      refreshKeys();
    }

    // Docked: the selection has gone to the page; the panel stays.
    function leave() {
      if (layer.hidden || !docked) return;
      active = false;
      markCurrent(null);
    }

    // Docked: the selection comes back, where it was, or along its row's last
    // key when it comes from the right.
    function enter(from) {
      if (layer.hidden || !docked) return;
      active = true;
      const row = rows[at.r];
      focusAt(at.r, from === "right" && row ? row.keys.length - 1 : at.i);
      if (typeof o.onEnter === "function") o.onEnter();
    }

    /** A real keyboard's key, while open: a character, or "Backspace". */
    function typed(c) {
      if (layer.hidden) return false;
      if (!active) enter();
      if (c === "Backspace") edit("", true);
      else edit(c, false);
      return true;
    }

    return Object.freeze({
      open,
      key: keyDown,
      typed,
      refresh,
      leave,
      enter,
      close: () => finish(null),
      setHints: (on) => { hint.hidden = !on; },
      refocus: () => focusAt(at.r, at.i, true),
      contains: (n) => Boolean(n) && layer.contains(n),
      get isOpen() { return !layer.hidden && active; },
      get isDocked() { return !layer.hidden && docked; },
      get current() { return layer.hidden || !active || !rows[at.r] ? null : rows[at.r].keys[at.i].el; },
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
