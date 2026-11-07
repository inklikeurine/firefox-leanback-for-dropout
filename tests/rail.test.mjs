// nav/rail.js on its own: the entries (icons, the profile set apart at the
// top, the gear at the foot), the page's entry highlighted and where the
// selection lands, moves that never wrap, the profile's picture over its
// icon, a click. The page script's use of it is in page.test and home.test.
import { T, makeDom } from '../../firefox-tools/harness/lib.mjs';

function load() {
  const dom = makeDom({ clock: true, html: '<!doctype html><html><body><p>page</p></body></html>', url: 'https://watch.dropout.tv/browse' });
  dom.runScripts([T.extFile('lib/common.js'), T.extFile('nav/rail.js')]);
  return { win: dom.window, doc: dom.window.document, R: dom.window.TenfootRail };
}

const ENTRIES = [
  { id: 'profile', label: 'Switch profile', icon: 'person', start: true },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'browse', label: 'Browse', icon: 'grid' },
  { id: 'settings', label: 'Leanback settings', icon: 'gear', end: true }
];

T.run('the entries: one button each with its icon and its name, the profile at the top, the gear at the foot; hidden until shown', () => {
  const { doc, R } = load();
  const rail = R.createRail(doc, ENTRIES.concat([null, { label: 'no id' }]), {});
  const nav = rail.element;
  T.eq([nav.tagName, nav.className, nav.parentElement], ['NAV', R.RAIL_CLASS, doc.documentElement]);
  T.eq(rail.visible, false);
  rail.show(true);
  T.eq(rail.visible, true);
  const items = [...nav.querySelectorAll(`.${R.ITEM_CLASS}`)];
  T.eq(items.map((b) => b.dataset.tenfootRail), ['profile', 'search', 'home', 'browse', 'settings'], 'entries without an id are left out');
  T.eq(items.map((b) => b.getAttribute('aria-label')), ['Switch profile', 'Search', 'Home', 'Browse', 'Leanback settings']);
  T.eq([items[0].dataset.tenfootStart, items[4].dataset.tenfootEnd], ['true', 'true']);
  T.ok(items.every((b) => b.querySelector('svg[aria-hidden="true"] path')), 'every entry has its icon');
  T.eq(items[3].querySelectorAll('svg path').length, 4, 'the grid: four squares');
  T.eq(rail.item('home'), items[2]);
  T.ok(rail.contains(items[1]) && !rail.contains(doc.body));
});

T.run('the page\'s entry is highlighted and is where the selection is; ▲ ▼ never wrap', () => {
  const { doc, R } = load();
  const rail = R.createRail(doc, ENTRIES, {});
  T.eq(rail.currentId, 'profile', 'nothing set: the top');
  rail.setCurrent('browse');
  T.eq(rail.currentId, 'browse');
  T.eq([...rail.element.querySelectorAll('[data-tenfoot-page="true"]')].map((b) => b.dataset.tenfootRail), ['browse']);
  T.eq(rail.move(1).dataset.tenfootRail, 'settings');
  T.eq(rail.move(1).dataset.tenfootRail, 'settings', 'no wrap at the foot');
  rail.move(-10);
  T.eq(rail.currentId, 'profile', 'no wrap at the top');
  rail.select(rail.item('home'));
  T.eq(rail.currentId, 'home');
  rail.select(doc.body);
  T.eq(rail.currentId, 'home', 'not an entry: the selection stays');
  rail.setCurrent(null);
  T.eq(rail.element.querySelectorAll('[data-tenfoot-page]').length, 0);
});

T.run('the profile\'s picture over its icon; only https; none takes it away and the icon stays', () => {
  const { doc, R } = load();
  const rail = R.createRail(doc, [Object.assign({ picture: 'https://img.test/sam.png' }, ENTRIES[0]), ENTRIES[1]], {});
  const b = rail.item('profile');
  T.eq([b.dataset.tenfootPicture, b.querySelector('img').getAttribute('src')], ['true', 'https://img.test/sam.png']);
  T.ok(b.querySelector('svg'), 'the icon stays under it');
  rail.setPicture('profile', 'javascript:alert(1)');
  T.eq([b.dataset.tenfootPicture, b.querySelector('img')], [undefined, null]);
  rail.setPicture('profile', 'https://img.test/kim.png');
  rail.setPicture('profile', 'https://img.test/kim.png');
  T.eq(b.querySelectorAll('img').length, 1);
  rail.setPicture('nobody', 'https://img.test/x.png');
  T.notOk(rail.item('search').querySelector('img'));
});

T.run('a click activates the entry, and the site never sees it; a second rail replaces the first; destroy removes it', () => {
  const { doc, R } = load();
  const picked = [];
  let siteSaw = 0;
  doc.documentElement.addEventListener('click', () => { siteSaw += 1; });
  R.createRail(doc, ENTRIES, {});
  const rail = R.createRail(doc, ENTRIES, { onActivate: (id) => picked.push(id) });
  T.eq(doc.querySelectorAll(`.${R.RAIL_CLASS}`).length, 1, 'one rail');
  rail.item('search').click();
  T.eq(picked, ['search']);
  T.eq(siteSaw, 0);
  rail.destroy();
  T.eq(doc.querySelectorAll(`.${R.RAIL_CLASS}`).length, 0);
});

await T.exit();
