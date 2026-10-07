/* global browser, chrome */
// Leanback for Dropout — small helpers every content script uses: finding
// elements by a selector that may be wrong (a site change, a rule typo)
// without ever throwing, reading an element's text, writing a time as the
// screen shows it, and messaging the background with a reply that is always
// an object.
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

  globalThis.TenfootCommon = Object.freeze({ qs, qsa, matches, textOf, clock, send });
})();
