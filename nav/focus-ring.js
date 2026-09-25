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

  function reducedMotion(win) {
    try {
      return Boolean(win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (_err) {
      return false;
    }
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

    function place() {
      raf = 0;
      if (!target || !target.isConnected) {
        hide();
        return;
      }
      const r = target.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) {
        el.hidden = true;
        return;
      }
      const pad = width + 2;
      el.style.left = `${r.left - pad}px`;
      el.style.top = `${r.top - pad}px`;
      el.style.width = `${r.width + pad * 2}px`;
      el.style.height = `${r.height + pad * 2}px`;
      el.hidden = false;
      if (win.performance && win.performance.now() < settleUntil) schedule();
    }

    function schedule() {
      if (raf) return;
      raf = win.requestAnimationFrame(place);
    }

    // The zoom goes on the focused element itself. A transform does nothing to
    // a non-replaced inline box — which is why the old setting appeared to do
    // nothing on the browse rows — so an inline target is made inline-block
    // first. It deliberately does NOT scale the tile around it: a transform
    // makes its element the containing block for positioned descendants, which
    // moves the very thing we are trying to highlight.
    function scaleTarget(el, on) {
      if (!on) {
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
      settleUntil = win.performance ? win.performance.now() + SETTLE_MS : 0;
      place();
    }

    function hide() {
      if (target) scaleTarget(target, false);
      target = null;
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
    const osd = doc.createElement("div");
    osd.className = "tenfoot-osd";
    osd.hidden = true;
    const list = doc.createElement("div");
    list.className = "tenfoot-hint-list";
    el.appendChild(osd);
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
        const k = doc.createElement("kbd");
        k.className = "tenfoot-key";
        k.textContent = it.keys || "";
        const l = doc.createElement("span");
        l.className = "tenfoot-label";
        l.textContent = it.label;
        item.appendChild(k);
        item.appendChild(l);
        list.appendChild(item);
      }
    }

    function arm() {
      if (timer) win.clearTimeout(timer);
      timer = autoHideMs > 0 ? win.setTimeout(hide, autoHideMs) : 0;
    }

    function show(items, ms, force) {
      if (Array.isArray(items)) lastItems = items;
      if (!enabled && !force) return;
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
      osd.hidden = true;
    }

    function setOsd(text) {
      if (typeof text === "string" && text) {
        osd.textContent = text;
        osd.hidden = false;
      } else {
        osd.textContent = "";
        osd.hidden = true;
      }
    }

    function setEnabled(v) {
      enabled = Boolean(v);
      if (!enabled) hide();
    }

    // Show regardless of the setting (the Info key), for `ms` milliseconds.
    function force(items, ms) {
      show(items, ms, true);
    }

    function destroy() {
      hide();
      el.remove();
    }

    return Object.freeze({
      show, hide, setOsd, setEnabled, force, destroy, element: el,
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
