// Leanback for Dropout — the icon rail down the left edge. Site-agnostic: the
// caller hands it the entries (id, label, icon) and says which one is the
// current page. The rail is its own focus region: ◀ from the left edge of the
// content enters it, ▲ ▼ move inside it without wrapping, and ▶ or back
// return to where the selection came from — the caller keeps that end.
//
// Only plain buttons live here. Nothing in the rail holds a value that the
// arrows could change, so the arrows always have a way out.

(function () {
  const RAIL_CLASS = "tenfoot-rail";
  const ITEM_CLASS = "tenfoot-rail-item";
  const SVG_NS = "http://www.w3.org/2000/svg";

  // 24×24 stroke icons, drawn with paths only.
  const ICONS = {
    search: ["M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13z", "M20 20l-4.35-4.35"],
    home: ["M3 11.5 12 4l9 7.5", "M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"],
    grid: ["M4.5 3h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 3 8.5v-4A1.5 1.5 0 0 1 4.5 3z",
      "M15.5 3h4A1.5 1.5 0 0 1 21 4.5v4a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 14 8.5v-4A1.5 1.5 0 0 1 15.5 3z",
      "M4.5 14h4a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 8.5 21h-4A1.5 1.5 0 0 1 3 19.5v-4A1.5 1.5 0 0 1 4.5 14z",
      "M15.5 14h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-4a1.5 1.5 0 0 1 1.5-1.5z"],
    bookmark: ["M6.5 3h11A1.5 1.5 0 0 1 19 4.5V21l-7-5-7 5V4.5A1.5 1.5 0 0 1 6.5 3z"],
    tv: ["M4.5 7h15A1.5 1.5 0 0 1 21 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-10A1.5 1.5 0 0 1 4.5 7z", "M8 3l4 4 4-4"],
    gear: ["M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z",
      "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"]
  };

  function icon(doc, name) {
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    for (const d of ICONS[name] || []) {
      const p = doc.createElementNS(SVG_NS, "path");
      p.setAttribute("d", d);
      svg.appendChild(p);
    }
    return svg;
  }

  /**
   * @param {Document} doc
   * @param {{id: string, label: string, icon: string, end?: boolean}[]} entries
   *   `end: true` pushes the entry to the foot of the rail (the gear). Icons:
   *   search, home, grid, bookmark, tv, gear.
   * @param {{onActivate: (id: string) => void}} handlers
   */
  function createRail(doc, entries, handlers) {
    const h = handlers || {};
    let nav = doc.querySelector(`.${RAIL_CLASS}`);
    if (nav) nav.remove();
    nav = doc.createElement("nav");
    nav.className = RAIL_CLASS;
    nav.setAttribute("aria-label", "Leanback");
    nav.hidden = true;
    const items = [];
    for (const it of entries || []) {
      if (!it || !it.id) continue;
      const b = doc.createElement("button");
      b.type = "button";
      b.className = ITEM_CLASS;
      b.dataset.tenfootRail = it.id;
      b.setAttribute("aria-label", it.label);
      b.title = it.label;
      if (it.end) b.dataset.tenfootEnd = "true";
      b.appendChild(icon(doc, it.icon));
      b.addEventListener("click", (e) => {
        // The site never sees this click; its handlers would move the focus.
        e.preventDefault();
        e.stopPropagation();
        if (typeof h.onActivate === "function") h.onActivate(it.id);
      });
      nav.appendChild(b);
      items.push(b);
    }
    doc.documentElement.appendChild(nav);
    let index = 0;
    let current = null;

    function show(on) {
      nav.hidden = !on;
    }

    // The entry for the page on screen is drawn highlighted, and is where the
    // selection lands the first time the rail is entered.
    function setCurrent(id) {
      current = id || null;
      items.forEach((b, i) => {
        if (b.dataset.tenfootRail === current) {
          b.dataset.tenfootPage = "true";
          index = i;
        } else delete b.dataset.tenfootPage;
      });
    }

    function element(i) {
      return items[Math.min(items.length - 1, Math.max(0, i))] || null;
    }

    function move(delta) {
      if (!items.length) return null;
      index = Math.min(items.length - 1, Math.max(0, index + delta));
      return items[index];
    }

    function select(el) {
      const i = items.indexOf(el);
      if (i >= 0) index = i;
    }

    function destroy() {
      nav.remove();
    }

    return Object.freeze({
      show, setCurrent, move, select, destroy, element: nav,
      get current() { return element(index); },
      get currentId() { const el = element(index); return el ? el.dataset.tenfootRail : null; },
      get visible() { return !nav.hidden; },
      contains: (el) => nav.contains(el),
      item: (id) => items.find((b) => b.dataset.tenfootRail === id) || null
    });
  }

  globalThis.TenfootRail = Object.freeze({ createRail, RAIL_CLASS, ITEM_CLASS });
})();
