/* global browser, chrome */
// Leanback for Dropout — options page. Reads settings through the shared
// TenfootSettings module, saves on every change, follows storage changes
// made elsewhere (toolbar toggle) so the form never goes stale.

(function () {
  const API = typeof browser !== "undefined" ? browser : chrome;
  const Settings = globalThis.TenfootSettings;
  const $ = (id) => document.getElementById(id);
  const status = $("status");
  let statusTimer = 0;

  const CHECKBOXES = ["enabled", "skipMarketingSite", "hintBar", "autoplayNext", "startMuted"];
  const NUMBERS = ["ringWidth", "focusZoom"];
  const SELECTS = ["theater", "exitHook", "playerChrome"];
  const NUMERIC_SELECTS = ["seekStep"];

  function render(s) {
    for (const id of CHECKBOXES) $(id).checked = s[id];
    for (const id of NUMBERS) $(id).value = String(s[id]);
    for (const id of SELECTS) $(id).value = s[id];
    for (const id of NUMERIC_SELECTS) $(id).value = String(s[id]);
    $("ringColor").value = s.ringColor;
    $("ringColorText").value = s.ringColor;
  }

  function say(text) {
    status.textContent = text;
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.textContent = ""; }, 2000);
  }

  function readPatch(id) {
    if (CHECKBOXES.includes(id)) return { [id]: $(id).checked };
    if (NUMBERS.includes(id)) return { [id]: Number($(id).value) };
    if (SELECTS.includes(id)) return { [id]: $(id).value };
    if (NUMERIC_SELECTS.includes(id)) return { [id]: Number($(id).value) };
    if (id === "ringColor" || id === "ringColorText") return { ringColor: $(id).value };
    return null;
  }

  async function onChange(e) {
    const patch = readPatch(e.target.id);
    if (!patch) return;
    try {
      const s = await Settings.save(API, patch);
      render(s);
      say("Saved");
    } catch (err) {
      say("Could not save: " + (err && err.message ? err.message : "unknown error"));
    }
  }

  async function reset() {
    try {
      const s = await Settings.save(API, Settings.DEFAULTS);
      render(s);
      say("Defaults restored");
    } catch (err) {
      say("Could not reset: " + (err && err.message ? err.message : "unknown error"));
    }
  }

  // Forgetting cannot be undone, so the button asks once more first.
  let forgetArmed = false;
  async function forget() {
    const btn = $("forget");
    if (!forgetArmed) {
      forgetArmed = true;
      btn.textContent = "Click again to forget";
      return;
    }
    forgetArmed = false;
    btn.textContent = "Forget watch history";
    try {
      const r = await API.runtime.sendMessage({ type: "history:clear" });
      say(r && r.ok ? "Watch history forgotten" : "Could not forget: " + ((r && r.error) || "no reply"));
    } catch (err) {
      say("Could not forget: " + (err && err.message ? err.message : "unknown error"));
    }
  }

  function disarmForget() {
    if (!forgetArmed) return;
    forgetArmed = false;
    $("forget").textContent = "Forget watch history";
  }

  $("form").addEventListener("change", onChange);
  $("reset").addEventListener("click", reset);
  $("forget").addEventListener("click", forget);
  $("forget").addEventListener("blur", disarmForget);
  Settings.watch(API, render);
  Settings.load(API).then(render).catch(() => render(Settings.normalize(null)));
})();
