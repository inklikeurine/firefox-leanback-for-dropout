/* global browser, chrome */
// Leanback for Dropout — the toolbar button's panel, for a desktop: the on/off
// switch, what Leanback makes of the tab in front (the kind of page, whether
// the player is found, signed in or not), the version, and the way to all
// the settings. On a TV in kiosk there is no toolbar; the remote's Menu opens
// the settings there.

(function () {
  const API = typeof browser !== "undefined" ? browser : chrome;
  const Settings = globalThis.TenfootSettings;
  const LOG = "[leanback-for-dropout]";
  const $ = (id) => document.getElementById(id);
  // Leanback's names for its kinds of page, in plain words.
  const KINDS = {
    browse: "Home",
    series: "A show, or a list",
    video: "An episode",
    search: "Search",
    live: "Dropout 24/7",
    hub: "A collection",
    welcome: "Welcome (signed out)",
    signin: "Sign in",
    reset: "Password reset",
    profiles: "Who is watching?",
    profileEdit: "Edit profile",
    legal: "A policy",
    other: "Account or help"
  };
  const WATCH = { details: "its details page", playing: "playing" };

  function row(dl, term, value) {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dl.append(dt, dd);
  }

  async function showTab() {
    const dl = $("tab");
    dl.textContent = "";
    let tab = null;
    try {
      [tab] = await API.tabs.query({ active: true, currentWindow: true });
    } catch (err) {
      console.warn(LOG, "popup: no active tab:", err && err.message);
    }
    // The address is only readable on Dropout's own pages (the host permission).
    if (!tab || !tab.url || !/^https:\/\/watch\.dropout\.tv\//.test(tab.url)) {
      row(dl, "Page", "Not a Dropout page");
      return;
    }
    let s = null;
    try {
      s = await API.tabs.sendMessage(tab.id, { type: "page:state" }, { frameId: 0 });
    } catch (_err) {
      s = null;
    }
    if (!s || !s.ok) {
      row(dl, "Page", "Leanback is not running here (reload the tab)");
      return;
    }
    row(dl, "Address", new URL(tab.url).pathname);
    row(dl, "Page", KINDS[s.kind] || s.kind || "?");
    if (s.kind === "video") row(dl, "Episode", WATCH[s.watch] || s.watch || "?");
    if (s.kind === "video" || s.kind === "live") row(dl, "Player", s.playerReady ? "found" : "not found yet");
    row(dl, "Signed in", s.signedIn === true ? "yes" : s.signedIn === false ? "no" : "?");
    row(dl, "Leanback", s.enabled ? "on" : "off");
  }

  async function init() {
    $("version").textContent = `v${API.runtime.getManifest().version}`;
    const box = $("enabled");
    const s = await Settings.load(API);
    box.checked = Boolean(s.enabled);
    box.addEventListener("change", async () => {
      await Settings.save(API, { enabled: box.checked });
      setTimeout(showTab, 300);
    });
    $("settings").addEventListener("click", () => {
      API.runtime.openOptionsPage();
      window.close();
    });
    try {
      const cmds = await API.commands.getAll();
      const c = cmds.find((x) => x.name === "toggle-tv-mode");
      $("shortcut").textContent = c && c.shortcut ? `Shortcut to turn it on or off: ${c.shortcut}` : "A shortcut to turn it on or off can be set in Add-ons → ⚙ → Manage Extension Shortcuts.";
    } catch (_err) { /* no commands API: no line */ }
    await showTab();
  }

  init().catch((err) => console.error(LOG, "popup failed:", err));
})();
