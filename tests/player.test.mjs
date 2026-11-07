// content/player.js under jsdom with the embed fixture: registration, direct
// <video> control from commands and keys, state reports, ended → up-next.
import fs from 'node:fs';
import path from 'node:path';
import { T, makeBrowserShim, makeDom } from '../../firefox-tools/harness/lib.mjs';

const baseRules = JSON.parse(fs.readFileSync(T.extFile('sites/dropout.json'), 'utf8'));
const html = fs.readFileSync(path.join(T.testsDir, 'fixtures', 'embed.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(T.extFile('manifest.json'), 'utf8'));
const FILES = manifest.content_scripts
  .find((cs) => cs.matches.some((m) => m.includes('embed.vhx.tv')))
  .js.map((f) => T.extFile(f));

async function boot(opts = {}) {
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
  const dom = makeDom({ html, url: 'https://embed.vhx.tv/videos/612228?api=1&autoplay=0', browser: shim.browser });
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

T.runAsync('registers with player:hello carrying OTTData facts, marks the document', async () => {
  const { last, win } = await boot();
  const h = last('player:hello');
  T.eq([h.videoId, h.title, h.duration, h.hasVideo], ['612228', 'Fixture episode', 0.5, true]);
  T.eq(win.document.documentElement.dataset.tenfootPlayer, 'on');
  T.ok(last('player:state'), 'initial state reported once the <video> is found');
});

T.runAsync('Accessibility in the player: the caption style and the colour filter from the settings, and again when they change', async () => {
  const { win, shim } = await boot({ settings: { captionSize: 'large', captionBackground: 'none', videoFilter: 'protanopia' } });
  const root = win.document.documentElement;
  T.eq([root.dataset.tenfootCaptionSize, root.dataset.tenfootCaptionBg, root.dataset.tenfootFilter], ['large', 'none', 'protanopia']);
  T.ok(win.document.getElementById('tenfoot-filter-protanopia'), 'the filter the video\'s CSS names');
  await shim.changeStorage({ settings: { newValue: { captionSize: 'default', videoFilter: 'off' } } });
  await T.sleep(20);
  T.eq([root.dataset.tenfootCaptionSize, root.dataset.tenfootFilter], [undefined, undefined]);
});

T.runAsync('player:command state / toggle / seek', async () => {
  const { cmd, st } = await boot();
  const s = await cmd({ type: 'player:command', cmd: 'state' });
  T.eq([s.ok, s.state.present, s.state.paused, s.state.title, s.state.duration, s.state.upNext.url], [true, true, true, 'Fixture episode', 60, 'https://watch.dropout.tv/game-changer/season:1/videos/ep2']);
  T.eq((await cmd({ type: 'player:command', cmd: 'toggle' })).state.paused, false);
  T.eq(st.plays, 1);
  T.eq((await cmd({ type: 'player:command', cmd: 'toggle' })).state.paused, true);
  T.eq((await cmd({ type: 'player:command', cmd: 'seek', by: 25 })).state.currentTime, 25);
  T.eq((await cmd({ type: 'player:command', cmd: 'seek', by: 100 })).state.currentTime, 60, 'clamped to duration');
  T.eq((await cmd({ type: 'player:command', cmd: 'seek', by: -200 })).state.currentTime, 0, 'clamped to 0');
  T.eq((await cmd({ type: 'player:command', cmd: 'seek', by: 'x' })).ok, false);
  T.eq((await cmd({ type: 'player:command', cmd: 'nope' })).ok, false);
  T.eq((await cmd({ type: 'bogus' })).ok, false);
  T.eq((await cmd(null)).ok, false);
});

T.runAsync('stop pauses, rewinds and hands focus back to the page', async () => {
  const { cmd, st, last } = await boot();
  await cmd({ type: 'player:command', cmd: 'toggle' });
  await cmd({ type: 'player:command', cmd: 'seek', by: 30 });
  const r = await cmd({ type: 'player:command', cmd: 'stop' });
  T.eq([r.state.paused, r.state.currentTime, st.pauses], [true, 0, 1]);
  await T.sleep(5);
  T.eq(last('page:focus').hint, 'back');
});

T.runAsync('an over-broad hide selector can never empty the transport row (regression)', async () => {
  // The hide list is substring matching, so a selector can match an ancestor
  // of the whole bar. Hiding that took every control with it and ▼ fell
  // through to the page, which is what the owner saw.
  const { key, win, cmd, last } = await boot({ rulesPatch: (r) => { r.player.transportHide = ["[class*='vp']"]; } });
  key('ArrowDown');
  T.eq((await cmd({ type: 'player:command', cmd: 'state' })).state.transport, true, 'the row still opened');
  T.notOk(win.document.querySelector('.vp-controls').hasAttribute('data-tenfoot-hide'), 'the bar itself is never stamped');
  T.eq(last('page:focus'), undefined, 'and ▼ did not fall through to the page');
});

T.runAsync('the row is ours, so no vendor selector can empty it (regression)', async () => {
  // Both of these used to decide what the row held. The row is drawn by the
  // extension now, so a rule that matches everything — or nothing — changes
  // what the panels can read and nothing else.
  const { key, win, cmd } = await boot({ rulesPatch: (r) => {
    r.player.transportSkip = ["[class*='controls']"];
    r.player.transportHide = ["[class*='vp']"];
  } });
  key('ArrowDown');
  T.eq((await cmd({ type: 'player:command', cmd: 'state' })).state.transport, true);
  const bar = win.document.querySelector('.tenfoot-transport');
  T.notOk(bar.hidden, 'the row opened anyway');
  T.eq([...bar.querySelectorAll('.tenfoot-tc')].map((b) => b.dataset.tenfootTc),
    ['playpause', 'settings', 'fullscreen'], 'with all three of its own controls');
});

T.runAsync('the row stays up while it is in use and takes nothing from the player (items 1 + 8)', async () => {
  const { key, win, cmd } = await boot();
  const html = win.document.documentElement;
  const bar = () => win.document.querySelector('.tenfoot-transport');
  T.notOk(bar(), 'nothing over the picture to start with — the row is built on first use');
  key('ArrowDown');
  T.ok(html.classList.contains('tenfoot-transport'));
  T.notOk(bar().hidden, 'the row is up');
  // The player used to hide its own bar under us and take the focus with it.
  // Ours cannot be taken away, and the selection is stamped rather than read
  // from :focus, so losing the focus does not lose the highlight either.
  win.document.activeElement.blur();
  await T.sleep(120);
  T.notOk(bar().hidden, 'still up');
  T.eq(bar().querySelector('[data-tenfoot-current="true"]').dataset.tenfootTc, 'playpause',
    'and still showing which control is selected');
  T.eq((await cmd({ type: 'player:command', cmd: 'state' })).state.transport, true);
  key('Escape');
  T.notOk(html.classList.contains('tenfoot-transport'));
  T.ok(bar().hidden, 'and gone again on the way out');
});

T.runAsync('back closes the row and nothing else — it must not leave the video (item 5)', async () => {
  const { key, cmd, bg } = await boot();
  key('ArrowDown');
  const before = bg.filter((m) => m.type === 'page:focus').length;
  T.ok(key('Escape').defaultPrevented, 'the key is consumed inside the frame');
  T.eq((await cmd({ type: 'player:command', cmd: 'state' })).state.transport, false);
  T.eq(bg.filter((m) => m.type === 'page:focus').length, before, 'the page was never asked to take over');
});

T.runAsync('the row is play, position, settings, fullscreen — and position is not a stop (items 3 + 4)', async () => {
  const { key, win } = await boot();
  key('ArrowDown');
  const bar = win.document.querySelector('.tenfoot-transport');
  // Laid out left to right exactly as asked for.
  const laid = [...bar.querySelector('.tenfoot-transport-row').children]
    .map((el) => el.dataset.tenfootTc || el.className);
  T.eq(laid, ['playpause', 'tenfoot-scrub', 'settings', 'fullscreen'], laid.join(' | '));
  // Walking the row skips the position: it is shown, never selected.
  const stops = [];
  for (let i = 0; i < 8; i++) {
    stops.push(bar.querySelector('[data-tenfoot-current="true"]').dataset.tenfootTc);
    key('ArrowRight');
  }
  T.eq([...new Set(stops)], ['playpause', 'settings', 'fullscreen'], 'no wrap, and no stop on the position');
  T.ok(win.document.querySelector('.tenfoot-scrub-track'), 'the position is drawn');
  T.notOk(win.document.querySelector('.tenfoot-scrub').hasAttribute('data-tenfoot-tc'), 'and is not a control');
  // Volume, PiP and the transcript are the player's, and stay gone.
  for (const id of ['pip-control-bar-button', 'transcript-control-bar-button']) {
    T.ok(win.document.getElementById(id).hasAttribute('data-tenfoot-hide'), id + ' is hidden outright');
  }
  T.ok(win.document.querySelector("[class*='VolumeControl_module_volumeControl__']").hasAttribute('data-tenfoot-hide'), 'the volume slider too');
});

T.runAsync('all player chrome is kept off screen until the row is used, not just the bar', async () => {
  const { win, key } = await boot();
  await T.sleep(150);
  T.ok(win.document.querySelector('.vp-controls').hasAttribute('data-tenfoot-bar'), 'the bar is marked without waiting for ▼');
  // The overlay play button is NOT inside .vp-controls, which is why hiding
  // only the bar left it sitting over the picture.
  T.ok(win.document.querySelector("[class*='PlayButton_module_playButtonWrapper__']").hasAttribute('data-tenfoot-bar'), 'and so is the play button, which sits outside the bar');
  T.notOk(win.document.documentElement.classList.contains('tenfoot-transport'), 'the class that reveals them is off');
  key('ArrowDown');
  T.ok(win.document.documentElement.classList.contains('tenfoot-transport'));
});

T.runAsync('settings opens a full-height panel with the player\'s settings and Leanback\'s together', async () => {
  const { key, win, st, video } = await boot();
  st.paused = false;
  video.dispatchEvent(new win.Event('play'));
  key('ArrowDown');
  key('ArrowRight');
  T.eq(win.document.querySelector('.tenfoot-transport [data-tenfoot-current="true"]').dataset.tenfootTc, 'settings');
  key('Enter');
  await T.sleep(120);
  const panel = win.document.querySelector('.tenfoot-settings');
  T.notOk(panel.hidden, 'the panel is open');
  T.eq(panel.tagName, 'ASIDE');
  T.ok(win.document.documentElement.classList.contains('tenfoot-settings-open'), 'and flown in');
  T.eq(st.paused, true, 'opening settings pauses the picture');
  const rows = () => [...panel.querySelectorAll('.tenfoot-settings-label')].map((r) => r.textContent);
  // Quality and Speed come from the player; the rest are Leanback's, in the
  // order asked for, under their headings.
  T.eq(rows(), ['Play Next Episode', 'Quality', 'Speed', 'Closed Captions', 'Caption Style', 'Leanback Settings'], rows().join(' | '));
  T.eq([...panel.querySelectorAll('.tenfoot-settings-group')].map((g) => g.textContent), ['This episode', 'Picture', 'Captions']);
  T.eq(panel.querySelector('.tenfoot-settings-title').textContent, 'Playback Settings');
  T.ok(!panel.querySelector('.tenfoot-settings-close') && panel.querySelector('.tenfoot-settings-keys'), 'no ✕, the keys along the foot, as on a page (UI1)');
  T.eq(panel.querySelector('[data-tenfoot-current="true"]').querySelector('.tenfoot-settings-label').textContent,
    'Quality', 'the first setting starts highlighted, not Play Next Episode');
  // None of the player's own menu markup is what is on screen.
  T.notOk(panel.querySelector('.vp-menu'), 'the player\'s popover is not reused');
  key('Escape');
  await T.sleep(320);
  T.ok(panel.hidden, 'back closes the panel');
  T.eq(win.document.querySelector('.tenfoot-transport').hidden, false, 'and leaves the row up');
  await T.sleep(40);
  T.eq(st.paused, false, 'and the picture starts again, because we were the ones who stopped it');
});

T.runAsync('◀ at the top of the settings panel closes it, as Back does (N2)', async () => {
  const { key, win } = await boot();
  key('ArrowDown');
  key('ArrowRight');
  key('Enter');
  await T.sleep(120);
  const panel = win.document.querySelector('.tenfoot-settings');
  T.notOk(panel.hidden, 'the panel is open');
  T.ok(key('ArrowLeft').defaultPrevented, '◀ is taken');
  await T.sleep(320);
  T.ok(panel.hidden, '◀ closed the panel');
  T.eq(win.document.querySelector('.tenfoot-transport').hidden, false, 'and left the row up');
});

T.runAsync('a video already paused is left paused when the panel closes', async () => {
  const { key, win, st } = await boot();
  T.eq(st.paused, true, 'paused to start with');
  key('ArrowDown');
  key('ArrowRight');
  key('Enter');
  await T.sleep(120);
  key('Escape');
  await T.sleep(80);
  T.eq(st.paused, true, 'still paused — settings did not start it');
});

T.runAsync('Leanback\'s own rows: the same list as on a page; a choice opens its values, OK picks one; an on/off flips (C1, C2)', async () => {
  const { key, win, bg } = await boot({ settings: { seekStep: 15, autoplayNext: true, hintBar: true } });
  key('ArrowDown');
  key('ArrowRight');
  key('Enter');
  await T.sleep(120);
  const panel = win.document.querySelector('.tenfoot-settings');
  const labels = () => [...panel.querySelectorAll('.tenfoot-settings-label')].map((r) => r.textContent);
  const item = (label) => [...panel.querySelectorAll('.tenfoot-settings-item')].find((r) => r.querySelector('.tenfoot-settings-label').textContent === label);
  const valueOf = (label) => item(label).querySelector('.tenfoot-settings-value').textContent;
  const current = () => panel.querySelector('[data-tenfoot-current="true"] .tenfoot-settings-label').textContent;
  T.eq(valueOf('Play Next Episode'), 'Ep 2', 'the next episode is named, not toggled');
  for (let i = 0; i < 4; i += 1) key('ArrowDown'); // Leanback Settings, from Quality
  key('ArrowRight');
  await T.sleep(20);
  T.eq(panel.querySelector('.tenfoot-settings-title').textContent, 'Leanback Settings');
  T.eq(labels(), ['Autoplay Next Episode', 'Seek Step', 'Shows Open On', 'Skip dropout.tv Home', 'Back On Home', 'Theme', 'Theme Color', 'Holidays', 'Enlarge Selection', 'Ring Width', 'Button Hints', 'Accessibility', 'Clear Continue Watching'],
    'the one list, as on a page (C1); no Player Controls or Start Videos Muted, which are on the options page only');
  const walkTo = (label) => {
    for (let i = 0; i < 14; i += 1) key('ArrowUp');
    for (let i = 0; i < 14 && current() !== label; i += 1) key('ArrowDown');
  };
  walkTo('Seek Step');
  T.eq(valueOf('Seek Step'), '15 s');
  key('ArrowRight');
  T.eq(panel.querySelector('.tenfoot-settings-title').textContent, 'Seek Step', '▶ opens its values');
  T.eq(current(), '15 s', 'on the one in force');
  T.ok(item('15 s').querySelector('.tenfoot-settings-mark svg'), 'ticked');
  key('ArrowDown');
  key('Enter');
  T.eq(bg.filter((m) => m.type === 'settings:set').at(-1).patch, { seekStep: 30 }, 'OK picks it, written through');
  T.eq(panel.querySelector('.tenfoot-settings-title').textContent, 'Leanback Settings', 'and goes back up');
  T.eq(valueOf('Seek Step'), '30 s');
  walkTo('Button Hints');
  T.eq(item('Button Hints').getAttribute('aria-checked'), 'true');
  key('Enter');
  T.eq(item('Button Hints').getAttribute('aria-checked'), 'false', 'an on/off flips on OK');
  T.eq(bg.filter((m) => m.type === 'settings:set').at(-1).patch, { hintBar: false });
  key('ArrowLeft');
  await T.sleep(20);
  T.eq(panel.querySelector('.tenfoot-settings-title').textContent, 'Playback Settings', '◀ goes back up');
});

T.runAsync('Clear Continue Watching is in the playback panel too, and takes OK twice', async () => {
  const { key, win, bg } = await boot();
  key('ArrowDown');
  key('ArrowRight');
  key('Enter');
  await T.sleep(120);
  const panel = win.document.querySelector('.tenfoot-settings');
  const current = () => panel.querySelector('[data-tenfoot-current="true"]');
  for (let i = 0; i < 5; i += 1) key('ArrowDown');
  key('ArrowRight');
  for (let i = 0; i < 14 && current().querySelector('.tenfoot-settings-label').textContent !== 'Clear Continue Watching'; i += 1) key('ArrowDown');
  key('ArrowRight');
  T.notOk(bg.some((m) => m.type === 'history:clear'), '▶ never runs it');
  key('Enter');
  T.eq(current().querySelector('.tenfoot-settings-value').textContent, 'OK again to clear');
  T.notOk(bg.some((m) => m.type === 'history:clear'), 'the first OK only asks');
  key('Enter');
  await T.sleep(10);
  T.ok(bg.some((m) => m.type === 'history:clear'), 'the second clears');
  T.eq(current().querySelector('.tenfoot-settings-value').textContent, 'Cleared');
});
T.runAsync('every value is reachable: the list holds them all, and one not offered any more is listed too', async () => {
  const { key, win } = await boot({ settings: { focusZoom: 3 } });
  key('ArrowDown');
  key('ArrowRight');
  key('Enter');
  await T.sleep(120);
  const panel = win.document.querySelector('.tenfoot-settings');
  const current = () => panel.querySelector('[data-tenfoot-current="true"] .tenfoot-settings-label').textContent;
  for (let i = 0; i < 5; i += 1) key('ArrowDown');
  key('ArrowRight');
  for (let i = 0; i < 14 && current() !== 'Enlarge Selection'; i += 1) key('ArrowDown');
  key('Enter');
  const labels = [...panel.querySelectorAll('.tenfoot-settings-label')].map((r) => r.textContent);
  T.eq(labels, ['Off', '3%', '5%', '10%', '15%', '20%', '25%'], 'a hand-set 3 % is there, in order');
  T.eq(current(), '3%');
  for (let i = 0; i < 9; i += 1) key('ArrowDown');
  T.eq(current(), '25%', 'the list ends: no wrap');
});
T.runAsync('▶ enters a submenu of the player\'s, ◀ leaves it', async () => {
  const { key, win } = await boot();
  const menu = win.document.querySelector('.vp-menu');
  const items = [...menu.querySelectorAll('[data-menu-item="true"]')];
  const clicked = [];
  items.forEach((it) => it.addEventListener('click', () => {
    clicked.push(it.querySelector("[class*='MenuItem_module_label']").textContent);
    const body = menu.querySelector('[role="menu"]');
    while (body.firstChild) body.removeChild(body.firstChild);
    for (const label of ['Auto', '1080p', '720p']) {
      const row = win.document.createElement('div');
      row.setAttribute('role', 'menuitem');
      row.dataset.menuItem = 'true';
      if (label === 'Auto') row.setAttribute('aria-checked', 'true');
      const t = win.document.createElement('span');
      t.className = 'Text_module_text__73112353';
      t.textContent = label;
      row.appendChild(t);
      body.appendChild(row);
    }
  }));
  key('ArrowDown');
  key('ArrowRight');
  key('Enter');
  await T.sleep(120);
  const panel = win.document.querySelector('.tenfoot-settings');
  T.eq(panel.querySelector('.tenfoot-settings-title').textContent, 'Playback Settings');
  key('ArrowRight'); // enter Quality
  await T.sleep(260);
  T.eq(clicked, ['Quality'], 'the player\'s own entry was the thing opened');
  T.eq(panel.querySelector('.tenfoot-settings-title').textContent, 'Quality', 'the submenu is titled');
  const subs = [...panel.querySelectorAll('.tenfoot-settings-label')].map((r) => r.textContent);
  T.eq(subs, ['Auto', '1080p', '720p'], 'and drawn in our own list: ' + subs.join(', '));
  T.eq(panel.querySelector('[data-tenfoot-current="true"]').querySelector('.tenfoot-settings-label').textContent,
    'Auto', 'opening on the option in force');
  key('ArrowLeft');
  await T.sleep(400);
  T.eq(panel.querySelector('.tenfoot-settings-title').textContent, 'Playback Settings', '◀ comes back out');
});

T.runAsync('the frame keeps no history of its own; the page asks it what Back means (item 5)', async () => {
  const { key, win, cmd, bg } = await boot();
  key('ArrowDown');
  T.eq((await cmd({ type: 'player:command', cmd: 'state' })).state.transport, true);
  // The frame used to push an entry of its own. With the page holding a guard
  // as well, one press popped both — which is what dropped the video out of its
  // full-window layout on the way out of the row.
  T.eq(win.history.state, null, 'nothing was pushed in this frame');
  const before = bg.filter((m) => m.type === 'page:focus').length;
  // The page's guard caught the key and is asking.
  let r = await cmd({ type: 'player:back' });
  T.eq(r.consumed, true, 'the row was the layer to close');
  T.eq((await cmd({ type: 'player:command', cmd: 'state' })).state.transport, false, 'the row closed');
  T.eq(bg.filter((m) => m.type === 'page:focus').length, before, 'and the page was never asked to take over');
  // Nothing left in the frame to close: the page is told so and walks its own layers.
  r = await cmd({ type: 'player:back' });
  T.eq(r.consumed, false, 'so the next press belongs to the page');
});

T.runAsync('Back walks one layer at a time: panel, then row, then the page', async () => {
  const { key, cmd, win } = await boot();
  key('ArrowDown');
  key('ArrowRight');
  key('Enter');
  await T.sleep(120);
  T.notOk(win.document.querySelector('.tenfoot-settings').hidden, 'panel open');
  T.eq((await cmd({ type: 'player:back' })).consumed, true);
  await T.sleep(320); // it rolls back out before it is taken away
  T.ok(win.document.querySelector('.tenfoot-settings').hidden, 'first press closed the panel');
  T.eq((await cmd({ type: 'player:command', cmd: 'state' })).state.transport, true, 'and left the row up');
  T.eq((await cmd({ type: 'player:back' })).consumed, true);
  T.eq((await cmd({ type: 'player:command', cmd: 'state' })).state.transport, false, 'second press closed the row');
  T.eq((await cmd({ type: 'player:back' })).consumed, false, 'third press is the page\'s');
});


T.runAsync('▼ opens the row; ◀ ▶ walk it and no longer seek; back leaves (item 1)', async () => {
  const { key, win, st, cmd } = await boot({ settings: { seekStep: 15 } });
  key('ArrowRight');
  T.eq(st.currentTime, 15, 'seeking before the row is open');
  T.ok(key('ArrowDown').defaultPrevented);
  T.eq((await cmd({ type: 'player:command', cmd: 'state' })).state.transport, true, 'the row is open');
  const cur = () => win.document.querySelector('.tenfoot-transport [data-tenfoot-current="true"]').dataset.tenfootTc;
  T.eq(cur(), 'playpause', 'play/pause is the first stop');
  key('ArrowRight');
  T.eq(cur(), 'settings');
  T.eq(st.currentTime, 15, 'arrows in the row do NOT seek');
  key('ArrowLeft');
  T.eq(cur(), 'playpause');
  for (let i = 0; i < 6; i++) key('ArrowRight');
  T.eq(cur(), 'fullscreen', 'stops at the last control, no wrap');
  T.ok(key('Escape').defaultPrevented);
  T.eq((await cmd({ type: 'player:command', cmd: 'state' })).state.transport, false, 'back closed the row');
  key('ArrowRight');
  T.eq(st.currentTime, 30, 'and ◀ ▶ seek again');
});

T.runAsync('the position readout follows the video', async () => {
  const { key, win, st, video } = await boot();
  key('ArrowDown');
  await T.sleep(30);
  const time = () => ['elapsed', 'total'].map((p) => win.document.querySelector(`.tenfoot-scrub-${p}`).textContent);
  T.eq(time(), ['0:00', '1:00'], 'the time so far and the length, under the two ends of the bar (P8)');
  const times = win.document.querySelector('.tenfoot-scrub-times');
  T.ok(times.previousElementSibling.classList.contains('tenfoot-scrub-track'), 'under the bar');
  st.currentTime = 30;
  video.dispatchEvent(new win.Event('timeupdate'));
  await T.sleep(60);
  T.eq(time(), ['0:30', '1:00']);
  T.eq(win.document.querySelector('.tenfoot-scrub').getAttribute('aria-label'), '0:30 of 1:00');
  T.eq(win.document.querySelector('.tenfoot-scrub-played').style.width, '50%', 'and the bar fills with it');
});

T.runAsync('OK on play/pause drives the video itself, not one of the player\'s buttons', async () => {
  const { key, win, st, video } = await boot();
  st.paused = false;
  video.dispatchEvent(new win.Event('play'));
  key('ArrowDown');
  T.ok(key('Enter').defaultPrevented);
  T.eq([st.paused, st.pauses], [true, 1], 'OK paused it');
  key('Enter');
  await T.sleep(20);
  T.eq(st.paused, false, 'and OK again started it');
  // The glyph is the state, so the row reads right from across the room.
  await T.sleep(40);
  T.eq(win.document.querySelector('[data-tenfoot-tc="playpause"]').dataset.tenfootIcon, 'pause');
});

T.runAsync('OK on fullscreen asks for fullscreen, falling back to the player\'s button', async () => {
  const { key, win } = await boot();
  const hits = [];
  win.document.getElementById('fullscreen-control-bar-button').addEventListener('click', () => hits.push('vendor'));
  let asked = 0;
  win.document.documentElement.requestFullscreen = () => { asked += 1; return Promise.resolve(); };
  key('ArrowDown');
  for (let i = 0; i < 3; i++) key('ArrowRight');
  T.eq(win.document.querySelector('[data-tenfoot-current="true"]').dataset.tenfootTc, 'fullscreen');
  key('Enter');
  T.eq([asked, hits.length], [1, 0], 'the frame asked for itself; the player was not touched');
  win.document.documentElement.requestFullscreen = () => { asked += 1; return Promise.reject(new Error('refused')); };
  key('Enter');
  await T.sleep(5);
  T.eq([asked, hits], [2, ['vendor']], 'refused: the player\'s own button instead');
});

T.runAsync('▼ again stays on the row: there is nothing below the video (D5)', async () => {
  const { key, cmd, last } = await boot();
  key('ArrowDown');
  T.eq((await cmd({ type: 'player:command', cmd: 'state' })).state.transport, true);
  T.ok(key('ArrowDown').defaultPrevented, 'the key is taken');
  await T.sleep(5);
  T.eq((await cmd({ type: 'player:command', cmd: 'state' })).state.transport, true, 'row still open');
  T.eq(last('page:focus'), undefined, 'and the page was not asked to take the focus');
});

T.runAsync('▼ falls back to leaving for the page when there is no video to drive', async () => {
  const { key, win, last } = await boot();
  const v = win.document.getElementById('video');
  v.remove();
  key('ArrowDown');
  await T.sleep(5);
  T.eq(last('page:focus').hint, 'below', 'the old behaviour is the fallback, never a dead key');
});

T.runAsync('the menu button does not raise Firefox\'s context menu inside the frame (item 4)', async () => {
  const { win } = await boot();
  const e = new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 0 });
  win.document.body.dispatchEvent(e);
  T.ok(e.defaultPrevented, 'suppressed');
  const real = new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
  win.document.body.dispatchEvent(real);
  T.notOk(real.defaultPrevented, 'a real right-click is left alone');
});

T.runAsync('nothing touches the sound before a user gesture — that is what cost autoplay (item 1)', async () => {
  const { st, video, win } = await boot({ muted: true, autoplayBlocked: true });
  st.paused = false;
  video.dispatchEvent(new win.Event('play'));
  video.dispatchEvent(new win.Event('loadedmetadata'));
  await T.sleep(500);
  T.eq([st.muted, st.paused], [true, false], 'still muted, and still playing — the autoplay was never disturbed');
});

T.runAsync('the first keypress is the gesture, and the sound goes on then (item 1)', async () => {
  const { key, st, video, win } = await boot({ muted: true, autoplayBlocked: true });
  st.paused = false;
  video.dispatchEvent(new win.Event('play'));
  await T.sleep(200);
  T.eq(st.muted, true, 'nothing yet');
  win.__allowUnmute = true; // the keypress is user activation
  key('ArrowRight');
  await T.sleep(400);
  T.eq([st.muted, st.paused], [false, false], 'sound on, still playing');
});

T.runAsync('if Firefox stops the video for the unmute anyway, it goes straight back', async () => {
  const { key, st, video, win } = await boot({ muted: true, autoplayBlocked: true });
  st.paused = false;
  video.dispatchEvent(new win.Event('play'));
  await T.sleep(150);
  key('ArrowRight'); // gesture, but the fake still refuses (win.__allowUnmute unset)
  await T.sleep(500);
  T.eq([st.muted, st.paused], [true, false], 'back to muted and playing, never left stopped');
});

T.runAsync('a video you have opened before is re-muted by the site, and unmuted again (item 2)', async () => {
  const { st, video, win, gesture } = await boot({ muted: true });
  T.eq(st.muted, true, 'left muted until playback and a gesture — unmuting first costs autoplay');
  st.paused = false;
  video.dispatchEvent(new win.Event('play'));
  gesture();
  await T.sleep(200);
  T.eq(st.muted, false, 'unmuted once playing, after a gesture');
  st.muted = true; // the site restoring its remembered preference
  video.dispatchEvent(new win.Event('volumechange'));
  await T.sleep(10);
  T.eq(st.muted, false, 'put back');
  video.dispatchEvent(new win.Event('loadedmetadata'));
  st.muted = true;
  video.dispatchEvent(new win.Event('volumechange'));
  await T.sleep(10);
  T.eq(st.muted, false, 'and again later in the load');
});

T.runAsync('once the user touches the transport row, their volume choice stands', async () => {
  const { key, st, video, win } = await boot({ muted: true });
  st.paused = false;
  key('ArrowDown');
  key('Enter');
  st.muted = true;
  video.dispatchEvent(new win.Event('volumechange'));
  await T.sleep(10);
  T.eq(st.muted, true, 'not fought');
});

T.runAsync('videos start unmuted once playing, and the setting turns that around (owner report)', async () => {
  // Dropout starts them muted to satisfy Firefox's autoplay policy.
  const a = await boot({ muted: true });
  a.st.paused = false;
  a.video.dispatchEvent(new a.win.Event('play'));
  a.gesture();
  await T.sleep(200);
  T.eq(a.st.muted, false, 'unmuted once it was playing and the page had been used');
  const b = await boot({ muted: true, settings: { startMuted: true } });
  b.st.paused = false;
  b.video.dispatchEvent(new b.win.Event('play'));
  b.gesture();
  await T.sleep(200);
  T.eq(b.st.muted, true, 'startMuted leaves it alone');
});

T.runAsync('a video that has not started is never unmuted — that is what costs autoplay (item 1)', async () => {
  const { st, video, win, gesture } = await boot({ muted: true, autoplayBlocked: true });
  gesture(); // even with a gesture in hand, a video that has not started is left alone
  T.eq([st.muted, st.paused], [true, true], 'still muted and still paused');
  video.dispatchEvent(new win.Event('loadedmetadata'));
  await T.sleep(400);
  T.eq(st.muted, true, 'metadata does not tempt us either');
  st.paused = false;
  video.dispatchEvent(new win.Event('play'));
  await T.sleep(400);
  T.eq(st.paused, false, 'it is playing — the autoplay was never taken away');
});

T.runAsync('in the player the arrows move the playhead and leave — nothing else', async () => {
  const { key, st, last, win, bg } = await boot({ settings: { seekStep: 15 } });
  T.ok(key('ArrowRight').defaultPrevented);
  T.eq(st.currentTime, 15);
  key('ArrowLeft'); key('ArrowLeft');
  T.eq(st.currentTime, 0, 'clamped');
  key('MediaFastForward'); T.eq(st.currentTime, 45, 'a remote with media keys still gets 3× step');
  key('Enter'); T.eq(st.paused, false, 'OK toggles playback');
  key('MediaPlayPause'); T.eq(st.paused, true);
  key('ArrowDown'); key('ArrowDown'); key('Escape'); await T.sleep(5);
  T.eq(last('page:focus'), undefined, 'into the transport row and out of it again; nothing below it');
  key('Escape'); await T.sleep(5); T.eq(last('page:focus').hint, 'back');
  const backs = () => bg.filter((m) => m.type === 'page:focus' && m.hint === 'back').length;
  const before = backs();
  T.notOk(key('BrowserBack').defaultPrevented, 'BrowserBack is Firefox\'s: not cancelled');
  await T.sleep(5);
  T.eq([last('page:action').action, backs()], ['browser-back', before], 'the page is told; nothing else is done here');
  key('MediaTrackNext'); await T.sleep(5); T.eq(last('page:episode').delta, 1);
  T.ok(key('ArrowUp').defaultPrevented, 'Up is absorbed, and does NOT skip an episode');
  T.eq(st.currentTime, 45, 'Up changed nothing');
  // The menu button no longer bounces out to the page: during playback it is
  // the way into the settings panel, which lives in this frame.
  key('ContextMenu'); await T.sleep(5);
  T.eq(last('page:action').action, 'browser-back', 'nothing more was sent to the page');
  T.notOk(win.document.querySelector('.tenfoot-settings').hidden, 'the settings panel opened here');
});

T.runAsync('no letter key does anything inside the player either', async () => {
  const { key, st, clicks, bg } = await boot();
  const before = bg.length;
  for (const k of ['c', 's', 'm', 'k', 'n', 'p', 'j', 'l', 'i', ' ', 'PageUp', 'PageDown', 'Home']) {
    T.notOk(key(k).defaultPrevented, `"${k}" must not be handled`);
  }
  T.eq([st.paused, st.muted, st.currentTime, clicks.length, bg.length], [true, false, 0, 0, before], 'nothing happened at all');
});

T.runAsync('keys the player does not own pass through; modifiers and typing are respected', async () => {
  const { key, win, st } = await boot();
  T.notOk(key('a').defaultPrevented);
  T.notOk(key('Tab').defaultPrevented);
  T.notOk(key('ArrowRight', { ctrlKey: true }).defaultPrevented);
  T.eq(st.currentTime, 0);
  const input = win.document.createElement('input');
  win.document.body.appendChild(input);
  input.focus();
  T.notOk(key('ArrowRight').defaultPrevented, 'typing in a field inside the frame');
  T.ok(key('Escape').defaultPrevented);
});

T.runAsync('the next episode can be started early without any keyboard (bug 3)', async () => {
  const { key, cmd, last, win, st } = await boot();
  // The menu button's panel is the general route; here we check the two paths
  // that live in the player frame itself.
  await cmd({ type: 'player:command', cmd: 'state' });
  // Once the site shows its own overlay, OK takes the offer: it resumes
  // properly and cancels the site's countdown.
  const overlay = win.document.querySelector('.vp-outro-wrapper');
  const button = win.document.getElementById('outro-play-next');
  const clicks = [];
  button.addEventListener('click', () => clicks.push('play'));
  const shown = () => [{ width: 300, height: 120 }];
  overlay.hidden = false;
  overlay.getClientRects = shown;
  button.getClientRects = shown;
  key('Enter');
  T.eq(clicks, ['play'], 'OK takes the offer instead of pausing while it is showing');
  T.eq(st.paused, true, 'and did not toggle playback');
  key('MediaTrackNext');
  T.eq(clicks.length, 2, 'a media key routes through the overlay too');
  overlay.hidden = true;
  overlay.getClientRects = () => [];
  key('Enter');
  T.eq([clicks.length, st.paused], [2, false], 'and OK goes back to play/pause once it is gone');
  key('MediaTrackNext');
  await T.sleep(5);
  T.eq(last('page:episode').delta, 1, 'with no overlay, the page navigates instead');
});

T.runAsync('OK on a finished video starts the next one even when no overlay is found (item 8)', async () => {
  const { key, st, video, win, last } = await boot();
  st.ended = true;
  st.paused = true;
  video.dispatchEvent(new win.Event('ended'));
  await T.sleep(5);
  key('Enter');
  await T.sleep(5);
  T.eq(last('page:episode').delta, 1, 'OK asks for the next episode rather than toggling a finished video');
  T.eq(st.plays, 0, 'and did not try to replay this one');
});

T.runAsync('only the visible up-next overlay counts — the site renders several (item 7)', async () => {
  const { win, cmd } = await boot();
  const extra = win.document.createElement('div');
  extra.className = 'ott-up-next';
  extra.getClientRects = () => [];
  win.document.body.appendChild(extra);
  T.eq((await cmd({ type: 'player:command', cmd: 'state' })).state.upNextShowing, false, 'hidden ones do not count');
  const overlay = win.document.querySelector('.vp-outro-wrapper');
  overlay.hidden = false;
  overlay.getClientRects = () => [{ width: 300, height: 120 }];
  T.eq((await cmd({ type: 'player:command', cmd: 'state' })).state.upNextShowing, false, 'an empty end screen (Vimeo\'s, at the very end) offers nothing');
  win.document.getElementById('outro-play-next').getClientRects = () => [{ width: 300, height: 120 }];
  T.eq((await cmd({ type: 'player:command', cmd: 'state' })).state.upNextShowing, true, 'one with a link to the next episode does');
});

T.runAsync('the page can tell the frame the offer is showing, when the page renders it (item 7)', async () => {
  const { key, cmd, last } = await boot();
  T.eq((await cmd({ type: 'player:offer', showing: true })).state.upNextShowing, true);
  key('Enter');
  await T.sleep(5);
  T.eq(last('page:episode').delta, 1, 'OK takes the offer the page told us about');
});

T.runAsync('the up-next overlay appearing is reported to the page', async () => {
  const { win, bg, last } = await boot();
  const overlay = win.document.querySelector('.vp-outro-wrapper');
  T.notOk(last('player:state').state.upNextShowing);
  const before = bg.filter((m) => m.type === 'player:state').length;
  overlay.hidden = false;
  overlay.getClientRects = () => [{ width: 300, height: 120 }];
  win.document.getElementById('outro-play-next').getClientRects = () => [{ width: 300, height: 120 }];
  win.document.body.appendChild(win.document.createElement('span')); // provoke the observer
  await T.sleep(200);
  T.ok(bg.filter((m) => m.type === 'player:state').length > before, 'a state report was sent');
  T.ok(last('player:state').state.upNextShowing, 'and it says the offer is on screen');
});

T.runAsync('no message is sent from a frame that is going away (bug 5)', async () => {
  const { win, bg, video, st } = await boot();
  win.dispatchEvent(new win.Event('pagehide'));
  const after = bg.length;
  st.paused = false;
  video.dispatchEvent(new win.Event('play'));
  await T.sleep(20);
  T.eq(bg.length, after, 'no player:bye and no further state reports once the frame is unloading');
});

T.runAsync('ended reports player:ended with the up-next URL and a paused state', async () => {
  const { video, win, last, st } = await boot();
  st.ended = true; st.paused = true;
  video.dispatchEvent(new win.Event('ended'));
  await T.sleep(5);
  T.eq(last('player:ended').upNext, { url: 'https://watch.dropout.tv/game-changer/season:1/videos/ep2', title: 'Ep 2' });
  T.eq(last('player:state').state.ended, true);
});

T.runAsync('without OTTData the script still works with document.title and no up-next', async () => {
  const { cmd, last } = await boot({ ottData: false });
  T.eq(last('player:hello').videoId, null);
  const s = (await cmd({ type: 'player:command', cmd: 'state' })).state;
  T.eq([s.title, s.upNext], ['Embed fixture', null]);
});

T.runAsync('player:focus focuses the video; disabling the extension silences keys', async () => {
  const { cmd, key, win, shim, st } = await boot();
  T.eq((await cmd({ type: 'player:focus' })).ok, true);
  T.eq(win.document.activeElement.id, 'video');
  await shim.changeStorage({ settings: { newValue: { enabled: false } } });
  await T.sleep(5);
  T.notOk(key('ArrowRight').defaultPrevented);
  T.eq(st.currentTime, 0);
  await shim.changeStorage({ settings: { newValue: { enabled: true, seekStep: 5 } } });
  await T.sleep(5);
  key('ArrowRight');
  T.eq(st.currentTime, 5, 'new seek step applied');
});

T.runAsync('turning Leanback off gives the player its own chrome back (no reload)', async () => {
  const { win, shim, key } = await boot();
  await T.sleep(150);
  const root = win.document.documentElement;
  const bar = win.document.querySelector('.vp-controls');
  const pip = win.document.getElementById('pip-control-bar-button');
  T.eq(root.dataset.tenfootPlayer, 'on');
  T.ok(bar.hasAttribute('data-tenfoot-bar'), 'the bar is stamped while we are on');
  T.ok(pip.hasAttribute('data-tenfoot-hide'), 'and picture-in-picture is stamped away');

  await shim.changeStorage({ settings: { newValue: { enabled: false } } });
  await T.sleep(20);
  // The CSS is gated on html[data-tenfoot-player="on"], and the stamps come off
  // too, so nothing of ours is left holding the control bar off screen.
  T.eq(root.dataset.tenfootPlayer, 'off', 'the CSS gate is closed');
  T.notOk(bar.hasAttribute('data-tenfoot-bar'), 'the bar is unstamped');
  T.notOk(pip.hasAttribute('data-tenfoot-hide'), 'picture-in-picture is back');
  T.eq(win.document.querySelectorAll('[data-tenfoot-bar], [data-tenfoot-hide]').length, 0, 'no stamp of ours survives');

  // And the observer must not quietly re-stamp everything behind our back.
  win.document.body.appendChild(win.document.createElement('span'));
  await T.sleep(200);
  T.eq(win.document.querySelectorAll('[data-tenfoot-bar], [data-tenfoot-hide]').length, 0, 'the observer stays quiet while off');

  await shim.changeStorage({ settings: { newValue: { enabled: true } } });
  await T.sleep(20);
  T.eq(root.dataset.tenfootPlayer, 'on');
  T.ok(win.document.querySelector('.vp-controls').hasAttribute('data-tenfoot-bar'), 'and switching back on re-stamps');
  T.ok(key('ArrowDown').defaultPrevented, 'the row works again');
});

T.runAsync('a second injection is a no-op', async () => {
  const { dom, shim } = await boot();
  const before = shim.listeners.message.length;
  dom.runScripts(FILES);
  await T.sleep(10);
  T.eq(shim.listeners.message.length, before, 'no second onMessage listener');
});

T.runAsync('captions are a row of the player\'s own, because that is where they live', async () => {
  const { key, win } = await boot();
  // The real popover holds exactly three entries — Quality, Speed and
  // CC/subtitles — and the caption font, background and window options are
  // inside CC/subtitles, not beside it. Rows of our own for them matched
  // nothing and never could.
  const menu = win.document.querySelector('.vp-menu [role="menu"]');
  const labels = [...menu.querySelectorAll("[class*='MenuItem_module_label']")];
  T.eq(labels.map((l) => l.textContent), ['Quality', 'Speed', 'CC/subtitles'], 'the fixture mirrors the real popover');
  const cc = labels[2].closest('[data-menu-item="true"]');
  cc.addEventListener('click', () => {
    const body = win.document.querySelector('.vp-menu [role="menu"]');
    while (body.firstChild) body.removeChild(body.firstChild);
    for (const label of ['Off', 'English', 'Font', 'Background', 'Window']) {
      const row = win.document.createElement('div');
      row.setAttribute('role', 'menuitem');
      row.dataset.menuItem = 'true';
      if (label === 'Off') row.setAttribute('aria-checked', 'true');
      const t = win.document.createElement('span');
      t.className = 'Text_module_text__73112353';
      t.textContent = label;
      row.appendChild(t);
      body.appendChild(row);
    }
  });
  key('ArrowDown');
  key('ArrowRight');
  key('Enter');
  await T.sleep(120);
  const panel = win.document.querySelector('.tenfoot-settings');
  const rows = () => [...panel.querySelectorAll('.tenfoot-settings-label')].map((r) => r.textContent);
  T.ok(rows().includes('Closed Captions'), 'the row is there: ' + rows().join(' | '));
  // Walk to it and open it: the player's caption options, in our own list.
  for (let i = 0; i < 2; i += 1) key('ArrowDown');
  T.eq(panel.querySelector('[data-tenfoot-current="true"]').querySelector('.tenfoot-settings-label').textContent, 'Closed Captions');
  key('ArrowRight');
  await T.sleep(260);
  T.eq(panel.querySelector('.tenfoot-settings-title').textContent, 'Closed Captions', 'the submenu is titled');
  T.eq(rows(), ['Off', 'English', 'Font', 'Background', 'Window'],
    'and holds what the player offers, appearance included: ' + rows().join(', '));
});


T.runAsync('"the site\'s own" hands the player its controls back and draws nothing of ours', async () => {
  const { key, win, last } = await boot({ settings: { playerChrome: 'site' } });
  await T.sleep(150);
  T.notOk(win.document.querySelector('.vp-controls').hasAttribute('data-tenfoot-bar'), 'the control bar is not hidden');
  T.notOk(win.document.querySelector("[class*='PlayButton_module_playButtonWrapper__']").hasAttribute('data-tenfoot-bar'), 'nor the overlay play button');
  T.notOk(win.document.getElementById('pip-control-bar-button').hasAttribute('data-tenfoot-hide'), 'nothing in the bar is stamped away');
  key('ArrowDown');
  await T.sleep(10);
  T.notOk(win.document.querySelector('.tenfoot-transport'), 'no bar of ours was built');
  T.eq(last('page:focus').hint, 'below', 'and ▼ goes to the page, as it did before there was a bar');
  key('ContextMenu');
  await T.sleep(10);
  T.eq(last('page:action').action, 'menu', 'the options button goes back to the page too');
});

T.runAsync('switching back to Leanback\'s controls takes effect without a reload', async () => {
  const { key, win, shim } = await boot({ settings: { playerChrome: 'site' } });
  await T.sleep(120);
  T.notOk(win.document.querySelector('.vp-controls').hasAttribute('data-tenfoot-bar'));
  shim.store.settings = { ...(shim.store.settings || {}), playerChrome: 'leanback' };
  await shim.changeStorage({ settings: { newValue: shim.store.settings } });
  await T.sleep(150);
  T.ok(win.document.querySelector('.vp-controls').hasAttribute('data-tenfoot-bar'), 'the player chrome is hidden again');
  key('ArrowDown');
  T.notOk(win.document.querySelector('.tenfoot-transport').hidden, 'and our bar opens');
});

T.runAsync('the panel does not lose the player\'s rows to one unlucky read', async () => {
  const { key, win } = await boot();
  const menu = win.document.querySelector('.vp-menu');
  const body = menu.querySelector('[role="menu"]');
  const real = [...body.children];
  // The player's menu is busy the first time it is asked — something else
  // driving it, or a re-render mid-click — and comes back a moment later.
  body.replaceChildren();
  setTimeout(() => body.replaceChildren(...real), 120);
  key('ArrowDown');
  key('ArrowRight');
  key('Enter');
  await T.sleep(700);
  const rows = [...win.document.querySelectorAll('.tenfoot-settings-label')].map((r) => r.textContent);
  T.ok(rows.includes('Quality') && rows.includes('Speed') && rows.includes('Closed Captions'),
    'the second read got them: ' + rows.join(' | '));
});

// A stand-in for the player's settings popover, shaped like the real one
// (leanback-for-dropout docs/site-notes.md): one panel at a time, a header with
// a Back button and a title below the root, options that tick in place, a
// collapsed accordion whose options are `hidden`, and radio groups named by
// aria-labelledby. Picking a caption track returns to the root, as the player
// does; picking a colour or size stays on the panel.
function realMenu(win) {
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

async function openCaptions(t) {
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

T.runAsync('captions go as deep as the player\'s menu: CC/subtitles → Customize → Font (B2)', async () => {
  const t = await boot();
  const c = await openCaptions(t);
  T.eq(c.title(), 'Closed Captions');
  T.eq(c.labels(), ['Off', 'English CC', 'Customize']);
  c.walkTo('Customize');
  t.key('Enter');
  await T.sleep(300);
  T.eq(c.title(), 'Customize', 'OK on a submenu goes into it instead of bouncing back');
  T.eq(c.labels(), ['Font', 'Background', 'Window', 'Reset all']);
  c.walkTo('Font');
  t.key('ArrowRight');
  await T.sleep(300);
  T.eq(c.title(), 'Font', '▶ goes in too');
  // Each set of options (Color, Size) and each accordion (Family) is one
  // entry, showing its current choice; its choices are a level of their own.
  T.eq(c.labels(), ['Family', 'Color', 'Size'], c.labels().join(' | '));
  const values = [...c.panel.querySelectorAll('.tenfoot-settings-item')].map((b) => b.querySelector('.tenfoot-settings-value').textContent);
  T.eq(values, ['Proportional Sans-Serif', 'White', '100%'], 'each shows its current choice');
  T.eq(c.panel.querySelectorAll('.tenfoot-settings-group').length, 0, 'no headings over a long flat list');
});

T.runAsync('a caption colour is a submenu of its own: OK opens "Font Color", OK on a colour presses the player\'s and comes back up; an accordion too (the owner, 2026-10-03)', async () => {
  const t = await boot();
  const c = await openCaptions(t);
  c.walkTo('Customize');
  t.key('Enter');
  await T.sleep(300);
  t.key('Enter'); // Font
  await T.sleep(300);
  c.walkTo('Color');
  t.key('Enter');
  await T.sleep(50);
  T.eq([c.title(), c.labels(), c.current()], ['Font Color', ['White', 'Yellow'], 'White'], 'its choices, the current one selected');
  const ticked = () => [...c.panel.querySelectorAll('.tenfoot-settings-item')].filter((b) => b.querySelector('.tenfoot-settings-mark svg')).map((b) => b.querySelector('.tenfoot-settings-label').textContent);
  T.eq(ticked(), ['White'], 'and ticked');
  t.key('ArrowDown');
  t.key('Enter');
  await T.sleep(300);
  T.eq(c.menu.color, 'Yellow', 'the player\'s own swatch was pressed');
  T.eq([c.title(), c.current()], ['Font', 'Color'], 'back up, on Color');
  const color = [...c.panel.querySelectorAll('.tenfoot-settings-item')].find((b) => b.querySelector('.tenfoot-settings-label').textContent === 'Color');
  T.eq(color.querySelector('.tenfoot-settings-value').textContent, 'Yellow', 'showing the new colour');
  c.walkTo('Size');
  t.key('Enter');
  await T.sleep(50);
  T.eq([c.title(), c.labels()], ['Font Size', ['50%', '100%', '150%']]);
  t.key('ArrowLeft');
  await T.sleep(50);
  T.eq([c.title(), c.current(), c.menu.backs], ['Font', 'Size', 0], '◀ back up, without touching the player\'s menu');
  c.walkTo('Family');
  t.key('Enter');
  await T.sleep(300);
  T.eq(c.title(), 'Font Family', 'the accordion opened in the player, then as a level of its own');
  T.eq(c.labels(), ['Monospace Serif', 'Proportional Sans-Serif']);
  T.eq(c.current(), 'Proportional Sans-Serif');
  t.key('ArrowLeft');
  await T.sleep(50);
  T.eq([c.title(), c.labels()], ['Font', ['Family', 'Color', 'Size']], 'its options stay out of the Font list');
  t.key('Enter');
  await T.sleep(300);
  T.eq(c.title(), 'Font Family', 'open already: straight in, not shut by a second click');
});

T.runAsync('◀ uses the player\'s own Back, one level at a time (B3)', async () => {
  const t = await boot();
  const c = await openCaptions(t);
  c.walkTo('Customize');
  t.key('Enter');
  await T.sleep(300);
  t.key('Enter'); // Font
  await T.sleep(300);
  T.eq(c.title(), 'Font');
  t.key('ArrowLeft');
  await T.sleep(300);
  T.eq(c.title(), 'Customize');
  t.key('Escape');
  await T.sleep(300);
  T.eq(c.title(), 'Closed Captions', 'Back works the same as ◀');
  t.key('ArrowLeft');
  await T.sleep(300);
  T.eq(c.title(), 'Playback Settings');
  T.eq(c.menu.backs, 3, 'every step was the player\'s own Back button');
  T.eq(c.menu.path, [], 'and the player\'s menu is at its root again');
});

T.runAsync('picking a caption track goes back up the way the player does, with the switch showing it', async () => {
  const t = await boot();
  const c = await openCaptions(t);
  c.walkTo('English CC');
  t.key('Enter');
  await T.sleep(300);
  T.eq(c.title(), 'Playback Settings', 'the player returned to its root, and so did the panel');
  const cc = [...c.panel.querySelectorAll('.tenfoot-settings-item')].find((b) => b.querySelector('.tenfoot-settings-label').textContent === 'Closed Captions');
  T.eq(cc.getAttribute('aria-checked'), 'true', 'captions on');
});

T.runAsync('Closed Captions is a switch: OK turns the player\'s first track on, and off again (C3)', async () => {
  const t = await boot();
  const menu = realMenu(t.win);
  t.key('ArrowDown');
  t.key('ArrowRight');
  t.key('Enter');
  await T.sleep(150);
  const panel = t.win.document.querySelector('.tenfoot-settings');
  const cc = () => [...panel.querySelectorAll('.tenfoot-settings-item')].find((b) => b.querySelector('.tenfoot-settings-label').textContent === 'Closed Captions');
  T.eq([cc().dataset.tenfootKind, cc().getAttribute('aria-checked')], ['toggle', 'false']);
  for (let i = 0; i < 2; i += 1) t.key('ArrowDown');
  t.key('Enter');
  await T.sleep(700);
  T.eq(menu.track, 'English CC', 'the player\'s own track was picked');
  T.eq(cc().getAttribute('aria-checked'), 'true');
  T.eq(panel.querySelector('.tenfoot-settings-title').textContent, 'Playback Settings', 'and the panel stayed where it was');
  T.eq(panel.querySelector('[data-tenfoot-current="true"] .tenfoot-settings-label').textContent, 'Closed Captions');
  t.key('Enter');
  await T.sleep(700);
  T.eq([menu.track, cc().getAttribute('aria-checked')], ['Off', 'false'], 'and off again');
  T.eq(menu.path, [], 'the player\'s menu back at its root');
});

T.runAsync('OK held down (key repeat) toggles the captions once, not once per repeat', async () => {
  const t = await boot();
  const menu = realMenu(t.win);
  t.key('ArrowDown');
  t.key('ArrowRight');
  t.key('Enter');
  await T.sleep(150);
  for (let i = 0; i < 2; i += 1) t.key('ArrowDown');
  for (let i = 0; i < 5; i += 1) t.key('Enter', { repeat: i > 0 });
  await T.sleep(1200);
  T.eq(menu.track, 'English CC', 'on, and left on: the repeats arrived while the player was still answering');
  t.key('Enter');
  await T.sleep(800);
  T.eq(menu.track, 'Off', 'a fresh press afterwards works');
});

T.runAsync('Caption Style goes straight to the player\'s Customize, and ◀ comes straight back (C3)', async () => {
  const t = await boot();
  const menu = realMenu(t.win);
  t.key('ArrowDown');
  t.key('ArrowRight');
  t.key('Enter');
  await T.sleep(150);
  const panel = t.win.document.querySelector('.tenfoot-settings');
  const title = () => panel.querySelector('.tenfoot-settings-title').textContent;
  const labels = () => [...panel.querySelectorAll('.tenfoot-settings-label')].map((r) => r.textContent);
  for (let i = 0; i < 3; i += 1) t.key('ArrowDown');
  T.eq(panel.querySelector('[data-tenfoot-current="true"] .tenfoot-settings-label').textContent, 'Caption Style');
  t.key('Enter');
  await T.sleep(700);
  T.eq(title(), 'Caption Style');
  T.eq(labels(), ['Font', 'Background', 'Window', 'Reset all']);
  t.key('ArrowLeft');
  await T.sleep(700);
  T.eq(title(), 'Playback Settings', 'one ◀, all the way back');
  T.eq([menu.backs, menu.path], [2, []], 'the player\'s own Back, twice');
});
// ---------------------------------------------------------------------------
// the title and the bar on pause (P1–P3)
// ---------------------------------------------------------------------------

const GC = { ok: true, series: 'Game Changer', season: 9, episode: 3, title: 'Whodunnit' };
const titleOf = (win) => {
  const osd = win.document.querySelector('.tenfoot-osd');
  return osd && !osd.hidden ? [...osd.children].filter((c) => !c.hidden).map((c) => c.textContent) : null;
};

T.runAsync('the title: the show, then "S9 · E3 · Whodunnit", for four seconds when a video starts (P1, P2)', async () => {
  const { cmd, win, bg } = await boot({ pageInfo: GC });
  T.ok(bg.some((m) => m.type === 'page:info'), 'the page was asked what it knows');
  T.eq(titleOf(win), null, 'nothing before playback');
  await cmd({ type: 'player:command', cmd: 'toggle' });
  await T.sleep(20);
  T.eq(titleOf(win), ['Game Changer', 'S9 · E3 · Whodunnit']);
  T.ok(win.document.querySelector('.tenfoot-transport').hidden, 'the title alone; the bar stays down');
  await T.sleep(4100);
  T.eq(titleOf(win), null, 'gone after four seconds');
  await cmd({ type: 'player:command', cmd: 'pause' });
  await cmd({ type: 'player:command', cmd: 'play' });
  await T.sleep(20);
  T.ok(win.document.querySelector('.tenfoot-transport').hidden, 'playing again is not a start');
});

T.runAsync('the title without the page\'s answer: the player\'s own title alone', async () => {
  const { cmd, win } = await boot();
  await cmd({ type: 'player:command', cmd: 'toggle' });
  await T.sleep(20);
  T.eq(titleOf(win), ['Fixture episode']);
});

T.runAsync('a pause brings up the title and the bar for a moment, and the keys stay playback\'s (P2, P3)', async () => {
  const { key, win, st } = await boot({ pageInfo: GC });
  const bar = () => win.document.querySelector('.tenfoot-transport');
  key('Enter');
  await T.sleep(20);
  key('Enter');
  await T.sleep(20);
  T.ok(st.paused, 'paused by the viewer');
  T.notOk(bar().hidden, 'the bar is up');
  T.eq(bar().dataset.tenfootPeek, 'true', 'only peeking');
  T.notOk(bar().querySelector('[data-tenfoot-current]'), 'no button selected');
  T.eq(titleOf(win), ['Game Changer', 'S9 · E3 · Whodunnit'], 'with the title');
  st.currentTime = 30;
  key('ArrowRight');
  T.eq(st.currentTime, 40, '▶ still skips');
  T.ok(bar().dataset.tenfootPeek === 'true', 'and the bar is still only peeking');
  key('ArrowDown');
  T.notOk(bar().dataset.tenfootPeek, '▼ takes you into it');
  T.eq(bar().querySelector('[data-tenfoot-current="true"]').dataset.tenfootTc, 'playpause');
  key('ArrowUp');
  T.ok(bar().hidden, '▲ closes it, title and all');
  T.eq(titleOf(win), null);
});

T.runAsync('a pause keeps the bar and the title up until the video plays again', async () => {
  const { key, win } = await boot({ pageInfo: GC });
  const bar = () => win.document.querySelector('.tenfoot-transport');
  key('Enter'); await T.sleep(20);
  key('Enter'); await T.sleep(20);
  T.notOk(bar().hidden);
  await T.sleep(4100);
  T.notOk(bar().hidden, 'still up after four seconds: still paused');
  T.ok(titleOf(win) !== null, 'and the title with it');
  key('Enter'); await T.sleep(20);
  T.ok(bar().hidden, 'OK plays, and the bar goes');
  T.eq(titleOf(win), null);
});

T.runAsync('Back on a paused video: the bar and the title go at once', async () => {
  const { key, win } = await boot({ pageInfo: GC });
  const bar = () => win.document.querySelector('.tenfoot-transport');
  key('Enter'); await T.sleep(20);
  key('Enter'); await T.sleep(20);
  T.notOk(bar().hidden);
  key('Escape'); await T.sleep(20);
  T.ok(bar().hidden);
  T.eq(titleOf(win), null);
});

T.runAsync('the bar opened over a playing video closes three seconds after the last key; paused, it stays', async () => {
  const { key, win, cmd } = await boot({ pageInfo: GC });
  await cmd({ type: 'player:command', cmd: 'toggle' });
  await T.sleep(20);
  const bar = () => win.document.querySelector('.tenfoot-transport');
  key('ArrowDown'); await T.sleep(20);
  T.notOk(bar().hidden, 'open');
  await T.sleep(2000);
  key('ArrowRight'); // a key starts the count again
  await T.sleep(2000);
  T.notOk(bar().hidden, 'two seconds after the last key: still open');
  await T.sleep(1200);
  T.ok(bar().hidden, 'three seconds without a key: closed');
  key('ArrowDown'); await T.sleep(20);
  key('Enter'); await T.sleep(20); // OK on the play button: pause
  await T.sleep(3300);
  T.notOk(bar().hidden, 'paused: the bar stays');
});

T.runAsync('a skip shows ⏪ / ⏩ and the new time, and the bar, until a second after the last one (F1)', async () => {
  const { key, win, st, cmd } = await boot({ pageInfo: GC });
  await cmd({ type: 'player:command', cmd: 'toggle' });
  await T.sleep(20);
  const seek = () => win.document.querySelector('.tenfoot-seek');
  const bar = () => win.document.querySelector('.tenfoot-transport');
  T.ok(seek().hidden, 'nothing before a skip');
  key('ArrowRight');
  T.notOk(seek().hidden);
  T.eq([seek().dataset.tenfootDir, seek().querySelector('.tenfoot-seek-time').textContent], ['forward', '0:10']);
  T.eq(bar().dataset.tenfootPeek, 'true', 'the bar peeks with it');
  // Quick presses: never a frame without them.
  for (let i = 0; i < 6; i += 1) {
    await T.sleep(250);
    key('ArrowLeft');
    T.ok(!seek().hidden && !bar().hidden, `still up after press ${i + 2}`);
  }
  T.eq([seek().dataset.tenfootDir, seek().querySelector('.tenfoot-seek-time').textContent], ['rewind', '0:00']);
  T.eq(st.currentTime, 0);
  await T.sleep(1100);
  T.ok(seek().hidden && bar().hidden, 'a second after the last skip, both go');
  key('ArrowDown');
  key('ArrowRight');
  T.ok(seek().hidden, 'with the bar open, ◀ ▶ walk it: no skip');
});

T.runAsync('a skip on a paused video: the skip shows for a second, the bar stays with the pause', async () => {
  const { key, win, cmd } = await boot({ pageInfo: GC });
  key('Enter'); await T.sleep(20);
  key('Enter'); await T.sleep(20);
  key('ArrowRight');
  await T.sleep(1300);
  T.notOk(win.document.querySelector('.tenfoot-transport').hidden, 'still up after a second: the pause showing');
  T.ok(win.document.querySelector('.tenfoot-seek').hidden, 'the skip itself has gone');
  await cmd({ type: 'player:command', cmd: 'seek', by: 30 });
  T.notOk(win.document.querySelector('.tenfoot-seek').hidden, 'a skip from the page (a media key) shows too');
});

// ---------------------------------------------------------------------------
// the up-next card (P5)
// ---------------------------------------------------------------------------

const EP2 = 'https://watch.dropout.tv/game-changer/season:1/videos/ep2';
const UP = { url: EP2, title: 'E2, S1 - Game Changer', thumbnail_url: 'https://vhx.imgix.net/next.jpg', offset_seconds: 8 };

// Dropout's own card, as captured (2026-09-26): Hide comes first, then the
// link that plays the next episode.
function dropoutCard(win) {
  const app = win.document.getElementById('app');
  app.insertAdjacentHTML('beforeend', '<div class="ott-up-next"><div class="ott-up-next-container"><div class="ott-up-next-header"><span class="ott-up-next-label">Next Up</span><button class="ott-up-next-hide">Hide</button></div><div class="ott-up-next-content"><a class="ott-up-next-thumb-link" href="#next"><div class="ott-up-next-thumb"></div><h3 class="ott-up-next-title">E2, S1 - Game Changer</h3></a></div></div></div>');
  const card = app.querySelector('.ott-up-next');
  const clicks = [];
  for (const el of [card, card.querySelector('button'), card.querySelector('a')]) el.getClientRects = () => [{ width: 300, height: 100 }];
  card.querySelector('button').addEventListener('click', () => clicks.push('hide'));
  card.querySelector('a').addEventListener('click', (e) => { e.preventDefault(); clicks.push('play'); });
  return { card, clicks };
}

const cardOf = (win) => win.document.querySelector('.tenfoot-upnext');
const at = async (p, t) => { p.st.currentTime = t; p.video.dispatchEvent(new p.win.Event('timeupdate')); await T.sleep(10); };

T.runAsync('the up-next card: from eight seconds before the end, the next episode, counting down (P5)', async () => {
  const p = await boot({ upNext: UP });
  await p.cmd({ type: 'player:command', cmd: 'toggle' });
  await at(p, 40);
  T.ok(cardOf(p.win).hidden, 'not before');
  await at(p, 52.5);
  const c = cardOf(p.win);
  T.notOk(c.hidden, 'eight seconds before the end');
  T.eq([...c.querySelectorAll('.tenfoot-upnext-label, .tenfoot-upnext-line, .tenfoot-upnext-show')].map((e) => e.textContent), ['Up next · 0:08', 'S1 · E2', 'Game Changer']);
  T.eq(c.querySelector('.tenfoot-upnext-img').getAttribute('src'), 'https://vhx.imgix.net/next.jpg');
  const ring = () => Number(c.querySelector('.tenfoot-upnext-ring-fill').getAttribute('stroke-dashoffset'));
  const early = ring();
  await at(p, 57);
  T.eq(c.querySelector('.tenfoot-upnext-label').textContent, 'Up next · 0:03');
  T.ok(ring() > early, 'the ring runs down');
  await T.sleep(20);
  T.ok(p.last('player:state').state.upNextShowing, 'the page is told (its hints say what OK does)');
  T.eq(p.last('player:state').state.upNextCard, true, 'and that it is Leanback\'s card, which ◀ hides');
});

T.runAsync('OK on the card plays the next episode now: Dropout\'s play link, never its Hide', async () => {
  const p = await boot({ upNext: UP });
  await p.cmd({ type: 'player:command', cmd: 'toggle' });
  const { clicks } = dropoutCard(p.win);
  await at(p, 55);
  p.key('Enter');
  T.eq(clicks, ['play'], 'the play link, though Hide comes first on Dropout\'s card');
  T.eq(p.st.paused, false, 'and playback was not toggled');
});

T.runAsync('◀ hides the card for this episode, and then nothing plays by itself at the end', async () => {
  const p = await boot({ upNext: UP });
  await p.cmd({ type: 'player:command', cmd: 'toggle' });
  const { clicks } = dropoutCard(p.win);
  await at(p, 55);
  T.notOk(cardOf(p.win).hidden);
  p.key('ArrowLeft');
  T.ok(cardOf(p.win).hidden, 'gone');
  T.eq(clicks, ['hide'], 'Dropout\'s own card told too');
  T.eq(p.st.currentTime, 55, 'that ◀ was not a skip');
  await at(p, 56);
  T.ok(cardOf(p.win).hidden, 'and stays gone');
  p.key('ArrowLeft');
  T.eq(p.st.currentTime, 46, 'the next ◀ skips as usual');
  p.key('Enter');
  T.eq(p.st.paused, true, 'OK is play/pause again');
  p.st.currentTime = 60;
  p.st.ended = true;
  p.video.dispatchEvent(new p.win.Event('ended'));
  await T.sleep(10);
  T.eq(p.last('player:ended').dismissed, true, 'the page hears it was hidden, and plays nothing next');
});

T.runAsync('with "Play next episode" off the card counts nothing down, and Dropout\'s card is told to stand down', async () => {
  const p = await boot({ upNext: UP, settings: { autoplayNext: false } });
  await p.cmd({ type: 'player:command', cmd: 'toggle' });
  const { clicks } = dropoutCard(p.win);
  await at(p, 55);
  T.eq(cardOf(p.win).querySelector('.tenfoot-upnext-label').textContent, 'Up next');
  T.eq(cardOf(p.win).dataset.tenfootCounting, 'false');
  T.eq(clicks, ['hide'], 'Dropout\'s own countdown stopped, once');
  await at(p, 56);
  T.eq(clicks, ['hide']);
  p.key('Enter');
  T.eq(clicks, ['hide', 'play'], 'OK still plays the next episode');
});

T.runAsync('Dropout\'s own card is kept off screen; skipping back before the last eight seconds takes the card away', async () => {
  const p = await boot({ upNext: UP });
  await p.cmd({ type: 'player:command', cmd: 'toggle' });
  const { card } = dropoutCard(p.win);
  await T.sleep(200);
  T.ok(card.hasAttribute('data-tenfoot-bar'), 'Dropout\'s card: invisible, still working');
  card.remove();
  await at(p, 55);
  T.notOk(cardOf(p.win).hidden);
  await p.cmd({ type: 'player:command', cmd: 'seek', by: -30 });
  p.video.dispatchEvent(new p.win.Event('seeked'));
  await T.sleep(10);
  T.ok(cardOf(p.win).hidden, 'back before the last eight seconds: gone');
  await at(p, 58);
  T.notOk(cardOf(p.win).hidden, 'and back again near the end');
});

T.runAsync('the settings panel\'s own pause brings up nothing extra', async () => {
  const { key, win, cmd } = await boot({ pageInfo: GC });
  await cmd({ type: 'player:command', cmd: 'toggle' });
  key('ContextMenu');
  await T.sleep(400);
  T.notOk(win.document.querySelector('.tenfoot-transport').dataset.tenfootPeek, 'the panel holds the picture: not a pause to show');
});

// ---------------------------------------------------------------------------
// watch history
// ---------------------------------------------------------------------------

T.runAsync('watch history: pause, seek and the end report where the video is; playing reports every 15 s, not every tick', async () => {
  const { cmd, win, video, st, bg } = await boot({ duration: 1500 });
  const reports = () => bg.filter((m) => m.type === 'history:progress');
  await cmd({ type: 'player:command', cmd: 'toggle' });
  st.currentTime = 300;
  video.dispatchEvent(new win.Event('timeupdate'));
  T.eq(reports().length, 0, 'the first report waits 15 s');
  await cmd({ type: 'player:command', cmd: 'toggle' });
  T.eq(reports().at(-1), { type: 'history:progress', key: 'ep1', url: 'https://watch.dropout.tv/game-changer/season:1/videos/ep1', title: 'Fixture episode', position: 300, duration: 1500, ended: false, next: { url: 'https://watch.dropout.tv/game-changer/season:1/videos/ep2', title: 'Ep 2' } }, 'with the episode Dropout plays next');
  st.currentTime = 900;
  video.dispatchEvent(new win.Event('seeked'));
  T.eq(reports().at(-1).position, 900);
  st.currentTime = 1500;
  st.ended = true;
  video.dispatchEvent(new win.Event('ended'));
  T.eq(reports().at(-1).ended, true);
  win.dispatchEvent(new win.Event('blur'));
  T.eq(reports().length, 4, 'and when the focus leaves the frame (the first Back)');
});

T.runAsync('watch history: a trailer is never recorded or resumed', async () => {
  const { cmd, bg, st } = await boot({ duration: 1500, trailer: true, progress: { entries: { ep1: { url: 'https://watch.dropout.tv/videos/ep1', duration: 1500, local: { position: 700, at: 1 } } } } });
  await T.sleep(30);
  await cmd({ type: 'player:command', cmd: 'toggle' });
  await cmd({ type: 'player:command', cmd: 'toggle' });
  T.notOk(bg.some((m) => m.type === 'history:progress'));
  T.eq(st.currentTime, 0);
});

T.runAsync('resume: an episode left halfway picks up there and says so once; Start Over is the details page\'s, not the panel\'s', async () => {
  const progress = { entries: { ep1: { url: 'https://watch.dropout.tv/videos/ep1', duration: 1500, local: { position: 724, at: Date.now() - 1000 } } } };
  const { key, win, st, video, bg, last, cmd } = await boot({ duration: 1500, progress });
  await T.sleep(30);
  T.eq(st.currentTime, 724, 'picked up where it was left');
  T.eq(last('player:resumed').at, 724);
  T.eq([st.paused, st.muted], [true, false], 'playing and sound left alone');
  // The player puts itself back to 0 when it starts: go there again, once.
  st.currentTime = 0;
  await cmd({ type: 'player:command', cmd: 'toggle' });
  T.eq(st.currentTime, 724);
  T.eq(bg.filter((m) => m.type === 'player:resumed').length, 1, 'the notice is sent once');
  T.eq((await cmd({ type: 'player:command', cmd: 'state' })).state.resumed, true);
  key('ArrowDown');
  key('ArrowRight');
  key('Enter');
  await T.sleep(120);
  const panel = win.document.querySelector('.tenfoot-settings');
  const rows = [...panel.querySelectorAll('.tenfoot-settings-label')].map((r) => r.textContent);
  T.notOk(rows.includes('Start Over'), rows.join(' | '));
});

T.runAsync('resume: nothing to pick up — a finished or barely started episode starts from the top, with no Start Over', async () => {
  for (const position of [1480, 30]) {
    const progress = { entries: { ep1: { url: 'https://watch.dropout.tv/videos/ep1', duration: 1500, local: { position, at: 1 } } } };
    const { st, bg, key, win } = await boot({ duration: 1500, progress });
    await T.sleep(30);
    T.eq(st.currentTime, 0, `left at ${position}`);
    T.notOk(bg.some((m) => m.type === 'player:resumed'));
    key('ArrowDown');
    key('ArrowRight');
    key('Enter');
    await T.sleep(120);
    const rows = [...win.document.querySelectorAll('.tenfoot-settings-label')].map((r) => r.textContent);
    T.notOk(rows.includes('Start Over'), rows.join(' | '));
  }
});

// The details page (D1): the page draws an episode's details over Dropout's
// page, and the player underneath is held until Watch.
const HOLDING = { ok: true, hold: true, title: 'Episode', series: 'Game Changer', season: 9, episode: 3 };

T.runAsync('the details page holds the video: Dropout\'s autoplay is taken straight back, with no title and no bar', async () => {
  const { video, st, cmd, win } = await boot({ pageInfo: HOLDING });
  await T.sleep(20);
  video.play();
  T.eq(st.paused, true, 'held');
  T.eq((await cmd({ type: 'player:command', cmd: 'state' })).state.held, true);
  T.ok(win.document.querySelector('.tenfoot-transport') === null || win.document.querySelector('.tenfoot-transport').hidden, 'no bar peeking over the held video');
});

T.runAsync('Watch: the page lets it go and it plays; the remote\'s press lets the sound come on', async () => {
  const { st, cmd } = await boot({ pageInfo: HOLDING, muted: true });
  await T.sleep(20);
  const r = await cmd({ type: 'player:hold', on: false, play: true, gesture: true });
  T.eq([r.ok, r.state.held, st.paused, st.plays], [true, false, false, 1]);
  await T.sleep(150);
  T.eq(st.muted, false, 'the sound on, the press being the viewer\'s');
});

T.runAsync('Watch where Firefox still refuses the sound: it plays muted, and the next press unmutes it', async () => {
  const { st, cmd, key, win } = await boot({ pageInfo: HOLDING, muted: true, autoplayBlocked: true });
  await T.sleep(20);
  await cmd({ type: 'player:hold', on: false, play: true, gesture: true });
  await T.sleep(400);
  T.eq([st.paused, st.muted], [false, true], 'still playing, muted');
  win.__allowUnmute = true;
  key('ArrowRight');
  await T.sleep(150);
  T.eq([st.paused, st.muted], [false, false]);
});

T.runAsync('Back to the details page: the video stops where it is, without the pause\'s title and bar, and the row closes', async () => {
  const { st, cmd, key, win } = await boot({ pageInfo: HOLDING });
  await T.sleep(20);
  await cmd({ type: 'player:hold', on: false, play: true });
  key('ArrowDown');
  T.eq((await cmd({ type: 'player:command', cmd: 'state' })).state.transport, true);
  st.currentTime = 33;
  const r = await cmd({ type: 'player:hold', on: true });
  T.eq([r.state.held, r.state.paused, r.state.transport, st.currentTime], [true, true, false, 33]);
  const bar = win.document.querySelector('.tenfoot-transport');
  T.ok(!bar || bar.hidden || bar.dataset.tenfootPeek !== 'true', 'no pause peek');
});

T.runAsync('Start Over on the details page: from the beginning, even with a point to pick up from', async () => {
  const progress = { entries: { ep1: { url: 'https://watch.dropout.tv/videos/ep1', duration: 1500, local: { position: 724, at: Date.now() - 1000 } } } };
  const { st, cmd, video, win } = await boot({ duration: 1500, progress, pageInfo: HOLDING });
  await T.sleep(30);
  T.eq(st.currentTime, 724, 'the resume point is applied while held, ready for Resume');
  const r = await cmd({ type: 'player:hold', on: false, play: true, restart: true });
  T.eq([st.currentTime, st.paused, r.state.resumed], [0, false, false]);
  video.dispatchEvent(new win.Event('playing'));
  T.eq(st.currentTime, 0, 'and it sticks');
});

T.runAsync('until the page answers, a start is held back; a page that does not hold lets it go on', async () => {
  const { video, st, cmd } = await boot({ pageInfo: { ok: false, error: 'Could not establish connection. Receiving end does not exist.' } });
  video.play();
  T.eq(st.paused, true, 'not known yet: held, so nothing is heard first');
  await cmd({ type: 'player:hold', on: false });
  T.eq(st.paused, false, 'the start that was held back goes on');
  const q = await boot();
  q.video.play();
  T.eq(q.st.paused, false, 'not an episode page (a trailer): nothing held');
});

T.runAsync('the page\'s own word on the hold stands over a late answer to page:info', async () => {
  const { st, cmd, bg } = await boot({ pageInfo: { ok: false, error: 'No reply' } });
  await cmd({ type: 'player:hold', on: false, play: true });
  T.eq(st.paused, false);
  await T.sleep(600);
  T.eq(st.paused, false, 'no later answer held it again');
  T.ok(bg.filter((m) => m.type === 'page:info').length >= 1);
});

T.runAsync('with Leanback off nothing is held', async () => {
  const { video, st } = await boot({ pageInfo: HOLDING, settings: { enabled: false } });
  await T.sleep(20);
  video.play();
  T.eq(st.paused, false);
});

T.runAsync('one press of OK is one: a held OK, or the press of Watch arriving here too, does not pause what Watch started', async () => {
  const { st, cmd, key, win } = await boot({ pageInfo: HOLDING });
  await T.sleep(20);
  win.dispatchEvent(new win.Event('focus')); // the page hands the keys over
  await cmd({ type: 'player:hold', on: false, play: true, gesture: true });
  T.eq(st.paused, false);
  T.ok(key('Enter').defaultPrevented, 'the same press, right after the keys came: taken, and nothing done');
  T.eq(st.paused, false);
  await T.sleep(450);
  T.ok(key('Enter', { repeat: true }).defaultPrevented, 'a held button: taken, and nothing done');
  T.eq(st.paused, false);
  key('Enter');
  T.eq(st.paused, true, 'a new press pauses');
});

T.runAsync('the player stopping a start the page asked for: started again; a pause of the viewer\'s stays', async () => {
  const { st, cmd, video, key } = await boot({ pageInfo: HOLDING });
  await T.sleep(20);
  await cmd({ type: 'player:hold', on: false, play: true });
  T.eq([st.paused, st.plays], [false, 1]);
  video.pause(); // Dropout's player, not the viewer
  await T.sleep(400);
  T.eq([st.paused, st.plays], [false, 2], 'started again');
  key('MediaPlayPause');
  T.eq(st.paused, true, 'the viewer pauses');
  await T.sleep(400);
  T.eq(st.paused, true, 'and it stays paused');
});

T.runAsync('Firefox refusing the start with the sound on: it starts muted, and the next press brings the sound', async () => {
  const { st, cmd, key, win } = await boot({ pageInfo: HOLDING, autoplayBlocked: true });
  await T.sleep(20);
  T.eq(st.muted, false);
  await cmd({ type: 'player:hold', on: false, play: true });
  await T.sleep(20);
  T.eq([st.paused, st.muted], [false, true], 'playing, muted');
  win.__allowUnmute = true;
  key('ArrowRight');
  await T.sleep(150);
  T.eq([st.paused, st.muted], [false, false]);
});

T.runAsync('the page\'s words are numbered: a late one does not undo a newer one', async () => {
  const { st, cmd } = await boot({ pageInfo: HOLDING });
  await T.sleep(20);
  await cmd({ type: 'player:hold', on: false, play: true, seq: 2 });
  T.eq(st.paused, false);
  const r = await cmd({ type: 'player:hold', on: true, seq: 1 });
  T.eq([r.state.held, st.paused], [false, false], 'the older word, arriving late, is ignored');
  await cmd({ type: 'player:hold', on: true, seq: 3 });
  T.eq(st.paused, true);
});

await T.exit();
