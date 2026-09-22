// 10-Foot Dropout — helpers over a site rules object (sites/<site>.json).
// Pure: no DOM, no browser API. The rules file is the only place site
// knowledge lives; this file only knows its shape.

(function () {
  /**
   * Page kind for a path: the first route whose pattern matches wins.
   * @param {{routes?: {kind: string, path: string}[]}} rules
   * @param {string} pathname
   * @returns {string} a page kind, "other" when nothing matches
   */
  function classify(rules, pathname) {
    const routes = rules && Array.isArray(rules.routes) ? rules.routes : [];
    const p = typeof pathname === "string" ? pathname : "/";
    for (const r of routes) {
      if (!r || typeof r.path !== "string" || typeof r.kind !== "string") continue;
      let re;
      try {
        re = new RegExp(r.path);
      } catch (_err) {
        continue;
      }
      if (re.test(p)) return r.kind;
    }
    return "other";
  }

  /** Rules for one page kind, always an object. */
  function pageRules(rules, kind) {
    const pages = rules && rules.pages && typeof rules.pages === "object" ? rules.pages : {};
    const r = pages[kind];
    return r && typeof r === "object" ? r : {};
  }

  /** A selector list from a rule that may be a string, an array or missing. */
  function selectorList(value) {
    if (Array.isArray(value)) return value.filter((s) => typeof s === "string" && s.trim());
    if (typeof value === "string" && value.trim()) return [value];
    return [];
  }

  /** One comma-joined selector, or null when the rule is empty. */
  function selector(value) {
    const list = selectorList(value);
    return list.length ? list.join(", ") : null;
  }

  globalThis.TenfootSiteRules = Object.freeze({ classify, pageRules, selectorList, selector });
})();
