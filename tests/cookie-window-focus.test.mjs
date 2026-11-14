// A cookie window of Ketch's opened from Leanback's settings takes the
// selection before the page script sees it open. When it closes, the
// selection comes back to where it was before (or the page's own first stop),
// never to nothing.
import { T } from '../../firefox-tools/harness/lib.mjs';
import { fixture, boot, URLS, moveTo, kbOpen } from './page-support.mjs';

const FOOTER = '<footer class="footer--site"><a class="site-font-secondary-color legal-link manage-cookies-link" href="#" data-rect="10,1000,160,20">Manage Cookie Preferences</a></footer>';
// Ketch's Cookie Preferences window, as it opens: mounted in #lanyard_root,
// the selection moved into it at once (its focus trap), on its first link.
const KETCH = '<div id="ketch-modal" data-rect="595,89,730,901"><div id="ketch-purposes-modal"><a id="kprivacy" href="#" data-rect="1076,512,85,22">Privacy Policy</a>' +
  '<button id="kaccept" aria-label="Accept All" data-rect="1155,567,146,48">Accept All</button><button id="kconfirm" aria-label="Confirm My Choices" data-rect="1064,923,237,48">Confirm My Choices</button></div></div>';

function wireKetch(p) {
  p.doc.querySelector('.manage-cookies-link').addEventListener('click', (e) => {
    e.preventDefault();
    let root = p.$('lanyard_root');
    if (!root) {
      root = p.doc.createElement('div');
      root.id = 'lanyard_root';
      p.doc.body.appendChild(root);
    }
    root.insertAdjacentHTML('beforeend', KETCH);
    p.$('kprivacy').focus();
    p.$('kconfirm').addEventListener('click', () => p.$('ketch-modal').remove());
  });
}

const activeIn = (p) => {
  const a = p.doc.activeElement;
  if (!a || a === p.doc.body) return 'nothing';
  if (a.closest('.tenfoot-rail')) return 'rail:' + (a.getAttribute('aria-label') || '');
  if (a.closest('.tenfoot-kb')) return 'keyboard';
  return a.id || a.className;
};

T.runAsync('Search → the rail → Leanback settings → Cookie Preferences → Confirm My Choices: the selection is back on the rail or the keys, never on nothing', async () => {
  const p = await boot({ html: fixture('search.html').replace('</body>', `${FOOTER}</body>`), url: URLS.search });
  wireKetch(p);
  T.ok(kbOpen(p), 'the docked keyboard is up');
  p.key('ArrowLeft');
  T.ok(activeIn(p).startsWith('rail:'), 'on the rail');
  await p.act('menu');
  await moveTo(p, 'cookies', 20);
  const before = (await p.state()).menu;
  T.ok(Array.isArray(before), 'the settings are open');
  p.key('Enter');
  await T.sleep(250);
  T.eq(p.doc.activeElement.id, 'kprivacy', 'Ketch took the selection');
  p.doc.activeElement.blur();
  p.$('kconfirm').focus();
  p.key('Enter');
  await T.sleep(250);
  T.notOk(p.$('ketch-modal'), 'the window closed');
  const now = activeIn(p);
  T.ok(now !== 'nothing' && now !== 'kprivacy', 'the selection is somewhere, got: ' + now);
  T.ok(now.startsWith('rail:') || now === 'keyboard', 'back on the rail it was on, or the page\'s first stop, the keys; got: ' + now);
});

T.runAsync('a cookie window that took the selection when nothing outside it had been selected: on close, the page\'s first stop (the search page\'s keys)', async () => {
  const p = await boot({ html: fixture('search.html').replace('</body>', `${FOOTER}</body>`), url: URLS.search });
  wireKetch(p);
  // The window opens as the page does, before any stop of Leanback's was selected.
  p.doc.querySelector('.manage-cookies-link').click();
  await T.sleep(250);
  p.$('kconfirm').click();
  await T.sleep(250);
  T.eq(activeIn(p), 'keyboard', 'got: ' + activeIn(p));
});
await T.exit();
