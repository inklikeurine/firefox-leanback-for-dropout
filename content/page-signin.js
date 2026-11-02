// Leanback for Dropout — the sign-in screen, for content/page.js: Leanback's
// own /login, one screen with the email and the password boxes. Dropout's
// form stays underneath, unseen; this layer is a child of <html>, outside the
// site's tree, drawn in Leanback's look (content/home.css, .tenfoot-signin).
// Its boxes are ordinary form boxes — a real <form>, type=email name=email
// autocomplete=username, type=password name=password
// autocomplete=current-password, each with a label — which is all Firefox's
// saved passwords and every password app's add-on look for. Installed into
// the page script's shared context.
//
// Sign in is handed to Dropout's own form on the same page, so its checks and
// its reCAPTCHA work unchanged: the email goes into Dropout's email box and
// its Next is pressed, then, once the password step shows, the password goes
// into Dropout's box and its Sign in is pressed. The password is read from
// Leanback's box at that moment and passed on; it is never kept, logged or
// sent anywhere else.

(function () {
  function install(P) {
    const { state } = P;
    const Common = globalThis.TenfootCommon;
    const { qs } = Common;

    const focusEl = (...a) => P.focusEl(...a);

    const TYPING_LINE = "Press OK on a box to type with the remote, or use a keyboard.";
    const NO_ANSWER = "Dropout isn't answering. Check the TV's internet connection, then try again.";
    const BAD_EMAIL = "Please enter a valid email.";
    const MISSING = "Enter your email and your password.";
    // How long Dropout has to answer (pages.signin.nextMs: its Next, to the
    // password step or an error; signinMs: its Sign in, to the page moving on
    // or an error).
    const NEXT_MS = 15000;
    const SIGNIN_MS = 20000;

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
      const error = make("p", "tenfoot-signin-error");
      error.setAttribute("role", "alert");
      error.hidden = true;
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
      card.append(make("div", "tenfoot-signin-brand", "DROPOUT"), make("h1", "tenfoot-signin-title", "Sign in"), error, form, note, links);
      layer.appendChild(card);

      // Never submitted by the browser: Sign in is handed to Dropout's own
      // form instead.
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        signIn();
      });
      // Enter in Email goes on to Password; in Password it is Sign in, which
      // the form's own submit button already does.
      email.input.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        focusEl(password.input);
      });
      return { layer, form, error, email: email.input, password: password.input, submit, forgot, legal, busy: false };
    }

    // The text already in Dropout's own email box (a password app or Firefox
    // may have put it there): where the selection starts, and the first email.
    function dropoutEmail() {
      const box = qs(signinRules().dropoutEmail);
      return box ? String(box.value || "").trim() : "";
    }

    // ----- the hand-over to Dropout's form ----------------------------------

    function showError(text) {
      const s = state.signin;
      if (!s) return;
      s.error.textContent = text || "";
      s.error.hidden = !text;
    }

    function setBusy(on) {
      const s = state.signin;
      if (!s) return;
      s.busy = on;
      s.submit.textContent = on ? "Signing in…" : "Sign in";
      if (on) s.submit.setAttribute("aria-disabled", "true");
      else s.submit.removeAttribute("aria-disabled");
    }

    // Dropout's own words for what went wrong, when its page shows any.
    function dropoutError() {
      const R = signinRules();
      const box = qs(R.error);
      if (!box || box.classList.contains("is-hidden")) return "";
      return (qs(R.errorText, box) || box).textContent.trim();
    }

    function passwordStepShown() {
      const R = signinRules();
      return Boolean(qs(R.passwordInput)) && !qs(R.passwordHidden);
    }

    // Resolve with what `check` returns once it is truthy, looked at now and
    // on every change in Dropout's form (a MutationObserver, no polling), or
    // with null after `ms`.
    function waitFor(check, ms) {
      return new Promise((resolve) => {
        const now = check();
        if (now) {
          resolve(now);
          return;
        }
        const target = qs(signinRules().box) || document.body;
        let timer = 0;
        const done = (v) => {
          clearTimeout(timer);
          observer.disconnect();
          resolve(v);
        };
        const observer = new MutationObserver(() => {
          const v = check();
          if (v) done(v);
        });
        observer.observe(target, { subtree: true, childList: true, attributes: true, characterData: true });
        timer = setTimeout(() => done(check() || null), ms);
      });
    }

    // Put text into one of Dropout's boxes as if typed there, with the events
    // its script listens for.
    function fill(box, text) {
      Common.typeInto(box, text);
      if (box) box.dispatchEvent(new (box.ownerDocument.defaultView || globalThis).Event("change", { bubbles: true }));
    }

    // Dropout shows its own error under the title; Leanback shows it on its
    // screen, keeps the email, empties the password and selects it.
    function fail(text, where) {
      setBusy(false);
      showError(text);
      const s = state.signin;
      if (!s) return;
      if (where === "password") s.password.value = "";
      focusEl(where === "password" ? s.password : s.email);
    }

    function hideDropoutError() {
      const box = qs(signinRules().error);
      if (box) box.classList.add("is-hidden");
    }

    async function signIn() {
      const s = state.signin;
      if (!s || s.busy) return;
      const R = signinRules();
      showError("");
      const email = s.email.value.trim();
      if (!email) return fail(MISSING, "email");
      if (!s.password.value) return fail(MISSING, "password");
      setBusy(true);
      // Step 1: Dropout's email box and its Next.
      hideDropoutError();
      const theirs = qs(R.dropoutEmail);
      fill(theirs, email);
      // Dropout's form checks the email itself and the browser's own check
      // would stop its Next without a word: say it here.
      if (theirs && typeof theirs.checkValidity === "function" && !theirs.checkValidity()) return fail(BAD_EMAIL, "email");
      const next = qs(R.emailNext);
      if (!next) return fail(NO_ANSWER, "email");
      next.click();
      const first = await waitFor(() => dropoutError() ? "error" : passwordStepShown() ? "step" : null, Number(R.nextMs) || NEXT_MS);
      if (!state.signin || state.signin !== s) return; // the page moved on
      if (first === "error") return fail(dropoutError(), "email");
      if (first !== "step") return fail(NO_ANSWER, "email");
      // Step 2: the password, read from Leanback's box now, and Dropout's
      // Sign in.
      hideDropoutError();
      fill(qs(R.passwordInput), s.password.value);
      const go = qs(R.passwordSubmit);
      if (!go) return fail(NO_ANSWER, "password");
      go.click();
      const second = await waitFor(() => dropoutError() ? "error" : null, Number(R.signinMs) || SIGNIN_MS);
      if (!state.signin || state.signin !== s) return;
      // The page moves on when it works; staying here is an error, Dropout's
      // or none at all.
      fail(second === "error" ? dropoutError() : NO_ANSWER, "password");
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
