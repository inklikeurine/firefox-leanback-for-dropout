// lib/settings.js — defaults on empty or corrupt storage, clamping, save/watch.
import { T, loadScript, makeBrowserShim } from '../../firefox-tools/harness/lib.mjs';

const ctx = loadScript(T.extFile('lib/settings.js'));
const S = ctx.TenfootSettings;

// Every setting as normalize() fills it in: the defaults, plus what is
// worked out rather than chosen.
const LOOKS = { home: { banner: 'large', cards: 'medium' }, lists: { cards: 'medium' }, show: { cards: 'medium' }, details: { picture: 'right' } };
const FULL = (over = {}) => ({ ...S.DEFAULTS, exitHookSet: false, development: false, pageLooks: LOOKS, ...over });

T.run('defaults match the spec', () => {
  T.eq(S.DEFAULTS, {
    enabled: true, ringColor: '#feea3b', ringWidth: 4, focusZoom: 5, hintBar: false, playerChrome: 'leanback', seekStep: 10, autoplayNext: true, startMuted: false, skipMarketingSite: true, exitHook: 'close-tab', seasonStart: 'latest',
    theme: 'dropout', holidays: 'off', uiScale: 100, highContrast: false, reduceMotion: 'system', captionSize: 'default', captionColor: 'default', captionBackground: 'default', videoFilter: 'off'
  });
  T.eq(S.SEEK_STEPS, [5, 10, 15, 30, 60, 120, 300], 'the only seek steps offered');
  T.eq(S.DEFAULTS.startMuted, false, 'videos play with sound unless the user asks otherwise');
  T.eq(S.SEASON_START, ['latest', 'first'], 'a show opens on its newest season, or its first');
});

T.run('normalize: garbage in, defaults out', () => {
  T.eq(S.normalize(null), FULL());
  T.eq(S.normalize('nope'), FULL());
  T.eq(S.normalize({ enabled: 'yes', ringColor: 'red', ringWidth: 'x', seekStep: -5, exitHook: 'quit', seasonStart: 'middle', theme: 'neon', holidays: 'birthday', uiScale: 999, pageLooks: { home: { banner: 'huge' } } }), FULL({ seekStep: 5 }), 'a nonsense seek step snaps to the nearest offered one');
});

T.run('normalize: valid values pass, numbers clamp and round, colours lower-case', () => {
  const s = S.normalize({ enabled: false, ringColor: '#ABCDEF', ringWidth: 99, focusZoom: 100, hintBar: false, playerChrome: 'leanback', seekStep: '15.6', autoplayNext: false, skipMarketingSite: false, exitHook: 'close-tab', seasonStart: 'first' });
  T.eq(s, FULL({ enabled: false, ringColor: '#abcdef', ringWidth: 12, focusZoom: 25, hintBar: false, playerChrome: 'leanback', seekStep: 15, autoplayNext: false, startMuted: false, skipMarketingSite: false, exitHook: 'close-tab', seasonStart: 'first' }));
  T.eq(S.normalize({ focusZoom: 0 }).focusZoom, 0, 'zero turns the zoom off rather than falling back to the default');
  T.eq(S.normalize({ seekStep: 250 }).seekStep, 300, 'snaps up');
  T.eq(S.normalize({ seekStep: 11 }).seekStep, 10, 'and down');
  T.eq(S.normalize({ ringWidth: 1 }).ringWidth, 2);
  T.eq(S.normalize({ focusZoom: -4 }).focusZoom, 0);
  T.eq(S.normalize({ seekStep: 1000 }).seekStep, 300);
  T.eq(S.normalize({ ringColor: '#fff' }).ringColor, '#feea3b', 'short hex is rejected');
  T.eq(['#ffffff', '#ff4081', '#41d6c3', '#ff8a3d'].map((c) => S.normalize({ ringColor: c }).ringColor), ['#f2f2f2', '#ff9eb5', '#8fe3b6', '#ffb38a'], 'an old ring colour moves to its nearest Theme Color');
  T.eq(S.normalize({ pageLooks: { home: { banner: 'off' }, details: { picture: 'left' } } }).pageLooks, { ...LOOKS, home: { banner: 'off', cards: 'medium' }, details: { picture: 'left' } });
});

T.run('Back On Home: until it is picked, nothing on a copy loaded from its folder, closing the tab on the signed one', () => {
  T.eq(S.normalize({}).exitHook, 'close-tab', 'signed');
  T.eq(S.normalize({ development: true }).exitHook, 'none', 'from its folder');
  T.eq(S.normalize({ exitHook: 'none' }).exitHook, 'close-tab', 'a value nobody picked follows the default');
  T.eq(S.normalize({ exitHook: 'none', exitHookSet: true }).exitHook, 'none', 'a picked one stays');
  T.eq(S.normalize({ development: true, exitHook: 'close-tab', exitHookSet: true }).exitHook, 'close-tab');
});

