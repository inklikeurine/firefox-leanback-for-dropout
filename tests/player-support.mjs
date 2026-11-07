// Shared by the player-*.test.mjs suites: the helpers and test pages they boot with.
import fs from 'node:fs';
import path from 'node:path';
import { T, makeBrowserShim, makeDom } from '../../firefox-tools/harness/lib.mjs';

export const baseRules = JSON.parse(fs.readFileSync(T.extFile('sites/dropout.json'), 'utf8'));

export const html = fs.readFileSync(path.join(T.testsDir, 'fixtures', 'embed.html'), 'utf8');

export const manifest = JSON.parse(fs.readFileSync(T.extFile('manifest.json'), 'utf8'));

export const FILES = manifest.content_scripts
  .find((cs) => cs.matches.some((m) => m.includes('embed.vhx.tv')))
  .js.map((f) => T.extFile(f));

export async function boot(opts = {}) {
  const { settings = null, ottData = true, rulesPatch = null, autoplayBlocked = false, progress = null, trailer = false, pageInfo = null, upNext = null } = opts;
  const rules = JSON.parse(JSON.stringify(baseRules));
  if (rulesPatch) rulesPatch(rules);
  const storage = settings ? { settings } : {};
  if (progress) storage['progress:0'] = progress;
  const shim = makeBrowserShim({ tabs: [{ id: 1, url: 'https://watch.dropout.tv/v' }], storage });
  const bg = [];
  shim.browser.runtime.onMessage.addListener((m, s, send) => {
    bg.push(m);
    if (m.type === 'rules:get') send({ ok: true, rules });
    else if (m.type === 'page:info') send(pageInfo || { ok: false, error: 'Not an episode page' });
    else send({ ok: true });
    return false;
  });
  const dom = makeDom({ clock: true, html, url: 'https://embed.vhx.tv/videos/612228?api=1&autoplay=0', browser: shim.browser });
  const win = dom.window;
  if (ottData) {
    win.OTTData = { video: { id: 612228, title: 'Fixture episode', duration: 0.5, url: 'https://watch.dropout.tv/game-changer/season:1/videos/ep1', is_trailer: trailer ? 'true' : 'false' }, up_next: upNext || { url: 'https://watch.dropout.tv/game-changer/season:1/videos/ep2', title: 'Ep 2' } };
  }
  // jsdom has no media playback: give the <video> a tiny fake engine.
  const video = win.document.getElementById('video');
  const st = { paused: true, ended: false, duration: opts.duration || 60, muted: Boolean(opts.muted), currentTime: 0, plays: 0, pauses: 0 };
  for (const k of ['paused', 'ended', 'duration']) Object.defineProperty(video, k, { get: () => st[k], set: (v) => { st[k] = v; }, configurable: true });
  Object.defineProperty(video, 'muted', {
    get: () => st.muted,
    set: (v) => {
      st.muted = v;
      video.dispatchEvent(new win.Event('volumechange'));
      // What Firefox actually does: turning the sound on without user
      // activation stops the video.
      if (autoplayBlocked && !v && !win.__allowUnmute && !st.paused) {
        st.paused = true;
        video.dispatchEvent(new win.Event('pause'));
      }
    },
    configurable: true,
  });
  Object.defineProperty(video, 'currentTime', { get: () => st.currentTime, set: (v) => { st.currentTime = v; }, configurable: true });
  video.play = () => {
    // Firefox refuses play() on an unmuted video with no user activation.
    if (autoplayBlocked && !st.muted && !win.__allowUnmute) return Promise.reject(Object.assign(new Error('play() refused'), { name: 'NotAllowedError' }));
    st.plays += 1;
    st.paused = false;
    video.dispatchEvent(new win.Event('play'));
    return Promise.resolve();
  };
  video.pause = () => { st.pauses += 1; st.paused = true; video.dispatchEvent(new win.Event('pause')); };
  // jsdom exposes textTracks but never fills it from <track>, so the caption
  // rows need a stand-in list with the one thing the code uses: mode.
  const tracks = [{ kind: 'captions', label: 'English', language: 'en', mode: 'disabled' }];
  tracks.length = 1;
  Object.defineProperty(video, 'textTracks', { get: () => tracks, configurable: true });
  const clicks = [];
  win.document.getElementById('cc-control-bar-button').addEventListener('click', () => clicks.push('cc'));
  const shown = () => [{ width: 60, height: 40 }];
  let x = 0;
  for (const el of win.document.querySelectorAll('.vp-controls button, .vp-controls [role="slider"]')) {
    el.getClientRects = shown;
    const left = (x += 70);
    el.getBoundingClientRect = () => ({ left, top: 600, width: 60, height: 40, right: left + 60, bottom: 640, x: left, y: 600 });
  }
  dom.runScripts(FILES);
  await T.sleep(30);
  const listener = shim.listeners.message[1].fn;
  const cmd = (m) => new Promise((res) => listener(m, { tab: { id: 1 }, frameId: 7 }, res));
  const key = (k, init) => dom.key(k, init);
  const last = (type) => bg.filter((m) => m.type === type).at(-1);
  const gesture = () => win.dispatchEvent(new win.Event('pointerdown'));
  return { shim, dom, win, video, st, bg, cmd, key, last, clicks, gesture, tracks };
}

