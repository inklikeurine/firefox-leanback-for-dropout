// lib/history.js: the watch-history store — keys, the watched/in-progress
// thresholds, merging Leanback's own readings with Dropout's progress bars,
// Continue Watching order, resume points, and the size cap.
import { T, loadScript, makeBrowserShim } from '../../firefox-tools/harness/lib.mjs';

const ctx = loadScript(T.extFile('lib/history.js'), {});
const H = ctx.TenfootHistory;
const NOW = 1_800_000_000_000;
const empty = () => H.normalize(null);

T.run('keyOf: the slug after /videos/, whatever the address looks like', () => {
  T.eq(H.keyOf('https://watch.dropout.tv/game-changer/season:1/videos/lie-detector-1'), 'lie-detector-1');
  T.eq(H.keyOf('https://watch.dropout.tv/videos/lie-detector-1'), 'lie-detector-1');
  T.eq(H.keyOf('/videos/Street-Sharts/'), 'street-sharts');
  T.eq(H.keyOf('https://watch.dropout.tv/game-changer'), null, 'a show is not a video');
  T.eq(H.keyOf(''), null);
  T.eq(H.keyOf(null), null);
  T.eq(H.keyOf('/videos/a b'), null, 'nothing odd gets in as a key');
});

T.run('normalize: garbage in storage becomes an empty store; bad fields are dropped', () => {
  T.eq(H.normalize(null), { entries: {} });
  T.eq(H.normalize('nope'), { entries: {} });
  T.eq(H.normalize({ entries: [] }), { entries: {} });
  const s = H.normalize({ entries: {
    ok: { url: 'https://watch.dropout.tv/videos/ok', title: '  A  title ', duration: 100, local: { position: 50, at: 5 }, image: 'http://insecure.test/x.jpg' },
    'Bad Key': { title: 'x' },
    bad: { local: { position: -3, at: 5 }, dropout: { percent: 140, at: 1 } }
  } });
  T.eq(Object.keys(s.entries).sort(), ['bad', 'ok']);
  T.eq(s.entries.ok.title, 'A title');
  T.eq(s.entries.ok.image, undefined, 'only https pictures');
  T.eq(s.entries.bad, { key: 'bad' });
});

T.run('status: watched at 95 % or under 90 s left; started after a minute', () => {
  const e = (position, duration) => ({ key: 'k', duration, local: { position, at: 1 } });
  T.eq(H.status(e(30, 1500)), 'unstarted', 'half a minute is not started');
  T.eq(H.status(e(61, 1500)), 'in-progress');
  T.eq(H.status(e(1400, 1500)), 'in-progress', '100 s left');
  T.eq(H.status(e(1411, 1500)), 'watched', 'the credits');
  T.eq(H.status(e(1425, 3000 * 10)), 'in-progress');
  T.eq(H.status(e(28500, 30000)), 'watched', '95 %');
  T.eq(H.status({ key: 'k' }), 'unstarted');
  T.eq(H.status({ key: 'k', dropout: { percent: 40, at: 1 } }), 'in-progress', "Dropout's bar with no known length");
  T.eq(H.status({ key: 'k', dropout: { percent: 100, at: 1 } }), 'watched');
});

T.run('applyProgress: records Leanback’s reading; a near-zero report never wipes a saved one', () => {
  let s = H.applyProgress(empty(), { key: 'ep1', url: 'https://watch.dropout.tv/videos/ep1', title: 'Ep 1', position: 300, duration: 1500 }, NOW);
  T.eq(s.entries.ep1.local, { position: 300, at: NOW });
  T.eq([s.entries.ep1.duration, s.entries.ep1.title], [1500, 'Ep 1']);
  const same = H.applyProgress(s, { key: 'ep1', position: 0, duration: 1500 }, NOW + 5);
  T.eq(same.entries.ep1.local.position, 300, 'the player says 0 while it loads');
  s = H.applyProgress(s, { key: 'ep1', position: 12, duration: 1500, ended: true }, NOW + 9);
  T.eq(s.entries.ep1.local.position, 1500, 'ended = the whole video');
  T.eq(H.status(s.entries.ep1), 'watched');
  T.eq(H.applyProgress(s, { key: 'ep1', position: 'x', duration: 1500 }, NOW), s, 'nonsense changes nothing');
  T.eq(H.applyProgress(s, { url: 'https://watch.dropout.tv/game-changer', position: 5, duration: 9 }, NOW), s, 'no key, no entry');
});

