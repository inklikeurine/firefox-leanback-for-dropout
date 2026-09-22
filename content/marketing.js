/* global browser, chrome */
// 10-Foot Dropout — www.dropout.tv, site root only, at document_start.
// The marketing home page is useless on a TV; with the "skip marketing site"
// setting on (default) it forwards straight to the app's Browse page.

(function () {
  const API = typeof browser !== "undefined" ? browser : chrome;
  const BROWSE = "https://watch.dropout.tv/browse";
  if (location.pathname !== "/") return;
  globalThis.TenfootSettings.load(API).then((s) => {
    if (s.enabled && s.skipMarketingSite) location.replace(BROWSE);
  }).catch(() => { /* leave the page alone */ });
})();
