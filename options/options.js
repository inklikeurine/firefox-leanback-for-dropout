/* global browser, chrome */
// Leanback for Dropout — options page. Reads settings through the shared
// TenfootSettings module, saves on every change, follows storage changes
// made elsewhere (toolbar toggle) so the form never goes stale. The settings
// section is built from the one list (TenfootSettings.ROWS), so its names and
// value words are the TV panels' own.

(function () {
  const API = typeof browser !== "undefined" ? browser : chrome;
  const Settings = globalThis.TenfootSettings;
  const $ = (id) => document.getElementById(id);
  const status = $("status");
  let statusTimer = 0;

  // One row per entry of the list: a checkbox for an on/off, a drop-down for
  // a choice.
  function buildRows() {
    const box = $("rows");
    for (const row of Settings.ROWS) {
      const line = document.createElement(row.kind === "toggle" ? "label" : "div");
      line.className = "row";
      if (row.kind === "toggle") {
        const input = document.createElement("input");
        input.type = "checkbox";
        input.id = row.id;
        const text = document.createElement("span");
        text.textContent = row.label;
        line.append(input, text);
      } else {
        const label = document.createElement("label");
        label.htmlFor = row.id;
        label.textContent = row.label;
        const select = document.createElement("select");
        select.id = row.id;
        line.append(label, select);
      }
      box.appendChild(line);
    }
  }

  // A choice's options: its values, and the current one when it is not
  // among them (a colour of your own, an older ring width).
  function fillChoices(row, current) {
    const select = $(row.id);
    const values = Settings.choicesOf(row, current);
    const want = values.map(String).join("|");
    if (select.dataset.values !== want) {
      while (select.firstChild) select.removeChild(select.firstChild);
      for (const v of values) {
        const opt = document.createElement("option");
        opt.value = String(v);
        opt.textContent = Settings.valueText(row, v);
        select.appendChild(opt);
      }
      select.dataset.values = want;
    }
    select.value = String(current);
  }

  function render(s) {
    $("enabled").checked = s.enabled;
    $("playerChrome").value = s.playerChrome;
    for (const row of Settings.ROWS) {
      if (row.kind === "toggle") $(row.id).checked = Boolean(s[row.id]);
      else fillChoices(row, s[row.id]);
    }
    $("ringColorPicker").value = s.ringColor;
    $("ringColorText").value = s.ringColor;
  }

  function say(text) {
    status.textContent = text;
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.textContent = ""; }, 2000);
  }

  function readPatch(id) {
    if (id === "enabled") return { enabled: $(id).checked };
    if (id === "playerChrome") return { playerChrome: $(id).value };
    if (id === "ringColorPicker" || id === "ringColorText") return { ringColor: $(id).value };
    const row = Settings.rowOf(id);
    if (!row) return null;
    if (row.kind === "toggle") return { [id]: $(id).checked };
    const raw = $(id).value;
    const v = row.values.some((x) => typeof x === "number") ? Number(raw) : raw;
    return { [id]: v };
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

  // Clearing cannot be undone, so the button asks once more first.
  let forgetArmed = false;
  async function forget() {
    const btn = $("forget");
    if (!forgetArmed) {
      forgetArmed = true;
      btn.textContent = "Click again to clear";
      return;
    }
    forgetArmed = false;
    btn.textContent = "Clear Continue Watching";
    try {
      const r = await API.runtime.sendMessage({ type: "history:clear" });
      say(r && r.ok ? "Continue Watching cleared" : "Could not clear: " + ((r && r.error) || "no reply"));
    } catch (err) {
      say("Could not clear: " + (err && err.message ? err.message : "unknown error"));
    }
  }

  function disarmForget() {
    if (!forgetArmed) return;
    forgetArmed = false;
    $("forget").textContent = "Clear Continue Watching";
  }

  buildRows();
  $("form").addEventListener("change", onChange);
  $("reset").addEventListener("click", reset);
  $("forget").addEventListener("click", forget);
  $("forget").addEventListener("blur", disarmForget);
  Settings.watch(API, render);
  Settings.load(API).then(render).catch(() => render(Settings.normalize(null)));
})();