T.runAsync('save: picking Back On Home marks it picked', async () => {
  const shim = makeBrowserShim({ storage: { settings: { development: true } } });
  T.eq((await S.save(shim.browser, { seekStep: 5 })).exitHook, 'none');
  const s = await S.save(shim.browser, { exitHook: 'close-tab' });
  T.eq([s.exitHook, s.exitHookSet], ['close-tab', true]);
  T.eq((await S.save(shim.browser, { development: false })).exitHook, 'close-tab', 'still the picked one');
});

T.runAsync('load: empty storage → defaults; corrupt object → normalised', async () => {
  const shim = makeBrowserShim();
  T.eq(await S.load(shim.browser), FULL());
  const shim2 = makeBrowserShim({ storage: { settings: { seekStep: 30, theater: 42 } } });
  T.eq(await S.load(shim2.browser), FULL({ seekStep: 30 }));
});

T.runAsync('load: a throwing storage falls back to defaults without throwing', async () => {
  const api = { storage: { local: { get: async () => { throw new Error('boom'); } } } };
  T.eq(await S.load(api), FULL());
});

T.runAsync('save merges a patch, normalises it and writes one object', async () => {
  const shim = makeBrowserShim();
  const s = await S.save(shim.browser, { seekStep: 5, ringColor: '#000000' });
  T.eq([s.seekStep, s.ringColor, s.enabled], [5, '#000000', true]);
  T.eq(shim.store.settings, s, 'stored under one key');
  const s2 = await S.save(shim.browser, { enabled: false });
  T.eq([s2.enabled, s2.seekStep], [false, 5], 'earlier changes kept');
});

T.runAsync('watch fires for local "settings" changes only, with a normalised object', async () => {
  const shim = makeBrowserShim();
  const seen = [];
  const stop = S.watch(shim.browser, (s) => seen.push(s));
  await shim.changeStorage({ settings: { newValue: { seekStep: 15 } } });
  await shim.changeStorage({ other: { newValue: 1 } });
  await shim.changeStorage({ settings: { newValue: { seekStep: 30 } } }, 'sync');
  T.eq(seen.length, 1);
  T.eq(seen[0].seekStep, 15);
  T.eq(seen[0].enabled, true);
  stop();
  await shim.changeStorage({ settings: { newValue: { seekStep: 60 } } });
  T.eq(seen.length, 1, 'unsubscribed');
});

T.run('the one list (C1): every setting but the on/off and troubleshooting switches, each with its words and group', () => {
  // the whole list: the one test that pins every setting, in order, and its group
  T.eq(S.ROWS.map((r) => r.id), ['autoplayNext', 'seekStep', 'startMuted', 'seasonStart', 'skipMarketingSite', 'exitHook', 'theme', 'ringColor', 'holidays', 'focusZoom', 'ringWidth', 'hintBar',
    'uiScale', 'highContrast', 'reduceMotion', 'captionSize', 'captionColor', 'captionBackground', 'videoFilter']);
  T.eq(S.ROWS.map((r) => r.group), ['Playback', 'Playback', 'Playback', 'Browsing', 'Browsing', 'Browsing', 'Look', 'Look', 'Look', 'Look', 'Look', 'Look',
    'Display', 'Display', 'Display', 'Captions', 'Captions', 'Captions', 'Video']);
  T.eq(S.ROWS.filter((r) => r.menu).map((r) => r.menu), Array(7).fill('accessibility'), 'Accessibility, a menu of its own');
  T.eq(S.rowOf('ringColor').label, 'Theme Color');
  T.eq(S.ROWS.filter((r) => r.panel === false).map((r) => r.id), ['startMuted'], 'on the options page only');
  const d = S.normalize(null);
  for (const r of S.ROWS) {
    T.ok(Object.prototype.hasOwnProperty.call(d, r.id), `${r.id} is a setting`);
    if (r.kind === 'choice') T.ok(S.choicesOf(r, d[r.id]).includes(d[r.id]), `${r.id}: its default is a choice`);
    T.ok(S.valueText(r, d[r.id]).length > 0, `${r.id}: has words for its default`);
  }
  T.notOk(S.rowOf('enabled') || S.rowOf('playerChrome'), 'on/off for Leanback and the player-controls switch are not in it');
  T.eq([S.valueText(S.rowOf('seekStep'), 30), S.valueText(S.rowOf('focusZoom'), 0), S.valueText(S.rowOf('ringColor'), '#ffffff'), S.valueText(S.rowOf('hintBar'), true)], ['30 s', 'Off', '#ffffff', 'On']);
  T.eq(S.valueText(S.rowOf('seekStep'), 300), '5 min');
  T.eq(S.valueText(S.rowOf('ringColor'), '#123456'), '#123456', 'a colour of your own reads as itself');
  T.eq(S.choicesOf(S.rowOf('ringWidth'), 5), [2, 3, 4, 5, 6, 8, 10, 12], 'a value not offered is listed, in order');
  T.eq(S.choicesOf(S.rowOf('ringColor'), '#123456').at(-1), '#123456');
});

await T.exit();
