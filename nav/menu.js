// Leanback for Dropout — the options panel the remote's menu button opens.
// Site-agnostic. This is where every feature that has no button of its own
// lives (captions, mute, episode skip, …), so that nothing is reachable only
// by pressing a letter on a remote's keyboard.
//
// Navigation inside it is ordinary navigation: ▲ ▼ move, OK activates, back
// closes. The items are real <button>s, so the focus ring follows them the
// same way it follows anything else on the page.

(function () {
  const PANEL_CLASS = "tenfoot-menu";
  const ITEM_CLASS = "tenfoot-menu-item";

  /**
   * @param {Document} doc
   * @param {{onActivate: (id: string) => void, onClose?: () => void}} handlers
   */
  function createMenu(doc, handlers) {
    const h = handlers || {};
    let panel = doc.querySelector(`.${PANEL_CLASS}`);
    if (!panel) {
      panel = doc.createElement("div");
      panel.className = PANEL_CLASS;
      panel.setAttribute("role", "menu");
      panel.setAttribute("aria-label", "Leanback options");
      panel.hidden = true;
      doc.documentElement.appendChild(panel);
    }
    let items = [];
    let index = 0;

    function render(list) {
      while (panel.firstChild) panel.removeChild(panel.firstChild);
      const title = doc.createElement("p");
      title.className = "tenfoot-menu-title";
      title.textContent = "Options";
      panel.appendChild(title);
      items = [];
      for (const it of list) {
        if (!it || !it.label) continue;
        const b = doc.createElement("button");
        b.type = "button";
        b.className = ITEM_CLASS;
        b.setAttribute("role", "menuitem");
        b.dataset.tenfootItem = it.id;
        const label = doc.createElement("span");
        label.className = "tenfoot-menu-label";
        label.textContent = it.label;
        b.appendChild(label);
        if (it.detail || it.value !== undefined) {
          const d = doc.createElement("span");
          d.className = "tenfoot-menu-detail";
          d.textContent = it.value !== undefined ? String(it.value) : it.detail;
          b.appendChild(d);
        }
        b.addEventListener("click", (e) => {
          // The site never sees this. A click that bubbled out of the panel
          // would wake Dropout's own handlers, which move the focus and would
          // close the panel.
          e.preventDefault();
          e.stopPropagation();
          if (typeof h.onActivate === "function") h.onActivate(it.id);
        });
        panel.appendChild(b);
        items.push(b);
      }
    }

    function open(list, opts) {
      const o = opts || {};
      render(Array.isArray(list) ? list : []);
      if (!items.length) return false;
      const t = panel.querySelector(".tenfoot-menu-title");
      if (t) t.textContent = o.title || "Options";
      panel.hidden = false;
      index = Math.min(items.length - 1, Math.max(0, o.index || 0));
      focusCurrent();
      return true;
    }

    // Redraw a single entry's value in place, so stepping a setting does not
    // rebuild the panel and lose the focus.
    function setValue(id, value) {
      const b = items.find((x) => x.dataset.tenfootItem === id);
      if (!b) return false;
      let d = b.querySelector(".tenfoot-menu-detail");
      if (!d) {
        d = doc.createElement("span");
        d.className = "tenfoot-menu-detail";
        b.appendChild(d);
      }
      d.textContent = String(value);
      return true;
    }

    function close() {
      if (panel.hidden) return false;
      panel.hidden = true;
      return true;
    }

    // The selection is stamped on the element, not read from :focus. Pages
    // move the focus whenever they re-render, and a highlight that followed
    // :focus would vanish with it.
    function focusCurrent() {
      const el = items[index];
      for (const b of items) {
        if (b === el) b.dataset.tenfootCurrent = "true";
        else delete b.dataset.tenfootCurrent;
      }
      if (!el) return null;
      try {
        el.focus({ preventScroll: true });
      } catch (_err) { /* the stamp still marks it */ }
      return el;
    }

    // No wrapping: the same rule the rest of the navigation follows.
    function move(delta) {
      if (panel.hidden || !items.length) return null;
      const next = Math.min(items.length - 1, Math.max(0, index + delta));
      if (next === index) return items[index];
      index = next;
      return focusCurrent();
    }

    function activate() {
      const el = items[index];
      if (!el) return false;
      if (typeof h.onActivate === "function") h.onActivate(el.dataset.tenfootItem);
      return true;
    }

    function destroy() {
      close();
      panel.remove();
    }

    return Object.freeze({
      open, close, move, activate, setValue, destroy, element: panel,
      refocus: () => (panel.hidden ? null : focusCurrent()),
      get isOpen() { return !panel.hidden; },
      get current() { return items[index] || null; },
      get currentId() { return items[index] ? items[index].dataset.tenfootItem : null; },
      get length() { return items.length; },
      contains: (el) => panel.contains(el)
    });
  }

  globalThis.TenfootMenu = Object.freeze({ createMenu, PANEL_CLASS, ITEM_CLASS });
})();
