// lib/common.js on its own: a selector that is wrong never throws, a rule may
// be a list, a time reads as the screen writes it, and a message always comes
// back as an object.
import { T, makeDom } from '../../firefox-tools/harness/lib.mjs';

function load(browser) {
  const dom = makeDom({ html: '<!doctype html><html><body><p class="a" id="one">One&nbsp; <b>two</b></p><p class="b">three</p></body></html>', url: 'https://watch.dropout.tv/browse', browser });
  dom.runScripts([T.extFile('lib/common.js')]);
  return { doc: dom.window.document, C: dom.window.TenfootCommon };
}

T.run('selectors: a rule may be a list; a bad or missing one finds nothing and never throws', () => {
  const { doc, C } = load();
  T.eq(C.qs('.a').id, 'one');
  T.eq(C.qsa(['.a', '.b']).length, 2, 'a list is one selector');
  T.eq(C.qsa(['.b', '', 7]).length, 1, 'empty and non-string entries are dropped');
  T.eq([C.qs('p[', doc), C.qsa('p['), C.qs(null), C.qsa(undefined), C.qs([])], [null, [], null, [], null]);
  T.eq(C.qs('b', C.qs('.b')), null, 'only inside the scope given');
  T.eq([C.matches(C.qs('.a'), '.a'), C.matches(C.qs('.a'), 'p['), C.matches(C.qs('.a'), null), C.matches(null, '.a')], [true, false, false, false]);
});

T.run('profileIndex: the page\'s VHX.config.profile_index, from its inline script; 0 when it says nothing', () => {
  const { doc, C } = load();
  T.eq(C.profileIndex(doc), 0, 'nothing on the page');
  const s = doc.createElement('script');
  s.type = 'text/plain'; // jsdom would run a real one
  s.textContent = 'window.VHX = window.VHX || {};\n window.VHX.config = { api_url: "https://api.vhx.tv", user_has_subscription: "true",\n profile_index: 1\n };';
  doc.body.appendChild(s);
  T.eq(C.profileIndex(doc), 1);
  s.textContent = 'var x = { profile_index: 12 }';
  T.eq(C.profileIndex(doc), 12);
});

T.run('text: runs of white space, non-breaking ones too, are one space', () => {
  const { C } = load();
  T.eq(C.textOf(C.qs('.a')), 'One two');
  T.eq(C.textOf(null), '');
});

T.run('clock: as the screen writes a time; nothing sensible reads 0:00', () => {
  const { C } = load();
  T.eq([C.clock(0), C.clock(65.7), C.clock(3723), C.clock(36000)], ['0:00', '1:05', '1:02:03', '10:00:00']);
  T.eq([C.clock(-5), C.clock(NaN), C.clock(Infinity), C.clock(undefined)], ['0:00', '0:00', '0:00', '0:00'], 'a live stream has no length');
});

T.runAsync('send: the reply is always an object', async () => {
  const replies = [{ ok: true }, undefined, new Error('Could not establish connection')];
  const browser = { runtime: { sendMessage: async () => { const r = replies.shift(); if (r instanceof Error) throw r; return r; } } };
  const { C } = load(browser);
  T.eq(await C.send({ type: 'x' }), { ok: true });
  T.eq(await C.send({ type: 'x' }), { ok: false, error: 'No reply' });
  T.eq(await C.send({ type: 'x' }), { ok: false, error: 'Could not establish connection' });
});

await T.exit();
