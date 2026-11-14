// The remote's Back in Leanback's settings: up a level, and at the top it
// closes them, rather than leaving the page. Firefox goes back in the tab's
// history on that Back whatever the page does, so the settings stand on a
// step of their own in it while they are open.
import { T } from '../../firefox-tools/harness/lib.mjs';
import { fixture, boot, URLS, moveTo, firefoxBack } from './page-support.mjs';

const onStep = (p) => Boolean(p.win.history.state && p.win.history.state.tenfootMenu === true);

// The remote's Back: the key, then Firefox's own going back.
async function remoteBack(p) {
  p.key('BrowserBack');
  await firefoxBack(p);
  await T.sleep(40);
}

T.runAsync('settings: Back in Accessibility goes up to the settings; Back at the top closes them; the page stays', async () => {
  const p = await boot({ html: fixture('home.html'), url: URLS.browse });
  const before = p.win.history.length;
  await p.act('menu');
  T.ok(Array.isArray((await p.state()).menu), 'open');
  T.ok(onStep(p) && p.win.history.length === before + 1, 'a step of their own in the history');
  await moveTo(p, 'menu:accessibility', 30);
  p.key('Enter');
  T.ok((await p.state()).menu.includes('uiScale'), 'in Accessibility');
  await remoteBack(p);
  const up = await p.state();
  T.ok(Array.isArray(up.menu) && up.menu.includes('menu:accessibility'), 'Back: up to the settings\' top, still open');
  T.ok(onStep(p), 'standing on a step again for the next Back');
  T.eq(p.win.location.href, URLS.browse, 'the page did not change');
  await remoteBack(p);
  const s = await p.state();
  T.eq(s.menu, null, 'Back at the top: closed');
  T.eq([s.kind, p.win.location.href], ['browse', URLS.browse], 'and the page is still Home');
  T.notOk(onStep(p));
});

T.runAsync('settings: closed with the Menu button, their step comes off the history, and nothing else moves', async () => {
  const p = await boot({ html: fixture('home.html'), url: URLS.browse });
  await p.act('menu');
  T.ok(onStep(p));
  p.key('ContextMenu');
  await T.sleep(80);
  const s = await p.state();
  T.eq(s.menu, null, 'closed');
  T.notOk(onStep(p), 'off the step');
  T.eq([s.kind, p.win.location.href], ['browse', URLS.browse]);
});
await T.exit();
