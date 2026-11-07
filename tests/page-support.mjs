// Shared by the page-*.test.mjs suites: the helpers and test pages they boot with.
import fs from 'node:fs';
import path from 'node:path';
import { T, makeBrowserShim, makeDom } from '../../firefox-tools/harness/lib.mjs';

export const rules = JSON.parse(fs.readFileSync(T.extFile('sites/dropout.json'), 'utf8'));

export const fixture = (n) => fs.readFileSync(path.join(T.testsDir, 'fixtures', n), 'utf8');

export const kbOpen = (p) => { const k = p.doc.querySelector('.tenfoot-kb'); return Boolean(k) && !k.hidden; };

export const kbKey = (p, id) => p.doc.querySelector(`.tenfoot-kb [data-tenfoot-key="${id}"]`).click();

// Exactly the scripts the manifest injects into a Dropout page, in order, so
// this list can never drift from what ships.
export const manifest = JSON.parse(fs.readFileSync(T.extFile('manifest.json'), 'utf8'));

export const FILES = manifest.content_scripts
  .find((cs) => cs.matches.some((m) => m.includes('watch.dropout.tv')))
  .js.map((f) => T.extFile(f));

export const URLS = {
  browse: 'https://watch.dropout.tv/browse',
  series: 'https://watch.dropout.tv/game-changer',
  season1: 'https://watch.dropout.tv/game-changer/season:1',
  season2: 'https://watch.dropout.tv/game-changer/season:2',
  video: 'https://watch.dropout.tv/game-changer/season:1/videos/ep1',
  search: 'https://watch.dropout.tv/search',
};

// Walk the options panel to a named entry. Bounded: when an entry stops being
// reachable the test should fail, not spin for ever — which is exactly what an
// unbounded while-loop did when the options button changed what it opens.
export async function moveTo(p, id, max = 14) {
  for (let i = 0; i < max; i += 1) {
    if ((await p.state()).menuItem === id) return true;
    p.key('ArrowDown');
  }
  throw new Error(`options panel never reached "${id}"`);
}

// Button hints are off on a fresh install; most tests here are about how the
// bar behaves, so they switch it on. `fresh: true` boots with nothing stored.
export async function boot({ html, url, settings = null, playerState = null, fresh = false, before = null, progress = null, store = null } = {}) {
  const stored = fresh ? null : { hintBar: true, ...(settings || {}) };
  const storage = { ...(stored ? { settings: stored } : {}), ...(store || {}) };
  if (progress) storage['progress:0'] = progress;
  const shim = makeBrowserShim({ tabs: [{ id: 1, url, active: true }], storage });
  const bg = [];
  const replies = { exit: { ok: true, action: 'none' } };
  shim.browser.runtime.onMessage.addListener((m, s, send) => {
    bg.push(m);
    if (m.type === 'rules:get') send({ ok: true, rules });
    else if (m.type === 'exit') send(replies.exit);
    else if (m.type === 'player:command' && m.cmd === 'state') send({ ok: true, state: playerState || { title: 'T', currentTime: 5, duration: 100, paused: false } });
    else if (m.type === 'settings:set') {
      // Persist like the real background does, so settings assertions are real.
      const cur = shim.store.settings || {};
      shim.store.settings = { ...cur, ...m.patch };
      send({ ok: true, settings: shim.store.settings });
    } else send({ ok: true });
    return false;
  });
  const dom = makeDom({ clock: true, html, url, browser: shim.browser });
  const win = dom.window;
  // content/show.css's first rule: jsdom does not load the extension's CSS,
  // and what Leanback hides must drop out of navigation here too.
  const omitStyle = win.document.createElement('style');
  omitStyle.textContent = '[data-tenfoot-omit] { display: none !important; }';
  win.document.head.appendChild(omitStyle);
  // …and, as in a browser, what is inside a hidden element has no box.
  const rectOf = win.Element.prototype.getBoundingClientRect;
  win.Element.prototype.getBoundingClientRect = function () {
    if (this.closest && this.closest('[data-tenfoot-omit]')) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
    return rectOf.call(this);
  };
  // jsdom cannot leave the document: record where the page asked to go.
  win.__went = [];
  win.history.go = (d) => win.__went.push(d);
  if (before) before(win);
  dom.runScripts(FILES);
  await T.sleep(40);
  const msg = (m) => new Promise((res) => shim.listeners.message[1].fn(m, { tab: { id: 1 }, frameId: 0 }, res));
  const state = () => msg({ type: 'page:state' });
  const act = (a) => msg({ type: 'page:action', action: a });
  const key = (k, init) => dom.key(k, init);
  const last = (type) => bg.filter((m) => m.type === type).at(-1);
  const $ = (id) => win.document.getElementById(id);
  const ring = () => win.document.querySelector('.tenfoot-ring');
  const hints = () => win.document.querySelector('.tenfoot-hints');
  return { shim, dom, win, doc: win.document, bg, replies, msg, state, act, key, last, $, ring, hints };
}

