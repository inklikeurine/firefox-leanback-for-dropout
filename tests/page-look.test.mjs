// content/page.js and the look: Theme Color, Holidays, Theme This Page.
import { T } from '../../firefox-tools/harness/lib.mjs';
import { fixture, URLS, moveTo, boot, watch } from './page-support.mjs';

T.runAsync('the look: Theme Color is the accent of every page and the ring; a holiday picked shows its own', async () => {
  const p = await boot({ html: fixture('browse.html'), url: URLS.browse, settings: { ringColor: '#7cc6fe' } });
  const root = p.doc.documentElement;
  T.eq([root.style.getPropertyValue('--tenfoot-accent'), root.style.getPropertyValue('--tenfoot-ring-color')], ['#7cc6fe', '#7cc6fe']);
  await p.shim.changeStorage({ settings: { newValue: { ringColor: '#7cc6fe', holidays: 'halloween', theme: 'oled' } } });
  await T.sleep(20);
  T.eq([root.style.getPropertyValue('--tenfoot-accent'), root.dataset.tenfootHoliday, root.dataset.tenfootTheme, root.style.getPropertyValue('--tf-bg')], ['#ffa94d', 'halloween', 'oled', '#000000']);
});

T.runAsync('Theme This Page on Home: the banner — each value shown as you move to it, Back puts it back, OK keeps it; Off takes the banner away', async () => {
  const p = await boot({ html: fixture('home.html'), url: URLS.browse });
  const root = p.doc.documentElement;
  T.eq(root.dataset.tenfootLookBanner, 'large');
  T.ok(p.doc.querySelector('.tenfoot-hero') && !p.doc.querySelector('.tenfoot-hero').hidden, 'the banner');
  await p.act('menu');
  await moveTo(p, 'look');
  p.key('Enter');
  T.eq(p.doc.querySelector('.tenfoot-settings-title').textContent, 'Theme This Page: Home');
  p.key('Enter');
  p.key('ArrowDown');
  T.eq(root.dataset.tenfootLookBanner, 'small', 'Small, at once');
  p.key('Escape');
  T.eq(root.dataset.tenfootLookBanner, 'large', 'Back: as it was');
  T.notOk(p.shim.store.settings.pageLooks, 'nothing saved');
  p.key('Enter');
  p.key('ArrowDown'); p.key('ArrowDown');
  T.eq(root.dataset.tenfootLookBanner, 'off');
  T.ok(p.doc.querySelector('.tenfoot-hero').hidden, 'no banner');
  p.key('Enter');
  await T.sleep(20);
  T.eq(p.shim.store.settings.pageLooks.home.banner, 'off', 'kept');
  p.key('Escape'); p.key('Escape');
  await T.sleep(20);
  T.eq(root.dataset.tenfootLookBanner, 'off', 'still, with the panel closed');
  T.ok(p.doc.activeElement.closest('.tenfoot-card'), 'the selection on a card, not a banner that is not there');
});

T.runAsync('Theme This Page on a list: Card Size — Large is four across, Small six', async () => {
  const cols = (p) => p.doc.querySelector('.tenfoot-screen .tenfoot-screen-grid').style.getPropertyValue('--tf-cols');
  const p = await boot({ html: fixture('my-list.html'), url: 'https://watch.dropout.tv/my-list', settings: { pageLooks: { lists: { cards: 'large' } } } });
  T.eq([p.doc.documentElement.dataset.tenfootLookCards, cols(p)], ['large', '4']);
  await p.shim.changeStorage({ settings: { newValue: { hintBar: true, pageLooks: { lists: { cards: 'small' } } } } });
  await T.sleep(20);
  T.eq([p.doc.documentElement.dataset.tenfootLookCards, cols(p)], ['small', '6']);
});

T.runAsync('Theme This Page on an episode\'s details page: the picture on the left', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video, settings: { pageLooks: { details: { picture: 'left' } } } });
  T.eq(p.doc.documentElement.dataset.tenfootLookPicture, 'left');
  T.eq(p.doc.documentElement.dataset.tenfootLookBanner, undefined, 'only the page\'s own choices');
});

await T.exit();
