// nav/settings-menu.js on its own: Leanback's settings as the page and the
// playback panel both show them. Its owners (page.js, transport.js) are
// tested in their suites, and the live check proves the two look the same.
import { T, loadScripts } from '../../firefox-tools/harness/lib.mjs';

const ctx = loadScripts([T.extFile('lib/settings.js'), T.extFile('nav/settings-menu.js')]);
const S = ctx.TenfootSettings;

function menu(opts = {}) {
  let settings = S.normalize(null);
  const log = [];
  const m = ctx.TenfootSettingsMenu.create(Object.assign({
    settings: () => settings,
    save: (patch) => { log.push(['save', patch]); settings = S.normalize(Object.assign({}, settings, patch)); },
    onClear: () => log.push(['clear']),
  }, opts));
  m.open();
  return { m, log, at: (id) => ROWS.findIndex((r) => r.id === id) };
}

// The panel's top level: the one list, less what is on the options page
// only and what is in a menu of its own (Accessibility, after them).
const ROWS = S.ROWS.filter((r) => r.panel !== false && !r.menu);
const FORGET = ROWS.length + 1;

const down = (m, n) => { for (let i = 0; i < n; i++) m.key('down'); };

T.run('the list: every setting in order under its group, then Clear Continue Watching', () => {
  const { m } = menu();
  const v = m.view();
  T.eq(v.title, 'Leanback Settings');
  // The settings themselves, in order, are settings.test.mjs's (the one list).
  T.eq(v.entries.map((e) => e.label), [...ROWS.map((r) => r.label), 'Accessibility', 'Clear Continue Watching']);
  T.eq([...new Set(v.entries.map((e) => e.group).filter(Boolean))], ['Playback', 'Browsing', 'Look']);
  T.eq(v.entries[0], { id: 'autoplayNext', label: 'Autoplay Next Episode', kind: 'toggle', group: 'Playback', on: true });
  T.eq(v.entries.find((e) => e.id === 'seekStep').value, '10 s');
  T.notOk(v.entries.some((e) => e.id === 'startMuted' || e.id === 'disable'), 'Start Videos Muted is on the options page only; the toolbar button turns Leanback off');
});

T.run('an on/off flips on OK and on ▶; ▲ ▼ stop at the ends', () => {
  const { m, log } = menu();
  m.key('up');
  T.eq(m.view().index, 0);
  T.eq(m.key('select'), true);
  T.eq(m.key('right'), true);
  T.eq(log, [['save', { autoplayNext: false }], ['save', { autoplayNext: true }]]);
  down(m, 99);
  T.eq(m.view().index, FORGET, 'Clear Continue Watching, the last');
});

T.run('a choice opens its values, the current one ticked; OK picks and goes back up; ◀ goes back without picking', () => {
  const { m, log, at } = menu();
  down(m, at('seekStep'));
  m.key('select');
  let v = m.view();
  T.eq([v.title, v.entries[v.index].label, v.entries[v.index].checked], ['Seek Step', '10 s', true]);
  m.key('down');
  m.key('select');
  T.eq(log, [['save', { seekStep: 15 }]]);
  v = m.view();
  T.eq([v.title, v.index, v.entries[v.index].value], ['Leanback Settings', at('seekStep'), '15 s'], 'back on the list, the new value shown');
  m.key('right');
  T.eq(m.key('left'), true, 'one level up');
  T.eq(m.view().title, 'Leanback Settings');
  T.eq(log.length, 1);
});

T.run('Clear Continue Watching takes OK twice; ▶ never runs it; moving away disarms it', () => {
  const { m, log } = menu();
  down(m, FORGET);
  const forget = () => m.view().entries[m.view().index];
  m.key('right');
  T.eq([forget().value, log], ['', []], '▶ runs no action');
  m.key('select');
  T.eq(forget().value, 'OK again to clear');
  m.key('up'); m.key('down');
  T.eq(forget().value, '', 'moving away disarms it');
  m.key('select'); m.key('select');
  T.eq([log, forget().value], [[['clear']], ''], 'cleared; the page confirms with its own notice');
  const p = menu({ showCleared: true });
  down(p.m, FORGET);
  p.m.key('select'); p.m.key('select');
  T.eq(p.m.view().entries[p.m.view().index].value, 'Cleared', 'the playback panel says so in the entry');
  p.m.key('up');
  p.m.key('down');
  T.eq(p.m.view().entries[p.m.view().index].value, '', 'until the next move');
});