T.run('applyMeta: the episode page fills in address, title, show and picture', () => {
  const s = H.applyMeta(empty(), { url: 'https://watch.dropout.tv/game-changer/season:1/videos/ep1', title: 'Lie Detector', series: 'Game Changer', image: 'https://vhx.imgix.net/a.jpg' });
  T.eq(s.entries.ep1, { key: 'ep1', url: 'https://watch.dropout.tv/game-changer/season:1/videos/ep1', title: 'Lie Detector', series: 'Game Changer', image: 'https://vhx.imgix.net/a.jpg' });
  T.eq(H.status(s.entries.ep1), 'unstarted', 'knowing about a video is not watching it');
});

T.run('applyObservations: Dropout’s bars are dated when first seen, and lose to Leanback’s own reading until they change', () => {
  let s = H.applyProgress(empty(), { key: 'mine', url: 'https://watch.dropout.tv/videos/mine', position: 900, duration: 1500 }, NOW - 1000);
  s = H.applyObservations(s, [
    { key: 'roku', url: 'https://watch.dropout.tv/videos/roku', percent: 30, duration: 1800, title: 'Roku show' },
    { key: 'mine', url: 'https://watch.dropout.tv/videos/mine', percent: 20, duration: 1500 }
  ], NOW);
  T.eq(s.entries.roku.dropout, { percent: 30, at: NOW });
  T.eq(s.entries.mine.dropout.at, 0, 'first sight of an old bar does not beat Leanback’s own reading');
  T.eq(H.reading(s.entries.mine).source, 'local');
  T.eq(H.applyObservations(s, [{ key: 'roku', percent: 30 }], NOW + 50), s, 'the same value changes nothing');
  const later = H.applyObservations(s, [{ key: 'mine', percent: 80 }], NOW + 60);
  T.eq(H.reading(later.entries.mine).source, 'dropout', 'a changed bar means another device played it since');
  T.eq(Math.round(H.reading(later.entries.mine).position), 1200);
});

T.run('continueWatching: one row, merged, most recent first; finished and barely started are left out', () => {
  let s = empty();
  s = H.applyProgress(s, { key: 'old', url: 'https://watch.dropout.tv/videos/old', title: 'Old', position: 600, duration: 1500 }, NOW - 5000);
  s = H.applyProgress(s, { key: 'new', url: 'https://watch.dropout.tv/videos/new', title: 'New', position: 700, duration: 1500 }, NOW - 10);
  s = H.applyProgress(s, { key: 'done', url: 'https://watch.dropout.tv/videos/done', position: 1490, duration: 1500 }, NOW);
  s = H.applyProgress(s, { key: 'peek', url: 'https://watch.dropout.tv/videos/peek', position: 20, duration: 1500 }, NOW);
  s = H.applyObservations(s, [{ key: 'roku', url: 'https://watch.dropout.tv/videos/roku', percent: 50, duration: 1200, title: 'Roku' }], NOW - 100);
  const cw = H.continueWatching(s);
  T.eq(cw.map((c) => c.key), ['new', 'roku', 'old']);
  T.eq([cw[1].source, cw[1].position, Math.round(cw[1].fraction * 100)], ['dropout', 600, 50]);
  T.eq(H.continueWatching(H.applyMeta(empty(), { key: 'x' })), [], 'no address, no card');
});

T.run('progressOf and resumePoint', () => {
  let s = H.applyProgress(empty(), { key: 'a', url: 'https://watch.dropout.tv/videos/a', position: 750, duration: 1500 }, NOW);
  T.eq(H.progressOf(s, 'a'), 0.5);
  T.eq(H.progressOf(s, 'nope'), null);
  T.eq(H.resumePoint(s, 'a'), 750);
  s = H.applyProgress(s, { key: 'a', position: 1480, duration: 1500 }, NOW + 1);
  T.eq(H.resumePoint(s, 'a'), null, 'watched: start from the top');
  T.eq(H.resumePoint(s, null), null);
});

