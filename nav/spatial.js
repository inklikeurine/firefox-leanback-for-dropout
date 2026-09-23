// 10-Foot Dropout — spatial navigation. Site-agnostic: it sees a rules object
// (selectors) and rectangles, never a site. Two halves:
//   * pure geometry — pick() and rowPick() work on {rect} objects and are
//     unit-tested without a DOM;
//   * DOM collection — collect() turns a page-kind's rules into candidates.
// Rules: nearest neighbour in the pressed direction, axis-aligned overlap
// beats plain distance, no wrapping, rows are row-wise.

(function () {
  const EDGE_TOLERANCE = 2; // px a leading edge may overlap the trailing edge
  const CENTRE_TOLERANCE = 4; // px a centre must be past the current centre (loose pass)

  function centre(r) {
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function hasArea(r) {
    return Boolean(r) && r.width > 0 && r.height > 0;
  }

  // Distance along the axis, the gap between the two projections across it
  // (0 when they overlap), the centre offset and the overlap flag, for a move
  // from `from` towards candidate `r`. null = candidate is on the wrong side.
  function relation(direction, from, r, strict) {
    const fc = centre(from);
    const rc = centre(r);
    const gapX = Math.max(0, r.left - from.right, from.left - r.right);
    const gapY = Math.max(0, r.top - from.bottom, from.top - r.bottom);
    switch (direction) {
      case "up":
        if (strict ? r.bottom > from.top + EDGE_TOLERANCE : rc.y > fc.y - CENTRE_TOLERANCE) return null;
        return { axis: Math.max(0, from.top - r.bottom), gap: gapX, centre: Math.abs(rc.x - fc.x), overlap: gapX === 0 };
      case "down":
        if (strict ? r.top < from.bottom - EDGE_TOLERANCE : rc.y < fc.y + CENTRE_TOLERANCE) return null;
        return { axis: Math.max(0, r.top - from.bottom), gap: gapX, centre: Math.abs(rc.x - fc.x), overlap: gapX === 0 };
      case "left":
        if (strict ? r.right > from.left + EDGE_TOLERANCE : rc.x > fc.x - CENTRE_TOLERANCE) return null;
        return { axis: Math.max(0, from.left - r.right), gap: gapY, centre: Math.abs(rc.y - fc.y), overlap: gapY === 0 };
      case "right":
        if (strict ? r.left < from.right - EDGE_TOLERANCE : rc.x < fc.x + CENTRE_TOLERANCE) return null;
        return { axis: Math.max(0, r.left - from.right), gap: gapY, centre: Math.abs(rc.y - fc.y), overlap: gapY === 0 };
      default:
        return null;
    }
  }

  // Lower is better. Candidates whose projection overlaps the current
  // element's on the orthogonal axis always rank before those that do not
  // (axis-aligned overlap beats distance); among them the nearest
  // along the axis wins, in 8 px buckets so a one-pixel misalignment does not
  // matter, and the centre offset only breaks ties. Non-overlapping candidates
  // rank by axis distance + 2 × the gap between projections + centre/4.
  function score(rel) {
    if (rel.overlap) return Math.round(rel.axis / 8) * 80 + Math.min(79, rel.centre / 20);
    return 1e6 + rel.axis + 2 * rel.gap + rel.centre / 4;
  }

  /**
   * Geometric move: the candidate with the lowest score() in the pressed
   * direction. First pass requires the candidate's leading edge to be past
   * the current trailing edge; if nothing qualifies, a second pass only
   * requires its centre to be.
   * @param {"up"|"down"|"left"|"right"} direction
   * @param {DOMRect|{left,top,right,bottom,width,height}} from
   * @param {{rect: object}[]} candidates — without the current element
   * @returns {object|null} the winning candidate, or null (no wrap)
   */
  function pick(direction, from, candidates) {
    if (!hasArea(from) || !Array.isArray(candidates)) return null;
    for (const strict of [true, false]) {
      let best = null;
      let bestScore = Infinity;
      for (const c of candidates) {
        if (!c || !hasArea(c.rect)) continue;
        const rel = relation(direction, from, c.rect, strict);
        if (!rel) continue;
        const sc = score(rel);
        if (sc < bestScore) {
          bestScore = sc;
          best = c;
        }
      }
      if (best) return best;
    }
    return null;
  }

  function inViewport(r, viewport) {
    if (!viewport) return true;
    return r.right > 0 && r.left < viewport.width && r.bottom > 0 && r.top < viewport.height;
  }

  /**
   * Row-aware move for pages laid out as horizontal rows (a browse page).
   * Left/Right: previous/next item of the same row in DOM order, no wrap.
   * Up/Down: the adjacent row with items; inside it, the item remembered for
   * that row (focus memory), else the visible item whose centre x is nearest.
   * @param {"up"|"down"|"left"|"right"} direction
   * @param {{el: any, rect: object, row: any}} current
   * @param {{row: any, items: {el: any, rect: object}[]}[]} rows — DOM order
   * @param {Map<any, any>} [memory] — row → last focused element
   * @param {{width: number, height: number}} [viewport]
   * @returns {object|null}
   */
  function rowPick(direction, current, rows, memory, viewport) {
    if (!current || !Array.isArray(rows)) return null;
    const ri = rows.findIndex((r) => r.row === current.row);
    if (ri < 0) return null;
    const items = rows[ri].items;
    const ii = items.findIndex((c) => c.el === current.el);
    if (direction === "left") return ii > 0 ? items[ii - 1] : null;
    if (direction === "right") return ii >= 0 && ii < items.length - 1 ? items[ii + 1] : null;
    if (direction !== "up" && direction !== "down") return null;
    const step = direction === "up" ? -1 : 1;
    for (let j = ri + step; j >= 0 && j < rows.length; j += step) {
      const r = rows[j];
      if (!r.items.length) continue;
      const remembered = memory && memory.get(r.row);
      if (remembered) {
        const m = r.items.find((c) => c.el === remembered);
        if (m) return m;
      }
      const pool = r.items.filter((c) => inViewport(c.rect, viewport));
      const cx = centre(current.rect).x;
      let best = null;
      let bestD = Infinity;
      for (const c of pool.length ? pool : r.items) {
        const d = Math.abs(centre(c.rect).x - cx);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      return best;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // DOM collection
  // ---------------------------------------------------------------------------

  function isVisible(el, win) {
    if (!el || el.nodeType !== 1 || typeof el.getBoundingClientRect !== "function") return false;
    if (el.disabled) return false;
    if (el.closest && el.closest('[aria-hidden="true"]')) return false;
    const r = el.getBoundingClientRect();
    if (!hasArea(r)) return false;
    const w = win || globalThis;
    if (typeof w.getComputedStyle === "function") {
      const cs = w.getComputedStyle(el);
      if (cs && (cs.visibility === "hidden" || cs.display === "none")) return false;
    }
    return true;
  }

  /**
   * Turn a page kind's rules into focus candidates.
   * @param {Element|Document} scope — the document, or the open modal
   * @param {{rows?, rowItem?, tile?, target?, focusable?}} rules
   * @param {{win?: Window, extra?: Element[], common?: string[]}} [opts]
   *   extra: elements the caller wants as candidates (a player mount);
   *   common: selectors that apply on every page kind (site header links).
   * @returns {{candidates: {el, rect, row?, tile?}[], rows: {row, items}[]}}
   */
  function collect(scope, rules, opts) {
    const o = opts || {};
    const win = o.win || globalThis;
    const R = globalThis.TenfootSiteRules;
    const rowSel = R.selector(rules.rows);
    const itemSel = R.selector(rules.rowItem);
    const tileSel = R.selector(rules.tile);
    const targetSel = R.selector(rules.target) || "a[href]";
    const seen = new Set();
    const candidates = [];
    const rows = [];
    const rectOf = (el) => el.getBoundingClientRect();
    const targetIn = (container) => (container.matches(targetSel) ? container : container.querySelector(targetSel));

    if (rowSel && itemSel) {
      for (const row of scope.querySelectorAll(rowSel)) {
        const items = [];
        for (const item of row.querySelectorAll(itemSel)) {
          const target = targetIn(item);
          if (!target || seen.has(target) || !isVisible(target, win)) continue;
          seen.add(target);
          const cand = { el: target, rect: rectOf(target), row, tile: item };
          items.push(cand);
          candidates.push(cand);
        }
        if (items.length) rows.push({ row, items });
      }
    }
    if (tileSel) {
      for (const tile of scope.querySelectorAll(tileSel)) {
        if (rowSel && tile.closest(rowSel)) continue;
        const target = targetIn(tile);
        if (!target || seen.has(target) || !isVisible(target, win)) continue;
        seen.add(target);
        candidates.push({ el: target, rect: rectOf(target), tile });
      }
    }
    const loose = [...R.selectorList(rules.focusable), ...R.selectorList(o.common)];
    for (const sel of loose) {
      let els;
      try {
        els = scope.querySelectorAll(sel);
      } catch (_err) {
        continue;
      }
      for (const el of els) {
        if (seen.has(el) || !isVisible(el, win)) continue;
        if (tileSel && el.closest(tileSel)) continue;
        if (itemSel && el.closest(itemSel)) continue;
        seen.add(el);
        candidates.push({ el, rect: rectOf(el) });
      }
    }
    for (const el of o.extra || []) {
      if (!el || seen.has(el) || !isVisible(el, win)) continue;
      seen.add(el);
      candidates.push({ el, rect: rectOf(el) });
    }
    return { candidates, rows };
  }

  globalThis.TenfootSpatial = Object.freeze({ pick, rowPick, collect, isVisible, centre, EDGE_TOLERANCE, CENTRE_TOLERANCE });
})();
