// The My List button, wherever Leanback draws it (a video's details page, a
// show's page, the Home banner): the rail's bookmark and no words on it — an
// outline when not on the list, filled in when it is; round and glyph-only
// like Start Over, its words (what pressing it does) under it while selected.
import { T } from '../../firefox-tools/harness/lib.mjs';
import { fixture, boot, URLS } from './page-support.mjs';

const BOOKMARK = 'M6.5 3h11A1.5 1.5 0 0 1 19 4.5V21l-7-5-7 5V4.5A1.5 1.5 0 0 1 6.5 3z';
const glyph = (b) => b.querySelector('svg.tenfoot-hero-glyph');
const look = (b) => {
  const g = glyph(b);
  return {
    icon: b.getAttribute('data-tenfoot-icon'),
    glyph: g && g.dataset.glyph,
    path: g && g.querySelector('path').getAttribute('d'),
    fill: g && g.getAttribute('fill'),
    words: b.querySelector('.tenfoot-hero-word') && b.querySelector('.tenfoot-hero-word').textContent
  };
};
const outline = { icon: 'true', glyph: 'bookmark', path: BOOKMARK, fill: 'none', words: 'Add to My List' };
const filled = { icon: 'true', glyph: 'bookmarked', path: BOOKMARK, fill: 'currentColor', words: 'Remove from My List' };

T.runAsync('My List on a video\'s page: the rail\'s bookmark, glyph-only; pressed, it fills in and its words say Remove', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  await T.sleep(100);
  const btn = () => p.doc.querySelector('.tenfoot-hero-actions [data-tenfoot-action="mylist"]');
  T.eq(look(btn()), outline, 'not on the list: an outline bookmark, its words Add to My List');
  const rail = p.doc.querySelector('.tenfoot-rail [data-tenfoot-rail="my-list"] path');
  T.eq(rail && rail.getAttribute('d'), BOOKMARK, 'the same shape as the rail\'s My List');
  p.$('video-mylist').addEventListener('click', () => p.$('video-mylist').classList.replace('icon-watchlist-add', 'icon-watchlist-remove'));
  btn().focus();
  p.key('Enter');
  await T.sleep(200);
  T.eq(look(btn()), filled, 'on the list: the bookmark filled in, its words Remove from My List');
  T.eq(btn().getAttribute('aria-label'), 'Remove from My List', 'the screen reader says the same');
});

T.runAsync('My List on a show\'s page: the outline bookmark, glyph-only', async () => {
  const p = await boot({ html: fixture('series.html'), url: URLS.season2 });
  await T.sleep(100);
  const b = p.doc.querySelector('.tenfoot-hero-actions [data-tenfoot-action="mylist"]');
  T.ok(b, 'My List is there');
  T.eq(look(b), outline);
});

T.runAsync('My List on the Home banner: the bookmark, filled in for a slide already on the list', async () => {
  const p = await boot({ html: fixture('home.html'), url: URLS.browse });
  await T.sleep(100);
  const listBtn = () => [...p.doc.querySelectorAll('.tenfoot-hero-action')].find((b) => b.hasAttribute('data-tenfoot-listed'));
  T.eq(look(listBtn()), outline, 'the first slide is not on the list');
  p.doc.querySelector('.tenfoot-hero-next').click();
  await T.sleep(100);
  T.eq(look(listBtn()), filled, 'the second slide is on the list');
});
await T.exit();
