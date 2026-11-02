/* global browser, chrome */
// Leanback for Dropout — small helpers every content script uses: finding
// elements by a selector that may be wrong (a site change, a rule typo)
// without ever throwing, reading an element's text, writing a time as the
// screen shows it, which of the account's profiles is watching, messaging
// the background with a reply that is always an object, and building the
// elements and icons Leanback draws.
//
// Exposed as globalThis.TenfootCommon to the scripts listed after it in the
// same manifest entry.

(function () {
  // A rule may be one selector or a list of them (sites/dropout.json).
  function selectorOf(value) {
    if (Array.isArray(value)) return value.filter((s) => typeof s === "string" && s.trim()).join(", ") || null;
    return typeof value === "string" && value.trim() ? value : null;
  }

  /** The first match in `scope` (default: the document), or null. Never throws. */
  function qs(sel, scope) {
    const s = selectorOf(sel);
    if (!s) return null;
    try {
      return (scope || document).querySelector(s);
    } catch (_err) {
      return null;
    }
  }

  /** Every match in `scope` (default: the document), as an array. Never throws. */
  function qsa(sel, scope) {
    const s = selectorOf(sel);
    if (!s) return [];
    try {
      return Array.from((scope || document).querySelectorAll(s));
    } catch (_err) {
      return [];
    }
  }

  /** Whether `el` matches the selector; false for no selector or a bad one. */
  function matches(el, sel) {
    const s = selectorOf(sel);
    if (!s || !el || typeof el.matches !== "function") return false;
    try {
      return el.matches(s);
    } catch (_err) {
      return false;
    }
  }

  /** An element's text, its runs of white space (non-breaking too) made one space. */
  function textOf(el) {
    return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "";
  }

  /** Seconds as the screen writes a time: "2:48", "1:12:05". */
  function clock(seconds) {
    let n = Number(seconds);
    if (!Number.isFinite(n) || n < 0) n = 0;
    const s = Math.floor(n);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  }

  /**
   * Which of the account's profiles is watching: the page's
   * `VHX.config.profile_index` (0 for the first), read from its inline
   * script, since a content script does not see the page's own variables.
   * 0 when the page says nothing.
   */
  function profileIndex(doc) {
    const d = doc || document;
    for (const s of Array.from(d.scripts || [])) {
      if (s.src) continue;
      const m = /\bprofile_index\s*:\s*(\d{1,3})\b/.exec(s.textContent || "");
      if (m) return Number(m[1]);
    }
    return 0;
  }

  /** A message to the background. The reply is always an object: {ok: false, error} when there is none. */
  async function send(msg) {
    const API = typeof browser !== "undefined" ? browser : chrome;
    try {
      const r = await API.runtime.sendMessage(msg);
      return r === undefined ? { ok: false, error: "No reply" } : r;
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  }

  /** A new element of `doc`, with `cls` as its class when given. */
  function el(doc, tag, cls) {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  const SVG_NS = "http://www.w3.org/2000/svg";

  /**
   * A 24×24 icon drawn in currentColor from one path or several: stroked
   * (round ends, `strokeWidth`, default 2) or, with `fill`, filled.
   * @param {Document} doc
   * @param {string|string[]} paths
   * @param {{fill?: boolean, strokeWidth?: number}} [opts]
   */
  function svgIcon(doc, paths, opts) {
    const o = opts || {};
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("aria-hidden", "true");
    if (o.fill) {
      svg.setAttribute("fill", "currentColor");
    } else {
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", String(o.strokeWidth || 2));
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
    }
    for (const d of [].concat(paths || [])) {
      const path = doc.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    }
    return svg;
  }

  /**
   * Type `value` into one of the site's text boxes as if typed there: its
   * own value setter (past a framework's watcher on the element), then an
   * input event, which is what a React box listens for.
   */
  function typeInto(input, value) {
    if (!input || !input.isConnected) return;
    const win = input.ownerDocument.defaultView || globalThis;
    try {
      const desc = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value");
      if (desc && desc.set) desc.set.call(input, value);
      else input.value = value;
    } catch (_err) {
      input.value = value;
    }
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
  }

  /** Whether the system asks for less motion (prefers-reduced-motion). */
  function prefersReducedMotion(win) {
    try {
      const w = win || window;
      return Boolean(w.matchMedia && w.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (_err) {
      return false;
    }
  }

  globalThis.TenfootCommon = Object.freeze({ qs, qsa, matches, textOf, clock, profileIndex, send, el, svgIcon, typeInto, prefersReducedMotion });
})();
