// Leanback for Dropout — the profiles, for content/page.js: whether the
// profile picker shows a form of Dropout's own in place of its profiles,
// a profile's picture changed through Dropout's profile API, Cancel and
// Delete on Edit Profile asked first in Leanback's box, and signing out.
// Installed into the page script's shared context.

(function () {
  function install(P) {
    const { state } = P;
    const Readers = globalThis.TenfootReaders;
    const Common = globalThis.TenfootCommon;
    const { qs } = Common;
    const SAVE_MS = 6000; // how long Dropout has to answer a Save
    const SAVE_SETTLE_MS = 800; // a Save greyed this long is saved, not sending
    const SAVED_MS = 3000; // how long the button says Saved! if the screen stays

    // From the rest of the page script.
    const screenRules = (...a) => P.screenRules(...a);
    const startScreen = (...a) => P.startScreen(...a);
    const stopScreen = (...a) => P.stopScreen(...a);
    const refocusPage = (...a) => P.refocusPage(...a);
    const goSideways = (...a) => P.goSideways(...a);
    const askUser = (...a) => P.askUser(...a);
    const pickPicture = (...a) => P.pickPicture(...a);
    const notice = (...a) => P.notice(...a);

    // The picker shows a form of its own in place of its profiles: Add
    // Profile (a name and a picture), or a profile's PIN. Those are Dropout's,
    // driven as they are (rules → pages.profiles); while it is only loading,
    // nothing to press yet, the screen waits on.
    function formRules() {
      return screenRules().profileForm || {};
    }

    // The picker showing a form Leanback does not draw (a PIN): Dropout's
    // own, driven as it is.
    function pickerForm() {
      const R = screenRules().profiles || {};
      const app = qs(R.root);
      if (!app || !qs("input, button", app)) return false;
      return !Readers || (!Readers.profilesModel(document, R, { current: state.profile }) && !Readers.profileFormModel(document, formRules().add));
    }

    // Dropout's profile API, as its own pages call it: its address from the
    // page (VHX.config.api_v2_url), the page's sign-in token (TOKEN), the
    // site's and the account's ids, and the page's own fetch, so the call
    // is the page's. Null on a page without them.
    function profileApi() {
      let page = null;
      try {
        page = window.wrappedJSObject || window;
        const base = page.VHX && page.VHX.config ? page.VHX.config.api_v2_url : "";
        const token = page.TOKEN;
        const site = page._current_site ? page._current_site.id : null;
        const user = page._current_user ? page._current_user.id : null;
        if (!base || typeof token !== "string" || !token || site == null || user == null) return null;
        const call = async (path, method, body) => {
          const init = { method: method || "GET", headers: { Authorization: `Bearer ${token}` } };
          if (body !== undefined) {
            init.headers["Content-Type"] = "application/json";
            init.body = JSON.stringify(body);
          }
          const url = String(base) + path.replace("{site}", String(site)).replace("{user}", String(user));
          const res = await page.fetch(url, page !== window && typeof cloneInto === "function" ? cloneInto(init, window) : init);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const text = String(await res.text());
          return text ? JSON.parse(text) : null;
        };
        return { call };
      } catch (_err) {
        return null;
      }
    }

    // Manage profiles, OK on a profile's picture: its pictures in a box of
    // Leanback's, the one it has now selected. OK on another saves it (as
    // Dropout's Edit Profile does) and Manage profiles is drawn again with
    // it; Back changes nothing. Without Dropout's API on the page, Dropout's
    // own button for the profile (Edit Profile).
    async function editPicture(button, position) {
      const R = (state.rules && state.rules.profileApi) || {};
      const api = profileApi();
      if (!api || !R.profiles || !R.pictures || !R.update) {
        if (button && button.isConnected) button.click();
        return;
      }
      let profiles = [];
      let pictures = [];
      try {
        const [p, q] = await Promise.all([api.call(R.profiles), api.call(R.pictures)]);
        profiles = (p && Array.isArray(p.profiles) ? p.profiles : []).slice().sort((a, b) => a.index - b.index);
        pictures = (q && Array.isArray(q.profile_pictures) ? q.profile_pictures : []).slice().sort((a, b) => a.position - b.position);
      } catch (err) {
        console.warn("[leanback-for-dropout] the profile pictures could not be read:", err && err.message);
      }
      const profile = profiles[position];
      if (!profile || !pictures.length) {
        notice("The pictures could not be loaded");
        return;
      }
      const item = (pic, i) => ({ id: String(pic.id), image: String(pic.image_url || ""), label: `Picture ${i + 1}` });
      const current = pictures.find((pic) => pic.id === profile.profile_image_id || (pic.image_url && pic.image_url === profile.profile_image_url));
      const classics = pictures.filter((pic) => pic.site_id == null);
      const own = pictures.filter((pic) => pic.site_id != null);
      const chosen = await pickPicture({
        title: `Picture for ${profile.name}`,
        start: current ? String(current.id) : null,
        sections: [
          { label: "The classics", items: classics.map(item) },
          { label: R.siteLabel || "Dropout", items: own.map((pic, i) => item(pic, classics.length + i)) }
        ]
      });
      if (!chosen || (current && chosen === String(current.id))) return;
      const pick = pictures.find((pic) => String(pic.id) === chosen);
      try {
        await api.call(R.update.replace("{index}", String(profile.index)), "PATCH", { profile: { name: profile.name, profile_image_id: pick ? pick.id : chosen } });
      } catch (err) {
        console.warn("[leanback-for-dropout] the picture could not be saved:", err && err.message);
        notice("The picture could not be saved");
        return;
      }
      // Dropout's picker draws its profiles once: drawn again, managing.
      if (R.after) goSideways(R.after);
    }

    // Save on Edit Profile: Dropout's own Save pressed, and its answer
    // watched for (no polling): Dropout greying Save again (what a saved form
    // does) or its toast saying saved means it worked: the screen
    // closes at once (the button says Saved! if it stays). Anything else Dropout says is shown as
    // it is; no answer is said too. Save grey to begin with: nothing to save.
    let savedTimer = 0;
    async function saveProfile() {
      const R = formRules().edit || {};
      const root = qs(R.root);
      if (!root) return;
      const rule = (R.buttons || []).find((b) => b.key === "save");
      const save = findButton(root, rule && rule.text);
      if (!save) return;
      let re = null;
      try {
        re = new RegExp((rule && rule.text) || "^Save$", "i");
      } catch (_err) {
        return;
      }
      // Dropout's own button, in Dropout's form (Leanback's is outside it).
      const saveNow = () => {
        const scope = qs(R.root) || root;
        return Array.from(scope.querySelectorAll("button")).find((b) => re.test((b.textContent || "").trim())) || null;
      };
      const grey = () => {
        const b = saveNow();
        return Boolean(b) && (b.disabled || b.getAttribute("aria-disabled") === "true");
      };
      const toast = () => Common.siteText(R.status);
      const verdict = () => {
        const t = toast();
        if (t && /saved|updated|success/i.test(t)) return "saved";
        if (t) return "toast";
        return grey() ? "grey" : null;
      };
      clearTimeout(savedTimer);
      state.profileSaved = false;
      save.click();
      let result = await Common.waitFor(verdict, Number(R.saveMs) || SAVE_MS);
      if (state.kind !== "profileEdit") return; // Dropout moved on: nothing to say
      if (result === "grey") {
        // Greyed while it sends is not greyed for good: Dropout's toast saying
        // saved ends the wait at once; without one, look again after a moment.
        const word = () => {
          const t = toast();
          return t ? (/saved|updated|success/i.test(t) ? "saved" : "toast") : null;
        };
        result = (await Common.waitFor(word, Number(R.saveSettleMs) || SAVE_SETTLE_MS)) || (grey() ? "grey" : "none");
      }
      if (result === "saved" || result === "grey") {
        state.profileSaved = true;
        P.refreshScreen();
        savedTimer = setTimeout(() => {
          state.profileSaved = false;
          P.refreshScreen();
        }, SAVED_MS);
        // Saved: the screen closes at once, as Cancel does with nothing left
        // to save (Dropout's own Cancel, so it goes where Dropout sends it).
        // Only with Save grey: a Save still lit would ask to leave.
        if (grey()) cancelProfile();
      } else {
        notice(result === "toast" ? toast() : "Dropout did not say whether it saved");
        P.refreshScreen();
      }
    }

    // Cancel on Edit Profile. With changes not saved (Dropout's Save lit),
    // asked first in Leanback's box, Keep Editing selected; Firefox's own
    // "leave this page?" never comes up there (page.js onBeforeUnload).
    function cancelProfile() {
      const R = formRules().edit || {};
      const root = qs(R.root);
      if (!root) return;
      const rule = (k) => (R.buttons || []).find((b) => b.key === k);
      const cancel = findButton(root, rule("cancel") && rule("cancel").text);
      const save = findButton(root, rule("save") && rule("save").text);
      if (!cancel) return;
      if (!save || save.disabled || save.getAttribute("aria-disabled") === "true") {
        cancel.click();
        return;
      }
      askUser({
        title: "Leave without saving?",
        text: "The changes to this profile will not be kept.",
        buttons: [{ id: "stay", label: "Keep Editing" }, { id: "leave", label: "Leave" }],
        start: "stay"
      }).then((answer) => {
        if (answer === "leave" && cancel.isConnected) cancel.click();
      });
    }

    // Delete Profile, on Edit Profile: asked first, Cancel selected; then
    // Dropout's own Delete Profile, and the Delete in the box Dropout opens
    // to ask again (or its window.confirm, answered yes for this one press).
    function deleteProfile() {
      const R = formRules().edit || {};
      const root = qs(R.root);
      const input = root ? qs(R.name, root) : null;
      const name = input ? String(input.value || "").trim() : "";
      askUser({
        title: name ? `Delete ${name}?` : "Delete this profile?",
        text: "The profile goes for good, with its My List and what it has watched.",
        buttons: [{ id: "cancel", label: "Cancel" }, { id: "delete", label: "Delete Profile", danger: true }],
        start: "cancel"
      }).then((answer) => {
        if (answer !== "delete" || !root) return;
        const rule = (R.buttons || []).find((b) => b.key === "delete");
        const button = findButton(root, rule && rule.text);
        if (!button) return;
        const page = window.wrappedJSObject;
        const own = page ? page.confirm : null;
        try {
          if (page) page.confirm = exportFunction(() => true, window);
          button.click();
        } finally {
          if (page) setTimeout(() => { page.confirm = own; }, 0);
        }
        confirmInDialog(R, Date.now() + 3000);
      });
    }

    function findButton(scope, pattern) {
      let re = null;
      try {
        re = new RegExp(pattern || "^$", "i");
      } catch (_err) {
        return null;
      }
      return Array.from(scope.querySelectorAll("button")).find((b) => re.test((b.textContent || "").trim()) && !b.disabled) || null;
    }

    // Dropout's own "Delete profile" box: its Delete, once it is there.
    function confirmInDialog(R, until) {
      const dialog = Array.from(document.querySelectorAll(R.dialog || "[role='dialog']")).find((d) => findButton(d, R.confirm));
      if (dialog) {
        findButton(dialog, R.confirm).click();
        return;
      }
      if (Date.now() < until && !state.leaving) setTimeout(() => confirmInDialog(R, until), 100);
    }

    function syncPicker() {
      const form = pickerForm();
      if (form && state.screen) {
        stopScreen();
        refocusPage();
      } else if (!form && !state.screen) {
        startScreen();
      }
    }

    // Sign Out (the profile picker): asked first, Cancel selected; then
    // Dropout's own sign-out, a form sent with the page's token, as its
    // Log out button does.
    function signOut() {
      const r = state.rules.signout || {};
      askUser({
        title: "Sign out of Dropout?",
        text: "Signing in again needs your email and password.",
        buttons: [{ id: "cancel", label: "Cancel" }, { id: "signout", label: "Sign Out", primary: true }],
        start: "cancel"
      }).then((answer) => {
        if (answer !== "signout" || !r.url) return;
        const meta = qs(r.token);
        const form = document.createElement("form");
        form.method = "post";
        form.action = r.url;
        form.hidden = true;
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "authenticity_token";
        input.value = meta ? meta.getAttribute("content") || "" : "";
        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();
      });
    }

    Object.assign(P, { formRules, pickerForm, editPicture, cancelProfile, deleteProfile, saveProfile, syncPicker, signOut });
  }

  globalThis.TenfootPageProfiles = Object.freeze({ install });
})();
