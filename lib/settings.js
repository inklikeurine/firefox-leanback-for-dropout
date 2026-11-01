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
    exitHook: "close-tab",
    seasonStart: "latest",
    theme: "dropout",
    holidays: "off",
    uiScale: 100,
    highContrast: false,
    reduceMotion: "system",
    captionSize: "default",
    captionColor: "default",
    captionBackground: "default",
    videoFilter: "off"
  });
  // Back On Home, until the viewer picks one: the signed release closes the
  // tab; a copy loaded from its folder (about:debugging, "development")
  // does nothing, so testing never closes the tab being tested.
  const DEV_EXIT_HOOK = "none";

  const PLAYER_CHROME = ["leanback", "site"];
  const SEEK_STEPS = [5, 10, 15, 30, 60, 120, 300];
  const EXIT_HOOK = ["none", "close-tab"];
  // Which season a show opens on: its newest, or its first.
  const SEASON_START = ["latest", "first"];
  const FOCUS_ZOOMS = [0, 5, 10, 15, 20, 25];
  const RING_WIDTHS = [2, 3, 4, 6, 8, 10, 12];
  // Theme Color: Dropout's yellow and softer colours, each light enough for
  // black text on it. An old choice moves to its nearest (OLD_COLORS).
  const RING_COLORS = ["#feea3b", "#f2f2f2", "#7cc6fe", "#8fe3b6", "#b9a6ff", "#ffb38a", "#ff9eb5"];
  const COLOR_NAMES = { "#feea3b": "Dropout Yellow", "#f2f2f2": "Soft White", "#7cc6fe": "Sky Blue", "#8fe3b6": "Mint", "#b9a6ff": "Lavender", "#ffb38a": "Peach", "#ff9eb5": "Rose" };
  const OLD_COLORS = { "#ffffff": "#f2f2f2", "#ff4081": "#ff9eb5", "#41d6c3": "#8fe3b6", "#ff8a3d": "#ffb38a" };
  const THEMES = ["dropout", "midnight", "oled", "warm"];
  const HOLIDAYS = ["off", "auto", "newyear", "valentines", "stpatricks", "halloween", "winter"];
  const UI_SCALES = [100, 115, 130];
  const MOTION = ["system", "on", "off"];
  const CAPTION_SIZES = ["default", "large", "larger", "largest"];
  const CAPTION_COLORS = ["default", "white", "yellow", "cyan"];
  const CAPTION_BACKGROUNDS = ["default", "black", "none"];
  const VIDEO_FILTERS = ["off", "protanopia", "deuteranopia", "tritanopia"];

  // Theme This Page: what each kind of page lets you change about its look,
  // kept per kind of page (settings.pageLooks). The first value is the default.
  const CARD_SIZES = { id: "cards", label: "Card Size", values: ["medium", "small", "large"], names: { small: "Small", medium: "Medium", large: "Large" } };
  const PAGE_LOOKS = Object.freeze({
    home: { title: "Home", options: [
      { id: "banner", label: "Banner", values: ["large", "small", "off"], names: { large: "Large", small: "Small", off: "Off" } },
      CARD_SIZES
    ] },
    lists: { title: "Lists", options: [CARD_SIZES] },
    show: { title: "Shows", options: [CARD_SIZES] },
    details: { title: "Episode Details", options: [
      { id: "picture", label: "Picture", values: ["right", "left", "off"], names: { right: "On the right", left: "On the left", off: "Off" } }
    ] }
  });
  const STORAGE_KEY = "settings";

  // The one list of Leanback's settings, in the order they are shown, under
  // their group's heading, with the words for each value. The panel on a page
  // and the playback panel draw it the same way (nav/panel.js), and the
  // options page uses its words. `panel: false`: on the options page only.
  //   toggle — on/off: OK flips it.
  //   choice — one of `values`: OK opens the list, OK on one picks it.
  const ROWS = Object.freeze([
    { id: "autoplayNext", label: "Autoplay Next Episode", kind: "toggle", group: "Playback" },
    { id: "seekStep", label: "Seek Step", kind: "choice", values: SEEK_STEPS, unit: " s", names: { 60: "1 min", 120: "2 min", 300: "5 min" }, group: "Playback" },
    { id: "startMuted", label: "Start Videos Muted", kind: "toggle", group: "Playback", panel: false },
    { id: "seasonStart", label: "Shows Open On", kind: "choice", values: SEASON_START, names: { latest: "Newest season", first: "First season" }, group: "Browsing" },
    { id: "skipMarketingSite", label: "Skip dropout.tv Home", kind: "toggle", group: "Browsing" },
    { id: "exitHook", label: "Back On Home", kind: "choice", values: EXIT_HOOK, names: { none: "Does nothing", "close-tab": "Closes the tab" }, group: "Browsing" },
    { id: "theme", label: "Theme", kind: "choice", values: THEMES, names: { dropout: "Dropout Dark", midnight: "Midnight Blue", oled: "OLED Black", warm: "Warm Dark" }, group: "Look", look: true },
    { id: "ringColor", label: "Theme Color", kind: "choice", values: RING_COLORS, names: COLOR_NAMES, group: "Look", look: true },
    { id: "holidays", label: "Holidays", kind: "choice", values: HOLIDAYS, names: { off: "Off", auto: "Automatic", newyear: "New Year", valentines: "Valentine's Day", stpatricks: "St. Patrick's Day", halloween: "Halloween", winter: "Winter Holidays" }, group: "Look", look: true },
    { id: "focusZoom", label: "Enlarge Selection", kind: "choice", values: FOCUS_ZOOMS, names: { 0: "Off" }, unit: "%", group: "Look", look: true },
    { id: "ringWidth", label: "Ring Width", kind: "choice", values: RING_WIDTHS, unit: " px", group: "Look", look: true },
    { id: "hintBar", label: "Button Hints", kind: "toggle", group: "Look" },
    // Accessibility: a menu of its own (menu: "accessibility").
    { id: "uiScale", label: "Interface Size", kind: "choice", values: UI_SCALES, unit: "%", group: "Display", menu: "accessibility", look: true },
    { id: "highContrast", label: "High Contrast", kind: "toggle", group: "Display", menu: "accessibility" },
    { id: "reduceMotion", label: "Reduce Motion", kind: "choice", values: MOTION, names: { system: "As the system says", on: "On", off: "Off" }, group: "Display", menu: "accessibility" },
    { id: "captionSize", label: "Caption Size", kind: "choice", values: CAPTION_SIZES, names: { default: "Player's own", large: "Large", larger: "Larger", largest: "Largest" }, group: "Captions", menu: "accessibility" },
    { id: "captionColor", label: "Caption Color", kind: "choice", values: CAPTION_COLORS, names: { default: "Player's own", white: "White", yellow: "Yellow", cyan: "Cyan" }, group: "Captions", menu: "accessibility" },
    { id: "captionBackground", label: "Caption Background", kind: "choice", values: CAPTION_BACKGROUNDS, names: { default: "Player's own", black: "Black box", none: "None, with a shadow" }, group: "Captions", menu: "accessibility" },
    { id: "videoFilter", label: "Color Filter (Experimental)", kind: "choice", values: VIDEO_FILTERS, names: { off: "Off", protanopia: "Red-weak (protan)", deuteranopia: "Green-weak (deutan)", tritanopia: "Blue-weak (tritan)" }, group: "Video", menu: "accessibility" }
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

  // Theme This Page's choices, every kind of page and option filled in.
  function pageLooks(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    const out = {};
    for (const [kind, page] of Object.entries(PAGE_LOOKS)) {
      const have = r[kind] && typeof r[kind] === "object" ? r[kind] : {};
      out[kind] = {};
      for (const opt of page.options) out[kind][opt.id] = oneOf(have[opt.id], opt.values, opt.values[0]);
    }
    return out;
  }

  // Turn whatever is in storage into a complete, valid settings object.
  // `development` is the background's word on how Leanback was installed;
  // `exitHookSet`, whether Back On Home was picked rather than defaulted.
  function normalize(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    const development = bool(r.development, false);
    const exitDefault = development ? DEV_EXIT_HOOK : DEFAULTS.exitHook;
    const exitHookSet = bool(r.exitHookSet, false);
    return {
      enabled: bool(r.enabled, DEFAULTS.enabled),
      ringColor: color(OLD_COLORS[String(r.ringColor).toLowerCase()] || r.ringColor, DEFAULTS.ringColor),
      ringWidth: int(r.ringWidth, DEFAULTS.ringWidth, 2, 12),
      focusZoom: int(r.focusZoom, DEFAULTS.focusZoom, 0, 25),
      hintBar: bool(r.hintBar, DEFAULTS.hintBar),
      playerChrome: oneOf(r.playerChrome, PLAYER_CHROME, DEFAULTS.playerChrome),
      seekStep: nearest(r.seekStep, SEEK_STEPS, DEFAULTS.seekStep),
      autoplayNext: bool(r.autoplayNext, DEFAULTS.autoplayNext),
      startMuted: bool(r.startMuted, DEFAULTS.startMuted),
      skipMarketingSite: bool(r.skipMarketingSite, DEFAULTS.skipMarketingSite),
      exitHook: exitHookSet ? oneOf(r.exitHook, EXIT_HOOK, exitDefault) : exitDefault,
      seasonStart: oneOf(r.seasonStart, SEASON_START, DEFAULTS.seasonStart),
      theme: oneOf(r.theme, THEMES, DEFAULTS.theme),
      holidays: oneOf(r.holidays, HOLIDAYS, DEFAULTS.holidays),
      uiScale: oneOf(Number(r.uiScale), UI_SCALES, DEFAULTS.uiScale),
      highContrast: bool(r.highContrast, DEFAULTS.highContrast),
      reduceMotion: oneOf(r.reduceMotion, MOTION, DEFAULTS.reduceMotion),
      captionSize: oneOf(r.captionSize, CAPTION_SIZES, DEFAULTS.captionSize),
      captionColor: oneOf(r.captionColor, CAPTION_COLORS, DEFAULTS.captionColor),
      captionBackground: oneOf(r.captionBackground, CAPTION_BACKGROUNDS, DEFAULTS.captionBackground),
      videoFilter: oneOf(r.videoFilter, VIDEO_FILTERS, DEFAULTS.videoFilter),
      exitHookSet,
      development,
      pageLooks: pageLooks(r.pageLooks)
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
    const p = Object.assign({}, patch || {});
    if ("exitHook" in p) p.exitHookSet = true;
    const next = normalize(Object.assign({}, current, p));
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
    DEV_EXIT_HOOK,
    STORAGE_KEY,
    SEEK_STEPS,
    PLAYER_CHROME,
    EXIT_HOOK,
    SEASON_START,
    FOCUS_ZOOMS,
    RING_WIDTHS,
    RING_COLORS,
    PAGE_LOOKS,
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
