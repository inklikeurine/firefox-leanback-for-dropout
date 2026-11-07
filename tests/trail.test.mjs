// nav/trail.js: keeping track of which pages of the site are behind the
// current one, so Back can follow Firefox's own history.
import { T, loadScript } from '../../firefox-tools/harness/lib.mjs';

const Tr = loadScript(T.extFile('nav/trail.js'), {}).TenfootTrail;
const B = 'https://watch.dropout.tv';
const urls = (t) => t.map((e) => e.url);
function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

T.run('same: origin and path; the query, the hash and a trailing slash do not count', () => {
  T.ok(Tr.same(`${B}/search?q=a`, `${B}/search/`));
  T.ok(Tr.same(`${B}/browse#x`, `${B}/browse`));
  T.notOk(Tr.same(`${B}/game-changer`, `${B}/game-changer/season:2`));
  T.notOk(Tr.same('nonsense', `${B}/x`));
});

T.run('arrive: a new page is pushed, a reload changes nothing, Leanback’s sideways step replaces', () => {
  let r = Tr.arrive([], `${B}/browse`, 'navigate', null);
  T.eq([urls(r.trail), r.left], [[`${B}/browse`], null]);
  r = Tr.arrive(r.trail, `${B}/game-changer`, 'navigate', null);
  T.eq(urls(r.trail), [`${B}/browse`, `${B}/game-changer`]);
  T.eq(urls(Tr.arrive(r.trail, `${B}/game-changer`, 'reload', null).trail), urls(r.trail));
  const side = Tr.arrive(r.trail, `${B}/game-changer/season:2`, 'navigate', { kind: 'replace', to: `${B}/game-changer/season:2` });
  T.eq(urls(side.trail), [`${B}/browse`, `${B}/game-changer/season:2`]);
  const odd = Tr.arrive(r.trail, `${B}/elsewhere`, 'navigate', { kind: 'replace', to: `${B}/game-changer/season:2` });
  T.eq(urls(odd.trail).at(-1), `${B}/elsewhere`, 'an intent for another page is ignored');
});

T.run('arrive: Back — by the browser or by Leanback — drops what was above and says what was left', () => {
  const t = [{ url: `${B}/browse` }, { url: `${B}/game-changer`, kind: 'series' }, { url: `${B}/videos/ep1`, kind: 'video' }];
  let r = Tr.arrive(t, `${B}/game-changer`, 'back_forward', null);
  T.eq([urls(r.trail), r.left.url], [[`${B}/browse`, `${B}/game-changer`], `${B}/videos/ep1`]);
  T.eq(r.trail[1].kind, 'series', 'the page keeps what it knew about itself');
  r = Tr.arrive(t, `${B}/browse`, 'navigate', { kind: 'back', to: `${B}/browse` });
  T.eq(urls(r.trail), [`${B}/browse`], 'several steps at once');
  r = Tr.arrive(t, `${B}/somewhere-new`, 'back_forward', null);
  T.eq(urls(r.trail).length, 4, 'a traversal to a page the trail never saw is just a new page');
});

T.run('skipSiblings: past episodes of the same show, stopping at the first page that is not one', () => {
  const t = [
    { url: `${B}/browse`, kind: 'browse' },
    { url: `${B}/gc/season:1`, kind: 'series', group: 'gc' },
    { url: `${B}/gc/season:1/videos/1`, kind: 'video', group: 'gc' },
    { url: `${B}/gc/season:1/videos/2`, kind: 'video', group: 'gc' }
  ];
  const left = { url: `${B}/gc/season:1/videos/3`, kind: 'video', group: 'gc' };
  T.eq(Tr.skipSiblings(t, left), -2, 'two episodes back to the season page');
  T.eq(Tr.skipSiblings(t.slice(0, 2), left), null, 'the season page is not a sibling of an episode');
  T.eq(Tr.skipSiblings(t, { url: 'x', kind: 'video', group: 'other-show' }), null, 'another show: stay');
  T.eq(Tr.skipSiblings(t.slice(2), left), null, 'nothing but siblings behind: stay');
  const seasons = [{ url: `${B}/browse`, kind: 'browse' }, { url: `${B}/gc/season:1`, kind: 'series', group: 'gc' }];
  T.eq(Tr.skipSiblings(seasons, { url: `${B}/gc/season:2`, kind: 'series', group: 'gc' }), -1, 'another season of the same show');
});

T.run('arrive: `from` is the page left going forward — pushed or replaced — and nothing on Back or a reload', () => {
  const ep0 = { url: `${B}/gc/season:1/videos/0`, kind: 'video', group: 'gc', play: true };
  const t = [{ url: `${B}/gc/season:1`, kind: 'series', group: 'gc' }, { url: ep0.url, kind: 'video', group: 'gc' }, ep0];
  const next = `${B}/gc/season:1/videos/1`;
  T.eq(Tr.arrive(t, next, 'navigate', { kind: 'replace', to: next }).from, ep0, 'replaced: the episode that was playing');
  T.eq(Tr.arrive(t, next, 'navigate', null).from, ep0, 'Dropout going on by itself');
  T.eq(Tr.arrive(t, ep0.url, 'reload', null).from, null);
  T.eq(Tr.arrive(t, `${B}/gc/season:1`, 'back_forward', null).from, null);
});

