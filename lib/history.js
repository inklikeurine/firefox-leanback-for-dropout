// Leanback for Dropout — watch history, shared by the background (the only
// writer), the page (Continue Watching, progress on cards) and the player
// frame (resume). Kept in storage.local under its own key, "progress", so a
// settings save never rewrites it.
//
// One entry per video, keyed by the slug after /videos/ in its address. An
// entry holds up to two readings of how far the video has got:
//   * local   — Leanback's own, written while it plays in this Firefox;
//   * dropout — the progress bar Dropout draws on its tiles, which comes from
//               the Roku and Android apps. Dropout gives no date for it, so
//               the date is when Leanback first saw that value.
// The newer reading wins. Nothing here leaves the browser.
//
// Clearing Continue Watching touches only what is unfinished: a watched video
// keeps every reading, so it stays watched. For the rest, Leanback's own
// readings go and the moment is noted (`clearedAt`): Dropout's bars are
// Dropout's, and keep showing on cards, but nothing unfinished read before
// that moment appears in Continue Watching or resumes.

(function () {
  const STORAGE_KEY = "progress";
  const MAX_ENTRIES = 500;
  // When a video counts as watched, and when as started: 95 % played or
  // under 90 s left (the credits); more than a minute played.
  const WATCHED_FRACTION = 0.95;
  const CREDITS_SECONDS = 90;
  const STARTED_SECONDS = 60;
  const CONTINUE_LIMIT = 20;
  const TEXT_MAX = 200;

  /**
   * The history key for an address: the slug after /videos/, or null.
   * "/game-changer/season:1/videos/lie-detector-1" and
   * "https://watch.dropout.tv/videos/lie-detector-1" share one key.
   */
  function keyOf(url) {
    if (typeof url !== "string" || !url) return null;
    let path;
    try {
      path = new URL(url, "https://watch.dropout.tv/").pathname;
    } catch (_err) {
      return null;
    }
    const m = /\/videos\/([^/?#]+)\/?$/.exec(path);
    if (!m) return null;
    let slug;
    try {
      slug = decodeURIComponent(m[1]);
    } catch (_err) {
      slug = m[1];
    }
    slug = slug.trim().toLowerCase();
    return /^[\w.~-]{1,160}$/.test(slug) ? slug : null;
  }

  function num(v, min, max) {
    return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;
  }

  function text(v) {
    return typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, TEXT_MAX) : null;
  }

  function httpsUrl(v) {
    if (typeof v !== "string" || !v) return null;
    try {
      const u = new URL(v);
      return u.protocol === "https:" ? u.href : null;
    } catch (_err) {
      return null;
    }
  }

  function cleanEntry(key, raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    const e = { key };
    const url = httpsUrl(r.url);
    if (url) e.url = url;
    const title = text(r.title);
    if (title) e.title = title;
    const series = text(r.series);
    if (series) e.series = series;
    const image = httpsUrl(r.image);
    if (image) e.image = image;
    const duration = num(r.duration, 1, 1e6);
    if (duration) e.duration = duration;
    const l = r.local && typeof r.local === "object" ? r.local : null;
    if (l && num(l.position, 0, 1e6) !== null && num(l.at, 0, 1e15) !== null) {
      e.local = { position: l.position, at: l.at };
    }
    const d = r.dropout && typeof r.dropout === "object" ? r.dropout : null;
    if (d && num(d.percent, 0, 100) !== null && num(d.at, 0, 1e15) !== null) {
      e.dropout = { percent: d.percent, at: d.at };
    }
    return e;
  }

  /** Whatever is in storage, as a valid store. Never throws. */
  function normalize(raw) {
    const out = { entries: {} };
    const cleared = raw && typeof raw === "object" ? num(raw.clearedAt, 0, 1e15) : null;
    if (cleared) out.clearedAt = cleared;
    const entries = raw && typeof raw === "object" && raw.entries && typeof raw.entries === "object" ? raw.entries : {};
    for (const k of Object.keys(entries)) {
      const key = keyOf(`/videos/${k}`);
      if (key && key === k) out.entries[key] = cleanEntry(key, entries[k]);
    }
    return out;
  }

  // The reading to believe: the newer of Leanback's own and Dropout's.
  function reading(entry) {
    if (!entry) return null;
    const l = entry.local;
    const d = entry.dropout;
    const duration = entry.duration || 0;
    const fromLocal = l ? { source: "local", at: l.at, position: l.position, duration } : null;
    const fromDropout = d ? { source: "dropout", at: d.at, position: duration ? (d.percent / 100) * duration : 0, duration, percent: d.percent } : null;
    if (fromLocal && fromDropout) return fromDropout.at > fromLocal.at ? fromDropout : fromLocal;
    return fromLocal || fromDropout;
  }

  // 0–1, how far the believed reading has got.
  function fraction(r) {
    if (!r) return 0;
    if (r.source === "dropout" && !r.duration) return Math.min(1, r.percent / 100);
    return r.duration ? Math.min(1, r.position / r.duration) : 0;
  }

  /** "unstarted", "in-progress" or "watched". */
  function status(entry) {
    const r = reading(entry);
    if (!r) return "unstarted";
    const f = fraction(r);
    if (r.duration) {
      if (f >= WATCHED_FRACTION || r.duration - r.position < CREDITS_SECONDS) return "watched";
      return r.position > STARTED_SECONDS ? "in-progress" : "unstarted";
    }
    // Dropout's bar without a known length: the percentage alone.
    if (f >= WATCHED_FRACTION) return "watched";
    return f > 0 ? "in-progress" : "unstarted";
  }

  function lastTouched(entry) {
    return Math.max(entry.local ? entry.local.at : 0, entry.dropout ? entry.dropout.at : 0);
  }

  // Keep the newest MAX_ENTRIES; an entry nobody has watched goes first.
  function prune(store, max) {
    const cap = typeof max === "number" ? max : MAX_ENTRIES;
    const keys = Object.keys(store.entries);
    if (keys.length <= cap) return store;
    keys.sort((a, b) => lastTouched(store.entries[b]) - lastTouched(store.entries[a]));
    const entries = {};
    for (const k of keys.slice(0, cap)) entries[k] = store.entries[k];
    return withClear(store, { entries });
  }

  // Carry the clear mark across a change.
  function withClear(from, to) {
    if (from && from.clearedAt) to.clearedAt = from.clearedAt;
    return to;
  }

  function withMeta(entry, m, overwrite) {
    const e = Object.assign({}, entry);
    for (const [field, clean] of [["url", httpsUrl], ["title", text], ["series", text], ["image", httpsUrl]]) {
      const v = clean(m[field]);
      if (v && (overwrite || !e[field])) e[field] = v;
    }
    const duration = num(m.duration, 1, 1e6);
    if (duration && (overwrite || !e.duration)) e.duration = duration;
    return e;
  }

  /**
   * The player's position, from this Firefox. A position under 5 s never
   * replaces a stored one: the player reports 0 while it is still loading,
   * before the resume has happened.
   */
  function applyProgress(store, p, now) {
    const key = p && (p.key || keyOf(p.url));
    if (!key) return store;
    const duration = num(p.duration, 1, 1e6);
    let position = num(p.position, 0, 1e6);
    if (duration === null || position === null) return store;
    if (p.ended) position = duration;
    const prev = store.entries[key] || { key };
    if (position < 5 && prev.local && !p.ended) return store;
    const e = withMeta(prev, { url: p.url, title: p.title, duration }, false);
    e.duration = duration;
    e.local = { position: Math.min(position, duration), at: now };
    const entries = Object.assign({}, store.entries, { [key]: e });
    return prune(withClear(store, { entries }));
  }

  /** What the episode page knows: its address, title, show and picture. */
  function applyMeta(store, m) {
    const key = m && (m.key || keyOf(m.url));
    if (!key) return store;
    const prev = store.entries[key] || { key };
    const entries = Object.assign({}, store.entries, { [key]: withMeta(prev, m, true) });
    return prune(withClear(store, { entries }));
  }

  /**
   * Dropout's progress bars, as read off the tiles on Home. A value seen for
   * the first time is dated now — unless Leanback already has its own
   * reading, which is then the better one until Dropout's value changes.
   * `items` are in page order; earlier items rank as seen slightly later.
   */
  function applyObservations(store, items, now) {
    if (!Array.isArray(items) || !items.length) return store;
    let entries = null;
    items.forEach((it, i) => {
      const key = it && (it.key || keyOf(it.url));
      const percent = it ? num(it.percent, 0, 100) : null;
      if (!key || percent === null) return;
      const prev = (entries || store.entries)[key] || { key };
      const same = prev.dropout && Math.abs(prev.dropout.percent - percent) < 0.5;
      const needsMeta = !prev.title || !prev.image || !prev.url || !prev.duration;
      if (same && !needsMeta) return;
      const e = withMeta(prev, it, false);
      if (!same) e.dropout = { percent, at: prev.dropout || !prev.local ? now - i : 0 };
      if (!entries) entries = Object.assign({}, store.entries);
      entries[key] = e;
    });
    return entries ? prune(withClear(store, { entries })) : store;
  }

  /**
   * Clear Continue Watching. A watched video is kept whole. Of anything else,
   * Leanback's own readings go, with the details that came from the episode
   * pages; what Dropout's bars said stays (it is Dropout's) but is dated
   * before `now`, so none of it counts as recent.
   */
  function forget(store, now) {
    const entries = {};
    for (const [k, e] of Object.entries(store.entries)) {
      if (status(e) === "watched") {
        entries[k] = e;
        continue;
      }
      if (!e.dropout) continue;
      const kept = { key: k, dropout: e.dropout };
      for (const f of ["url", "title", "image", "duration"]) if (e[f]) kept[f] = e[f];
      entries[k] = kept;
    }
    return { entries, clearedAt: now };
  }

  // A reading from before the last clear does not count as recent.
  function current(store, r) {
    return Boolean(r) && r.at > (store.clearedAt || 0);
  }

  /** Videos in progress, most recently touched first. */
  function continueWatching(store, limit) {
    const n = typeof limit === "number" ? limit : CONTINUE_LIMIT;
    return Object.values(store.entries)
      .filter((e) => e.url && status(e) === "in-progress")
      .map((e) => ({ entry: e, reading: reading(e) }))
      .filter((x) => current(store, x.reading))
      .sort((a, b) => b.reading.at - a.reading.at)
      .slice(0, n)
      .map(({ entry, reading: r }) => ({
        key: entry.key,
        url: entry.url,
        title: entry.title || "",
        series: entry.series || "",
        image: entry.image || "",
        duration: r.duration,
        position: r.position,
        fraction: fraction(r),
        source: r.source,
        at: r.at
      }));
  }

  /** 0–1 progress to draw on a card, or null when there is nothing to draw. */
  function progressOf(store, key) {
    const e = key ? store.entries[key] : null;
    const r = reading(e);
    if (!r) return null;
    const f = fraction(r);
    return f > 0 ? f : null;
  }

  /** Seconds to resume an in-progress video at, or null. */
  function resumePoint(store, key) {
    const e = key ? store.entries[key] : null;
    if (!e || status(e) !== "in-progress") return null;
    const r = reading(e);
    return current(store, r) && r.position > 0 ? r.position : null;
  }

  async function load(api) {
    try {
      const data = await api.storage.local.get(STORAGE_KEY);
      return normalize(data && data[STORAGE_KEY]);
    } catch (err) {
      console.warn("[leanback-for-dropout] watch history read failed:", err && err.message);
      return normalize(null);
    }
  }

  async function save(api, store) {
    await api.storage.local.set({ [STORAGE_KEY]: store });
    return store;
  }

  function watch(api, fn) {
    const listener = (changes, area) => {
      if (area !== "local" || !changes[STORAGE_KEY]) return;
      fn(normalize(changes[STORAGE_KEY].newValue));
    };
    api.storage.onChanged.addListener(listener);
    return () => api.storage.onChanged.removeListener(listener);
  }

  globalThis.TenfootHistory = Object.freeze({
    STORAGE_KEY,
    MAX_ENTRIES,
    WATCHED_FRACTION,
    CREDITS_SECONDS,
    STARTED_SECONDS,
    keyOf,
    normalize,
    reading,
    status,
    applyProgress,
    applyMeta,
    applyObservations,
    forget,
    continueWatching,
    progressOf,
    resumePoint,
    load,
    save,
    watch
  });
})();
