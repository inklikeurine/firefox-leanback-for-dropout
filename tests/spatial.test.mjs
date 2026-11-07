// nav/spatial.js — geometry with plain rects, then DOM collection over the
// live-check fixtures under jsdom (rects from data-rect).
import fs from 'node:fs';
import path from 'node:path';
import { T, loadScripts, makeDom } from '../../firefox-tools/harness/lib.mjs';

const ctx = loadScripts([T.extFile('nav/site-rules.js'), T.extFile('nav/spatial.js')]);
const S = ctx.TenfootSpatial;
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const cand = (name, ...r) => ({ name, rect: rect(...r) });
const fixture = (n) => fs.readFileSync(path.join(T.testsDir, 'fixtures', n), 'utf8');
const rules = JSON.parse(fs.readFileSync(T.extFile('sites/dropout.json'), 'utf8'));

// A 3×2 grid of 380×214 tiles, 20 px gutters, like a series page.
const grid = [];
for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) grid.push(cand(`r${r}c${c}`, 40 + c * 400, 220 + r * 260, 380, 214));
const others = (name) => grid.filter((g) => g.name !== name);
const from = (name) => grid.find((g) => g.name === name).rect;

T.run('grid: right/left stay in the row, down/up keep the column', () => {
  T.eq(S.pick('right', from('r0c0'), others('r0c0')).name, 'r0c1');
  T.eq(S.pick('left', from('r0c1'), others('r0c1')).name, 'r0c0');
  T.eq(S.pick('down', from('r0c1'), others('r0c1')).name, 'r1c1');
  T.eq(S.pick('up', from('r1c2'), others('r1c2')).name, 'r0c2');
});

T.run('grid: no wrap at the edges', () => {
  T.eq(S.pick('right', from('r0c2'), others('r0c2')), null, 'right from the last column');
  T.eq(S.pick('left', from('r1c0'), others('r1c0')), null);
  T.eq(S.pick('up', from('r0c0'), others('r0c0')), null);
  T.eq(S.pick('down', from('r1c1'), others('r1c1')), null);
});

T.run('overlap beats distance: a wide element directly above wins over a nearer-centred one', () => {
  const link = rect(40, 810, 200, 30);
  const mount = cand('mount', 0, 60, 1280, 720);
  const header = cand('search', 120, 15, 80, 30);
  T.eq(S.pick('up', link, [mount, header]).name, 'mount');
});

T.run('a diagonal neighbour is chosen only when nothing overlaps', () => {
  const cur = rect(40, 220, 380, 214);
  const diag = cand('diag', 440, 480, 380, 214);
  T.eq(S.pick('down', cur, [diag]).name, 'diag', 'second pass: centre is below');
  const straight = cand('straight', 40, 480, 380, 214);
  T.eq(S.pick('down', cur, [diag, straight]).name, 'straight');
});

T.run('strict pass rejects candidates that start before the trailing edge; loose pass uses centres', () => {
  const cur = rect(100, 100, 100, 100);
  const overlapping = cand('o', 150, 150, 100, 100); // starts inside cur → strict rejects, loose accepts (centre below)
  T.eq(S.pick('down', cur, [overlapping]).name, 'o');
  const above = cand('a', 100, 0, 100, 100);
  T.eq(S.pick('down', cur, [above]), null);
});

T.run('degenerate input: zero rects and bad args are ignored', () => {
  T.eq(S.pick('down', rect(0, 0, 0, 0), grid), null);
  T.eq(S.pick('down', from('r0c0'), [cand('z', 40, 480, 0, 0)]), null);
  T.eq(S.pick('sideways', from('r0c0'), grid), null);
  T.eq(S.pick('down', from('r0c0'), null), null);
});

T.run('a same-row neighbour whose centre is a hair lower is not "below" (scaled-tile sub-pixel case)', () => {
  const cur = rect(432.4, 475.71875, 395.2, 222.5625); // ep5 scaled by 1.04
  const same = cand('ep6', 840, 480, 380, 214);
  T.eq(S.pick('down', cur, [same]), null);
  T.eq(S.pick('right', cur, [same]).name, 'ep6');
});

// Rows: three rows of tiles, memory, viewport preference.
const rowsOf = () => {
  const mk = (row, y, n, x0 = 40) => ({ row, items: Array.from({ length: n }, (_, i) => ({ el: `${row}-${i}`, rect: rect(x0 + i * 310, y, 290, 163), row })) });
  return [mk('hero', 90, 1, 40), mk('r1', 440, 4), mk('r2', 680, 6)];
};

T.run('rows: left/right walk the row in DOM order without wrapping', () => {
  const rows = rowsOf();
  const cur = rows[1].items[1];
  T.eq(S.rowPick('right', cur, rows).el, 'r1-2');
  T.eq(S.rowPick('left', cur, rows).el, 'r1-0');
  T.eq(S.rowPick('left', rows[1].items[0], rows), null);
  T.eq(S.rowPick('right', rows[1].items[3], rows), null);
});