// A stand-in for the player's settings popover, shaped like the real one
// (leanback-for-dropout docs/site-notes.md): one panel at a time, a header with
// a Back button and a title below the root, options that tick in place, a
// collapsed accordion whose options are `hidden`, and radio groups named by
// aria-labelledby. Picking a caption track returns to the root, as the player
// does; picking a colour or size stays on the panel.
export function realMenu(win) {
  const doc = win.document;
  const menu = doc.querySelector('.vp-menu');
  const headerSlot = menu.firstElementChild;
  const body = menu.querySelector('[role="menu"]');
  const rootItems = [...body.children];
  const state = { path: [], track: 'Off', color: 'White', size: '100%', familyOpen: false, backs: 0 };
  const el = (tag, attrs = {}, text = '') => {
    const e = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text) e.textContent = text;
    return e;
  };
  const drill = (label, to) => {
    const row = el('div', { role: 'menuitem', 'data-menu-option': 'true', 'data-menu-item': 'true', 'aria-haspopup': 'true' });
    row.append(el('span', { class: 'MenuItem_module_label__2ed021e3' }, label));
    row.addEventListener('click', () => { state.path.push(to); draw(); });
    return row;
  };
  const radio = (label, checked, pick) => {
    const row = el('div', { role: 'menuitemradio', 'data-menu-option': 'true', 'aria-checked': String(checked) });
    row.append(el('span', { class: 'MenuOptionListItem_module_text__1' }, label));
    row.addEventListener('click', pick);
    return row;
  };
  const group = (id, name, options, current, set, swatch) => {
    const wrap = el('div');
    wrap.append(el('div', { class: 'MenuFieldLabel_module_menuField__1' }));
    wrap.firstChild.append(el('span', { id }, name));
    const ul = el('ul', { role: 'radiogroup', 'aria-labelledby': id, class: swatch ? 'ColorSwabs_module_swabs__1' : 'ButtonRow_module_row__1' });
    for (const o of options) {
      const li = el('li', { role: 'radio', 'data-menu-option': 'true', 'aria-checked': String(o === current) });
      if (swatch) li.setAttribute('aria-label', o);
      else li.append(el('span', { class: 'ButtonRow_module_label__1' }, o));
      li.addEventListener('click', () => { set(o); draw(); });
      ul.append(li);
    }
    wrap.append(ul);
    return wrap;
  };
  function header(title) {
    headerSlot.replaceChildren();
    if (!title) return;
    const h = el('div', { class: 'MenuHeader_module_menuHeader__1 MenuHeader_module_hasBack__1' });
    const back = el('button', { 'aria-label': 'Back', class: 'MenuHeader_module_backButton__1' });
    back.addEventListener('click', () => { state.backs += 1; state.path.pop(); draw(); });
    h.append(back, el('h2', { class: 'MenuHeader_module_title__1' }, title), el('button', { 'aria-label': 'Close menu' }));
    headerSlot.append(h);
  }
  function draw() {
    const at = state.path.at(-1) || 'root';
    if (at === 'root') {
      header(null);
      rootItems[2].querySelector("[class*='MenuItem_module_value']").textContent = state.track;
      body.replaceChildren(...rootItems);
      return;
    }
    header({ cc: 'CC/subtitles', customize: 'Customize', font: 'Font' }[at]);
    if (at === 'cc') {
      const pickTrack = (t) => () => { state.track = t; state.path = []; draw(); };
      body.replaceChildren(radio('Off', state.track === 'Off', pickTrack('Off')), radio('English CC', state.track === 'English CC', pickTrack('English CC')), drill('Customize', 'customize'));
    } else if (at === 'customize') {
      const reset = el('button', { role: 'menuitem', 'data-menu-option': 'true', class: 'ResetButton_module_reset__1' });
      reset.append(el('span', { class: 'Text_module_text__73112353' }, 'Reset all'));
      body.replaceChildren(drill('Font', 'font'), drill('Background', 'background'), drill('Window', 'window'), reset);
    } else if (at === 'font') {
      const acc = el('div', { class: 'Accordion_module_accordion__1', role: 'group' });
      const head = el('div', { role: 'button', 'aria-expanded': String(state.familyOpen) });
      head.append(el('span', { class: 'Text_module_text__73112353' }, 'Family'), el('span', { class: 'Text_module_text__73112353' }, 'Proportional Sans-Serif'));
      head.addEventListener('click', () => { state.familyOpen = !state.familyOpen; draw(); });
      const content = el('div', { class: 'Accordion_module_content__1', role: 'menu' });
      for (const f of ['Monospace Serif', 'Proportional Sans-Serif']) {
        const o = radio(f, f === 'Proportional Sans-Serif', () => draw());
        if (!state.familyOpen) { o.hidden = true; o.setAttribute('tabindex', '-1'); }
        content.append(o);
      }
      acc.append(head, content);
      body.replaceChildren(acc,
        group('vp-cc-font-color-label', 'Color', ['White', 'Yellow'], state.color, (v) => { state.color = v; }, true),
        group('vp-cc-font-size-label', 'Size', ['50%', '100%', '150%'], state.size, (v) => { state.size = v; }, false));
    }
  }
  for (const [i, to] of [[2, 'cc']]) rootItems[i].addEventListener('click', () => { state.path = [to]; draw(); });
  return state;
}

