// Leanback for Dropout — the focus ring and the hint bar. Site-agnostic DOM only:
// two fixed elements appended to <html> (outside <body>, so the site's CSS
// resets never touch them), positioned from getBoundingClientRect(). Styles
// are in content/page.css and driven by CSS custom properties.

(function () {
  const RING_CLASS = "tenfoot-ring";
  const HINTS_CLASS = "tenfoot-hints";
  const SCALED_CLASS = "tenfoot-scaled";
  const SCALE_VAR = "--tenfoot-zoom"; // percent; content/page.css does the maths
  const SETTLE_MS = 600; // keep following a target while smooth scroll settles
  const GLIDE_MS = 90; // the ring's move from one target to the next

  // A 2D matrix as getComputedStyle gives it, or null for anything else.
  function matrixOf(v) {
    if (!v || v === "none") return { a: 1, d: 1, e: 0, f: 0 };
    const m = /^matrix\(([^)]+)\)$/.exec(v);
    if (!m) return null;
    const n = m[1].split(",").map(Number);
    return n.length === 6 && n.every(Number.isFinite) ? { a: n[0], d: n[3], e: n[4], f: n[5] } : null;
  }

  // Where an inline transform of translate px values ends up, or null.
  function translateOf(v) {
    if (!v) return { x: 0, y: 0 };
    let x = 0;
    let y = 0;
    const re = /(translate[XY]?)\(\s*(-?[\d.]+)px(?:\s*,\s*(-?[\d.]+)px)?\s*\)/g;
    let rest = v;
    for (let m = re.exec(v); m; m = re.exec(v)) {
      if (m[1] === "translateX") x += Number(m[2]);
      else if (m[1] === "translateY") y += Number(m[2]);
      else {
        x += Number(m[2]);
        y += Number(m[3] || 0);
      }
      rest = rest.replace(m[0], "");
    }
    return rest.trim() ? null : { x, y };
  }

  /**
   * @param {Document} doc
   * @param {{color?: string, width?: number, scale?: boolean}} [style]
   */
  function createRing(doc, style) {
    const win = doc.defaultView || globalThis;
    const root = doc.documentElement;
    let el = doc.querySelector(`.${RING_CLASS}`);
    if (!el) {
      el = doc.createElement("div");
      el.className = RING_CLASS;
      el.setAttribute("aria-hidden", "true");
      el.hidden = true;
      root.appendChild(el);
    }
    let target = null;
    let raf = 0;
    let settleUntil = 0;
    let width = 4;
    let zoom = 5;
    // What the ring shows now, and the glide in progress: from `from` towards
    // wherever the target will be, between glideStart and glideStart + GLIDE_MS.
    let drawn = null;
    let from = null;
    let glideStart = 0;

    const now = () => (win.performance ? win.performance.now() : Date.now());

    function reducedMotion() {
      try {
        return Boolean(win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches);
      } catch (_err) {
        return false;
      }
    }

    // The target's box as it will be once the motion under way is over: the
    // zoom grown to its full size, and the rows Leanback slides (an inline
    // translate with a CSS transition) arrived where they are going. Aiming
    // there, the ring goes once to where the selection ends up and stays,
    // instead of riding along with the row and wobbling as it lands.
    function finalRect() {
      const r = target.getBoundingClientRect();
      let cx = r.left + r.width / 2;
      let cy = r.top + r.height / 2;
      let w = r.width;
      let h = r.height;
      try {
        const own = matrixOf(win.getComputedStyle(target).transform);
        const wanted = target.classList.contains(SCALED_CLASS) ? 1 + zoom / 100 : 1;
        if (own && own.a > 0 && own.d > 0) {
          w = (w / own.a) * wanted;
          h = (h / own.d) * wanted;
        }
        for (let a = target.parentElement; a && a !== root; a = a.parentElement) {
          if (!a.style || !a.style.transform) continue;
          const end = translateOf(a.style.transform);
          const cur = matrixOf(win.getComputedStyle(a).transform);
          if (!end || !cur || cur.a !== 1 || cur.d !== 1) continue;
          cx += end.x - cur.e;
          cy += end.y - cur.f;
        }
      } catch (_err) { /* the drawn box will do */ }
      return { left: cx - w / 2, top: cy - h / 2, width: w, height: h };
    }

    function draw(b, corner) {
      el.style.transform = `translate(${Math.round(b.left * 10) / 10}px, ${Math.round(b.top * 10) / 10}px)`;
      el.style.width = `${Math.round(b.width * 10) / 10}px`;
      el.style.height = `${Math.round(b.height * 10) / 10}px`;
      if (corner !== undefined) el.style.borderRadius = `${corner}px`;
      drawn = b;
    }

    function place() {
      raf = 0;
      if (!target || !target.isConnected) {
        hide();
        return;
      }
      const live = target.getBoundingClientRect();
      if (live.width <= 0 || live.height <= 0) {
        el.hidden = true;
        drawn = null;
        return;
      }
      const pad = width + 2;
      const f = finalRect();
      const end = { left: f.left - pad, top: f.top - pad, width: f.width + pad * 2, height: f.height + pad * 2 };
      const t = now();
      const k = from && GLIDE_MS > 0 ? Math.min(1, (t - glideStart) / GLIDE_MS) : 1;
      const ease = 1 - (1 - k) * (1 - k) * (1 - k);
      const box = k >= 1 ? end : {
        left: from.left + (end.left - from.left) * ease,
        top: from.top + (end.top - from.top) * ease,
        width: from.width + (end.width - from.width) * ease,
        height: from.height + (end.height - from.height) * ease
      };
      if (k >= 1) from = null;
      draw(box, Math.round((cornerOf(f) + pad) * 10) / 10);
      el.hidden = false;
      if (from || t < settleUntil) schedule();
    }

    // The target's corner radius as drawn at its full zoom (r is that box).
    // The ring sits one offset outside the target and adds that offset to the
    // radius, so the two curves run parallel: a rounded card gets a ring
    // rounded the same way, a square target a nearly square one.
    function cornerOf(r) {
      let v = "";
      try {
        v = String(win.getComputedStyle(target).borderTopLeftRadius || "");
      } catch (_err) {
        return 0;
      }
      const n = parseFloat(v);
      if (!Number.isFinite(n) || n <= 0) return 0;
      if (v.includes("%")) return (n / 100) * Math.min(r.width, r.height);
      const scaled = zoom > 0 && target.classList && target.classList.contains(SCALED_CLASS);
      return n * (scaled ? 1 + zoom / 100 : 1);
    }

    function schedule() {
      if (raf) return;
      raf = win.requestAnimationFrame(place);
    }

    // Start a glide from what is on screen now; a ring not showing yet just
    // appears on its target.
    function glide() {
      from = drawn && !el.hidden && !reducedMotion() ? drawn : null;
      glideStart = now();
    }

    // The zoom goes on the focused element itself. A transform does nothing to
    // a non-replaced inline box, so an inline target (the browse rows' links)
    // is made inline-block first. It deliberately does NOT scale the tile around it: a transform
    // makes its element the containing block for positioned descendants, which
    // moves the very thing we are trying to highlight.
    // An element marked data-tenfoot-nozoom (a text box) is ringed, not grown.
    function scaleTarget(el, on) {
      if (!on || (el.hasAttribute && el.hasAttribute("data-tenfoot-nozoom"))) {
        el.classList.remove(SCALED_CLASS);
        return;
      }
      el.classList.add(SCALED_CLASS);
      try {
        if (win.getComputedStyle(el).display === "inline") el.style.display = "inline-block";
      } catch (_err) { /* the class alone still applies */ }
    }

    function follow(next) {
      if (target && target !== next) scaleTarget(target, false);
      target = next || null;
      if (!target) {
        hide();
        return;
      }
      if (zoom > 0) scaleTarget(target, true);
      settleUntil = now() + SETTLE_MS;
      glide();
      place();
    }

    function hide() {
      if (target) scaleTarget(target, false);
      target = null;
      from = null;
      drawn = null;
      el.hidden = true;
    }

    function setStyle(s) {
      const st = s || {};
      if (typeof st.color === "string") root.style.setProperty("--tenfoot-ring-color", st.color);
      if (typeof st.width === "number") {
        width = st.width;
        root.style.setProperty("--tenfoot-ring-width", `${st.width}px`);
      }
      if (typeof st.zoom === "number") {
        zoom = st.zoom;
        root.style.setProperty(SCALE_VAR, String(zoom));
        if (target) scaleTarget(target, zoom > 0);
      }
      if (target) place();
    }

    const onScroll = () => { if (target) schedule(); };
    win.addEventListener("scroll", onScroll, { capture: true, passive: true });
    win.addEventListener("resize", onScroll, { passive: true });

    function destroy() {
      win.removeEventListener("scroll", onScroll, { capture: true });
      win.removeEventListener("resize", onScroll);
      if (raf) win.cancelAnimationFrame(raf);
      hide();
      el.remove();
    }

    setStyle(style);
    return Object.freeze({ follow, hide, setStyle, refresh: schedule, destroy, element: el, get target() { return target; } });
  }

  /**
   * The hint bar: a bottom strip listing the keys that matter right now.
   * show(items) renders [{keys, label}] and hides again after `ms`.
   * @param {Document} doc
   * @param {{enabled?: boolean, autoHideMs?: number}} [opts]
   */
  function createHintBar(doc, opts) {
    const o = opts || {};
    const win = doc.defaultView || globalThis;
    let el = doc.querySelector(`.${HINTS_CLASS}`);
    if (!el) {
      el = doc.createElement("div");
      el.className = HINTS_CLASS;
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.hidden = true;
      doc.documentElement.appendChild(el);
    }
    const list = doc.createElement("div");
    list.className = "tenfoot-hint-list";
    el.appendChild(list);
    let enabled = o.enabled !== false;
    let autoHideMs = typeof o.autoHideMs === "number" ? o.autoHideMs : 0; // 0 = stay up
    let timer = 0;
    let lastItems = [];

    function render(items) {
      while (list.firstChild) list.removeChild(list.firstChild);
      for (const it of items) {
        if (!it || !it.label) continue;
        const item = doc.createElement("span");
        item.className = "tenfoot-hint";
        // A notice ("Resumed at 12:04") has no key to show.
        if (it.keys) {
          const k = doc.createElement("kbd");
          k.className = "tenfoot-key";
          k.textContent = it.keys;
          item.appendChild(k);
        }
        const l = doc.createElement("span");
        l.className = "tenfoot-label";
        l.textContent = it.label;
        item.appendChild(l);
        list.appendChild(item);
      }
    }

    function arm() {
      if (timer) win.clearTimeout(timer);
      timer = autoHideMs > 0 ? win.setTimeout(hide, autoHideMs) : 0;
    }

    // `notice` shows it even with button hints off: for short messages ("No
    // next episode") rather than the hints themselves.
    function show(items, ms, notice) {
      if (Array.isArray(items)) lastItems = items;
      if (!enabled && !notice) return;
      render(lastItems);
      el.hidden = false;
      if (typeof ms === "number") {
        if (timer) win.clearTimeout(timer);
        timer = ms > 0 ? win.setTimeout(hide, ms) : 0;
      } else {
        arm();
      }
    }

    function hide() {
      if (timer) win.clearTimeout(timer);
      timer = 0;
      el.hidden = true;
    }

    function setEnabled(v) {
      enabled = Boolean(v);
      if (!enabled) hide();
    }

    function destroy() {
      hide();
      el.remove();
    }

    return Object.freeze({
      show, hide, setEnabled, destroy, element: el,
      get enabled() { return enabled; },
      get visible() { return !el.hidden; }
    });
  }

  // The element's rect as it would be without the focus zoom, so geometry does
  // not see the focused tile as slightly bigger than its neighbours.
  function unscaledRect(el, doc) {
    const r = el.getBoundingClientRect();
    if (!el.classList || !el.classList.contains(SCALED_CLASS)) return r;
    const d = doc || el.ownerDocument;
    const pct = Number((d && d.documentElement.style.getPropertyValue(SCALE_VAR)) || 0);
    const scale = 1 + (Number.isFinite(pct) ? pct : 0) / 100;
    if (scale <= 1) return r;
    const w = r.width / scale;
    const h = r.height / scale;
    const left = r.left + (r.width - w) / 2;
    const top = r.top + (r.height - h) / 2;
    return { left, top, width: w, height: h, right: left + w, bottom: top + h, x: left, y: top };
  }

  globalThis.TenfootFocusRing = Object.freeze({ createRing, createHintBar, unscaledRect, RING_CLASS, HINTS_CLASS, SCALED_CLASS, SCALE_VAR });
})();
