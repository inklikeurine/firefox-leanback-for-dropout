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
    playerChrome: "leanback",
    seekStep: 10,
    autoplayNext: true,
    startMuted: false,
    skipMarketingSite: true,
    exitHook: "none",
    seasonStart: "latest"
  });

  const PLAYER_CHROME = ["leanback", "site"];
  const SEEK_STEPS = [5, 10, 15, 30, 60, 120, 300];
  const EXIT_HOOK = ["none", "close-tab"];
  // Which season a show opens on: its newest, or its first.
  const SEASON_START = ["latest", "first"];
  const FOCUS_ZOOMS = [0, 5, 10, 15, 20, 25];
  const RING_WIDTHS = [2, 3, 4, 6, 8, 10, 12];
  const RING_COLORS = ["#feea3b", "#ffffff", "#ff4081", "#41d6c3", "#ff8a3d"];
  const STORAGE_KEY = "settings";

  // The one list of Leanback's settings, in the order they are shown, with
  // the words for each value. The panel on a page and the playback panel draw
  // it the same way (nav/panel.js), and the options page uses its words.
  //   toggle — on/off: OK flips it.
  //   choice — one of `values`: OK opens the list, OK on one picks it.
  const ROWS = Object.freeze([
    { id: "autoplayNext", label: "Autoplay Next Episode", kind: "toggle" },
    { id: "seasonStart", label: "Shows Open On", kind: "choice", values: SEASON_START, names: { latest: "Newest season", first: "First season" } },
    { id: "seekStep", label: "Seek Step", kind: "choice", values: SEEK_STEPS, unit: " s", names: { 60: "1 min", 120: "2 min", 300: "5 min" } },
    { id: "startMuted", label: "Start Videos Muted", kind: "toggle" },
    { id: "hintBar", label: "Button Hints", kind: "toggle" },
    { id: "focusZoom", label: "Enlarge Selection", kind: "choice", values: FOCUS_ZOOMS, names: { 0: "Off" }, unit: "%" },
    { id: "ringWidth", label: "Ring Width", kind: "choice", values: RING_WIDTHS, unit: " px" },
    { id: "ringColor", label: "Ring Colour", kind: "choice", values: RING_COLORS, names: { "#feea3b": "Yellow", "#ffffff": "White", "#ff4081": "Pink", "#41d6c3": "Teal", "#ff8a3d": "Orange" } },
    { id: "skipMarketingSite", label: "Skip dropout.tv Home", kind: "toggle" },
    { id: "exitHook", label: "Back On Home", kind: "choice", values: EXIT_HOOK, names: { none: "Does nothing", "close-tab": "Closes the tab" } }
  ].map((r) => Object.freeze(r)));

  /** The words for a value of a row: "On", "Newest season", "10 s", "#123456". */
  function valueText(row, v) {
    if (!row) return "";
    if (row.kind === "toggle") return v ? "On" : "Off";
    if (row.names && Object.prototype.hasOwnProperty.call(row.names, v)) return row.names[v];
    return `${v}${row.unit || ""}`;
  }

  /** A choice row's values, with the current one added when it is not among them. */
  function choicesOf(row, current) {
    const list = row && Array.isArray(row.values) ? row.values.slice() : [];
    if (current !== undefined && current !== null && !list.includes(current)) {
      list.push(current);
      if (list.every((x) => typeof x === "number")) list.sort((a, b) => a - b);
    }
    return list;
  }

  function rowOf(id) {
    return ROWS.find((r) => r.id === id) || null;
  }

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
      playerChrome: oneOf(r.playerChrome, PLAYER_CHROME, DEFAULTS.playerChrome),
      seekStep: nearest(r.seekStep, SEEK_STEPS, DEFAULTS.seekStep),
      autoplayNext: bool(r.autoplayNext, DEFAULTS.autoplayNext),
      startMuted: bool(r.startMuted, DEFAULTS.startMuted),
      skipMarketingSite: bool(r.skipMarketingSite, DEFAULTS.skipMarketingSite),
      exitHook: oneOf(r.exitHook, EXIT_HOOK, DEFAULTS.exitHook),
      seasonStart: oneOf(r.seasonStart, SEASON_START, DEFAULTS.seasonStart)
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
    SEEK_STEPS,
    PLAYER_CHROME,
    EXIT_HOOK,
    SEASON_START,
    FOCUS_ZOOMS,
    RING_WIDTHS,
    RING_COLORS,
    ROWS,
    valueText,
    choicesOf,
    rowOf,
    normalize,
    load,
    save,
    watch
  });
})();
