// Leanback for Dropout — the sign-in screen, for content/page.js: Leanback's
// own /login, one screen with the email and the password boxes. Dropout's
// form stays underneath, unseen; this layer is a child of <html>, outside the
// site's tree, drawn in Leanback's look (content/home.css, .tenfoot-signin).
// Its boxes are ordinary form boxes — a real <form>, type=email name=email
// autocomplete=username, type=password name=password
// autocomplete=current-password, each with a label — which is all Firefox's
// saved passwords and every password app's add-on look for. Installed into
// the page script's shared context.

(function () {
  function install(P) {
    const { state } = P;
    const { qs } = globalThis.TenfootCommon;

    const focusEl = (...a) => P.focusEl(...a);

    const TYPING_LINE = "Press OK on a box to type with the remote, or use a keyboard.";

    function signinRules() {
      return state.page || {};
    }

    function legalLinks() {
      const list = Array.isArray(state.rules.legal) ? state.rules.legal : [];
      return list.filter((l) => l && typeof l.url === "string" && typeof l.label === "string");
    }

    function make(tag, cls, text) {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text) e.textContent = text;
      return e;
    }

    function field(id, label, type, name, autocomplete) {
      const wrap = make("div", "tenfoot-signin-field");
      const lab = make("label", "tenfoot-signin-label", label);
      lab.htmlFor = id;
      const input = make("input", "tenfoot-signin-input");
      input.id = id;
      input.type = type;
      input.name = name;
      input.setAttribute("autocomplete", autocomplete);
      input.spellcheck = false;
      input.setAttribute("autocapitalize", "off");
      input.setAttribute("data-tenfoot-nozoom", "");
      wrap.append(lab, input);
      return { wrap, input };
    }

    // The screen: DROPOUT, "Sign in", the two boxes, Sign in, Forgot
    // password?, the typing line, then the policies. No rail, no top bar.
    function build() {
      const layer = make("div", "tenfoot-signin");
      layer.setAttribute("role", "main");
      layer.setAttribute("aria-label", "Sign in");
      const card = make("div", "tenfoot-signin-card");
      const form = make("form", "tenfoot-signin-form");
      form.noValidate = true;
      form.setAttribute("autocomplete", "on");
      const email = field("tenfoot-signin-email", "Email", "email", "email", "username");
      const password = field("tenfoot-signin-password", "Password", "password", "password", "current-password");
      const submit = make("button", "tenfoot-hero-button tenfoot-hero-primary tenfoot-signin-submit", "Sign in");
      submit.type = "submit";
      const forgot = make("a", "tenfoot-hero-button tenfoot-signin-forgot", "Forgot password?");
      forgot.href = state.rules.resetUrl || "/forgot_password";
      const buttons = make("div", "tenfoot-signin-buttons");
      buttons.append(submit, forgot);
      form.append(email.wrap, password.wrap, buttons);
      const note = make("p", "tenfoot-signin-note", TYPING_LINE);
      const links = make("p", "tenfoot-signin-links");
      const legal = legalLinks().map((l) => {
        const a = make("a", "tenfoot-signin-link", l.label);
        a.href = l.url;
        links.appendChild(a);
        return a;
      });
      card.append(make("div", "tenfoot-signin-brand", "DROPOUT"), make("h1", "tenfoot-signin-title", "Sign in"), form, note, links);
      layer.appendChild(card);

      // Never submitted by the browser: Sign in is handed to Dropout's own
      // form instead.
      form.addEventListener("submit", (e) => e.preventDefault());
      // Enter in Email goes on to Password; in Password it is Sign in, which
      // the form's own submit button already does.
      email.input.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        focusEl(password.input);
      });
      return { layer, form, email: email.input, password: password.input, submit, forgot, legal };
    }

    // The text already in Dropout's own email box (a password app or Firefox
    // may have put it there): where the selection starts, and the first email.
    function dropoutEmail() {
      const box = qs(signinRules().dropoutEmail);
      return box ? String(box.value || "").trim() : "";
    }

    function syncSignin() {
      if (state.kind !== "signin" || !state.enabled) {
        removeSignin();
        return;
      }
      if (state.signin && state.signin.layer.isConnected) return;
      const s = build();
      s.email.value = dropoutEmail();
      const start = s.email.value ? s.password : s.email;
      start.setAttribute("data-tenfoot-signin-start", "");
      document.documentElement.appendChild(s.layer);
      state.signin = s;
      // The first stop is set here, not waited for: the screen is Leanback's
      // own, there is nothing for the site to render first.
      state.pendingInitialFocus = 0;
      focusEl(start);
    }

    function removeSignin() {
      if (!state.signin) return;
      state.signin.layer.remove();
      state.signin = null;
    }

    function inSignin(el) {
      return Boolean(state.signin && el && state.signin.layer.contains(el));
    }

    // Top to bottom, in the order the screen reads.
    function stops() {
      const s = state.signin;
      return s ? [s.email, s.password, s.submit, s.forgot, ...s.legal].filter((e) => e.isConnected) : [];
    }

    // ▲ ▼ go to the next stop up or down and stop at the ends; ◀ ▶ go between
    // the two policies. No geometry: the order is the screen's.
    function moveSignin(dir) {
      const list = stops();
      if (!list.length) return true;
      const i = list.indexOf(document.activeElement);
      if (i < 0) {
        focusEl(list[0]);
        return true;
      }
      const s = state.signin;
      if (dir === "up" || dir === "down") {
        const j = Math.min(list.length - 1, Math.max(0, i + (dir === "down" ? 1 : -1)));
        if (j !== i) focusEl(list[j]);
        return true;
      }
      const cur = list[i];
      if (s.legal.includes(cur)) {
        const k = s.legal.indexOf(cur) + (dir === "right" ? 1 : -1);
        if (s.legal[k]) focusEl(s.legal[k]);
      }
      return true;
    }

    // Back from a box leaves it, to Sign in; Back again is the page's.
    function leaveSigninBox() {
      if (!state.signin) return false;
      focusEl(state.signin.submit);
      return true;
    }

    Object.assign(P, { syncSignin, removeSignin, inSignin, moveSignin, leaveSigninBox });
  }

  globalThis.TenfootPageSignin = Object.freeze({ install });
})();