// A show's page drawn by Leanback (content/screen.js, read by content/show.js).
export const V = (n) => `https://watch.dropout.tv/game-changer/season:1/videos/ep${n}`;

export const hrefNow = (p) => (p.doc.activeElement && p.doc.activeElement.getAttribute('href')) || null;

export const pillNow = (p) => (p.doc.activeElement && p.doc.activeElement.matches('.tenfoot-season') ? p.doc.activeElement.textContent : null);

export const actionNow = (p) => (p.doc.activeElement && p.doc.activeElement.dataset.tenfootAction) || null;

export const cardOf = (p, n) => p.doc.querySelector(`.tenfoot-screen .tenfoot-card[data-tenfoot-card="${V(n)}"]`);

// Dropout's season and sort dropdowns are on screen only when Leanback does
// not recognise the page — Dropout has changed its markup — and then they
// still have to work from a remote.
export const unrecognised = (win) => {
  const sec = win.document.querySelector('section.episode-container');
  const div = win.document.createElement('div');
  div.className = sec.className;
  while (sec.firstChild) div.appendChild(sec.firstChild);
  sec.replaceWith(div);
};

// Back — Firefox acts on BrowserBack itself, whatever the page does (T2).
// Leanback keeps the history in the shape Back should follow instead.
export const SEASON3 = 'https://watch.dropout.tv/game-changer/season:3';

export const EP0 = 'https://watch.dropout.tv/game-changer/season:1/videos/ep0';

export const EP2 = 'https://watch.dropout.tv/game-changer/season:1/videos/ep2';

export const trailOf = (...entries) => (win) => win.sessionStorage.setItem('tenfoot.trail', JSON.stringify(entries));

export const episodeOrder = (win) => win.sessionStorage.setItem('tenfoot.episodes', JSON.stringify({ series: '/game-changer/season:3', href: SEASON3, urls: [URLS.video] }));

export const trailNow = (p) => JSON.parse(p.win.sessionStorage.getItem('tenfoot.trail'));

// Ep 1 left partway: 600 of 1500 seconds.
export const leftAt = (position) => ({ entries: { ep1: { url: URLS.video, duration: 1500, local: { position, at: Date.now() - 1000 } } } });

// OK on Watch (where the details page starts).
export async function watch(p) {
  p.key('Enter');
  await T.sleep(20);
}

// What Firefox does with the remote's Back, which the page can never stop:
// the history goes back a step (jsdom's own traversal, not the recorder).
export async function firefoxBack(p) {
  p.win.history.back();
  await T.sleep(40);
}

// Dropout 24/7's page: Watch plays the stream right there (content/page-live.js).
export const HUB = 'https://watch.dropout.tv/dropout-24-7';

export const EVENT = 'https://watch.dropout.tv/dropout-247/events/dropout-24-7';

export const STREAM = 'https://embed.vhx.tv/videos/612228?api=1&autoplay=0&collection_id=1486854&live=1';

// The page's own fetch, as Firefox exposes it to a content script.
export const servesStream = (html) => (win) => {
  win.__fetched = [];
  win.cloneInto = (o) => o;
  win.wrappedJSObject = { fetch: async (u, o) => { win.__fetched.push([u, o && o.credentials]); return { ok: true, text: async () => html }; } };
};

export const PICK = 'https://watch.dropout.tv/profile/pick';

export const pickCards = (p) => [...p.doc.querySelectorAll('.tenfoot-screen [data-tenfoot-avatars] .tenfoot-card')];

// Manage profiles, in place on the same page: Dropout's title and its button
// change; the profiles are the same buttons.
export const MANAGING = (html) => html.replace('<span>Who is watching?</span>', '<span>Manage profiles</span>').replace('<span>Manage Profiles</span></button>', '<span>Done</span></button>');

export const editOf = (c) => c.querySelector('.tenfoot-card-action');

// Add Profile, the picker's own form (#/add), in the shape read 2026-10-31.
export const ADD = '<div id="addform"><h1><span>Add Profile</span></h1><p><span>Add a profile for another person watching Dropout</span></p><hr>' +
  '<div><button id="pic"><img src="https://fixture.test/art-3.svg"><div></div></button><div><input id="pname" aria-label="Profile name" placeholder="Profile Name"></div></div><hr>' +
  '<div><button id="cont"><span>Continue</span></button><button id="cancel"><span>Cancel</span></button></div></div>';

