/* global browser, chrome */
// Leanback for Dropout — watch.dropout.tv, at document_start: before any of
// Dropout's own scripts run.
//
// Signed out, Dropout's page at "/" sends anyone without a subscription on
// to signup.dropout.tv (an inline script of Dropout's), and that site does
// not answer: the tab loads for ever, then shows Firefox's "timed out" page
// (#11). Leanback draws its own welcome at "/" (Sign In, Browse), so while
// Leanback is on, that one move is cancelled and the welcome stays. With the
// Navigation API (Firefox 147 and later) the move is stopped before it
// starts; without it, content/page.js stops the load once it runs.

(function () {
  const API = typeof browser !== "undefined" ? browser : chrome;
  // Addresses Dropout's pages move to that never answer.
  const DEAD = new Set(["signup.dropout.tv"]);
  let enabled = true; // until the settings say otherwise
  try {
    API.storage.local.get("settings").then((d) => {
      enabled = !(d && d.settings && d.settings.enabled === false);
    }).catch(() => { /* on, as by default */ });
  } catch (_err) { /* on, as by default */ }
  const nav = window.navigation;
  if (!nav || typeof nav.addEventListener !== "function") return;
  nav.addEventListener("navigate", (e) => {
    try {
      if (!enabled || !e.cancelable) return;
      const host = new URL(e.destination.url).hostname;
      if (!DEAD.has(host)) return;
      e.preventDefault();
      console.warn("[leanback-for-dropout] kept the page from moving to", host, "(it does not answer)");
    } catch (_err) { /* leave the move alone */ }
  });
})();
