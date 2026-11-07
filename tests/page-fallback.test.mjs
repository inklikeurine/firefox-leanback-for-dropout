// content/page.js on Dropout's own Home, when Leanback cannot draw its own
// (Dropout changed its markup): the page stays Dropout's, driven with the
// arrows and the ring. The Home test page, with Leanback's reading of it
// broken and the boxes a 1280-wide window shows.
import { T } from '../../firefox-tools/harness/lib.mjs';
import { rules, URLS, boot, unreadHome, layOutUnreadHome, shelf } from './page-support.mjs';

const home = (before = null) => boot({ html: unreadHome(), url: URLS.browse, before: (win) => { layOutUnreadHome(win); if (before) before(win); } });

T.runAsync('Dropout\'s own Home: the ring on the first card, the hints up, Dropout\'s hover tooltips hidden', async () => {
  const p = await home();
  const s = await p.state();
  T.eq([s.enabled, s.kind, s.ring, s.modal, s.home], [true, 'browse', true, false, null], 'Leanback\'s own Home is not drawn');
  T.eq(p.doc.activeElement, shelf(p.doc, 0)[0]);
  T.eq(p.doc.documentElement.dataset.tenfoot, 'on');
  T.notOk(p.ring().hidden);
  T.notOk(p.hints().hidden, 'up from the start, so the keys are readable without pressing one');
  const style = p.doc.getElementById('tenfoot-site-style').textContent;
  T.ok(/\.tooltip/.test(style) && /display: none/.test(style), style);
});

T.runAsync('the ring\'s corners follow the selected card\'s, one ring-offset out', async () => {
  const p = await home((win) => { win.document.querySelector('.browse-row .horizontal-row-item a[href]').style.borderTopLeftRadius = '12px'; });
  // 12 px, enlarged 5 % by the default zoom, plus the ring's offset (4 + 2).
  T.eq(p.ring().style.borderRadius, '18.6px');
  p.key('ArrowRight');
  await T.sleep(20);
  T.eq(p.doc.activeElement, shelf(p.doc, 0)[1]);
  T.eq(p.ring().style.borderRadius, '6px', 'a square card: the offset alone');
});

T.runAsync('the first selection is scrolled into view without waiting for a key', async () => {
  const p = await home();
  T.eq(p.win.__scrolledInto, shelf(p.doc, 0)[0]);
});

T.runAsync('a card off the right of its shelf is brought in with the shelf\'s own arrow, as Dropout\'s slider does it', async () => {
  let shifts = 0;
  const p = await home((win) => {
    // Dropout's slider moves its cards with a transform, so scrolling moves
    // nothing; only its own arrow (slick-next) does, one card a press here.
    const row = win.document.querySelectorAll('.browse-row')[1];
    row.querySelector('.slick-next').addEventListener('click', () => {
      shifts += 1;
      for (const el of row.querySelectorAll('[data-rect]')) {
        if (el.matches('.slick-prev, .slick-next, .horizontal-row')) continue;
        const [l, t, w, h] = el.getAttribute('data-rect').split(',').map(Number);
        el.setAttribute('data-rect', [l - 248, t, w, h].join(','));
      }
    });
  });
  p.key('ArrowDown');
  for (let i = 0; i < 5; i += 1) p.key('ArrowRight');
  const card = shelf(p.doc, 1)[5];
  T.eq(p.doc.activeElement, card, 'the sixth card, off the right edge');
  await T.sleep(1000);
  T.ok(shifts >= 1, 'the shelf\'s own arrow was pressed');
  T.ok(card.getBoundingClientRect().right <= p.win.innerWidth + 1, `the card is in view (right edge ${card.getBoundingClientRect().right})`);
});

T.runAsync('a shelf arrow that moves nothing is pressed once, not forever', async () => {
  let presses = 0;
  const p = await home((win) => {
    win.document.querySelectorAll('.browse-row')[1].querySelector('.slick-next').addEventListener('click', () => { presses += 1; });
  });
  p.key('ArrowDown');
  for (let i = 0; i < 5; i += 1) p.key('ArrowRight');
  await T.sleep(1000);
  T.eq(presses, 1, 'gave up after the shelf refused to move');
});

T.runAsync('the arrows: along a shelf, down to the next keeping the column, up again to the card it left, then the top bar', async () => {
  const p = await home();
  T.ok(p.key('ArrowRight').defaultPrevented);
  T.eq(p.doc.activeElement, shelf(p.doc, 0)[1]);
  T.notOk(p.hints().hidden, 'the hints show on a key Leanback handles');
  T.ok(p.hints().textContent.includes('Move'));
  p.key('ArrowDown');
  T.eq(p.doc.activeElement, shelf(p.doc, 1)[1], 'the card under it');
  p.key('ArrowLeft');
  T.eq(p.doc.activeElement, shelf(p.doc, 1)[0]);
  p.key('ArrowUp');
  T.eq(p.doc.activeElement, shelf(p.doc, 0)[1], 'back on the card it left the shelf from');
  // The banner's buttons are not reached: on Dropout's page the banner's
  // slides sit outside .carousel-layout-container (which holds its dots and
  // arrows), where sites/dropout.json looks for them.
  p.key('ArrowUp');
  T.ok(p.doc.activeElement.closest('.site-header'), 'then the top bar');
  T.eq(p.win.__scrolledInto, p.doc.activeElement, 'kept on screen');
});

T.runAsync('a shelf does not wrap; ◀ from its first card is the rail, ▶ comes back; a card off screen is reachable', async () => {
  const p = await home();
  p.key('ArrowLeft');
  T.eq(p.doc.activeElement.dataset.tenfootRail, 'home', 'the rail, on the entry for this page');
  p.key('ArrowRight');
  T.eq(p.doc.activeElement, shelf(p.doc, 0)[0], 'and back to the card it came from');
  p.key('ArrowDown');
  const cards = shelf(p.doc, 1);
  for (let i = 0; i < cards.length + 3; i += 1) p.key('ArrowRight');
  T.eq(p.doc.activeElement, cards.at(-1), 'stops on the last card, off screen');
  T.notOk(p.ring().hidden);
});

T.runAsync('a held arrow (key repeat) moves at a steady pace, keys with a modifier are Firefox\'s, Back runs the exit hook', async () => {
  const p = await home();
  p.key('ArrowRight', { repeat: true });
  p.key('ArrowRight', { repeat: true });
  T.eq(p.doc.activeElement, shelf(p.doc, 0)[1], 'two repeats at the same moment move once');
  T.notOk(p.key('ArrowRight', { altKey: true }).defaultPrevented);
  T.eq(p.doc.activeElement, shelf(p.doc, 0)[1]);
  T.ok(p.key('Escape').defaultPrevented);
  await T.sleep(10);
  T.eq(p.last('exit').type, 'exit');
  T.ok(p.hints().textContent.includes('Nothing to go back to'));
});

T.runAsync('OK opens the selected card; / goes to search', async () => {
  const p = await home();
  const clicked = [];
  p.doc.addEventListener('click', (e) => { clicked.push(e.target.closest('a')?.getAttribute('href')); e.preventDefault(); });
  p.key('Enter');
  T.eq(clicked, [shelf(p.doc, 0)[0].getAttribute('href')]);
  p.key('/');
  T.eq((await p.state()).navigation, rules.searchUrl, '"/" is the one keyboard exception');
});

await T.exit();