T.run('forget: Leanback’s readings go; what was in Continue Watching stays out until something new happens', () => {
  let s = H.applyProgress(empty(), { key: 'mine', url: 'https://watch.dropout.tv/videos/mine', title: 'Mine', position: 600, duration: 1500 }, NOW - 50);
  s = H.applyMeta(s, { key: 'mine', series: 'Show', image: 'https://vhx.imgix.net/m.jpg' });
  s = H.applyObservations(s, [{ key: 'roku', url: 'https://watch.dropout.tv/videos/roku', percent: 50, duration: 1200 }], NOW - 40);
  T.eq(H.continueWatching(s).length, 2);
  s = H.forget(s, NOW);
  T.eq(Object.keys(s.entries), ['roku'], 'only Dropout’s own reading is kept');
  T.eq(s.clearedAt, NOW);
  T.eq(H.continueWatching(s), [], 'Continue Watching is empty');
  T.eq(H.resumePoint(s, 'roku'), null, 'and nothing resumes');
  T.eq(H.progressOf(s, 'roku'), 0.5, 'Dropout’s bar still shows on its card');
  T.eq(H.normalize(JSON.parse(JSON.stringify(s))).clearedAt, NOW, 'kept through storage');
  const same = H.applyObservations(s, [{ key: 'roku', percent: 50 }], NOW + 10);
  T.eq(H.continueWatching(same), [], 'the same bar seen again is still old news');
  const moved = H.applyObservations(s, [{ key: 'roku', percent: 60 }], NOW + 20);
  T.eq(H.continueWatching(moved).map((c) => c.key), ['roku'], 'the Roku played it since: back in the row');
  T.eq(moved.clearedAt, NOW, 'and the mark survives the change');
  const played = H.applyProgress(s, { key: 'new', url: 'https://watch.dropout.tv/videos/new', position: 300, duration: 1500 }, NOW + 30);
  T.eq(H.continueWatching(played).map((c) => c.key), ['new'], 'watched here since: in the row');
});

T.run('forget keeps what was watched: only unfinished videos are cleared', () => {
  let s = H.applyProgress(empty(), { key: 'done', url: 'https://watch.dropout.tv/videos/done', title: 'Done', position: 1490, duration: 1500 }, NOW - 60);
  s = H.applyProgress(s, { key: 'half', url: 'https://watch.dropout.tv/videos/half', position: 700, duration: 1500 }, NOW - 50);
  s = H.applyObservations(s, [{ key: 'roku-done', url: 'https://watch.dropout.tv/videos/roku-done', percent: 100, duration: 1200 }], NOW - 40);
  const before = JSON.parse(JSON.stringify(s.entries));
  s = H.forget(s, NOW);
  T.eq(Object.keys(s.entries).sort(), ['done', 'roku-done'], 'the unfinished one went; both watched ones stayed');
  T.eq(s.entries.done, before.done, 'a watched video is kept whole, details and all');
  T.eq(H.status(s.entries.done), 'watched');
  T.eq(H.status(s.entries['roku-done']), 'watched', 'watched on the Roku: still watched');
  T.eq(H.continueWatching(s), []);
});

T.run('forgetOne: one video unstarted again, Dropout’s bar included, until it is played again', () => {
  let s = H.applyProgress(empty(), { key: 'mine', url: 'https://watch.dropout.tv/videos/mine', title: 'Mine', position: 600, duration: 1500 }, NOW - 50);
  s = H.applyObservations(s, [{ key: 'mine', percent: 40 }], NOW - 45);
  s = H.applyProgress(s, { key: 'other', url: 'https://watch.dropout.tv/videos/other', position: 600, duration: 1500 }, NOW - 40);
  s = H.applyObservations(s, [{ key: 'done', url: 'https://watch.dropout.tv/videos/done', percent: 100, duration: 1200 }], NOW - 30);
  T.eq(H.forgetOne(s, 'nothing', NOW), s, 'an unknown video: nothing to do');
  let c = H.forgetOne(s, 'mine', NOW);
  T.eq([H.status(c.entries.mine), H.progressOf(c, 'mine'), H.resumePoint(c, 'mine')], ['unstarted', null, null]);
  T.eq(H.continueWatching(c).map((x) => x.key), ['other'], 'out of Continue Watching; the other stays');
  T.eq([c.entries.mine.title, c.entries.mine.local, c.entries.mine.dropout.percent], ['Mine', undefined, 40], 'still known by name; Dropout’s bar kept, not counted');
  T.ok(H.clearedOf(c, 'mine'));
  T.notOk(H.clearedOf(c, 'other'));
  T.notOk('clearedAt' in c, 'the rest of the history is untouched');
  T.eq(H.normalize(JSON.parse(JSON.stringify(c))).entries.mine.clearedAt, NOW, 'kept through storage');
  T.eq(H.continueWatching(H.forget(c, NOW + 5)).length, 0);
  T.eq(H.forget(c, NOW + 5).entries.mine.clearedAt, NOW, 'Clear Continue Watching keeps the mark');
  T.eq(H.applyObservations(c, [{ key: 'mine', percent: 40 }], NOW + 10), c, 'the same bar seen again is old news');
  const moved = H.applyObservations(c, [{ key: 'mine', percent: 55 }], NOW + 20);
  T.eq([H.status(moved.entries.mine), H.clearedOf(moved, 'mine')], ['in-progress', false], 'played on the Roku since: back');
  const played = H.applyProgress(c, { key: 'mine', position: 300, duration: 1500 }, NOW + 30);
  T.eq(H.resumePoint(played, 'mine'), 300, 'played here since: resumes there');
  c = H.forgetOne(s, 'done', NOW);
  T.eq([H.status(c.entries.done), H.progressOf(c, 'done')], ['unstarted', null], 'a watched one is unwatched again');
  T.eq(H.pickUp(c, null, [{ url: 'https://watch.dropout.tv/videos/done', percent: 100 }]), null, 'its bar on a show page does not count either');
});