T.run('play: an episode playing is a step of its own above its details page, described as it is; off again, it is gone', () => {
  const t = [{ url: `${B}/gc` }, { url: `${B}/gc/videos/1`, kind: 'video', group: 'gc', parent: `${B}/gc` }];
  const on = Tr.play(t, true);
  T.eq(on[2], { url: `${B}/gc/videos/1`, kind: 'video', group: 'gc', parent: `${B}/gc`, play: true });
  T.eq(Tr.play(on, true).length, 3, 'once only');
  T.eq(Tr.play(on, false), t);
  T.eq(Tr.play(t, false), t, 'nothing to take off');
  T.eq(Tr.play([], true), []);
  T.eq(Tr.describe(on, { kind: 'video', group: 'gc' })[2].play, true, 'describing the step keeps it a step');
  T.eq(Tr.indexBelow(on, `${B}/gc/videos/1`), 1, 'its details page is below it');
  const st = memory();
  Tr.save(st, [...on, { url: `${B}/x`, play: 'yes' }]);
  T.eq(Tr.load(st).map((e) => Boolean(e.play)), [false, false, true, false], 'kept through storage; only true counts');
});

T.run('skipSiblings: an episode that was playing counts once more, so Back goes past both its entries', () => {
  const t = [
    { url: `${B}/browse`, kind: 'browse' },
    { url: `${B}/gc/season:1`, kind: 'series', group: 'gc' },
    { url: `${B}/gc/season:1/videos/1`, kind: 'video', group: 'gc' },
    { url: `${B}/gc/season:1/videos/1`, kind: 'video', group: 'gc', play: true }
  ];
  T.eq(Tr.skipSiblings(t, { url: `${B}/gc/season:1/videos/2`, kind: 'video', group: 'gc' }), -2);
});

T.run('arrive: landing by Back on an episode, the history says whether it is its step or the page', () => {
  const ep1 = `${B}/gc/season:1/videos/1`;
  const t = [{ url: `${B}/gc/season:1`, kind: 'series' }, { url: ep1, kind: 'video' }, { url: ep1, kind: 'video', play: true }, { url: `${B}/gc/season:1/videos/2`, kind: 'video' }];
  T.eq(Tr.arrive(t, ep1, 'back_forward', null, { play: true }).trail.length, 3, 'its step');
  T.eq(Tr.arrive(t, ep1, 'back_forward', null, { play: false }).trail.length, 2, 'the page under it, past the step');
  T.eq(Tr.arrive(t, ep1, 'back_forward', null).trail.length, 3, 'not said: the newest');
});

T.run('passedOver: Back from a video that started by itself landed below its details page — that page, to go forward to', () => {
  const ep = (n, play) => ({ url: `${B}/gc/season:1/videos/${n}`, kind: 'video', group: 'gc', ...(play ? { play: true } : {}) });
  const t = [{ url: `${B}/gc/season:1`, kind: 'series' }, ep(1), ep(1, true), ep(2), ep(2, true)];
  T.eq(Tr.passedOver(t, 2), 3, 'from the step of the episode before');
  T.eq(Tr.passedOver(t, 1), 3, 'from the episode before');
  T.eq(Tr.passedOver(t, 3), null, 'landed on it: nothing passed over');
  T.eq(Tr.passedOver(t.slice(0, 4), 1), null, 'left from a details page, not a video playing');
  T.eq(Tr.passedOver([ep(2, true)], 0), null);
});

T.run('describe, depth, indexBelow', () => {
  let t = [{ url: `${B}/browse` }, { url: `${B}/gc` }];
  t = Tr.describe(t, { kind: 'series', group: 'gc', parent: `${B}/browse` });
  T.eq(t[1], { url: `${B}/gc`, kind: 'series', group: 'gc', parent: `${B}/browse` });
  T.eq(Tr.describe(t, { kind: 'series', group: null })[1].group, undefined);
  T.eq([Tr.depth(t), Tr.depth([]), Tr.depth(null)], [1, 0, 0]);
  T.eq([Tr.indexBelow(t, `${B}/browse/`), Tr.indexBelow(t, `${B}/gc`)], [0, -1], 'the top is the current page, not below it');
});

T.run('storage: survives garbage, drops stale intents, caps its length', () => {
  const st = memory();
  T.eq(Tr.load(st), []);
  st.setItem(Tr.TRAIL_KEY, '{nope');
  T.eq(Tr.load(st), []);
  Tr.save(st, Array.from({ length: 80 }, (_, i) => ({ url: `${B}/p${i}` })));
  T.eq(Tr.load(st).length, 50);
  Tr.setIntent(st, 'push', `${B}/x`, 1000);
  T.eq(Tr.takeIntent(st, 1000 + 40000), null, 'too old');
  Tr.setIntent(st, 'push', `${B}/x`, 1000);
  T.eq(Tr.takeIntent(st, 2000).kind, 'push');
  T.eq(Tr.takeIntent(st, 2000), null, 'taken once');
  T.eq(Tr.load(null), [], 'no storage at all');
  Tr.save(null, []);
});

await T.exit();