export async function openCaptions(t) {
  const menu = realMenu(t.win);
  t.key('ArrowDown');
  t.key('ArrowRight');
  t.key('Enter');
  await T.sleep(150);
  const panel = t.win.document.querySelector('.tenfoot-settings');
  for (let i = 0; i < 2; i += 1) t.key('ArrowDown');
  t.key('ArrowRight');
  await T.sleep(300);
  const title = () => panel.querySelector('.tenfoot-settings-title').textContent;
  const labels = () => [...panel.querySelectorAll('.tenfoot-settings-label')].map((r) => r.textContent);
  const current = () => panel.querySelector('[data-tenfoot-current="true"] .tenfoot-settings-label').textContent;
  const walkTo = (label) => {
    for (let i = 0; i < 12; i += 1) t.key('ArrowUp');
    for (let i = 0; i < 12 && current() !== label; i += 1) t.key('ArrowDown');
    T.eq(current(), label);
  };
  return { menu, panel, title, labels, current, walkTo };
}

export const GC = { ok: true, series: 'Game Changer', season: 9, episode: 3, title: 'Whodunnit' };

export const titleOf = (win) => {
  const osd = win.document.querySelector('.tenfoot-osd');
  return osd && !osd.hidden ? [...osd.children].filter((c) => !c.hidden).map((c) => c.textContent) : null;
};

export const EP2 = 'https://watch.dropout.tv/game-changer/season:1/videos/ep2';

export const UP = { url: EP2, title: 'E2, S1 - Game Changer', thumbnail_url: 'https://vhx.imgix.net/next.jpg', offset_seconds: 8 };

// Dropout's own card, as captured (2026-09-26): Hide comes first, then the
// link that plays the next episode.
export function dropoutCard(win) {
  const app = win.document.getElementById('app');
  app.insertAdjacentHTML('beforeend', '<div class="ott-up-next"><div class="ott-up-next-container"><div class="ott-up-next-header"><span class="ott-up-next-label">Next Up</span><button class="ott-up-next-hide">Hide</button></div><div class="ott-up-next-content"><a class="ott-up-next-thumb-link" href="#next"><div class="ott-up-next-thumb"></div><h3 class="ott-up-next-title">E2, S1 - Game Changer</h3></a></div></div></div>');
  const card = app.querySelector('.ott-up-next');
  const clicks = [];
  for (const el of [card, card.querySelector('button'), card.querySelector('a')]) el.getClientRects = () => [{ width: 300, height: 100 }];
  card.querySelector('button').addEventListener('click', () => clicks.push('hide'));
  card.querySelector('a').addEventListener('click', (e) => { e.preventDefault(); clicks.push('play'); });
  return { card, clicks };
}

export const cardOf = (win) => win.document.querySelector('.tenfoot-upnext');

export const at = async (p, t) => { p.st.currentTime = t; p.video.dispatchEvent(new p.win.Event('timeupdate')); await T.sleep(10); };

// The details page (D1): the page draws an episode's details over Dropout's
// page, and the player underneath is held until Watch.
export const HOLDING = { ok: true, hold: true, title: 'Episode', series: 'Game Changer', season: 9, episode: 3 };