// In the shape of Dropout's Edit Profile (/settings/manage/profile, its new
// settings app, read 2026-10-31): the picture, the name, Save, Cancel, and
// Delete Profile, which opens Dropout's own box to ask again.
export const EDIT = '<!doctype html><html><body><div id="app"><header data-testid="page-header-bar"><a href="/" aria-label="Back">←</a></header><main>' +
  '<nav aria-label="settings"><a href="/settings/manage/profile">Profile</a></nav>' +
  '<div data-testid="settings-content-column"><h2>Edit Profile</h2><p>Update this profile\'s name, picture, and Kid profile setting.</p>' +
  '<form><button id="pic" type="button" aria-label="Change profile picture"><div><span>S</span><img src="https://fixture.test/art-2.svg"></div></button>' +
  '<label>Profile name</label><input id="profile-name" name="name" value="Sam">' +
  '<button id="save" type="submit">Save</button><button id="cancel" type="button">Cancel</button></form>' +
  '<button id="delete" type="button">Delete Profile</button></div></main></div></body></html>';

// Edit Profile's Save as Dropout draws it: grey (disabled) until the name changes, grey
// again once it has saved, a toast for what it says.
export function wireEdit(p, o = {}) {
  const save = p.$('save');
  save.disabled = true;
  const sent = [];
  sent.cancelled = 0;
  p.$('cancel').addEventListener('click', () => { sent.cancelled += 1; });
  p.$('profile-name').addEventListener('input', () => { save.disabled = false; });
  save.addEventListener('click', (e) => {
    e.preventDefault();
    sent.push(p.$('profile-name').value);
    if (o.silent) return;
    if (o.error) {
      const t = p.doc.createElement('div'); t.setAttribute('data-sonner-toast', ''); t.textContent = o.error; p.doc.body.appendChild(t);
      return;
    }
    save.disabled = true;
    if (o.toast) { const t = p.doc.createElement('div'); t.setAttribute('data-sonner-toast', ''); t.textContent = o.toast; p.doc.body.appendChild(t); }
  });
  return sent;
}

export const saveBtn = (p) => [...p.doc.querySelectorAll('.tenfoot-hero-action')].find((b) => /Save/.test(b.textContent));

// Dropout's profile API, as the picker page has it: what Leanback asks for.
export function profileApi(win, { fail = false, pictures = true } = {}) {
  const calls = [];
  win.VHX = { config: { api_v2_url: 'https://api.test' } };
  win.TOKEN = 'fixture-token';
  win._current_site = { id: 7 };
  win._current_user = { id: 9 };
  win.fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', auth: init.headers && init.headers.Authorization, body: init.body ? JSON.parse(init.body) : null });
    const reply = (data, ok = true) => ({ ok, status: ok ? 200 : 500, text: async () => JSON.stringify(data) });
    if (url.endsWith('/v2/sites/7/users/9/profiles')) return reply({ profiles: [{ index: 1, name: 'Sam', profile_image_url: 'https://fixture.test/p2.svg' }, { index: 0, name: 'Alex', profile_image_url: 'https://fixture.test/p1.svg' }, { index: 2, name: 'robin', profile_image_url: null }] });
    if (url.endsWith('/v2/sites/7/profile_pictures')) return pictures ? reply({ profile_pictures: [{ id: 11, image_url: 'https://fixture.test/p1.svg', site_id: null, position: 0 }, { id: 12, image_url: 'https://fixture.test/p2.svg', site_id: null, position: 1 }, { id: 21, image_url: 'https://fixture.test/d1.svg', site_id: 7, position: 2 }, { id: 22, image_url: 'https://fixture.test/d2.svg', site_id: 7, position: 3 }] }) : reply({}, false);
    return reply({}, !fail);
  };
  return calls;
}

// In the shape of Dropout's /login (read 2026-10-29, signed out): the email
// step, and the password step hidden until Next.
export const SIGNIN = '<!doctype html><html><body class="logged-out">' +
  '<header class="site-header" data-rect="0,0,1280,60"><a href="/browse" data-rect="20,15,80,30">Browse</a></header>' +
  '<div id="login--box-container" data-rect="390,200,500,344">' +
  '<form id="login-form-email"><label>Email address</label><input id="signin-email-input" type="email" data-rect="425,300,430,40"><button id="signin-email-submit" type="submit" data-rect="425,350,430,45">Next</button></form>' +
  '<div class="flash-error-container"><div class="flash-msg-container is-hidden"><div class="flash-msg"></div></div></div>' +
  '<a id="help" href="/help/articles/trouble-logging-in-computer" data-rect="600,410,67,18">Need help?</a>' +
  '<div class="signin-flow__password-form-container signin-flow--hidden"><form id="login-form-password" action="/login" method="post"><input type="hidden" name="authenticity_token" value="x"><input id="signin-password-input" type="password"><button id="signin-password-submit" type="submit">Sign in</button></form>' +
  '<div class="signin-flow__divider-container">or</div><form id="login-form-magic"><a id="signin-magic-submit">Email me a sign in link</a></form></div>' +
  '</div></body></html>';

