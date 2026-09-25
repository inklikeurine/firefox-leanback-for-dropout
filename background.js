/* global browser, chrome */
// Leanback for Dropout — background (event page, persistent: false).
// Serves the site rules file, keeps a per-tab registry of the player frame
// (in storage.session, so it survives the event page unloading), relays
// messages page ⇄ player, owns the toolbar toggle and its badge, the
// keyboard command and the exit hook. Every message gets a reply.

const API = typeof browser !== "undefined" ? browser : chrome;
const LOG = "[leanback-for-dropout]";
const RULES_URL = "sites/dropout.json";
const REGISTRY_KEY = "players";
const Settings = globalThis.TenfootSettings;

let rulesCache = null;
const memoryRegistry = new Map(); // fallback when storage.session is unavailable

async function loadRules() {
  if (rulesCache) return rulesCache;
  const res = await fetch(API.runtime.getURL(RULES_URL));
  if (!res.ok) throw new Error(`rules file failed to load: HTTP ${res.status}`);
  const rules = await res.json();
  if (!rules || typeof rules !== "object" || !Array.isArray(rules.routes)) throw new Error("rules file has no routes");
  rulesCache = rules;
  return rules;
}

// --- registry: tabId → frameId of the player frame -------------------------

function sessionStore() {
  return API.storage && API.storage.session ? API.storage.session : null;
}

async function getRegistry() {
  const s = sessionStore();
  if (!s) return Object.fromEntries(memoryRegistry);
  let data;
  try {
    data = await s.get(REGISTRY_KEY);
  } catch (err) {
    console.warn(LOG, "session storage read failed:", err && err.message);
    return Object.fromEntries(memoryRegistry);
  }
  const reg = data && data[REGISTRY_KEY];
  return reg && typeof reg === "object" ? reg : {};
}

async function saveRegistry(reg) {
  memoryRegistry.clear();
  for (const [k, v] of Object.entries(reg)) memoryRegistry.set(k, v);
  const s = sessionStore();
  if (!s) return;
  try {
    await s.set({ [REGISTRY_KEY]: reg });
  } catch (err) {
    console.warn(LOG, "session storage write failed:", err && err.message);
  }
}

async function setPlayerFrame(tabId, frameId) {
  const reg = await getRegistry();
  reg[String(tabId)] = frameId;
  await saveRegistry(reg);
}

async function forgetPlayerFrame(tabId) {
  const reg = await getRegistry();
  if (!(String(tabId) in reg)) return;
  delete reg[String(tabId)];
  await saveRegistry(reg);
}

async function playerFrameOf(tabId) {
  const reg = await getRegistry();
  const f = reg[String(tabId)];
  return typeof f === "number" ? f : null;
}

// --- relay -------------------------------------------------------------------

async function sendToFrame(tabId, frameId, message) {
  try {
    const r = await API.tabs.sendMessage(tabId, message, { frameId });
    return r === undefined ? { ok: false, error: "No reply from frame" } : r;
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

async function relayToPlayer(tabId, message) {
  const frameId = await playerFrameOf(tabId);
  if (frameId === null) return { ok: false, error: "No player frame registered for this tab" };
  const r = await sendToFrame(tabId, frameId, message);
  if (!r.ok && /receiving end does not exist/i.test(r.error || "")) await forgetPlayerFrame(tabId);
  return r;
}

function relayToPage(tabId, message) {
  return sendToFrame(tabId, 0, message);
}

// --- toggle, badge, exit -----------------------------------------------------

async function toggleEnabled() {
  const s = await Settings.load(API);
  return Settings.save(API, { enabled: !s.enabled });
}

async function updateBadge(settings) {
  const s = settings || (await Settings.load(API));
  try {
    await API.browserAction.setBadgeText({ text: s.enabled ? "" : "OFF" });
    await API.browserAction.setBadgeBackgroundColor({ color: "#5a5a5a" });
    await API.browserAction.setTitle({ title: s.enabled ? "Leanback for Dropout is on (click to turn off)" : "Leanback for Dropout is off (click to turn on)" });
  } catch (err) {
    console.warn(LOG, "badge update failed:", err && err.message);
  }
  return s;
}

async function handleExit(sender) {
  const s = await Settings.load(API);
  const tabId = sender && sender.tab ? sender.tab.id : null;
  if (s.exitHook === "close-tab" && typeof tabId === "number") {
    await API.tabs.remove(tabId);
    return { ok: true, action: "close-tab" };
  }
  return { ok: true, action: "none" };
}

// --- messages ----------------------------------------------------------------

async function handleMessage(message, sender) {
  if (!message || typeof message.type !== "string") return { ok: false, error: "Invalid message" };
  const tabId = sender && sender.tab && typeof sender.tab.id === "number" ? sender.tab.id : null;
  const frameId = sender && typeof sender.frameId === "number" ? sender.frameId : null;
  const fromTab = () => (tabId === null ? { ok: false, error: "Not sent from a tab" } : null);
  switch (message.type) {
    case "rules:get":
      return { ok: true, rules: await loadRules() };
    case "settings:get":
      return { ok: true, settings: await Settings.load(API) };
    case "settings:set":
      return { ok: true, settings: await Settings.save(API, message.patch) };
    case "player:hello": {
      if (tabId === null || frameId === null) return { ok: false, error: "Not sent from a tab frame" };
      await setPlayerFrame(tabId, frameId);
      relayToPage(tabId, { type: "player:ready", frameId, videoId: message.videoId || null, title: message.title || "" });
      return { ok: true, tabId, frameId };
    }
    case "player:bye":
      if (tabId !== null) await forgetPlayerFrame(tabId);
      return { ok: true };
    case "player:command":
    case "player:focus":
    case "player:offer":
    case "player:back":
    case "player:settings":
      return fromTab() || relayToPlayer(tabId, message);
    case "player:state":
    case "player:ended":
    case "page:focus":
    case "page:episode":
    case "page:info":
    case "page:action":
      return fromTab() || relayToPage(tabId, message);
    case "exit":
      return handleExit(sender);
    default:
      return { ok: false, error: "Unknown message" };
  }
}

API.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((result) => sendResponse(result))
    .catch((err) => sendResponse({ ok: false, error: err && err.message ? err.message : "Error" }));
  return true;
});

API.browserAction.onClicked.addListener(() => {
  toggleEnabled().catch((err) => console.error(LOG, "toggle failed:", err));
});

if (API.commands && API.commands.onCommand) {
  API.commands.onCommand.addListener((command) => {
    if (command === "toggle-tv-mode") toggleEnabled().catch((err) => console.error(LOG, "toggle failed:", err));
  });
}

API.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[Settings.STORAGE_KEY]) updateBadge(Settings.normalize(changes[Settings.STORAGE_KEY].newValue));
});

API.tabs.onRemoved.addListener((tabId) => {
  forgetPlayerFrame(tabId).catch(() => { /* nothing to forget */ });
});

API.runtime.onInstalled.addListener(() => { updateBadge(); });
API.runtime.onStartup.addListener(() => { updateBadge(); });
updateBadge();
