// Leanback for Dropout — the trail: the pages of this site behind the current
// one in the tab's history, as far as Leanback can tell. Site-agnostic.
//
// Firefox acts on the remote's Back button itself, whatever a page does with
// the key. So Leanback does not fight it; it keeps the history in the shape
// Back should follow instead:
//   * a move sideways (another episode, another season, another top-level
//     page) replaces the current page rather than adding one;
//   * arriving by Back on a page that is only a sibling of the one left (the
//     previous episode, when Dropout itself went on to the next) carries on
//     back past the siblings;
//   * with nothing of the site behind the page, Back is Leanback's to do.
//
// An episode playing has an entry of its own above its details page (the
// same address, `play: true`), so Back while it plays is the details page.
// Firefox's own Back passes over an entry nobody interacted with
// (browser.navigation.requireUserInteraction), which is what the details page
// of a video that started by itself is: passedOver() finds that case.
//
// The trail lives in sessionStorage, which is per tab and survives page
// loads. Entries: {url, kind?, group?, parent?, play?}.

(function () {
  const TRAIL_KEY = "tenfoot.trail";
  const INTENT_KEY = "tenfoot.intent";
  const MAX = 50;
  const INTENT_TTL_MS = 30000;

  function pathOf(url) {
    try {
      const u = new URL(url, "https://example.invalid/");
      return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
    } catch (_err) {
      return null;
    }
  }

  /** Same page: origin and path, ignoring the query, the hash and a trailing slash. */
  function same(a, b) {
    const pa = pathOf(a);
    return Boolean(pa) && pa === pathOf(b);
  }

  function str(v) {
    return typeof v === "string" && v ? v.slice(0, 2000) : null;
  }

  function clean(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const e of list) {
      if (!e || typeof e !== "object" || !str(e.url)) continue;
      const entry = { url: str(e.url) };
      for (const k of ["kind", "group", "parent"]) if (str(e[k])) entry[k] = str(e[k]);
      if (e.play === true) entry.play = true;
      out.push(entry);
    }
    return out.slice(-MAX);
  }

  function load(store) {
    try {
      return clean(JSON.parse(store.getItem(TRAIL_KEY) || "[]"));
    } catch (_err) {
      return [];
    }
  }

  function save(store, trail) {
    try {
      store.setItem(TRAIL_KEY, JSON.stringify(clean(trail)));
    } catch (_err) { /* storage off: Back still works, less cleverly */ }
  }

  /**
   * What Leanback is about to do, so the next page knows how it was reached:
   * "push" (a new page), "replace" (sideways), or "back" (to an earlier one).
   */
  function setIntent(store, kind, to, now) {
    try {
      store.setItem(INTENT_KEY, JSON.stringify({ kind, to, at: typeof now === "number" ? now : Date.now() }));
    } catch (_err) { /* the arrival falls back to guessing */ }
  }

  function takeIntent(store, now) {
    let v = null;
    try {
      v = JSON.parse(store.getItem(INTENT_KEY) || "null");
      store.removeItem(INTENT_KEY);
    } catch (_err) {
      return null;
    }
    const t = typeof now === "number" ? now : Date.now();
    if (!v || typeof v !== "object" || !str(v.to) || !["push", "replace", "back"].includes(v.kind)) return null;
    if (typeof v.at !== "number" || t - v.at > INTENT_TTL_MS) return null;
    return v;
  }

  // The newest entry below the top that is the same page as `url`, or -1.
  // With `play` (true or false), an entry of that kind first: the step of a
  // video playing, or the page itself.
  function indexBelow(trail, url, play) {
    if (typeof play === "boolean") {
      for (let j = trail.length - 2; j >= 0; j--) if (same(trail[j].url, url) && Boolean(trail[j].play) === play) return j;
    }
    for (let j = trail.length - 2; j >= 0; j--) if (same(trail[j].url, url)) return j;
    return -1;
  }

  /**
   * Bring the trail up to date with the page that has just loaded.
   * @param {object[]} trail
   * @param {string} url — this page
   * @param {string} type — the load's navigation type: "navigate", "reload"
   *   or "back_forward" (PerformanceNavigationTiming.type)
   * @param {{kind: string, to: string}|null} intent — what Leanback meant to do
   * @param {{play?: boolean}} [opts] — `play`: this history entry is the step
   *   of a video playing (history.state says so), not the page itself
   * @returns {{trail: object[], left: object|null, from: object|null}}
   *   `left` is the entry this page was reached from by going back, else
   *   null; `from` the page it was reached from going forward (pushed or
   *   replaced), else null
   */
  function arrive(trail, url, type, intent, opts) {
    const t = clean(trail);
    const top = t.length ? t[t.length - 1] : null;
    const play = opts && typeof opts.play === "boolean" ? opts.play : undefined;
    if (intent && same(intent.to, url)) {
      if (intent.kind === "replace" && top) {
        t[t.length - 1] = { url };
        return { trail: t, left: null, from: top };
      }
      if (intent.kind === "back") {
        const j = indexBelow(t, url, play);
        if (j >= 0) return { trail: t.slice(0, j + 1), left: top, from: null };
      }
      if (intent.kind !== "back") return { trail: clean([...t, { url }]), left: null, from: top };
    }
    if (top && same(top.url, url)) return { trail: t, left: null, from: null }; // a reload
    if (type === "back_forward") {
      const j = indexBelow(t, url, play);
      if (j >= 0) return { trail: t.slice(0, j + 1), left: top, from: null };
    }
    return { trail: clean([...t, { url }]), left: null, from: top };
  }

  /**
   * Back from a video playing (the top of `trail`, as it was before this
   * page loaded) landed at `here`, below its details page: Firefox passed
   * over that page, as nobody had interacted with it (the video started by
   * itself). Its index, to go forward to, else null.
   */
  function passedOver(trail, here) {
    const top = trail.length - 1;
    const left = trail[top];
    if (!left || !left.play || here >= top - 1) return null;
    const d = top - 1;
    return same(trail[d].url, left.url) && !trail[d].play ? d : null;
  }

  function siblings(a, b) {
    return Boolean(a && b && a.kind && a.group) && a.kind === b.kind && a.group === b.group;
  }

  /**
   * After arriving by Back: when the page left and this one are siblings
   * (both episodes of one show, both seasons of one show), how far to carry
   * on back — past every sibling — as a negative history delta. null to stay.
   */
  function skipSiblings(trail, left) {
    const here = trail.length - 1;
    if (here < 0 || !siblings(left, trail[here])) return null;
    for (let j = here - 1; j >= 0; j--) {
      if (!siblings(trail[j], trail[here])) return j - here;
    }
    return null;
  }

  /** Record what this page is (kind, group, structural parent) on its entry. */
  function describe(trail, fields) {
    const t = clean(trail);
    if (!t.length) return t;
    const top = Object.assign({}, t[t.length - 1]);
    for (const k of ["kind", "group", "parent"]) {
      if (str(fields && fields[k])) top[k] = str(fields[k]);
      else delete top[k];
    }
    t[t.length - 1] = top;
    return t;
  }

  /**
   * The episode on top starting to play (`on`): an entry of its own above
   * its details page, described as that page is. Off: that entry gone.
   */
  function play(trail, on) {
    const t = clean(trail);
    const top = t.length ? t[t.length - 1] : null;
    if (!top || Boolean(top.play) === Boolean(on)) return t;
    if (on) return clean([...t, Object.assign({}, top, { play: true })]);
    return t.slice(0, -1);
  }

  /** How many pages of this site are behind the current one. */
  function depth(trail) {
    return Math.max(0, (Array.isArray(trail) ? trail.length : 0) - 1);
  }

  globalThis.TenfootTrail = Object.freeze({
    TRAIL_KEY, INTENT_KEY, same, load, save, setIntent, takeIntent, arrive, passedOver, skipSiblings, describe, play, depth, indexBelow
  });
})();
