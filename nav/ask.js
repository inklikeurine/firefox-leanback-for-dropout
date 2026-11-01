// Leanback for Dropout — a question in a box over the screen: a title, a
// line, and a row of buttons ("Sign out of Dropout?" — Cancel, Sign Out);
// and a picture to pick, in the same kind of box (createPicker).
// The page script routes keys to it while it is open: ◀ ▶ (and ▲ ▼) move
// between the buttons, OK picks one, Back answers with nothing. The button
// selected when it opens is the safe one, named by `start`.

(function () {
  /**
   * @param {Document} doc
   * @param {{onFocus?: (el: Element) => void}} [opts] — told of each button
   *   as it is selected (for the ring)
   */
  function createAsk(doc, opts) {
    const o = opts || {};
    const el = (tag, cls) => {
      const e = doc.createElement(tag);
      if (cls) e.className = cls;
      return e;
    };
    const layer = el("div", "tenfoot-ask");
    layer.hidden = true;
    layer.setAttribute("role", "alertdialog");
    layer.setAttribute("aria-modal", "true");
    const box = el("div", "tenfoot-ask-box");
    const title = el("h2", "tenfoot-ask-title");
    const text = el("p", "tenfoot-ask-text");
    const row = el("div", "tenfoot-ask-buttons");
    box.append(title, text, row);
    layer.appendChild(box);
    (doc.documentElement || doc.body).appendChild(layer);

    let buttons = [];
    let at = 0;
    let settle = null;

    function focusAt(i) {
      at = Math.max(0, Math.min(buttons.length - 1, i));
      const b = buttons[at];
      if (!b) return;
      try {
        b.focus({ preventScroll: true });
      } catch (_err) { /* the ring still marks it */ }
      if (typeof o.onFocus === "function") o.onFocus(b);
    }

    function finish(answer) {
      if (layer.hidden) return;
      layer.hidden = true;
      const done = settle;
      settle = null;
      if (done) done(answer);
    }

    /**
     * Ask. Resolves with the id of the button picked, or null for Back (or
     * another question replacing this one).
     * @param {{title: string, text?: string, buttons: {id: string, label: string, danger?: boolean, primary?: boolean}[], start?: string}} q
     * @returns {Promise<string|null>}
     */
    function open(q) {
      finish(null);
      title.textContent = q.title || "";
      text.textContent = q.text || "";
      text.hidden = !q.text;
      row.textContent = "";
      buttons = (q.buttons || []).map((spec) => {
        const b = el("button", "tenfoot-ask-button");
        b.type = "button";
        b.textContent = spec.label;
        b.dataset.tenfootAsk = spec.id;
        if (spec.danger) b.dataset.tenfootDanger = "true";
        if (spec.primary) b.dataset.tenfootPrimary = "true";
        b.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          finish(spec.id);
        });
        row.appendChild(b);
        return b;
      });
      layer.hidden = false;
      const start = buttons.findIndex((b) => b.dataset.tenfootAsk === q.start);
      focusAt(start >= 0 ? start : 0);
      return new Promise((resolve) => { settle = resolve; });
    }

    /** A key, while open: true when it was the box's. */
    function key(action) {
      if (layer.hidden) return false;
      switch (action) {
        case "left":
        case "up":
          focusAt(at - 1);
          return true;
        case "right":
        case "down":
          focusAt(at + 1);
          return true;
        case "select":
          finish(buttons[at] ? buttons[at].dataset.tenfootAsk : null);
          return true;
        case "back":
          finish(null);
          return true;
        default:
          return true; // nothing else gets past an open question
      }
    }

    return Object.freeze({
      open,
      key,
      close: () => finish(null),
      refocus: () => focusAt(at),
      contains: (n) => Boolean(n) && layer.contains(n),
      get isOpen() { return !layer.hidden; },
      get current() { return layer.hidden ? null : buttons[at] || null; },
      element: layer
    });
  }

  /**
   * A picture to pick, in a box over the screen ("Picture for Sam"): its
   * sections ("The classics", "Dropout"), each a grid of pictures. Keys as
   * for a question: ◀ ▶ along a row, ▲ ▼ between rows and sections, OK
   * picks, Back answers with nothing.
   * @param {Document} doc
   * @param {{onFocus?: (el: Element) => void}} [opts]
   */
  function createPicker(doc, opts) {
    const o = opts || {};
    const el = (tag, cls) => {
      const e = doc.createElement(tag);
      if (cls) e.className = cls;
      return e;
    };
    const layer = el("div", "tenfoot-ask tenfoot-picker");
    layer.hidden = true;
    layer.setAttribute("role", "dialog");
    layer.setAttribute("aria-modal", "true");
    const box = el("div", "tenfoot-ask-box tenfoot-picker-box");
    const title = el("h2", "tenfoot-ask-title");
    const text = el("p", "tenfoot-ask-text");
    const body = el("div", "tenfoot-picker-sections");
    box.append(title, text, body);
    layer.appendChild(box);
    (doc.documentElement || doc.body).appendChild(layer);

    let sections = []; // [{buttons: Element[]}]
    let at = { s: 0, i: 0 };
    let columns = 7;
    let settle = null;

    function button() {
      const sec = sections[at.s];
      return sec ? sec.buttons[at.i] || null : null;
    }

    function focusAt(s, i) {
      const sec = sections[s];
      if (!sec || !sec.buttons.length) return;
      at = { s, i: Math.max(0, Math.min(sec.buttons.length - 1, i)) };
      const b = button();
      try {
        b.focus({ preventScroll: true });
      } catch (_err) { /* the ring still marks it */ }
      try {
        b.scrollIntoView({ block: "nearest" });
      } catch (_err) { /* in view or not, it is selected */ }
      if (typeof o.onFocus === "function") o.onFocus(b);
    }

    function finish(answer) {
      if (layer.hidden) return;
      layer.hidden = true;
      const done = settle;
      settle = null;
      if (done) done(answer);
    }

    /**
     * @param {{title: string, text?: string, columns?: number, start?: string,
     *   sections: {label: string, items: {id: string, image: string, label: string}[]}[]}} q
     * @returns {Promise<string|null>} the picture's id, or null
     */
    function open(q) {
      finish(null);
      title.textContent = q.title || "";
      say(q.text || "");
      columns = q.columns || 7;
      body.style.setProperty("--tf-picker-cols", String(columns));
      body.textContent = "";
      sections = [];
      let start = null;
      for (const sec of q.sections || []) {
        if (!sec.items || !sec.items.length) continue;
        const head = el("h3", "tenfoot-picker-label");
        head.textContent = sec.label || "";
        const grid = el("div", "tenfoot-picker-grid");
        const buttons = sec.items.map((it, i) => {
          const b = el("button", "tenfoot-picker-item");
          b.type = "button";
          b.dataset.tenfootPicture = it.id;
          b.setAttribute("aria-label", it.label || "");
          if (it.id === q.start) {
            b.setAttribute("aria-pressed", "true");
            start = { s: sections.length, i };
          }
          const img = el("img");
          img.alt = "";
          img.src = it.image;
          b.appendChild(img);
          b.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            finish(it.id);
          });
          grid.appendChild(b);
          return b;
        });
        body.append(head, grid);
        sections.push({ buttons });
      }
      layer.hidden = false;
      const first = start || { s: 0, i: 0 };
      focusAt(first.s, first.i);
      return new Promise((resolve) => { settle = resolve; });
    }

    function say(words) {
      text.textContent = words || "";
      text.hidden = !words;
    }

    function move(action) {
      const sec = sections[at.s];
      if (!sec) return;
      const col = at.i % columns;
      if (action === "left") return focusAt(at.s, at.i - 1);
      if (action === "right") return focusAt(at.s, at.i + 1);
      if (action === "down") {
        if (at.i + columns < sec.buttons.length) return focusAt(at.s, at.i + columns);
        // The last row: on to the next row's start, or the next section.
        if (Math.floor(at.i / columns) < Math.floor((sec.buttons.length - 1) / columns)) return focusAt(at.s, sec.buttons.length - 1);
        if (sections[at.s + 1]) return focusAt(at.s + 1, Math.min(col, sections[at.s + 1].buttons.length - 1));
        return;
      }
      if (action === "up") {
        if (at.i - columns >= 0) return focusAt(at.s, at.i - columns);
        const prev = sections[at.s - 1];
        if (!prev) return;
        const lastRow = Math.floor((prev.buttons.length - 1) / columns) * columns;
        focusAt(at.s - 1, Math.min(lastRow + col, prev.buttons.length - 1));
      }
    }

    /** A key, while open: true when it was the box's. */
    function key(action) {
      if (layer.hidden) return false;
      switch (action) {
        case "left":
        case "right":
        case "up":
        case "down":
          move(action);
          return true;
        case "select": {
          const b = button();
          if (b) finish(b.dataset.tenfootPicture);
          return true;
        }
        case "back":
          finish(null);
          return true;
        default:
          return true;
      }
    }

    return Object.freeze({
      open,
      key,
      close: () => finish(null),
      refocus: () => focusAt(at.s, at.i),
      contains: (n) => Boolean(n) && layer.contains(n),
      get isOpen() { return !layer.hidden; },
      get current() { return layer.hidden ? null : button(); },
      element: layer
    });
  }

  globalThis.TenfootAsk = Object.freeze({ createAsk, createPicker });
})();
