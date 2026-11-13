/* global browser, chrome */
// Leanback for Dropout — background (event page, persistent: false).
// Serves the site rules file, keeps per-tab registries of the player frame and
// of the profile watching (in storage.session, so they survive the event page
// unloading), relays
// messages page ⇄ player, owns the toolbar toggle and its badge, the
// keyboard command and the exit hook, and is the only writer of the watch
// history (lib/history.js). Every message gets a reply.

const API = typeof browser !== "undefined" ? browser : chrome;
const LOG = "[leanback-for-dropout]";
const RULES_URL = "sites/dropout.json";
const REGISTRY_KEY = "players";
const PROFILES_KEY = "profiles";
const Settings = globalThis.TenfootSettings;
const History = globalThis.TenfootHistory;

let rulesCache = null;
const memoryRegistries = new Map(); // key → Map: the fallback when storage.session is unavailable

// --- watch history: one writer, one write at a time ------------------------
// The page and the player frame both report; each change is read, applied and
// saved before the next starts, so two reports can never overwrite each other.
// Each goes to the history of the profile watching in that tab.
let historyQueue = Promise.resolve();

function updateHistory(profile, change) {
  const run = historyQueue.then(async () => {
    const before = await History.load(API, profile);
    const after = change(before);
    if (after !== before) await History.save(API, after, profile);
    return after;
  });
  historyQueue = run.catch((err) => console.warn(LOG, "watch history write failed:", err && err.message));
  return run;
}


async function loadRules() {
  if (rulesCache) return rulesCache;
  const res = await fetch(API.runtime.getURL(RULES_URL));
  if (!res.ok) throw new Error(`rules file failed to load: HTTP ${res.status}`);
  const rules = await res.json();
  if (!rules || typeof rules !== "object" || !Array.isArray(rules.routes)) throw new Error("rules file has no routes");
  rulesCache = rules;
  return rules;
}

// --- registries: tabId → frameId of the player frame, tabId → profile -------

function sessionStore() {
  return API.storage && API.storage.session ? API.storage.session : null;
}

function memoryOf(key) {
  if (!memoryRegistries.has(key)) memoryRegistries.set(key, new Map());
  return memoryRegistries.get(key);
}

async function getRegistry(key = REGISTRY_KEY) {
  const s = sessionStore();
  if (!s) return Object.fromEntries(memoryOf(key));
  let data;
  try {
    data = await s.get(key);
  } catch (err) {
    console.warn(LOG, "session storage read failed:", err && err.message);
    return Object.fromEntries(memoryOf(key));
  }
  const reg = data && data[key];
  return reg && typeof reg === "object" ? reg : {};
}

async function saveRegistry(reg, key = REGISTRY_KEY) {
  const mem = memoryOf(key);
  mem.clear();
  for (const [k, v] of Object.entries(reg)) mem.set(k, v);
  const s = sessionStore();
  if (!s) return;
  try {
    await s.set({ [key]: reg });
  } catch (err) {
    console.warn(LOG, "session storage write failed:", err && err.message);
  }
}

// The profile watching in a tab, as its page last said (profile:current); 0,
// the first profile, until it has.
async function setTabProfile(tabId, profile) {
  const reg = await getRegistry(PROFILES_KEY);
  reg[String(tabId)] = profile;
  await saveRegistry(reg, PROFILES_KEY);
}

async function profileOfTab(tabId) {
  if (tabId === null) return 0;
  const reg = await getRegistry(PROFILES_KEY);
  const p = reg[String(tabId)];
  return Number.isInteger(p) && p >= 0 ? p : 0;
}

// Every profile with a history of its own (0 always).
async function historyProfiles() {
  const found = new Set([0]);
  try {
    const all = await API.storage.local.get(null);
    for (const k of Object.keys(all || {})) {
      const m = new RegExp(`^${History.STORAGE_KEY}:(\\d+)$`).exec(k);
      if (m) found.add(Number(m[1]));
    }
  } catch (err) {
    console.warn(LOG, "watch history list failed:", err && err.message);
  }
  return [...found];
}

async function forgetTabProfile(tabId) {
  const reg = await getRegistry(PROFILES_KEY);
  if (!(String(tabId) in reg)) return;
  delete reg[String(tabId)];
  await saveRegistry(reg, PROFILES_KEY);
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

// `force`: close the tab whatever Back On Home says (the page asks for it
// when the site cannot be used: signed out, "Not now").
async function handleExit(sender, force) {
  const s = await Settings.load(API);
  const tabId = sender && sender.tab ? sender.tab.id : null;
  if ((force === true || s.exitHook === "close-tab") && typeof tabId === "number") {
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
    case "player:command":
    case "player:hold":
    case "player:focus":
    case "player:offer":
    case "player:back":
    case "player:settings":
      return fromTab() || relayToPlayer(tabId, message);
    case "profile:current": {
      // The page says which profile is watching; the first to say so gets the
      // history from before profiles.
      if (tabId === null) return { ok: false, error: "Not sent from a tab" };
      const n = Number(message.profile);
      const profile = Number.isInteger(n) && n >= 0 && n < 1000 ? n : 0;
      await setTabProfile(tabId, profile);
      const claimed = await History.claimLegacy(API, profile);
      return { ok: true, profile, claimed };
    }
    case "profile:get":
      return { ok: true, profile: await profileOfTab(tabId) };
    case "history:progress":
      await updateHistory(await profileOfTab(tabId), (s) => History.applyProgress(s, message, Date.now()));
      return { ok: true };
    case "history:meta":
      await updateHistory(await profileOfTab(tabId), (s) => History.applyMeta(s, message));
      return { ok: true };
    case "history:observe":
      await updateHistory(await profileOfTab(tabId), (s) => History.applyObservations(s, message.items, Date.now()));
      return { ok: true };
    case "history:forget": {
      // Clear Progress on one video's details page: the tab's profile.
      if (tabId === null) return { ok: false, error: "Not sent from a tab" };
      const key = History.keyOf(`/videos/${message.key}`);
      if (!key || key !== message.key) return { ok: false, error: "Not a video" };
      await updateHistory(await profileOfTab(tabId), (s) => History.forgetOne(s, key, Date.now()));
      return { ok: true };
    }
    case "history:clear": {
      // From a tab: its profile's. From the options page, which is in no
      // tab: every profile's.
      const all = tabId !== null ? [await profileOfTab(tabId)] : await historyProfiles();
      for (const profile of all) await updateHistory(profile, (s) => History.forget(s, Date.now()));
      return { ok: true };
    }
    case "player:state":
    case "player:ended":
    case "player:resumed":
    case "page:focus":
    case "page:episode":
    case "page:action":
    case "page:info":
    case "page:panel":
      return fromTab() || relayToPage(tabId, message);
    case "exit":
      return handleExit(sender, message.force);
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
  forgetTabProfile(tabId).catch(() => { /* nothing to forget */ });
});

// How Leanback was installed: from its folder (about:debugging) or signed.
// Back On Home's default follows it (lib/settings.js).
async function noteInstallType() {
  try {
    const info = await API.management.getSelf();
    const development = Boolean(info && info.installType === "development");
    const s = await Settings.load(API);
    if (s.development !== development) await Settings.save(API, { development });
  } catch (err) {
    console.warn(LOG, "install type unknown:", err && err.message);
  }
}

API.runtime.onInstalled.addListener(() => { updateBadge(); });
API.runtime.onStartup.addListener(() => { updateBadge(); });
updateBadge();
noteInstallType();
