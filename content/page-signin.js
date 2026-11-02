// Leanback for Dropout — the sign-in and password reset screens, for
// content/page.js: Leanback's own /login (the email and the password boxes on
// one screen) and /forgot_password (the email box). Dropout's form stays
// underneath, unseen; this layer is a child of <html>, outside the site's
// tree, drawn in Leanback's look (content/home.css, .tenfoot-signin). Its
// boxes are ordinary form boxes — a real <form>, type=email name=email
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
// sent anywhere else. The reset is handed over the same way (Dropout's email
// box and its button).
//
// The email typed on one of the two screens is kept for the other, in this
// tab's session storage, for as long as the tab stays on them.

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
    const MISSING_EMAIL = "Enter your email.";
    const SENT = "Check your email on your phone or computer. Set the new password there, then sign in here.";
    // How long Dropout has to answer (pages.signin.nextMs: its Next, to the
    // password step or an error; signinMs: its Sign in, to the page moving on
    // or an error; pages.reset.answerMs: its reset button, to an error).
    const NEXT_MS = 15000;
    const SIGNIN_MS = 20000;
    const RESET_MS = 15000;
    // In the tab's session storage: the email between the two screens, and a
    // reset asked for (Dropout answers with a page of its own, which this
    // screen then says "check your email" for).
    const EMAIL_KEY = "tenfoot.signin-email";
    const RESET_KEY = "tenfoot.reset-asked";
    // Signed in from here: the picker, then Home (page-forms.js).
    const HOME_KEY = "tenfoot.signin-home";

    const isReset = () => state.kind === "reset";

    function pageRules() {
      return state.page || {};
    }

    function legalLinks() {
      const list = Array.isArray(state.rules.legal) ? state.rules.legal : [];
      return list.filter((l) => l && typeof l.url === "string" && typeof l.label === "string");
    }

    function store(op, key, value) {
      try {
        if (op === "set") sessionStorage.setItem(key, value);
        else if (op === "remove") sessionStorage.removeItem(key);
        else return sessionStorage.getItem(key);
      } catch (_err) { /* no session storage: nothing is carried over */ }
      return null;
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

    // The screen: DROPOUT, the title, the box or boxes, the main button and
    // the way to the other screen, the typing line, then the policies. No
    // rail, no top bar.
    function build() {
      const reset = isReset();
      const title = reset ? "Reset password" : "Sign in";
      const layer = make("div", "tenfoot-signin");
      layer.setAttribute("role", "main");
      layer.setAttribute("aria-label", title);
      const card = make("div", "tenfoot-signin-card");
      const form = make("form", "tenfoot-signin-form");
      form.noValidate = true;
      form.setAttribute("autocomplete", "on");
      const message = make("p", "tenfoot-signin-error");
      message.setAttribute("role", "alert");
      message.hidden = true;
      const email = field("tenfoot-signin-email", "Email", "email", "email", "username");
      const password = reset ? null : field("tenfoot-signin-password", "Password", "password", "password", "current-password");
      const label = reset ? "Send reset email" : "Sign in";
      const submit = make("button", "tenfoot-hero-button tenfoot-hero-primary tenfoot-signin-submit", label);
      submit.type = "submit";
      const alt = make("a", "tenfoot-hero-button tenfoot-signin-forgot", reset ? "Back to sign in" : "Forgot password?");
      alt.href = (reset ? state.rules.signinUrl : state.rules.resetUrl) || (reset ? "/login" : "/forgot_password");
      const buttons = make("div", "tenfoot-signin-buttons");
      buttons.append(submit, alt);
      form.append(email.wrap, ...(password ? [password.wrap] : []), buttons);
      const note = make("p", "tenfoot-signin-note", TYPING_LINE);
      const links = make("p", "tenfoot-signin-links");
      const legal = legalLinks().map((l) => {
        const a = make("a", "tenfoot-signin-link", l.label);
        a.href = l.url;
        links.appendChild(a);
        return a;
      });
      card.append(make("div", "tenfoot-signin-brand", "DROPOUT"), make("h1", "tenfoot-signin-title", title), message, form, note, links);
      layer.appendChild(card);

      // Never submitted by the browser: it is handed to Dropout's own form.
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (reset) sendReset();
        else signIn();
      });
      // The email goes with the viewer to the other screen.
      alt.addEventListener("click", () => store("set", EMAIL_KEY, email.input.value.trim()));
      // Enter in Email goes on to Password; in Password it is Sign in, which
      // the form's own submit button already does. On the reset screen it is
      // the form's own submit.
      if (password) {
        email.input.addEventListener("keydown", (e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          focusEl(password.input);
        });
      }
      return {
        layer, form, message, email: email.input, emailWrap: email.wrap, password: password ? password.input : null,
        submit, alt, legal, label, busy: false, kind: state.kind
      };
    }

    // ----- the hand-over to Dropout's form ----------------------------------

    function show(text, tone) {
      const s = state.signin;
      if (!s) return;
      s.message.textContent = text || "";
      s.message.hidden = !text;
      if (text) s.message.setAttribute("data-tone", tone || "error");
      else s.message.removeAttribute("data-tone");
    }

    function setBusy(on, busyLabel) {
      const s = state.signin;
      if (!s) return;
      s.busy = on;
      s.submit.textContent = on ? busyLabel : s.label;
      if (on) s.submit.setAttribute("aria-disabled", "true");
      else s.submit.removeAttribute("aria-disabled");
    }

    // Dropout's own words for what went wrong, when its page shows any.
    function dropoutError() {
      const R = pageRules();
      const box = qs(R.error);
      if (!box || box.classList.contains("is-hidden")) return "";
      return (qs(R.errorText, box) || box).textContent.trim();
    }

    function passwordStepShown() {
      const R = pageRules();
      return Boolean(qs(R.passwordInput)) && !qs(R.passwordHidden);
    }

    // What `check` returns once it is truthy, looked at on every change in
    // Dropout's form, or null after `ms`.
    const waitFor = (check, ms) => Common.waitFor(check, ms, qs(pageRules().box) || document.body);

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
      show(text, "error");
      const s = state.signin;
      if (!s) return;
      if (where === "password" && s.password) {
        s.password.value = "";
        focusEl(s.password);
      } else focusEl(s.email);
    }

    function hideDropoutError() {
      const box = qs(pageRules().error);
      if (box) box.classList.add("is-hidden");
    }

    // Dropout's email box, given the email, and whether the browser would
    // accept it: its form's own check would stop its button without a word.
    function handOverEmail(email) {
      const theirs = qs(pageRules().dropoutEmail);
      fill(theirs, email);
      return !(theirs && typeof theirs.checkValidity === "function" && !theirs.checkValidity());
    }

    async function signIn() {
      const s = state.signin;
      if (!s || s.busy) return;
      const R = pageRules();
      show("");
      const email = s.email.value.trim();
      if (!email) return fail(MISSING, "email");
      if (!s.password.value) return fail(MISSING, "password");
      setBusy(true, "Signing in…");
      // Step 1: Dropout's email box and its Next.
      hideDropoutError();
      if (!handOverEmail(email)) return fail(BAD_EMAIL, "email");
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
      store("set", HOME_KEY, `signed:${Date.now()}`);
      go.click();
      const second = await waitFor(() => dropoutError() ? "error" : null, Number(R.signinMs) || SIGNIN_MS);
      if (!state.signin || state.signin !== s) return;
      // The page moves on when it works; staying here is an error, Dropout's
      // or none at all.
      store("remove", HOME_KEY);
      fail(second === "error" ? dropoutError() : NO_ANSWER, "password");
    }

    // The reset: Dropout's email box and its button. Dropout answers with a
    // page of its own, so the ask is noted first (RESET_KEY): the next
    // sign-in or reset screen says "check your email". An error on this very
    // page is shown instead.
    async function sendReset() {
      const s = state.signin;
      if (!s || s.busy) return;
      const R = pageRules();
      show("");
      const email = s.email.value.trim();
      if (!email) return fail(MISSING_EMAIL, "email");
      setBusy(true, "Sending…");
      hideDropoutError();
      if (!handOverEmail(email)) return fail(BAD_EMAIL, "email");
      const send = qs(R.send);
      if (!send) return fail(NO_ANSWER, "email");
      // The email stays for the screen Dropout's answer lands on.
      store("set", EMAIL_KEY, email);
      store("set", RESET_KEY, "1");
      send.click();
      const answer = await waitFor(() => dropoutError() ? "error" : null, Number(R.answerMs) || RESET_MS);
      if (!state.signin || state.signin !== s) return;
      store("remove", RESET_KEY);
      fail(answer === "error" ? dropoutError() : NO_ANSWER, "email");
    }

    // Dropout has taken the request: say what to do next, leave the box and
    // the button out, and put the selection on the way back to sign-in.
    function showSent() {
      const s = state.signin;
      if (!s) return;
      show(SENT, "notice");
      s.emailWrap.hidden = true;
      s.submit.hidden = true;
      focusEl(s.alt);
    }

    // ----- the screens ------------------------------------------------------

    // What the email box starts with: what is already in Dropout's own box (a
    // password app or Firefox may have put it there), else the email typed on
    // the other screen.
    function startingEmail() {
      const box = qs(pageRules().dropoutEmail);
      const theirs = box ? String(box.value || "").trim() : "";
      return theirs || store("get", EMAIL_KEY) || "";
    }

    function syncSignin() {
      if ((state.kind !== "signin" && state.kind !== "reset") || !state.enabled) {
        removeSignin();
        return;
      }
      if (state.signin && state.signin.layer.isConnected) return;
      const s = build();
      s.email.value = startingEmail();
      const start = s.password && s.email.value ? s.password : s.email;
      start.setAttribute("data-tenfoot-signin-start", "");
      document.documentElement.appendChild(s.layer);
      state.signin = s;
      // The first stop is set here, not waited for: the screen is Leanback's
      // own, there is nothing for the site to render first.
      state.pendingInitialFocus = 0;
      focusEl(start);
      // Back from Dropout's answer to a reset: an error on its page is
      // shown; otherwise the request was taken.
      if (store("get", RESET_KEY)) {
        store("remove", RESET_KEY);
        const err = dropoutError();
        if (err) show(err, "error");
        else if (isReset()) showSent();
        else show(SENT, "notice");
      }
    }

    function removeSignin() {
      if (!state.signin) return;
      state.signin.layer.remove();
      state.signin = null;
    }

    // The email and the reset ask last only while the tab is on these two
    // screens: any other page forgets them.
    function forgetSigninEmail() {
      if (state.kind === "signin" || state.kind === "reset") return;
      store("remove", EMAIL_KEY);
      store("remove", RESET_KEY);
    }

    // The layout of the keyboard for one of the screen's boxes, or null.
    function signinLayoutFor(el) {
      const s = state.signin;
      if (!s || !el) return null;
      if (el === s.email) return "email";
      if (el === s.password) return "password";
      return null;
    }

    // What Enter in a box does: Email goes on to Password; Password (and the
    // reset's Email) press the button.
    function signinEnter(box) {
      const s = state.signin;
      if (!s) return false;
      if (box === s.email && s.password) focusEl(s.password);
      else s.submit.click();
      return true;
    }

    function inSignin(el) {
      return Boolean(state.signin && el && state.signin.layer.contains(el));
    }

    // Top to bottom, in the order the screen reads; what is hidden is no stop.
    function stops() {
      const s = state.signin;
      if (!s) return [];
      return [s.email, s.password, s.submit, s.alt, ...s.legal].filter((e) => e && e.isConnected && !e.closest("[hidden]"));
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

    // Back from a box leaves it, to the main button; Back again is the page's.
    function leaveSigninBox() {
      if (!state.signin) return false;
      focusEl(state.signin.submit.hidden ? state.signin.alt : state.signin.submit);
      return true;
    }

    Object.assign(P, { syncSignin, removeSignin, inSignin, signinLayoutFor, signinEnter, moveSignin, leaveSigninBox, forgetSigninEmail });
  }

  globalThis.TenfootPageSignin = Object.freeze({ install });
})();
