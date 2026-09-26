// Leanback for Dropout — settings shared by the background, the content scripts and
// the options page. One object under storage.local key "settings"; defaults
// are applied on every read, so a missing or corrupt value never throws.
//
// Exposed as globalThis.TenfootSettings so the scripts listed after this one in
// the same manifest entry (and the options page) can use it.

(function () {
  const DEFAULTS = Object.freeze({
    enabled: true,
    ringColor: "#feea3b",
    ringWidth: 4,
    focusZoom: 5,
    hintBar: false,
    theater: "auto",
    playerChrome: "leanback",
    seekStep: 10,
    autoplayNext: true,
    startMuted: false,
    skipMarketingSite: true,
    exitHook: "none"
  });

  const THEATER = ["auto", "manual", "off"];
  const PLAYER_CHROME = ["leanback", "site"];
  const SEEK_STEPS = [5, 10, 15, 30, 60, 120, 300];
  const EXIT_HOOK = ["none", "close-tab"];
  const STORAGE_KEY = "settings";

  function bool(v, d) {
    return typeof v === "boolean" ? v : d;
  }

  function int(v, d, min, max) {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n !== "number" || !Number.isFinite(n)) return d;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  function color(v, d) {
    return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : d;
  }

  // Snap to the nearest offered value, so an old or hand-edited number still
  // lands on something the settings panel can show.
  function nearest(v, list, d) {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n !== "number" || !Number.isFinite(n)) return d;
    return list.reduce((best, x) => (Math.abs(x - n) < Math.abs(best - n) ? x : best), list[0]);
  }

  function oneOf(v, list, d) {
    return list.includes(v) ? v : d;
  }

  // Turn whatever is in storage into a complete, valid settings object.
  function normalize(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    return {
      enabled: bool(r.enabled, DEFAULTS.enabled),
      ringColor: color(r.ringColor, DEFAULTS.ringColor),
      ringWidth: int(r.ringWidth, DEFAULTS.ringWidth, 2, 12),
      focusZoom: int(r.focusZoom, DEFAULTS.focusZoom, 0, 25),
      hintBar: bool(r.hintBar, DEFAULTS.hintBar),
      theater: oneOf(r.theater, THEATER, DEFAULTS.theater),
      playerChrome: oneOf(r.playerChrome, PLAYER_CHROME, DEFAULTS.playerChrome),
      seekStep: nearest(r.seekStep, SEEK_STEPS, DEFAULTS.seekStep),
      autoplayNext: bool(r.autoplayNext, DEFAULTS.autoplayNext),
      startMuted: bool(r.startMuted, DEFAULTS.startMuted),
      skipMarketingSite: bool(r.skipMarketingSite, DEFAULTS.skipMarketingSite),
      exitHook: oneOf(r.exitHook, EXIT_HOOK, DEFAULTS.exitHook)
    };
  }

  async function load(api) {
    let data;
    try {
      data = await api.storage.local.get(STORAGE_KEY);
    } catch (err) {
      console.warn("[leanback-for-dropout] settings read failed, using defaults:", err && err.message);
      return normalize(null);
    }
    return normalize(data && data[STORAGE_KEY]);
  }

  async function save(api, patch) {
    const current = await load(api);
    const next = normalize(Object.assign({}, current, patch || {}));
    await api.storage.local.set({ [STORAGE_KEY]: next });
    return next;
  }

  // Call fn(settings) whenever the settings object changes in storage.
  function watch(api, fn) {
    const listener = (changes, area) => {
      if (area !== "local" || !changes[STORAGE_KEY]) return;
      fn(normalize(changes[STORAGE_KEY].newValue));
    };
    api.storage.onChanged.addListener(listener);
    return () => api.storage.onChanged.removeListener(listener);
  }

  globalThis.TenfootSettings = Object.freeze({
    DEFAULTS,
    STORAGE_KEY,
    THEATER,
    SEEK_STEPS,
    PLAYER_CHROME,
    EXIT_HOOK,
    normalize,
    load,
    save,
    watch
  });
})();
