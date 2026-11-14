// Ketch's own windows (Customize Settings, Cookie Preferences) stop the page
// scrolling by pinning <body> (position: fixed), which would put them under
// Leanback's screens. content/page.css keeps the body unpinned while Leanback
// is on. jsdom does not load the extension's CSS, so the stylesheet is put on
// the page here.
import fs from 'node:fs';
import { T } from '../../firefox-tools/harness/lib.mjs';
import { boot, SIGNIN } from './page-support.mjs';

const css = fs.readFileSync(T.extFile('content/page.css'), 'utf8');

function withCss(p) {
  const s = p.doc.createElement('style');
  s.textContent = css;
  p.doc.head.appendChild(s);
}

T.runAsync('cookie window: on sign-in, Ketch pinning the body for its Customize Settings window leaves the body unpinned, so the window is not under Leanback\'s screen', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  withCss(p);
  p.doc.body.setAttribute('style', 'top: 0px; position: fixed; width: 100%;');
  T.eq(p.win.getComputedStyle(p.doc.body).position, 'relative', 'the body stays where it is');
});

T.runAsync('cookie window: with Leanback off, the body is Ketch\'s to pin', async () => {
  const p = await boot({ html: SIGNIN, url: 'https://watch.dropout.tv/login' });
  withCss(p);
  p.doc.documentElement.dataset.tenfoot = 'off';
  p.doc.body.setAttribute('style', 'top: 0px; position: fixed; width: 100%;');
  T.eq(p.win.getComputedStyle(p.doc.body).position, 'fixed');
});
await T.exit();
