// content/player.js: the keys in the player, Dropout's up-next overlay, what the frame tells the page, and turning Leanback off.
import { T } from '../../firefox-tools/harness/lib.mjs';
import { html, FILES, boot, at } from './player-support.mjs';

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

T.runAsync('the next episode can be started early without any keyboard', async () => {
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

T.runAsync('OK on a finished video starts the next one even when no overlay is found', async () => {
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

T.runAsync('only the visible up-next overlay counts — the site renders several', async () => {
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

T.runAsync('the page can tell the frame the offer is showing, when the page renders it', async () => {
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

T.runAsync('no message is sent from a frame that is going away', async () => {
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

await T.exit();