T.run('the store is capped; the entries touched longest ago go first', () => {
  let s = empty();
  for (let i = 0; i < H.MAX_ENTRIES + 5; i++) s = H.applyProgress(s, { key: `v${i}`, position: 100, duration: 1000 }, NOW + i);
  T.eq(Object.keys(s.entries).length, H.MAX_ENTRIES);
  T.notOk(s.entries.v0, 'the oldest went');
  T.ok(s.entries[`v${H.MAX_ENTRIES + 4}`], 'the newest stayed');
});

const G = (s, n) => `https://watch.dropout.tv/game-changer/season:${s}/videos/s${s}e${n}`;

T.run('showOf, seasonOf: what an address says about the show and the season', () => {
  T.eq(H.showOf(G(2, 1)), 'game-changer');
  T.eq(H.showOf('https://watch.dropout.tv/game-changer/videos/trailer'), 'game-changer');
  T.eq(H.showOf('https://watch.dropout.tv/videos/street-sharts'), null, 'a bare /videos/ address names no show');
  T.eq(H.showOf('https://watch.dropout.tv/game-changer/season:2'), null, 'a season page is not an episode');
  T.eq(H.seasonOf(G(12, 1)), 12);
  T.eq(H.seasonOf('https://watch.dropout.tv/game-changer/season:3'), 3);
  T.eq(H.seasonOf('https://watch.dropout.tv/videos/x'), null);
  T.eq([H.showOf(null), H.seasonOf(undefined)], [null, null]);
});

T.run('the episode page\'s show, season and episode are kept; garbage is not', () => {
  let s = H.applyMeta(empty(), { url: G(2, 1), title: 'Round 4', show: 'game-changer', season: 2, episode: 1 });
  T.eq([s.entries.s2e1.show, s.entries.s2e1.season, s.entries.s2e1.episode], ['game-changer', 2, 1]);
  s = H.normalize({ entries: { x: { show: 'Bad Show!', season: 1.5, episode: -1 } } });
  T.eq(s.entries.x, { key: 'x' });
});

T.run('the episode Dropout plays next is kept with the progress, its numbers read from Dropout\'s title', () => {
  let s = H.applyProgress(empty(), { url: G(1, 1), position: 300, duration: 1000, next: { url: G(1, 2), title: 'E2, S1 - Game Changer' } }, NOW);
  T.eq(s.entries.s1e1.next, { url: G(1, 2), season: 1, episode: 2 });
  s = H.applyProgress(s, { url: G(1, 1), position: 400, duration: 1000 }, NOW + 1);
  T.eq(s.entries.s1e1.next, { url: G(1, 2), season: 1, episode: 2 }, 'a report without it keeps it');
  s = H.applyProgress(s, { url: G(1, 1), position: 500, duration: 1000, next: null }, NOW + 2);
  T.notOk(s.entries.s1e1.next, 'null: nothing follows');
  s = H.applyProgress(s, { url: G(1, 1), position: 600, duration: 1000, next: { url: 'https://watch.dropout.tv/videos/later', title: 'nothing to read' } }, NOW + 3);
  T.eq(s.entries.s1e1.next, { url: 'https://watch.dropout.tv/videos/later' }, 'no numbers to be had: just the address');
  T.eq(H.normalize(JSON.parse(JSON.stringify(s))).entries.s1e1.next, { url: 'https://watch.dropout.tv/videos/later' }, 'survives storage');
  s = H.applyProgress(s, { url: G(1, 1), position: 700, duration: 1000, next: { url: 'javascript:alert(1)' } }, NOW + 4);
  T.notOk(s.entries.s1e1.next, 'only an https video address');
});

