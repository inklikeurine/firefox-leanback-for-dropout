// Leanback for Dropout — the settings panel's look, shared by the panel on a
// page (content/page.js) and the playback panel (content/transport.js), so
// Leanback's settings are drawn the same way wherever they open. Site-agnostic
// and logic-free: the owner hands it a level to show and decides what keys do.
//
//   ┌ Title ─────────────── ✕ ┐   the ✕ is a picture: Back closes
//   │ Label            value ›│   a choice or a submenu: its value, a chevron
//   │ Label               (●)│   on/off: a switch
//   │ GROUP                   │   a heading over a group of options
//   │ Label                 ✓ │   an option: ticked when chosen
//   ├─────────────────────────┤
//   │ ◀ Back  ▲▼ Move  OK Change
//   └─────────────────────────┘
//
// It flies in from the right. The selection is stamped on the entry
// (data-tenfoot-current), never read from :focus, so a page that moves the
// focus cannot take the highlight with it.

(function () {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const SLIDE_MS = 250;
  const ICONS = {
    check: "M5 13l4 4L19 7",
    chevron: "M9 6l6 6-6 6",
    close: "M6 6l12 12M18 6L6 18"
  };

  function icon(doc, name) {
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("aria-hidden", "true");
    const path = doc.createElementNS(SVG_NS, "path");
    path.setAttribute("d", ICONS[name]);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2.5");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
    return svg;
  }

  /**
   * @param {Document} doc
   * @param {{label?: string, onPick?: (index: number) => void}} opts
   *   onPick — a click on an entry (a mouse; the remote goes through keys)
   */
  function createPanel(doc, opts) {
    const o = opts || {};
    const root = doc.documentElement;
    const el = doc.createElement("aside");
    el.className = "tenfoot-settings";
    el.hidden = true;
    el.setAttribute("role", "menu");
    el.setAttribute("aria-label", o.label || "Settings");

    const head = doc.createElement("header");
    head.className = "tenfoot-settings-head";
    const title = doc.createElement("p");
    title.className = "tenfoot-settings-title";
    const close = doc.createElement("span");
    close.className = "tenfoot-settings-close";
    close.setAttribute("aria-hidden", "true");
    close.appendChild(icon(doc, "close"));
    head.append(title, close);

    const list = doc.createElement("div");
    list.className = "tenfoot-settings-list";

    const keys = doc.createElement("footer");
    keys.className = "tenfoot-settings-keys";
    for (const [k, label, main] of [["◀", "Back"], ["▲ ▼", "Move"], ["OK", "Change", true]]) {
      const key = doc.createElement("kbd");
      key.textContent = k;
      if (main) key.className = "tenfoot-settings-key-main";
      const span = doc.createElement("span");
      span.textContent = label;
      keys.append(key, span);
    }
    el.append(head, list, keys);
    root.appendChild(el);

    let items = [];
    let hideTimer = 0;

    /**
     * Draw a level.
     * @param {{title: string, index: number, entries: {
     *   id?: string, label: string, value?: string,
     *   kind?: "toggle"|"choice"|"drill"|"option"|"action",
     *   on?: boolean, checked?: boolean, group?: string, separator?: boolean
     * }[]}} view
     */
    function render(view) {
      const v = view || { title: "", entries: [], index: 0 };
      title.textContent = v.title || "";
      while (list.firstChild) list.removeChild(list.firstChild);
      items = [];
      let group = "";
      (v.entries || []).forEach((entry, i) => {
        if (entry.group && entry.group !== group) {
          const h = doc.createElement("p");
          h.className = "tenfoot-settings-group";
          h.textContent = entry.group;
          list.appendChild(h);
        }
        group = entry.group || "";
        const b = doc.createElement("button");
        b.type = "button";
        b.className = "tenfoot-settings-item";
        const kind = entry.kind || "action";
        b.dataset.tenfootKind = kind;
        b.dataset.tenfootSettingsItem = String(i);
        if (entry.id !== undefined) b.dataset.tenfootItem = String(entry.id);
        if (entry.separator) b.dataset.tenfootSeparator = "true";
        if (kind === "toggle") {
          b.setAttribute("role", "menuitemcheckbox");
          b.setAttribute("aria-checked", entry.on ? "true" : "false");
        } else if (kind === "option") {
          b.setAttribute("role", "menuitemradio");
          b.setAttribute("aria-checked", entry.checked ? "true" : "false");
        } else b.setAttribute("role", "menuitem");
        if (i === v.index) b.dataset.tenfootCurrent = "true";
        const label = doc.createElement("span");
        label.className = "tenfoot-settings-label";
        label.textContent = entry.label;
        const value = doc.createElement("span");
        value.className = "tenfoot-settings-value";
        value.textContent = entry.value || "";
        const mark = doc.createElement("span");
        mark.className = "tenfoot-settings-mark";
        if (kind === "toggle") {
          const sw = doc.createElement("span");
          sw.className = "tenfoot-switch";
          sw.dataset.on = entry.on ? "true" : "false";
          sw.appendChild(doc.createElement("span"));
          mark.appendChild(sw);
        } else if (entry.checked) mark.appendChild(icon(doc, "check"));
        else if (kind === "choice" || kind === "drill") mark.appendChild(icon(doc, "chevron"));
        b.append(label, value, mark);
        b.addEventListener("click", (e) => {
          // The site never sees it: a click bubbling out would wake its own
          // handlers, which move the focus.
          e.preventDefault();
          e.stopPropagation();
          if (typeof o.onPick === "function") o.onPick(i);
        });
        list.appendChild(b);
        items.push(b);
      });
      refocus();
    }

    function refocus() {
      const cur = items.find((b) => b.dataset.tenfootCurrent === "true") || null;
      if (cur) {
        try {
          cur.focus({ preventScroll: true });
        } catch (_err) { /* the stamp marks it either way */ }
        // Keep it in view in a long list (caption colours).
        try {
          cur.scrollIntoView({ block: "nearest" });
        } catch (_err) { /* not laid out */ }
      }
      return cur;
    }

    function open() {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = 0;
      const was = !el.hidden;
      el.hidden = false;
      if (!was) void el.offsetWidth; // lay out off screen first, then slide in
      root.classList.add("tenfoot-settings-open");
      return true;
    }

    function hide() {
      if (el.hidden) return false;
      root.classList.remove("tenfoot-settings-open");
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        hideTimer = 0;
        if (!root.classList.contains("tenfoot-settings-open")) {
          el.hidden = true;
          while (list.firstChild) list.removeChild(list.firstChild);
          items = [];
        }
      }, SLIDE_MS);
      return true;
    }

    function destroy() {
      if (hideTimer) clearTimeout(hideTimer);
      root.classList.remove("tenfoot-settings-open");
      el.remove();
    }

    return Object.freeze({
      element: el,
      render,
      open,
      close: hide,
      refocus,
      destroy,
      get isOpen() { return root.classList.contains("tenfoot-settings-open"); },
      get current() { return items.find((b) => b.dataset.tenfootCurrent === "true") || null; },
      get items() { return items.slice(); },
      contains: (node) => el.contains(node)
    });
  }

  globalThis.TenfootPanel = Object.freeze({ createPanel, SLIDE_MS });
})();
