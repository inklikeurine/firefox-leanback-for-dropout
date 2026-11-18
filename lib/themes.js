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
  // (daltonisation), from Machado (2009)'s simulation at each Filter Strength,
  // for linear light. Worked out once, not here: the maker's workshop has the
  // script (tools/cvd-matrices.py). 100 % is the full-strength filter.
  const FILTERS = Object.freeze({
    protanopia: Object.freeze({
      25: "1 0 0 0 0  0.1617 0.8152 0.0231 0 0  0.2278 -0.2742 1.0464 0 0  0 0 0 1 0",
      50: "1 0 0 0 0  0.2866 0.678 0.0354 0 0  0.3868 -0.4589 1.072 0 0  0 0 0 1 0",
      75: "1 0 0 0 0  0.3891 0.5694 0.0415 0 0  0.504 -0.5892 1.0852 0 0  0 0 0 1 0",
      100: "1 0 0 0 0  0.4789 0.4769 0.0442 0 0  0.5973 -0.6887 1.0914 0 0  0 0 0 1 0"
    }),
    deuteranopia: Object.freeze({
      25: "1 0 0 0 0  0.0894 0.8679 0.0426 0 0  0.2043 -0.2795 1.0751 0 0  0 0 0 1 0",
      50: "1 0 0 0 0  0.1351 0.7928 0.0721 0 0  0.3272 -0.4527 1.1255 0 0  0 0 0 1 0",
      75: "1 0 0 0 0  0.1557 0.7502 0.0941 0 0  0.4035 -0.5654 1.1619 0 0  0 0 0 1 0",
      100: "1 0 0 0 0  0.1628 0.725 0.1122 0 0  0.4547 -0.6454 1.1907 0 0  0 0 0 1 0"
    }),
    tritanopia: Object.freeze({
      25: "1.09 -0.2191 0.1292 0 0  -0.0377 0.9681 0.0696 0 0  0 0 1 0 0  0 0 0 1 0",
      50: "0.9783 -0.2011 0.2229 0 0  0.0016 0.8674 0.1309 0 0  0 0 1 0 0  0 0 0 1 0",
      75: "0.7765 -0.1919 0.4154 0 0  0.0702 0.7059 0.2238 0 0  0 0 1 0 0  0 0 0 1 0",
      100: "0.7412 -0.4072 0.666 0 0  0.0751 0.5852 0.3397 0 0  0 0 1 0 0  0 0 0 1 0"
    })
  });
  // Color Boost: colours made stronger (an SVG saturate), after the filter.
  const BOOSTS = Object.freeze({ low: 1.15, medium: 1.3, high: 1.5 });

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

  // Selection (Accessibility): the ring's edge and style, on the page and in
  // the player frame alike; today's (dark, solid) writes nothing.
  function applySelection(root, settings) {
    const s = settings || {};
    setData(root, "tenfootRingEdge", s.ringEdge && s.ringEdge !== "dark" ? s.ringEdge : null);
    setData(root, "tenfootRingStyle", s.ringStyle && s.ringStyle !== "solid" ? s.ringStyle : null);
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
    applySelection(root, settings);
    setData(root, "tenfootDim", settings && settings.dimAround && settings.dimAround !== "off" ? settings.dimAround : null);
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
    setData(root, "tenfootMotion", reduceMotion(s.reduceMotion, doc && doc.defaultView) ? "reduce" : null);
    applySelection(root, s);
    const kind = FILTERS[s.videoFilter] ? s.videoFilter : null;
    const strength = FILTERS.protanopia[s.videoFilterStrength] ? s.videoFilterStrength : 100;
    const boost = BOOSTS[s.videoColorBoost] || 0;
    setData(root, "tenfootFilter", kind || (boost ? "boost" : null));
    if ((!kind && !boost) || !doc) return;
    const NS = "http://www.w3.org/2000/svg";
    let svg = doc.getElementById("tenfoot-filters");
    if (!svg) {
      svg = doc.createElementNS(NS, "svg");
      svg.id = "tenfoot-filters";
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("width", "0");
      svg.setAttribute("height", "0");
      svg.style.position = "absolute";
      root.appendChild(svg);
    }
    // One filter per kind (and one for Color Boost alone), each drawn again
    // with the strength and boost asked for: the colour matrix, then the
    // boost.
    for (const id of [...Object.keys(FILTERS), "boost"]) {
      let f = doc.getElementById(`tenfoot-filter-${id}`);
      if (!f) {
        f = doc.createElementNS(NS, "filter");
        f.id = `tenfoot-filter-${id}`;
        svg.appendChild(f);
      }
      f.setAttribute("color-interpolation-filters", "linearRGB");
      while (f.firstChild) f.removeChild(f.firstChild);
      if (FILTERS[id]) {
        const m = doc.createElementNS(NS, "feColorMatrix");
        m.setAttribute("type", "matrix");
        m.setAttribute("values", FILTERS[id][strength]);
        f.appendChild(m);
      }
      if (boost || !FILTERS[id]) {
        const b = doc.createElementNS(NS, "feColorMatrix");
        b.setAttribute("type", "saturate");
        b.setAttribute("values", String(boost || 1));
        f.appendChild(b);
      }
    }
  }

  globalThis.TenfootThemes = Object.freeze({ THEMES, HOLIDAYS, FILTERS, BOOSTS, SCALES, holidayFor, lookOf, apply, applyPlayer });
})();
