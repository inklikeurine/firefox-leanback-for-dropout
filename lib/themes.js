// Leanback for Dropout — how Leanback looks: its themes (the colours of the
// screens, the rail and the panels), the Theme Color (the yellow of the
// selection, the main buttons and the lit icons, in another colour), the
// holiday looks, and the Accessibility choices that change the look:
// Interface Size, High Contrast, Reduce Motion, and, in the player, the
// caption style and the video's colour filter.
//
// The settings (lib/settings.js) say which; apply() writes it onto <html> as
// CSS custom properties (--tf-*, --tenfoot-accent) and data-tenfoot-*
// attributes, which the stylesheets read. Nothing here is drawn by itself.

(function () {
  // Each theme: the colours the stylesheets' tokens take (content/home.css
  // :root has Dropout's, the default).
  const THEMES = Object.freeze({
    dropout: { name: "Dropout Dark", tokens: { bg: "#0b0c10", surface: "#15171c", raised: "#1e2128", text: "#f5f6f7", dim: "#9aa0ac", railBg: "#101216", railEdge: "#1d2027", railIcon: "#8a909c" } },
    midnight: { name: "Midnight Blue", tokens: { bg: "#0a0f1c", surface: "#121a2e", raised: "#1a2440", text: "#eef2ff", dim: "#97a3c2", railBg: "#0d1324", railEdge: "#1b2542", railIcon: "#8590ad" } },
    oled: { name: "OLED Black", tokens: { bg: "#000000", surface: "#0e0e0e", raised: "#1a1a1a", text: "#f2f2f2", dim: "#9a9a9a", railBg: "#000000", railEdge: "#161616", railIcon: "#8c8c8c" } },
    warm: { name: "Warm Dark", tokens: { bg: "#14100c", surface: "#1f1914", raised: "#2b231c", text: "#f7f0e8", dim: "#b5a795", railBg: "#18130f", railEdge: "#2a221b", railIcon: "#a3957f" } }
  });

  // High Contrast (Accessibility): black, white, and a thicker ring.
  const CONTRAST = Object.freeze({ bg: "#000000", surface: "#000000", raised: "#121212", text: "#ffffff", dim: "#e8e8e8", railBg: "#000000", railEdge: "#ffffff", railIcon: "#ffffff" });

  // The holiday looks: when each comes round (month, day; both ends
  // included), its colour, and a glow along the top of the screens. Each
  // keeps the theme's own dark ground.
  const HOLIDAYS = Object.freeze([
    { id: "newyear", name: "New Year", from: [1, 1], to: [1, 6], accent: "#f5d76e", glow: "rgba(245, 215, 110, 0.18)" },
    { id: "valentines", name: "Valentine's Day", from: [2, 7], to: [2, 14], accent: "#ff9eb5", glow: "rgba(255, 110, 150, 0.18)" },
    { id: "stpatricks", name: "St. Patrick's Day", from: [3, 14], to: [3, 17], accent: "#8fe3a0", glow: "rgba(70, 190, 100, 0.18)" },
    { id: "halloween", name: "Halloween", from: [10, 17], to: [10, 31], accent: "#ffa94d", glow: "rgba(255, 140, 40, 0.2)", glow2: "rgba(150, 80, 200, 0.16)" },
    { id: "winter", name: "Winter Holidays", from: [12, 1], to: [12, 31], accent: "#ff8a8a", glow: "rgba(230, 70, 70, 0.16)", glow2: "rgba(60, 160, 100, 0.16)" }
  ].map((h) => Object.freeze(h)));

  // Interface Size (Accessibility): the scale of everything Leanback draws.
  const SCALES = Object.freeze({ 100: 1, 115: 1.15, 130: 1.3 });

  // The video's colour filter (Accessibility, experimental): a colour matrix
  // that moves what a kind of colour blindness loses into colours it keeps
  // (daltonisation, from the usual simulation matrices).
  const FILTERS = Object.freeze({
    protanopia: "1 0 0 0 0  0.479 0.477 0.044 0 0  0.597 -0.689 1.091 0 0  0 0 0 1 0",
    deuteranopia: "1 0 0 0 0  0.163 0.725 0.112 0 0  0.455 -0.645 1.191 0 0  0 0 0 1 0",
    tritanopia: "0.741 -0.407 0.666 0 0  0.075 0.585 0.340 0 0  0 0 1 0 0  0 0 0 1 0"
  });

  function inRange(h, date) {
    const d = (date.getMonth() + 1) * 100 + date.getDate();
    const a = h.from[0] * 100 + h.from[1];
    const b = h.to[0] * 100 + h.to[1];
    return a <= b ? d >= a && d <= b : d >= a || d <= b;
  }

  /** The holiday look on show for the Holidays setting on `date`, or null. */
  function holidayFor(setting, date) {
    if (!setting || setting === "off") return null;
    if (setting === "auto") return HOLIDAYS.find((h) => inRange(h, date || new Date())) || null;
    return HOLIDAYS.find((h) => h.id === setting) || null;
  }

  function reduceMotion(setting, win) {
    if (setting === "on") return true;
    if (setting === "off") return false;
    try {
      return Boolean(win && win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (_err) {
      return false;
    }
  }

  /**
   * What the settings make of the look on `date`: the theme, the colours, the
   * accent, the holiday (or null), and the Accessibility choices.
   */
  function lookOf(settings, date, win) {
    const s = settings || {};
    const theme = THEMES[s.theme] ? s.theme : "dropout";
    const holiday = holidayFor(s.holidays, date);
    const tokens = Object.assign({}, THEMES[theme].tokens, s.highContrast ? CONTRAST : {});
    const accent = holiday ? holiday.accent : s.ringColor || "#feea3b";
    return {
      theme,
      tokens,
      accent,
      holiday: holiday ? holiday.id : null,
      glow: holiday ? [holiday.glow, holiday.glow2 || holiday.glow] : null,
      contrast: Boolean(s.highContrast),
      scale: SCALES[s.uiScale] || 1,
      reduceMotion: reduceMotion(s.reduceMotion, win)
    };
  }

  const TOKEN_VARS = { bg: "--tf-bg", surface: "--tf-surface", raised: "--tf-raised", text: "--tf-text", dim: "--tf-dim", railBg: "--tf-rail-bg", railEdge: "--tf-rail-edge", railIcon: "--tf-rail-icon" };

  function setData(el, name, value) {
    if (value === null || value === undefined || value === false) delete el.dataset[name];
    else el.dataset[name] = String(value);
  }

  /** Write the look onto `root` (an <html>) for the stylesheets. */
  function apply(root, settings, date) {
    const win = root.ownerDocument && root.ownerDocument.defaultView;
    const look = lookOf(settings, date, win);
    for (const [k, v] of Object.entries(TOKEN_VARS)) root.style.setProperty(v, look.tokens[k]);
    root.style.setProperty("--tenfoot-accent", look.accent);
    root.style.setProperty("--tenfoot-ring-color", look.accent);
    root.style.setProperty("--tf-scale", String(look.scale));
    if (look.glow) {
      root.style.setProperty("--tf-glow", look.glow[0]);
      root.style.setProperty("--tf-glow2", look.glow[1]);
    } else {
      root.style.removeProperty("--tf-glow");
      root.style.removeProperty("--tf-glow2");
    }
    setData(root, "tenfootTheme", look.theme);
    setData(root, "tenfootHoliday", look.holiday);
    setData(root, "tenfootContrast", look.contrast ? "on" : null);
    setData(root, "tenfootMotion", look.reduceMotion ? "reduce" : null);
    return look;
  }

  /**
   * In the player frame: the caption style and the video's colour filter
   * (an SVG filter kept in the frame's document, which the video's CSS
   * filter names).
   */
  function applyPlayer(root, settings) {
    const s = settings || {};
    const doc = root.ownerDocument;
    setData(root, "tenfootCaptionSize", s.captionSize && s.captionSize !== "default" ? s.captionSize : null);
    setData(root, "tenfootCaptionColor", s.captionColor && s.captionColor !== "default" ? s.captionColor : null);
    setData(root, "tenfootCaptionBg", s.captionBackground && s.captionBackground !== "default" ? s.captionBackground : null);
    const matrix = FILTERS[s.videoFilter] || null;
    setData(root, "tenfootFilter", matrix ? s.videoFilter : null);
    if (!matrix || !doc) return;
    const NS = "http://www.w3.org/2000/svg";
    let svg = doc.getElementById("tenfoot-filters");
    if (!svg) {
      svg = doc.createElementNS(NS, "svg");
      svg.id = "tenfoot-filters";
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("width", "0");
      svg.setAttribute("height", "0");
      svg.style.position = "absolute";
      for (const [id, values] of Object.entries(FILTERS)) {
        const f = doc.createElementNS(NS, "filter");
        f.id = `tenfoot-filter-${id}`;
        f.setAttribute("color-interpolation-filters", "sRGB");
        const m = doc.createElementNS(NS, "feColorMatrix");
        m.setAttribute("type", "matrix");
        m.setAttribute("values", values);
        f.appendChild(m);
        svg.appendChild(f);
      }
      root.appendChild(svg);
    }
  }

  globalThis.TenfootThemes = Object.freeze({ THEMES, HOLIDAYS, FILTERS, SCALES, holidayFor, lookOf, apply, applyPlayer });
})();
