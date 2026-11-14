// Leanback for Dropout — the readers for the screens of content/screen.js
// that are not a show's or Home's (content/show.js, content/home.js): a
// collection page (Browse, My List, a list), search, an episode's details,
// the profile picker and its forms, and the welcome. Each reads Dropout's
// page (sites/dropout.json → screen) into a screen model, or null when the
// page is not what it expects. The page is only read.

(function () {
  const C = () => globalThis.TenfootCards;
  const Common = globalThis.TenfootCommon;
  const { textOf } = Common;
  // Only ever inside the scope given: no scope, no match.
  const qs = (sel, scope) => (scope ? Common.qs(sel, scope) : null);
  const qsa = (sel, scope) => (scope ? Common.qsa(sel, scope) : []);
  // A standard grid's columns.
  const { COLUMNS } = globalThis.TenfootScreen;
  const SEARCH_COLUMNS = 3; // beside the docked keyboard

    /**
     * What a collection page holds: its title, its tiles in page order (one per
     * link), and whether Dropout has more to load.
     * @param {Document} doc
     * @param {object} R — the rules' "screen" object
     */
    function readPage(doc, R) {
      const rules = R || {};
      const { hrefOf, tidyDuration, parseDuration, percentOf } = C();
      const root = qs(rules.root, doc);
      const out = { root: Boolean(root), title: textOf(qs(rules.title, doc)), items: [], more: false };
      if (!root) return out;
      const seen = new Set();
      for (const tile of qsa(rules.item, root)) {
        const href = hrefOf(qs(rules.itemLink, tile));
        if (!href || seen.has(href)) continue;
        seen.add(href);
        const img = qs(rules.itemImage, tile);
        const durationText = tidyDuration(textOf(qs(rules.itemDuration, tile)));
        out.items.push({
          key: href,
          href,
          title: textOf(qs(rules.itemTitle, tile)) || (img && img.getAttribute("alt")) || "",
          subtitle: textOf(qs(rules.itemSubtext, tile)),
          image: img ? img.getAttribute("src") || "" : "",
          duration: parseDuration(durationText),
          durationText,
          percent: percentOf(qs(rules.itemProgress, tile)),
          badge: textOf(qs(rules.itemBadge, tile))
        });
      }
      out.more = Boolean(qs(rules.more, doc));
      return out;
    }

    /**
     * Dropout's search page as a screen model: Leanback's own search box, the
     * type filters (All, Videos, Collections) as pills, the results as cards.
     * Null when Dropout's search box is not on the page.
     * @param {Document} doc
     * @param {object} R — the rules' "screen.search" object
     */
    function searchModel(doc, R) {
      const rules = R || {};
      const input = qs(rules.input, doc);
      if (!input) return null;
      const page = readPage(doc, rules);
      const filters = qsa(rules.filter, doc).map((b, i) => (
        { key: b.getAttribute("data-filter-type") || `filter-${i}`, label: textOf(b), current: Common.matches(b, rules.filterSelected), proxy: b }
      )).filter((f) => f.label);
      return {
        kind: "search",
        head: "",
        hero: null,
        // The box is on the docked keyboard (page-keyboard.js), not the screen.
        field: { value: String(input.value || ""), placeholder: input.getAttribute("placeholder") || "Search", proxy: input, docked: true },
        pills: filters.length ? { items: filters } : null,
        sections: [{ key: "results", title: "", sub: "", columns: SEARCH_COLUMNS, fit: true, items: page.items }],
        empty: textOf(qs(rules.empty, doc)),
        more: qs(rules.more, doc)
      };
    }

    /**
     * An episode's page as its details page: the show, the title, "Season 2,
     * Episode 1 · 28-Feb-2020", the synopsis and the buttons on the left —
     * Watch (Resume when it was left partway, with Start Over beside it), Add
     * to or Remove from My List, Episodes, and Clear Progress when it has any
     * (partway or watched) — and the episode's picture on the
     * right, with how far it got and the time left. Dropout 24/7's stream has
     * Watch only. Null when the page has no title to show.
     * @param {Document} doc
     * @param {object} R — the rules' "screen.episode" object
     * @param {{history?: object, href?: string, live?: boolean}} ctx — the
     *   watch history, this page's address, and whether it is the stream
     */
    function episodeModel(doc, R, ctx) {
      const rules = R || {};
      const c = ctx || {};
      const { hrefOf } = C();
      const H = globalThis.TenfootHistory;
      const title = textOf(qs(rules.title, doc));
      if (!title) return null;
      const store = c.history && c.history.entries ? c.history : { entries: {} };
      const key = H && !c.live && c.href ? H.keyOf(c.href) : null;
      const entry = key ? store.entries[key] : null;
      const at = key ? H.resumePoint(store, key) : null;
      const actions = [{ key: "watch", label: at ? "Resume" : "Watch", run: at ? "resume" : "watch", primary: true }];
      if (at) actions.push({ key: "restart", label: "Start Over", run: "restart" });
      const list = qs(rules.listAction, doc);
      if (list) {
        const listed = Common.matches(list, rules.listed);
        actions.push({ key: "mylist", label: "My List", ariaLabel: listed ? "Remove from My List" : "Add to My List", proxy: list, listed });
      }
      const back = hrefOf(qs(rules.season, doc)) || hrefOf(qs(rules.show, doc));
      if (back) actions.push({ key: "episodes", label: "Episodes", href: back });
      // Any progress drawn for it, half-way or watched: cleared on OK.
      if (key && H.progressOf(store, key) !== null) actions.push({ key: "clear", label: "Clear Progress", run: "clear" });
      const reading = at && H ? H.reading(entry) : null;
      const length = reading && reading.duration ? reading.duration : 0;
      const image = qs(rules.image, doc);
      return {
        kind: "episode",
        head: "",
        hero: {
          picture: {
            image: (image && image.getAttribute("content")) || (entry && entry.image) || "",
            fraction: at && length ? at / length : null,
            left: at && length ? `${Common.clock(length - at)} left` : ""
          },
          kicker: textOf(qs(rules.show, doc)),
          title,
          meta: textOf(qs(rules.info, doc)).replace(/\s*•\s*/g, " · "),
          description: textOf(qs(rules.description, doc)),
          image: "",
          actions
        },
        pills: null,
        sections: [],
        more: null,
        start: "watch"
      };
    }

    /**
     * Dropout's profile picker as a screen: "Who is watching?" over the
     * account's profiles in one row, each its picture (or its first letter)
     * and its name, the one watching now marked and selected; OK presses
     * Dropout's own button for it, which saves the choice and goes on to
     * Browse. Then Manage Profiles, which presses Dropout's own: the picker
     * turns into Manage profiles, where each profile reads Edit (OK: Dropout's
     * Edit Profile page for it), Add Profile follows them (Dropout's form for
     * it), and Done turns it back. Add Profile is left off the picker itself:
     * it is under Manage Profiles. Null until Dropout has drawn the picker,
     * and while it shows a form of its own instead (Add Profile, a PIN).
     * @param {Document} doc
     * @param {object} R — the rules' "screen.profiles" object
     * @param {{current?: number, signOut?: () => void, editPicture?: (button: Element, position: number) => void}} ctx
     *   — the profile watching now (its index); Sign Out, at the end of the
     *   picker's row; managing, OK on a profile's picture (its Dropout button,
     *   its place in the row)
     */
    function profilesModel(doc, R, ctx) {
      const rules = R || {};
      const c = ctx || {};
      const root = qs(rules.root, doc);
      if (!root) return null;
      const row = qs(rules.row, root);
      if (!row) return null;
      const pattern = (src) => {
        try {
          return src ? new RegExp(src, "i") : null;
        } catch (_err) {
          return null;
        }
      };
      const add = pattern(rules.add);
      const toggle = qs(rules.toggle, root);
      const done = pattern(rules.done);
      const managing = Boolean(toggle && done && done.test(textOf(toggle)));
      const items = [];
      let addButton = null;
      for (const b of qsa(rules.profile, row)) {
        const name = textOf(qs(rules.name, b));
        if (!name) continue;
        if (add && add.test(name)) {
          addButton = b;
          continue;
        }
        const img = qs(rules.picture, b);
        const i = items.length;
        items.push({
          key: `profile-${i}`,
          href: "",
          title: name,
          subtitle: managing ? "" : i === c.current ? "Watching now" : "",
          // Managing, each profile has an Edit button under it (▼ from the
          // profile): Edit Profile. OK on the profile itself changes its
          // picture, where the page says how.
          button: managing ? "Edit" : "",
          run: managing && typeof c.editPicture === "function"
            ? () => c.editPicture(b, i)
            // Choosing one: Dropout's own button, and Home comes next.
            : !managing && typeof c.choose === "function" ? () => c.choose(b) : undefined,
          image: img ? img.getAttribute("src") || "" : "",
          initial: name.charAt(0).toUpperCase(),
          proxy: b
        });
      }
      if (!items.length) return null;
      if (managing && addButton) items.push({ key: "add", href: "", title: "", subtitle: "", viewAll: true, label: "Add Profile", proxy: addButton });
      if (managing) items.push({ key: "done", href: "", title: "", subtitle: "", viewAll: true, label: "Done", proxy: toggle });
      else if (toggle) items.push({ key: "manage", href: "", title: "", subtitle: "", viewAll: true, label: "Manage Profiles", proxy: toggle });
      if (!managing && typeof c.signOut === "function") items.push({ key: "signout", href: "", title: "", subtitle: "", viewAll: true, label: "Sign Out", run: c.signOut });
      const current = items.find((it) => it.key === `profile-${c.current}`);
      return {
        kind: "profiles",
        head: textOf(qs(rules.title, root)) || (managing ? "Manage profiles" : "Who is watching?"),
        hero: null,
        pills: null,
        // ▶ at the end of the row goes round to its start.
        sections: [{ key: managing ? "manage" : "profiles", title: "", sub: "", columns: items.length, avatars: true, wrap: true, items }],
        more: null,
        managing,
        start: current ? current.key : items[0].key
      };
    }

    /**
     * A profile's form — Add Profile (the picker's own, at #/add) or Edit
     * Profile (/settings/manage/profile) — as a screen: the title and Dropout's
     * line under it, the profile's picture (OK: Dropout's picture chooser),
     * the name box (typed into Dropout's own), Kid Profile where Dropout offers
     * it, and the buttons in the rules' order, each pressing Dropout's own; a
     * button the rules mark `ask` (Delete Profile) runs `ask:<key>` instead,
     * for the page to ask first. Dropout's word after a press (a toast) is the
     * line under the title. Null when the page holds no such form.
     * @param {Document} doc
     * @param {object} R — the rules' "screen.profileForm.add" or ".edit"
     * @param {{saved?: boolean}} [ctx] — Save has just worked
     */
    function profileFormModel(doc, R, ctx) {
      const rules = R || {};
      const c = ctx || {};
      const root = qs(rules.root, doc);
      if (!root) return null;
      const input = qs(rules.name, root);
      if (!input) return null;
      const picture = qsa(rules.picture, root).find((b) => qs(rules.image, b) || qs(rules.letter, b)) || null;
      const img = picture ? qs(rules.image, picture) : null;
      const letter = picture ? textOf(qs(rules.letter, picture)) : "";
      const name = String(input.value || "");
      const buttons = qsa("button", root);
      const actions = [];
      const kid = qs(rules.kid, root);
      if (kid && !kid.disabled && kid.getAttribute("aria-disabled") !== "true") {
        const on = kid.checked === true || kid.getAttribute("aria-checked") === "true" || kid.getAttribute("data-state") === "checked";
        actions.push({ key: "kid", label: `Kid Profile: ${on ? "On" : "Off"}`, proxy: kid });
      }
      for (const b of Array.isArray(rules.buttons) ? rules.buttons : []) {
        let re = null;
        try {
          re = new RegExp(b.text, "i");
        } catch (_err) {
          continue;
        }
        const found = buttons.find((x) => re.test(textOf(x)));
        if (!found) continue;
        // Dropout greys out Continue until there is a name, Save until
        // something changed: shown, dimmed, pressing nothing.
        const off = Boolean(found.disabled) || found.getAttribute("aria-disabled") === "true";
        const a = { key: b.key, label: b.label || textOf(found), primary: Boolean(b.primary), danger: Boolean(b.danger), disabled: off };
        if (b.ask) a.run = `ask:${b.key}`;
        else if (b.save) a.run = "save";
        else a.proxy = found;
        // Just saved, and Dropout's Save grey again: Leanback says so.
        if (b.save && c.saved && off) {
          a.label = "Saved!";
          a.disabled = false;
        }
        actions.push(a);
      }
      // Dropout's word after a press (a toast), unless it is only good news
      // (Saved!, on Leanback's own button).
      let status = Common.siteText(rules.status, doc);
      try {
        if (status && rules.statusQuiet && new RegExp(rules.statusQuiet, "i").test(status)) status = "";
      } catch (_err) { /* no such rule: it is shown */ }
      return {
        kind: "profileForm",
        head: textOf(qs(rules.title, root)),
        hero: { kicker: "", title: "", meta: status, description: textOf(qs(rules.text, root)), actions },
        field: { value: name, placeholder: rules.placeholder || "Profile name", proxy: input },
        pills: null,
        sections: picture ? [{
          key: "picture",
          title: "",
          sub: "",
          columns: 1,
          avatars: true,
          items: [{
            key: "picture",
            href: "",
            title: "",
            subtitle: "Change picture",
            image: img ? img.getAttribute("src") || "" : "",
            initial: letter || name.charAt(0).toUpperCase(),
            proxy: picture
          }]
        }] : [],
        // Top to bottom: the title, the picture, the name, the buttons.
        showHead: true,
        rowOrder: ["sections", "field", "actions"],
        more: null,
        start: "field"
      };
    }

    /**
     * Dropout's front page, signed out, as a welcome screen: Dropout's logo,
     * its line and its words about the service, then Sign In (selected),
     * Browse (Home, signed out), and the privacy policy and terms. Starting a
     * subscription is left to a phone or a computer, which the last line says.
     * Null when the page holds no such banner.
     * @param {Document} doc
     * @param {object} R — the rules' "screen.welcome" object
     * @param {{signinUrl?: string, browseUrl?: string, legal?: {label: string, url: string}[]}} ctx
     */
    function welcomeModel(doc, R, ctx) {
      const rules = R || {};
      const c = ctx || {};
      const banner = qs(rules.root, doc);
      if (!banner) return null;
      const logo = qs(rules.logo, banner);
      const actions = [];
      if (c.signinUrl) actions.push({ key: "signin", label: "Sign In", href: c.signinUrl, primary: true });
      if (c.browseUrl) actions.push({ key: "browse", label: "Browse", href: c.browseUrl });
      for (const l of c.legal || []) {
        if (l && l.url && l.label) actions.push({ key: `legal-${actions.length}`, label: l.label, href: l.url });
      }
      if (!actions.length) return null;
      return {
        kind: "welcome",
        head: "",
        hero: {
          logo: logo ? logo.getAttribute("src") || "" : "",
          kicker: "",
          title: textOf(qs(rules.title, banner)) || "Dropout",
          meta: "",
          description: [textOf(qs(rules.text, banner)), rules.note || ""].filter(Boolean).join(" "),
          image: "",
          actions
        },
        pills: null,
        sections: [],
        more: null,
        start: actions[0].key
      };
    }

    /** A collection page as a screen model: its title over a grid of cards. */
    function collectionModel(doc, R, ctx) {
      const page = readPage(doc, R);
      if (!page.root) return null;
      const c = ctx || {};
      return {
        kind: "collection",
        head: page.title,
        hero: null,
        pills: null,
        sections: [{ key: "items", title: "", sub: "", columns: COLUMNS, items: page.items }],
        // A list with nothing in it (My List, emptied) says so; the selection
        // waits on the rail.
        empty: page.items.length || page.more ? "" : c.empty || "Nothing here yet.",
        more: page.more ? qs(R.more, doc) : null,
        start: null
      };
    }

  globalThis.TenfootReaders = Object.freeze({ readPage, collectionModel, searchModel, episodeModel, profilesModel, profileFormModel, welcomeModel });
})();