T.run('Accessibility: a menu of its own — Display, Captions, Video; a choice in it as at the top', () => {
  const { m, log } = menu();
  down(m, ROWS.length);
  T.eq(m.view().entries[m.view().index].label, 'Accessibility');
  m.key('select');
  const v = m.view();
  T.eq(v.title, 'Accessibility');
  T.eq(v.entries.map((e) => e.label), S.ROWS.filter((r) => r.menu === 'accessibility').map((r) => r.label));
  T.eq([...new Set(v.entries.map((e) => e.group))], ['Display', 'Captions', 'Video']);
  m.key('down');
  m.key('select');
  T.eq(log, [['save', { highContrast: true }]]);
  m.key('back');
  T.eq(m.view().title, 'Leanback Settings');
});

T.run('Theme This Page: first under Look when the page has a look of its own; moving through its values shows each; OK keeps one, Back puts it back', () => {
  const previews = [];
  const { m, log } = menu({ pageLook: () => ({ key: 'home', title: 'Home' }), preview: (p) => previews.push(p) });
  const entries = m.view().entries;
  const i = entries.findIndex((e) => e.id === 'look');
  T.eq([entries[i].label, entries[i].value, entries[i + 1].label], ['Theme This Page', 'Home', 'Theme']);
  down(m, i);
  m.key('select');
  T.eq(m.view().title, 'Theme This Page: Home');
  T.eq(m.view().entries.map((e) => [e.label, e.value]), [['Banner', 'Large'], ['Card Size', 'Medium']]);
  m.key('select');
  m.key('down');
  T.eq(previews.at(-1).pageLooks.home, { banner: 'small', cards: 'medium' }, 'Small, shown at once');
  m.key('back');
  T.eq(previews.at(-1), null, 'Back: as it was');
  T.eq(log, []);
  m.key('select');
  m.key('down'); m.key('down');
  m.key('select');
  T.eq(log, [['save', { pageLooks: { ...S.normalize(null).pageLooks, home: { banner: 'off', cards: 'medium' } } }]]);
  T.eq(m.view().entries[0].value, 'Off');
  const plain = menu();
  T.notOk(plain.m.view().entries.some((e) => e.id === 'look'), 'not on a page without one');
});

T.run('a look choice (Theme Color) shows each colour as you move; closing the menu puts the saved one back', () => {
  const previews = [];
  const { m, at } = menu({ preview: (p) => previews.push(p) });
  down(m, at('ringColor'));
  m.key('select');
  m.key('down');
  T.eq(previews, [{ ringColor: '#f2f2f2' }]);
  m.close();
  T.eq(previews.at(-1), null);
  const { m: m2, at: at2 } = menu({ preview: (p) => previews.push(p) });
  const before = previews.length;
  down(m2, at2('seekStep'));
  m2.key('select');
  m2.key('down');
  T.eq(previews.length, before, 'not for a setting that is not about the look');
});

T.run('Cookie Preferences: at the foot when the page can open them; OK opens them', () => {
  let opened = 0;
  const { m } = menu({ cookies: () => () => { opened += 1; } });
  const entries = m.view().entries;
  T.eq(entries.slice(-2).map((e) => e.label), ['Cookie Preferences', 'Clear Continue Watching']);
  down(m, entries.length - 2);
  m.key('right');
  T.eq(opened, 0, '▶ runs no action');
  m.key('select');
  T.eq(opened, 1);
  T.notOk(menu().m.view().entries.some((e) => e.id === 'cookies'), 'not on a page without them');
});

T.run('◀ and Back from the top are the owner\'s; other keys are not the menu\'s', () => {
  const { m } = menu();
  T.eq([m.key('left'), m.key('back'), m.key('menu'), m.key('play_pause')], ['out', 'out', false, false]);
});

T.run('a click is moving there and pressing OK', () => {
  const { m, log, at } = menu();
  m.pick(at('hintBar'));
  T.eq(log, [['save', { hintBar: true }]]);
  T.eq(m.view().index, at('hintBar'));
});

await T.exit();
