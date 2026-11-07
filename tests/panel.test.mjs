// nav/panel.js on its own: what a level looks like (switches, values and
// chevrons, ticks, headings, the ✕ picture, the keys along the foot), opening
// and closing, a click, and keeping the selection in view by scrolling the
// list only. Its owners (page.js, transport.js) are tested in their suites.
import { T, makeDom } from '../../firefox-tools/harness/lib.mjs';

function load() {
  const dom = makeDom({ html: '<!doctype html><html><body><p>page</p></body></html>', url: 'https://watch.dropout.tv/browse' });
  dom.runScripts([T.extFile('lib/common.js'), T.extFile('nav/panel.js')]);
  return { win: dom.window, doc: dom.window.document, P: dom.window.TenfootPanel };
}

const LEVEL = {
  title: 'Leanback Settings',
  index: 1,
  entries: [
    { id: 'autoplayNext', label: 'Autoplay Next Episode', kind: 'toggle', on: true },
    { id: 'seekStep', label: 'Seek Step', kind: 'choice', value: '10 s' },
    { label: 'White', kind: 'option', checked: true, group: 'Color' },
    { label: 'Yellow', kind: 'option', checked: false, group: 'Color' },
    { label: '100%', kind: 'option', checked: false, group: 'Size' },
    { id: 'forget', label: 'Clear Continue Watching', kind: 'action', separator: true }
  ]
};

T.run('a level: switches, values with a chevron, ticks, group headings, a separator', () => {
  const { doc, P } = load();
  const panel = P.createPanel(doc, { label: 'Settings' });
  panel.render(LEVEL);
  const el = panel.element;
  T.eq(el.parentElement, doc.documentElement, 'outside the page\'s body');
  T.eq(el.querySelector('.tenfoot-settings-title').textContent, 'Leanback Settings');
  const items = [...el.querySelectorAll('.tenfoot-settings-item')];
  T.eq(items.map((b) => b.dataset.tenfootKind), ['toggle', 'choice', 'option', 'option', 'option', 'action']);
  T.eq([items[0].getAttribute('role'), items[0].getAttribute('aria-checked'), items[0].querySelector('.tenfoot-switch').dataset.on], ['menuitemcheckbox', 'true', 'true']);
  T.eq(items[1].querySelector('.tenfoot-settings-value').textContent, '10 s');
  T.eq([...items[1].querySelector('.tenfoot-settings-text').children].map((c) => c.className), ['tenfoot-settings-label', 'tenfoot-settings-value'], 'the value under the name, in one block beside the mark');
  T.ok(items[1].querySelector('.tenfoot-settings-mark svg'), 'a chevron');
  T.eq([items[2].getAttribute('role'), items[2].getAttribute('aria-checked')], ['menuitemradio', 'true']);
  T.ok(items[2].querySelector('.tenfoot-settings-mark svg') && !items[3].querySelector('.tenfoot-settings-mark svg'), 'the chosen option ticked, the other not');
  T.eq([...el.querySelectorAll('.tenfoot-settings-group')].map((h) => h.textContent), ['Color', 'Size'], 'a heading where each group starts');
  T.eq(items[5].dataset.tenfootSeparator, 'true');
  T.eq(items.filter((b) => b.dataset.tenfootCurrent === 'true').length, 1, 'one selected entry');
  T.eq(items[1].dataset.tenfootCurrent, 'true', 'the level\'s index');
  T.eq(doc.activeElement, items[1], 'the selection has the focus');
  T.eq(items[0].dataset.tenfootItem, 'autoplayNext');
});

T.run('no ✕ (Back closes); the keys are along the foot; nothing in them is a stop', () => {
  const { doc, P } = load();
  const panel = P.createPanel(doc, {});
  panel.render(LEVEL);
  T.notOk(panel.element.querySelector('.tenfoot-settings-close'));
  T.eq(panel.element.querySelectorAll('button:not(.tenfoot-settings-item), a, [tabindex]').length, 0);
  T.eq(panel.element.querySelector('.tenfoot-settings-keys').textContent, '◀Back▲ ▼MoveOKChange');
  T.eq(panel.element.querySelectorAll('header, footer, p').length, 0, 'plain divs: the site\'s own styles for those never reach in');
});

T.runAsync('open slides it in; close slides it out, then hides it', async () => {
  const { doc, P } = load();
  const panel = P.createPanel(doc, {});
  T.ok(panel.element.hidden);
  panel.open();
  panel.render(LEVEL);
  T.ok(!panel.element.hidden && panel.isOpen);
  T.ok(doc.documentElement.classList.contains('tenfoot-settings-open'));
  T.ok(panel.contains(panel.current));
  panel.close();
  T.notOk(panel.isOpen, 'closed at once');
  T.notOk(panel.element.hidden, 'still on screen while it slides out');
  await T.sleep(P.SLIDE_MS + 50);
  T.ok(panel.element.hidden, 'then gone');
});

T.run('a click on an entry is handed to the owner, and goes no further', () => {
  const { doc, P } = load();
  const picked = [];
  const panel = P.createPanel(doc, { onPick: (i) => picked.push(i) });
  panel.render(LEVEL);
  let reached = false;
  doc.addEventListener('click', () => { reached = true; });
  panel.element.querySelectorAll('.tenfoot-settings-item')[3].click();
  T.eq(picked, [3]);
  T.notOk(reached, 'the site never sees it');
});

T.run('the selection is kept in view by scrolling the list only, never the page', () => {
  const { doc, win, P } = load();
  const panel = P.createPanel(doc, {});
  const list = panel.element.querySelector('.tenfoot-settings-list');
  // jsdom has no layout: a list 200 high, entries 50 high, from 0.
  Object.defineProperty(list, 'clientHeight', { value: 200, configurable: true });
  Object.defineProperty(list, 'offsetTop', { value: 100, configurable: true });
  const proto = win.HTMLElement.prototype;
  const offsetTop = Object.getOwnPropertyDescriptor(proto, 'offsetTop');
  const offsetHeight = Object.getOwnPropertyDescriptor(proto, 'offsetHeight');
  Object.defineProperty(proto, 'offsetTop', { configurable: true, get() { return this.classList.contains('tenfoot-settings-item') ? 100 + 50 * Number(this.dataset.tenfootSettingsItem) : 0; } });
  Object.defineProperty(proto, 'offsetHeight', { configurable: true, get() { return 50; } });
  let pageScrolled = false;
  proto.scrollIntoView = () => { pageScrolled = true; };
  try {
    const entries = Array.from({ length: 12 }, (_, i) => ({ label: `E${i}`, kind: 'action' }));
    panel.render({ title: 'T', index: 6, entries });
    T.eq(list.scrollTop, 150, 'entry 6 (300–350) brought up to the list\'s bottom edge');
    panel.render({ title: 'T', index: 1, entries });
    T.eq(list.scrollTop, 50, 'and back down to the top edge');
    T.notOk(pageScrolled, 'scrollIntoView never used');
  } finally {
    Object.defineProperty(proto, 'offsetTop', offsetTop);
    Object.defineProperty(proto, 'offsetHeight', offsetHeight);
    delete proto.scrollIntoView;
  }
});

await T.exit();
