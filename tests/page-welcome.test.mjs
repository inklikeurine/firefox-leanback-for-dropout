// content/page.js on Dropout's front page signed out (the welcome) and the policies.
import path from 'node:path';
import { T } from '../../firefox-tools/harness/lib.mjs';
import { rules, fixture, boot, watch, FRONT, POLICY } from './page-support.mjs';

T.runAsync("welcome: signed out, Dropout's front page is Leanback's welcome — the logo, the line, Sign In selected, Browse and the policies; no rail", async () => {
  const p = await boot({ html: FRONT, url: 'https://watch.dropout.tv/' });
  const s = await p.state();
  T.eq(s.kind, 'welcome');
  const layer = p.doc.querySelector('.tenfoot-screen');
  T.eq([layer.hidden, layer.dataset.tenfootScreen, layer.dataset.tenfootNorail], [false, 'welcome', 'true']);
  T.eq(p.doc.querySelector('.tenfoot-hero-logo').getAttribute('src'), 'https://fixture.test/poster.svg');
  T.eq(p.doc.querySelector('.tenfoot-hero-title').textContent, 'Independent. Funny. Ad Free.');
  T.ok(/dropout\.tv on a phone or a computer/.test(p.doc.querySelector('.tenfoot-hero-text').textContent), 'where to start a subscription');
  const buttons = [...p.doc.querySelectorAll('.tenfoot-hero-action')];
  T.eq(buttons.map((b) => b.textContent), ['Sign In', 'Browse', 'Privacy Policy', 'Terms of Use']);
  T.eq(buttons.map((b) => b.getAttribute('href')), [rules.signinUrl, rules.browseUrl, ...rules.legal.map((l) => l.url)]);
  T.eq(p.doc.activeElement, buttons[0]);
  p.key('ArrowRight');
  T.eq(p.doc.activeElement, buttons[1], '▶ along the buttons');
  T.notOk(p.doc.querySelector('.tenfoot-rail:not([hidden])'), 'no rail');
});

T.runAsync('welcome: signed in, the front page goes on to Home', async () => {
  const p = await boot({ html: FRONT.replace('logged-out', 'logged-in'), url: 'https://watch.dropout.tv/' });
  T.eq((await p.state()).navigation, rules.browseUrl);
});

T.runAsync('policies: privacy, terms and cookies in Leanback\'s type, Dropout\'s top bar and footer gone; ▲ ▼ scroll, nothing is a stop', async () => {
  const scrolled = [];
  const p = await boot({ html: POLICY, url: 'https://watch.dropout.tv/privacy', before: (win) => { win.scrollBy = (o) => scrolled.push(o.top); } });
  T.eq((await p.state()).kind, 'legal');
  T.ok(p.$('customer-agreements').hasAttribute('data-tenfoot-reading'), 'the words, for content/page.css');
  T.ok(p.doc.querySelector('.promo-banner').hasAttribute('data-tenfoot-gone'));
  T.ok(p.doc.querySelector('.site-header').hasAttribute('data-tenfoot-chrome'));
  T.ok(p.doc.querySelector('footer').hasAttribute('data-tenfoot-chrome'));
  T.ok(p.key('ArrowDown').defaultPrevented);
  p.key('ArrowDown');
  p.key('ArrowUp');
  T.eq(scrolled.map((y) => Math.sign(y)), [1, 1, -1], '▼ ▼ ▲');
  T.ok(scrolled[0] > 0 && scrolled[0] < p.win.innerHeight, 'most of a screen at a time');
  T.ok(p.ring().hidden, 'nothing selected');
  T.ok(/Scroll/.test(p.hints().textContent));
  for (const path of ['/tos', '/cookies']) {
    const q = await boot({ html: POLICY, url: `https://watch.dropout.tv${path}` });
    T.eq((await q.state()).kind, 'legal', path);
  }
});

await T.exit();
