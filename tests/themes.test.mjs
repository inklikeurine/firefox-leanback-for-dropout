// lib/themes.js: the themes, Theme Color, the holiday looks by date, the
// Accessibility look (High Contrast, Interface Size, Reduce Motion), and what
// apply() / applyPlayer() write onto a page for the stylesheets.
import { T, loadScripts, makeDom } from '../../firefox-tools/harness/lib.mjs';

const ctx = loadScripts([T.extFile('lib/settings.js'), T.extFile('lib/themes.js')]);
const S = ctx.TenfootSettings;
const Th = ctx.TenfootThemes;
const day = (m, d) => new Date(2026, m - 1, d, 12);

T.run('Holidays: Automatic follows the date; one picked shows all year; Off shows none', () => {
  T.eq(Th.holidayFor('auto', day(10, 31)).id, 'halloween');
  T.eq(Th.holidayFor('auto', day(10, 17)).id, 'halloween', 'from the 17th');
  T.eq(Th.holidayFor('auto', day(10, 16)), null);
  T.eq(Th.holidayFor('auto', day(12, 25)).id, 'winter');
  T.eq(Th.holidayFor('auto', day(1, 3)).id, 'newyear');
  T.eq(Th.holidayFor('auto', day(2, 14)).id, 'valentines');
  T.eq(Th.holidayFor('auto', day(3, 17)).id, 'stpatricks');
  T.eq(Th.holidayFor('auto', day(7, 4)), null, 'no holiday in July');
  T.eq(Th.holidayFor('valentines', day(7, 4)).id, 'valentines');
  T.eq(Th.holidayFor('off', day(10, 31)), null);
  const ids = Th.HOLIDAYS.map((h) => h.id);
  for (const v of S.ROWS.find((r) => r.id === 'holidays').values) {
    if (v !== 'off' && v !== 'auto') T.ok(ids.includes(v), `${v}: a holiday look exists for it`);
  }
});

T.run('lookOf: the theme\'s colours; Theme Color, unless a holiday\'s colour is on; High Contrast; Interface Size', () => {
  const base = S.normalize(null);
  let l = Th.lookOf(base, day(7, 4));
  T.eq([l.theme, l.accent, l.holiday, l.tokens.bg, l.scale, l.contrast], ['dropout', '#feea3b', null, '#0b0c10', 1, false]);
  for (const id of S.ROWS.find((r) => r.id === 'theme').values) T.ok(Th.THEMES[id], `${id}: a theme exists for it`);
  l = Th.lookOf({ ...base, theme: 'oled', ringColor: '#7cc6fe' }, day(7, 4));
  T.eq([l.tokens.bg, l.accent], ['#000000', '#7cc6fe']);
  l = Th.lookOf({ ...base, ringColor: '#7cc6fe', holidays: 'auto' }, day(10, 31));
  T.eq([l.holiday, l.accent], ['halloween', '#ffa94d'], 'the holiday\'s colour');
  T.ok(l.glow && l.glow.length === 2);
  l = Th.lookOf({ ...base, highContrast: true, uiScale: 130 }, day(7, 4));
  T.eq([l.tokens.bg, l.tokens.text, l.tokens.railEdge, l.scale, l.contrast], ['#000000', '#ffffff', '#ffffff', 1.3, true]);
  T.eq(Th.lookOf({ ...base, reduceMotion: 'on' }, day(7, 4)).reduceMotion, true);
  T.eq(Th.lookOf({ ...base, reduceMotion: 'off' }, day(7, 4), { matchMedia: () => ({ matches: true }) }).reduceMotion, false, 'Off: even when the system asks');
  T.eq(Th.lookOf({ ...base, reduceMotion: 'system' }, day(7, 4), { matchMedia: () => ({ matches: true }) }).reduceMotion, true, 'as the system says');
});

T.run('apply: the colours as CSS properties and the rest as attributes on <html>', () => {
  const { document } = makeDom();
  const root = document.documentElement;
  Th.apply(root, { ...S.normalize(null), theme: 'midnight', ringColor: '#b9a6ff', holidays: 'winter', highContrast: false, reduceMotion: 'on', uiScale: 115 }, day(7, 4));
  T.eq(root.style.getPropertyValue('--tenfoot-accent'), '#ff8a8a', 'the holiday picked wins the accent');
  T.eq(root.style.getPropertyValue('--tf-bg'), '#0a0f1c');
  T.eq(root.style.getPropertyValue('--tf-scale'), '1.15');
  T.eq([root.dataset.tenfootTheme, root.dataset.tenfootHoliday, root.dataset.tenfootMotion, root.dataset.tenfootContrast], ['midnight', 'winter', 'reduce', undefined]);
  Th.apply(root, S.normalize(null), day(7, 4));
  T.eq([root.style.getPropertyValue('--tenfoot-accent'), root.dataset.tenfootHoliday, root.dataset.tenfootMotion, root.style.getPropertyValue('--tf-glow')], ['#feea3b', undefined, undefined, ''], 'and taken off again');
});

T.run('applyPlayer: the caption style and the video\'s colour filter, its SVG filters kept in the frame once', () => {
  const { document } = makeDom();
  const root = document.documentElement;
  Th.applyPlayer(root, { ...S.normalize(null), captionSize: 'larger', captionColor: 'yellow', captionBackground: 'black', videoFilter: 'deuteranopia' });
  T.eq([root.dataset.tenfootCaptionSize, root.dataset.tenfootCaptionColor, root.dataset.tenfootCaptionBg, root.dataset.tenfootFilter], ['larger', 'yellow', 'black', 'deuteranopia']);
  const f = document.getElementById('tenfoot-filter-deuteranopia');
  T.ok(f && f.querySelector('feColorMatrix').getAttribute('values').split(/\s+/).length === 20, 'a 4×5 colour matrix');
  Th.applyPlayer(root, { ...S.normalize(null), videoFilter: 'protanopia' });
  T.eq(document.querySelectorAll('#tenfoot-filters').length, 1, 'once');
  Th.applyPlayer(root, S.normalize(null));
  T.eq([root.dataset.tenfootCaptionSize, root.dataset.tenfootFilter], [undefined, undefined], 'Player\'s own and Off: nothing of Leanback\'s');
});

await T.exit();
