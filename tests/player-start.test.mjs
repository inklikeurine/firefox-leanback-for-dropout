// content/player.js: the watch history, resuming, and the details page holding the video until Watch.
import { T } from '../../firefox-tools/harness/lib.mjs';
import { boot, at, HOLDING } from './player-support.mjs';

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