T.run('rows: down picks the nearest centre in the next row, memory wins when set', () => {
  const rows = rowsOf();
  T.eq(S.rowPick('down', rows[1].items[2], rows).el, 'r2-2');
  const memory = new Map([['r2', 'r2-0']]);
  T.eq(S.rowPick('down', rows[1].items[2], rows, memory).el, 'r2-0');
  T.eq(S.rowPick('up', rows[2].items[5], rows).el, 'r1-3', 'off-screen item maps to the nearest, last column');
  T.eq(S.rowPick('up', rows[1].items[0], rows).el, 'hero-0');
  T.eq(S.rowPick('up', rows[0].items[0], rows), null, 'nothing above the first row');
});

T.run('rows: a viewport prefers on-screen items, an empty row is skipped', () => {
  const rows = rowsOf();
  rows.splice(2, 0, { row: 'empty', items: [] });
  const viewport = { width: 1280, height: 900 };
  const far = { el: 'x', rect: rect(1600, 440, 290, 163), row: 'r1' };
  rows[1].items.push(far);
  T.eq(S.rowPick('down', far, rows, null, viewport).el, 'r2-3', 'last visible column rather than the off-screen one');
  T.eq(S.rowPick('down', far, rows, null, null).el, 'r2-5', 'without a viewport: nearest centre');
  T.eq(S.rowPick('down', { el: 'nope', rect: rect(0, 0, 1, 1), row: 'unknown' }, rows), null);
});

// DOM collection over the fixtures.
T.run('collect: browse fixture yields rows with one target per tile, plus header links', () => {
  const dom = makeDom({ html: fixture('browse.html'), url: 'https://watch.dropout.tv/browse' });
  const win = dom.window;
  const ctx2 = win;
  dom.runScripts([T.extFile('nav/site-rules.js'), T.extFile('nav/spatial.js')]);
  const { candidates, rows } = ctx2.TenfootSpatial.collect(win.document, rules.pages.browse, { win, common: rules.common.focusable });
  T.eq(rows.length, 3, 'carousel + two rows');
  T.eq(rows.map((r) => r.items.length), [1, 4, 5]);
  T.eq(rows[1].items[0].el.id, 'r1c1');
  const ids = candidates.map((c) => c.el.id || c.el.getAttribute('href'));
  T.ok(ids.includes('/browse') && ids.includes('/search') && ids.includes('/login'), 'header links are candidates');
  T.eq(candidates.filter((c) => c.el.classList.contains('carousel-arrow')).length, 0, 'arrow buttons are not candidates');
  T.eq(candidates.length, 10 + 3);
});

T.run('collect: series fixture dedupes the two links of a tile and includes the selects', () => {
  const dom = makeDom({ html: fixture('series.html'), url: 'https://watch.dropout.tv/game-changer' });
  const win = dom.window;
  dom.runScripts([T.extFile('nav/site-rules.js'), T.extFile('nav/spatial.js')]);
  const { candidates, rows } = win.TenfootSpatial.collect(win.document, rules.pages.series, { win, common: rules.common.focusable });
  T.eq(rows.length, 0);
  const ids = candidates.map((c) => c.el.id);
  T.eq(ids.filter((i) => i === 'ep1').length, 1, 'ep1 once although the tile has two links');
  T.ok(ids.includes('season') && ids.includes('sort') && ids.includes('trailer'));
  T.notOk(ids.includes('loadmore'), 'load more is a control, not a target');
  T.notOk(ids.includes('modal-link'), 'links in the closed modal have no rect');
});

T.run('collect: extra elements and invisible ones', () => {
  const dom = makeDom({ html: fixture('video.html'), url: 'https://watch.dropout.tv/game-changer/season:1/videos/ep1' });
  const win = dom.window;
  dom.runScripts([T.extFile('nav/site-rules.js'), T.extFile('nav/spatial.js')]);
  const mount = win.document.getElementById('mount');
  const { candidates } = win.TenfootSpatial.collect(win.document, rules.pages.video, { win, extra: [mount], common: rules.common.focusable });
  T.ok(candidates.some((c) => c.el === mount), 'mount added through extra');
  T.ok(candidates.some((c) => c.el.id === 'series-link'));
  T.ok(candidates.some((c) => c.el.id === 'rel1'), 'related tiles');
  const hidden = win.document.getElementById('rel2');
  hidden.setAttribute('aria-hidden', 'true');
  const again = win.TenfootSpatial.collect(win.document, rules.pages.video, { win, extra: [mount], common: rules.common.focusable });
  T.notOk(again.candidates.some((c) => c.el === hidden), 'aria-hidden removes a candidate');
  T.notOk(win.TenfootSpatial.isVisible(win.document.getElementById('rel2'), win));
});

await T.exit();
