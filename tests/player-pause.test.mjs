// content/player.js: the title and the bar on pause and skip, and Leanback's up-next card.
import { T } from '../../firefox-tools/harness/lib.mjs';
import { boot, GC, titleOf, UP, dropoutCard, cardOf, at } from './player-support.mjs';

T.runAsync('the title: the show, then "S9 · E3 · Whodunnit", for four seconds when a video starts', async () => {
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

T.runAsync('a pause brings up the title and the bar for a moment, and the keys stay playback\'s', async () => {
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

T.runAsync('a skip shows ⏪ / ⏩ and the new time, and the bar, until a second after the last one', async () => {
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

T.runAsync('the up-next card: from eight seconds before the end, the next episode, counting down', async () => {
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

await T.exit();
