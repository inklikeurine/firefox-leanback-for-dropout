// Signed out at "/", Dropout's page moves on to an address that does not
// answer (#11). Without the Navigation API (Firefox before 147, and this test
// page), Leanback stops that load once it starts; signed in, or anywhere
// else, it leaves the page alone.
import { T } from '../../firefox-tools/harness/lib.mjs';
import { boot, FRONT, fixture, URLS } from './page-support.mjs';

const counting = (box) => (win) => { win.stop = () => { box.stops += 1; }; };

T.runAsync('signed out at "/": the load is stopped, the welcome stays', async () => {
  const box = { stops: 0 };
  const p = await boot({ html: FRONT, url: 'https://watch.dropout.tv/', before: counting(box) });
  await T.sleep(100);
  T.eq(box.stops, 1);
  T.eq(p.doc.documentElement.dataset.tenfootKind, 'welcome');
});

T.runAsync('Home, or Leanback turned off: nothing is stopped', async () => {
  const home = { stops: 0 };
  await boot({ html: fixture('home.html'), url: URLS.browse, before: counting(home) });
  const off = { stops: 0 };
  await boot({ html: FRONT, url: 'https://watch.dropout.tv/', settings: { enabled: false }, before: counting(off) });
  await T.sleep(100);
  T.eq([home.stops, off.stops], [0, 0]);
});

await T.exit();
