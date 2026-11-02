// Leanback for Dropout — Dropout's own pages laid out for the TV, for
// content/page.js: the site's header and footer marked while Leanback is
// on, Edit Profile drawn large,
// the policies read by scrolling, the welcome offered once signed out, and
// the addresses better seen as another (redirects). Installed into the page
// script's shared context.

(function () {
  function install(P) {
    const { state } = P;
    const SIGNIN_OFFERED = "tenfoot.signin-offered";
    const SIGNIN_HOME_KEY = "tenfoot.signin-home";
    const SIGNIN_HOME_TTL_MS = 120000;
    const READ_STEP = 0.6; // ▲ ▼ on a policy: this share of the window's height
    const Rules = globalThis.TenfootSiteRules;
    const { qs, qsa } = globalThis.TenfootCommon;

    // From the rest of the page script.
    const reducedMotion = (...a) => P.reducedMotion(...a);

    // Dropout's own top bar and footer (rules: common.chrome) are hidden on every
    // page but account and help (`other`), which keep them.
    function stampChrome() {
      const want = state.enabled && state.kind !== "other";
      for (const sel of Rules.selectorList(state.rules.common && state.rules.common.chrome)) {
        for (const el of qsa(sel)) {
          if (want) el.setAttribute("data-tenfoot-chrome", "");
          else el.removeAttribute("data-tenfoot-chrome");
        }
      }
    }

    // A page of Dropout's laid out for the TV (content/page.css): a form —
    // Edit Profile (profileEdit) — its box (pages.<kind>.box) centred, drawn
    // large and in Leanback's colours ([data-tenfoot-form]); or a policy, its
    // words (pages.legal.content) in Leanback's type
    // ([data-tenfoot-reading]). What has no use on a TV (pages.<kind>.hide)
    // goes. (The sign-in and reset screens are Leanback's own:
    // content/page-signin.js.)
    function syncForm() {
      if (state.kind === "signin" || state.kind === "reset") {
        P.syncSignin();
        return;
      }
      if (state.kind !== "profileEdit" && state.kind !== "legal") return;
      for (const el of qsa(Rules.selector(state.page.hide))) {
        if (!el.hasAttribute("data-tenfoot-gone")) el.setAttribute("data-tenfoot-gone", "");
      }
      if (state.kind === "legal") {
        for (const el of qsa(Rules.selector(state.page.content))) {
          if (!el.hasAttribute("data-tenfoot-reading")) el.setAttribute("data-tenfoot-reading", "");
        }
        return;
      }
      const box = qs(state.page.box);
      if (box && !box.hasAttribute("data-tenfoot-form")) box.setAttribute("data-tenfoot-form", state.kind);
    }

    function signedOut() {
      return Boolean(qs(state.rules.common && state.rules.common.signedOut));
    }

    // An address that is better seen as another (rules → redirects: Dropout
    // 24/7's stream reached from My List, at an address no hub is in, goes to
    // Dropout 24/7's page), and the welcome signed in, which is Home's.
    function redirectPage() {
      const list = Array.isArray(state.rules.redirects) ? state.rules.redirects : [];
      for (const r of list) {
        if (!r || typeof r.path !== "string" || typeof r.to !== "string") continue;
        try {
          if (!new RegExp(r.path).test(location.pathname)) continue;
        } catch (_err) {
          continue;
        }
        P.navigate(r.to, "replace");
        return true;
      }
      if (state.kind === "welcome" && !signedOut() && state.rules.browseUrl) {
        P.navigate(state.rules.browseUrl, "replace");
        return true;
      }
      return homeAfterSignIn();
    }

    // After signing in the TV goes to "Who is watching?", and choosing a
    // profile there always ends on Home, whatever Dropout does next (it may go
    // back to the page that asked for the sign-in, or straight to Browse, or
    // skip the picker). One note in session storage (SIGNIN_HOME_KEY,
    // "<stage>:<time>") carries it from page to page:
    //   signed — Leanback's sign-in screen pressed Dropout's Sign in. The first
    //            page after the flow (the sign-in and reset screens are part of
    //            it) that is not the picker goes to the picker, once ("forced");
    //   forced — sent there; if Dropout takes the viewer away from it again
    //            (one profile, "remember my profile"), Home instead;
    //   chose  — a profile was chosen on Leanback's picker (chooseProfile(),
    //            also from the rail's Switch profile): the first page after
    //            that goes to Home, unless it is Home.
    // Signed out still, the sign-in did not work: nothing moves. The note
    // lapses after a couple of minutes.
    function homeAfterSignIn() {
      let raw = "";
      try {
        raw = sessionStorage.getItem(SIGNIN_HOME_KEY) || "";
      } catch (_err) {
        return false;
      }
      const [stage, at] = raw.split(":");
      if (!stage) return false;
      if (!(Date.now() - Number(at) < SIGNIN_HOME_TTL_MS)) {
        forgetHome();
        return false;
      }
      const home = state.rules.browseUrl;
      const picker = state.rules.profilesUrl;
      // Still in the flow.
      if (state.kind === "signin" || state.kind === "reset") return false;
      if (state.kind === "profiles") return false;
      if (signedOut()) {
        forgetHome();
        return false;
      }
      if (stage === "signed" && picker) {
        noteHome("forced");
        P.navigate(picker, "replace");
        return true;
      }
      forgetHome();
      if (state.kind === "browse" || !home) return false;
      P.navigate(home, "replace");
      return true;
    }

    function noteHome(stage) {
      try {
        sessionStorage.setItem(SIGNIN_HOME_KEY, `${stage}:${Date.now()}`);
      } catch (_err) { /* no way to carry it */ }
    }

    // A profile was chosen on Leanback's picker: Home comes next.
    function chooseProfile() {
      noteHome("chose");
    }

    function forgetHome() {
      try {
        sessionStorage.removeItem(SIGNIN_HOME_KEY);
      } catch (_err) { /* nothing to forget */ }
    }

    // Signed out, the first Home of the tab goes on to the welcome (Sign In,
    // Browse, the policies), so a TV left signed out is not left on a Home
    // whose videos will not play. Once per tab: Back from there, or its
    // Browse, comes back to Home and stays.
    function offerWelcome() {
      const to = state.rules.welcomeUrl || state.rules.signinUrl;
      if (state.kind !== "browse" || !to || !signedOut()) return false;
      try {
        if (sessionStorage.getItem(SIGNIN_OFFERED)) return false;
        sessionStorage.setItem(SIGNIN_OFFERED, "1");
      } catch (_err) {
        return false; // no way to remember it: never risk sending Back round in a loop
      }
      P.navigate(to, "push");
      return true;
    }

    // A policy (privacy, terms, cookies): Dropout's words in Leanback's type
    // and colours (content/page.css), read by scrolling. ▲ ▼ scroll by most
    // of a screen; nothing on it is a stop.
    function scrollReading(dir) {
      if (dir !== "up" && dir !== "down") return true;
      window.scrollBy({ top: (dir === "down" ? 1 : -1) * window.innerHeight * READ_STEP, behavior: reducedMotion() ? "auto" : "smooth" });
      return true;
    }

    Object.assign(P, { stampChrome, syncForm, redirectPage, offerWelcome, scrollReading, chooseProfile });
  }

  globalThis.TenfootPageForms = Object.freeze({ install });
})();
