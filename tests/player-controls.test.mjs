// content/player.js in the player's frame: registering, the transport row, the settings panel, Back.
import { T } from '../../firefox-tools/harness/lib.mjs';
import { html, boot, at } from './player-support.mjs';

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

await T.exit();
