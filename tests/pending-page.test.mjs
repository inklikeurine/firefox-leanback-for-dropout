// While Leanback builds one of its screens it keeps Dropout's page hidden
// under it — never the cookie box, and never for more than ten seconds,
// whatever holds the screen up. A page left dark looked like a page loading
// for ever.
import fs from 'node:fs';
import { T } from '../../firefox-tools/harness/lib.mjs';
import { boot, fixture, PICK } from './page-support.mjs';

// "Who is watching?" before Dropout has drawn its picker, with the cookie box
// already up (a fresh profile).
const KETCH = '<div id="lanyard_root"><div id="ketch-banner" data-rect="520,375,880,331"><button id="ketch-banner-button-primary" data-rect="1194,471,163,61">Accept All</button></div></div>';
const waiting = () => ({
  html: fixture('profiles.html').replace('</body>', `${KETCH}</body>`),
  url: PICK,
  before: (win) => win.document.getElementById('profile-picker-react-app').firstElementChild.remove()
});
const pending = (p) => p.doc.documentElement.hasAttribute('data-tenfoot-pending');

T.runAsync('a screen still being built hides Dropout\'s page but not its cookie box', async () => {
  const p = await boot(waiting());
  T.ok(pending(p), 'the picker is being built: the page is hidden under it');
  const s = p.doc.createElement('style');
  s.textContent = fs.readFileSync(T.extFile('content/page.css'), 'utf8');
  p.doc.head.appendChild(s);
  T.eq(p.win.getComputedStyle(p.doc.body).visibility, 'hidden', 'the page');
  T.eq(p.win.getComputedStyle(p.$('lanyard_root')).visibility, 'visible', 'the cookie box is not');
});

T.runAsync('a screen that never gets built (the cookie box up all the while) leaves the page hidden ten seconds at most', async () => {
  const p = await boot(waiting());
  T.ok(pending(p));
  await T.sleep(9000);
  T.ok(pending(p), 'still waiting at nine seconds');
  await T.sleep(1500);
  T.notOk(pending(p), 'shown by ten');
});
await T.exit();
