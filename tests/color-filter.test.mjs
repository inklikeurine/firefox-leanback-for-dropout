// The video's Color Filter (Accessibility, #15): Filter Strength, Color
// Boost, the filters for linear light, and each choice shown on the picture
// while choosing it in the playback panel.
import { T, makeDom, loadScripts } from '../../firefox-tools/harness/lib.mjs';
import { boot } from './player-support.mjs';

const ctx = loadScripts([T.extFile('lib/settings.js'), T.extFile('lib/themes.js')]);
const S = ctx.TenfootSettings;
const Th = ctx.TenfootThemes;
const nums = (v) => v.split(/\s+/).map(Number);

T.run('a filter for each kind at each strength; full strength is the filter as it was', () => {
  for (const kind of ['protanopia', 'deuteranopia', 'tritanopia']) {
    for (const s of [25, 50, 75, 100]) T.eq(nums(Th.FILTERS[kind][s]).length, 20, `${kind} ${s} %: a 4×5 colour matrix`);
  }
  const before = {
    protanopia: '1 0 0 0 0  0.479 0.477 0.044 0 0  0.597 -0.689 1.091 0 0  0 0 0 1 0',
    deuteranopia: '1 0 0 0 0  0.163 0.725 0.112 0 0  0.455 -0.645 1.191 0 0  0 0 0 1 0',
    tritanopia: '0.741 -0.407 0.666 0 0  0.075 0.585 0.340 0 0  0 0 1 0 0  0 0 0 1 0',
  };
  for (const [kind, v] of Object.entries(before)) {
    const a = nums(Th.FILTERS[kind][100]);
    T.ok(nums(v).every((x, i) => Math.abs(x - a[i]) < 0.002), `${kind}: full strength as before`);
  }
  const shift = (s) => nums(Th.FILTERS.protanopia[s])[5];
  T.ok(shift(25) < shift(50) && shift(50) < shift(75) && shift(75) < shift(100), 'stronger with each step');
});

T.run('Filter Strength and Color Boost: their values, full strength and no boost by default', () => {
  const d = S.normalize(null);
  T.eq([d.videoFilterStrength, d.videoColorBoost], [100, 'off']);
  const bad = S.normalize({ videoFilterStrength: 60, videoColorBoost: 'max' });
  T.eq([bad.videoFilterStrength, bad.videoColorBoost], [100, 'off']);
  T.eq(S.normalize({ videoFilterStrength: '50', videoColorBoost: 'high' }).videoFilterStrength, 50);
  for (const id of ['videoFilter', 'videoFilterStrength', 'videoColorBoost']) {
    const r = S.rowOf(id);
    T.eq([r.group, r.menu, r.look], ['Video', 'accessibility', true], `${id}: shown while choosing`);
  }
});

T.run('the frame gets the strength asked for, for linear light, with the boost after it; a boost alone is a filter of its own', () => {
  const { document } = makeDom({ clock: true });
  const root = document.documentElement;
  Th.applyPlayer(root, { ...S.normalize(null), videoFilter: 'protanopia', videoFilterStrength: 50, videoColorBoost: 'medium' });
  const f = document.getElementById('tenfoot-filter-protanopia');
  T.eq(f.getAttribute('color-interpolation-filters'), 'linearRGB');
  const steps = [...f.querySelectorAll('feColorMatrix')].map((m) => [m.getAttribute('type'), m.getAttribute('values')]);
  T.eq(steps, [['matrix', Th.FILTERS.protanopia[50]], ['saturate', '1.3']]);
  Th.applyPlayer(root, { ...S.normalize(null), videoColorBoost: 'high' });
  T.eq(root.dataset.tenfootFilter, 'boost');
  T.eq(document.querySelector('#tenfoot-filter-boost feColorMatrix').getAttribute('values'), '1.5');
  Th.applyPlayer(root, S.normalize(null));
  T.eq(root.dataset.tenfootFilter, undefined, 'off, and no boost: nothing on the video');
});

T.runAsync('in the playback panel, moving through Color Filter shows each on the picture; Back puts it back', async () => {
  const { key, win } = await boot();
  const root = win.document.documentElement;
  key('ArrowDown');
  key('ArrowRight');
  key('Enter');
  await T.sleep(120);
  const panel = win.document.querySelector('.tenfoot-settings');
  const current = () => panel.querySelector('[data-tenfoot-current="true"] .tenfoot-settings-label').textContent;
  for (let i = 0; i < 5; i += 1) key('ArrowDown');
  key('ArrowRight');
  for (let i = 0; i < 14 && current() !== 'Accessibility'; i += 1) key('ArrowDown');
  key('ArrowRight');
  for (let i = 0; i < 20 && current() !== 'Color Filter (Experimental)'; i += 1) key('ArrowDown');
  key('Enter');
  T.eq(current(), 'Off');
  key('ArrowDown');
  T.eq([current(), root.dataset.tenfootFilter], ['Red-weak (protan)', 'protanopia'], 'shown at once');
  key('Escape');
  await T.sleep(20);
  T.eq(root.dataset.tenfootFilter, undefined, 'Back: as saved');
});