T.run('pickUp: the most recent episode in progress, else the one after the last finished', () => {
  const ep = (s, n, extra = {}) => ({ url: G(s, n), season: s, episode: n, title: `S${s}E${n}`, percent: null, ...extra });
  const onScreen = [1, 2, 3, 4].map((n) => ep(2, n));
  const entry = (s, n, position, at, extra = {}) => [`s${s}e${n}`, { url: G(s, n), duration: 1000, local: { position, at }, ...extra }];
  const st = (...e) => ({ entries: Object.fromEntries(e) });

  T.eq(H.pickUp(st(), 'game-changer', onScreen), null, 'nothing watched: nothing to pick up (the page offers its first episode)');
  let p = H.pickUp(st(entry(2, 1, 999, 10), entry(2, 3, 400, 20)), 'game-changer', onScreen);
  T.eq(p, { action: 'resume', url: G(2, 3), season: 2, episode: 3, title: 'S2E3' }, 'partway through Episode 3');
  p = H.pickUp(st(entry(1, 5, 400, 50, { show: 'game-changer', season: 1, episode: 5 }), entry(2, 3, 400, 20)), 'game-changer', onScreen);
  T.eq([p.action, p.url, p.season, p.episode], ['resume', G(1, 5), 1, 5], 'the most recent wins, even in a season not on screen');
  p = H.pickUp({ entries: Object.fromEntries([entry(2, 3, 400, 20)]), clearedAt: 30 }, 'game-changer', onScreen);
  T.eq(p, null, 'progress from before Clear Continue Watching does not resume');

  p = H.pickUp(st(entry(2, 1, 999, 10), entry(2, 2, 999, 20)), 'game-changer', onScreen);
  T.eq([p.action, p.url, p.episode], ['next', G(2, 3), 3], 'the one after the last finished');
  p = H.pickUp(st(entry(2, 2, 999, 20), entry(2, 3, 999, 10)), 'game-changer', onScreen);
  T.eq(p.url, G(2, 4), 'past one already watched, to the next unwatched');

  const finale = entry(2, 4, 999, 40, { next: { url: G(3, 1), season: 3, episode: 1 } });
  p = H.pickUp(st(finale), 'game-changer', onScreen);
  T.eq([p.action, p.url, p.season, p.episode], ['next', G(3, 1), 3, 1], 'the last on screen: Dropout\'s up-next, into the next season');
  p = H.pickUp(st(entry(1, 5, 999, 60, { show: 'game-changer', next: { url: G(1, 6), season: 1, episode: 6 } })), 'game-changer', onScreen);
  T.eq([p.url, p.season, p.episode], [G(1, 6), 1, 6], 'finished in a season not on screen: its up-next');
  p = H.pickUp(st(entry(1, 5, 999, 60, { next: { url: G(1, 6) } }), entry(1, 6, 999, 50, { next: { url: G(1, 7), season: 1, episode: 7 } })), 'game-changer', onScreen);
  T.eq(p.url, G(1, 7), 'up-next already watched: on to the one after');
  T.eq(H.pickUp(st(entry(2, 4, 999, 40)), 'game-changer', onScreen), null, 'the last on screen and no up-next known: nothing');

  T.eq(H.pickUp(st(entry(2, 3, 400, 20)), 'another-show', []), null, 'another show\'s history is not this one\'s');
  p = H.pickUp(st(), 'game-changer', [ep(2, 1), ep(2, 2, { percent: 30 }), ep(2, 3)]);
  T.eq([p.action, p.url], ['resume', G(2, 2)], 'Dropout\'s own bar on a tile (the Roku) counts');
  p = H.pickUp(st(), 'game-changer', [ep(2, 1, { percent: 100 }), ep(2, 2, { percent: 100 }), ep(2, 3)]);
  T.eq(p.url, G(2, 3), 'and finished on the Roku: the next one');
  T.eq(H.pickUp(null, null, null), null, 'nothing to go on: no throw');
});

T.runAsync('load and watch go through a profile\'s own storage.local key, "progress:<profile>"', async () => {
  const shim = makeBrowserShim({ storage: { 'progress:0': { entries: { a: { local: { position: 5, at: 1 } } } }, 'progress:1': { entries: { z: {} } } } });
  T.eq((await H.load(shim.browser)).entries.a.local, { position: 5, at: 1 }, 'no profile: the first');
  T.eq(Object.keys((await H.load(shim.browser, 1)).entries), ['z']);
  T.eq([H.keyFor(3), H.keyFor(undefined), H.keyFor(-1), H.keyFor('x')], ['progress:3', 'progress:0', 'progress:0', 'progress:0']);
  const seen = [];
  H.watch(shim.browser, (st) => seen.push(Object.keys(st.entries)), 1);
  await shim.changeStorage({ 'progress:1': { newValue: { entries: { b: {} } } } });
  await shim.changeStorage({ 'progress:0': { newValue: { entries: { c: {} } } } });
  await shim.changeStorage({ settings: { newValue: {} } });
  T.eq(seen, [['b']], 'only its own profile');
});

await T.exit();