// Dropout's two steps, as its page does them: Next shows the password step (or
// an error), Sign in posts (or shows an error). What was posted is recorded.
export function wireDropout(p, o = {}) {
  const posted = [];
  const flash = (t) => { const c = p.doc.querySelector('.flash-msg-container'); c.classList.remove('is-hidden'); c.querySelector('.flash-msg').textContent = t; };
  p.$('login-form-email').addEventListener('submit', (e) => {
    e.preventDefault();
    posted.push({ step: 'next', email: p.$('signin-email-input').value });
    if (o.silent) return;
    if (o.badEmail) { flash('Please enter a valid email.'); return; }
    p.doc.querySelector('.signin-flow__password-form-container').classList.remove('signin-flow--hidden');
  });
  p.$('login-form-password').addEventListener('submit', (e) => {
    e.preventDefault();
    posted.push({ step: 'password', password: p.$('signin-password-input').value });
    if (o.hang) return;
    if (o.wrong) flash('Invalid email or password.');
  });
  return posted;
}

export const box = (p, id) => p.doc.querySelector('.tenfoot-signin #' + id);

export const HOME_KEY = 'tenfoot.signin-home';

export const note = (stage, ageMs = 0) => (win) => win.sessionStorage.setItem(HOME_KEY, `${stage}:${Date.now() - ageMs}`);

export const signedOutVideo = () => fixture('video.html').replace('<body>', '<body class="logged-out">');

export const askOpen = (p) => { const a = p.doc.querySelector('.tenfoot-ask'); return Boolean(a) && !a.hidden; };

// The password reset (/forgot_password), in the shape of Dropout's page: its
// error box, then the form.
export const RESET = '<!doctype html><html><body class="logged-out"><div id="login--box-container" data-rect="390,200,500,300">' +
  '<div class="flash-error-container"><div class="flash-msg-container is-hidden"><div class="flash-msg"></div></div></div>' +
  '<form id="forgot-password-form"><input id="email" type="email" data-rect="425,300,430,40"><input type="submit" id="reset-submit" value="Reset Password" data-rect="425,350,430,45"></form></div></body></html>';

// Dropout's reset form: what was posted is recorded; Dropout answers with a
// page of its own (not here), or with an error on this one.
export function wireReset(p, o = {}) {
  const posted = [];
  p.$('forgot-password-form').addEventListener('submit', (e) => {
    e.preventDefault();
    posted.push({ email: p.$('email').value, asked: p.win.sessionStorage.getItem('tenfoot.reset-asked') });
    if (o.error) {
      const c = p.doc.querySelector('.flash-msg-container');
      c.classList.remove('is-hidden');
      c.querySelector('.flash-msg').textContent = o.error;
    }
  });
  return posted;
}

// In the shape of Dropout's front page signed out (read 2026-10-30): a
// promo banner, the top bar, the banner with the logo, its line and words.
export const FRONT = '<!doctype html><html><body class="logged-out sites sites-show">' +
  '<main class="main-container"><div class="promo-banner"><a href="/checkout/x" data-rect="0,0,1280,40">20% OFF</a></div>' +
  '<header class="site-header" data-rect="0,40,1280,60"><a href="/login" data-rect="1180,55,60,30">Sign In</a></header>' +
  '<div class="hero--container"><h1 class="head-image"><img src="https://fixture.test/poster.svg"></h1>' +
  '<h2 class="head-2">Independent. Funny. Ad Free.</h2><p class="head-3">Watch new episodes every week.</p>' +
  '<a href="/plans" class="button" data-rect="540,500,200,50">Start Your Free Trial</a></div></main></body></html>';

// In the shape of Dropout's /privacy (read 2026-10-30): the policy drawn
// by Dropout's script into #customer-agreements.
export const POLICY = '<!doctype html><html><body class="logged-out sites-privacy-policy">' +
  '<main class="main-container"><div class="promo-banner"><a href="/checkout/x" data-rect="0,0,1280,40">20% OFF</a></div>' +
  '<header class="site-header" data-rect="0,40,1280,60"><a href="/browse" data-rect="20,55,80,30">Browse</a></header>' +
  '<div class="content-container"><section><div id="customer-agreements"><h1>Privacy Policy</h1><p>Words. <a href="https://example.test/" data-rect="100,300,80,20">a link</a></p></div></section></div></main>' +
  '<footer class="footer--site"><a href="/tos" data-rect="20,700,60,20">Terms</a></footer></body></html>';
