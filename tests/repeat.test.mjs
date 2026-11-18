// nav/repeat.js — a held button's repeats (Accessibility → Remote, #20), on
// a pretend clock, for both kinds of remote: one press held down (keydown,
// the system's repeats, keyup) and many quick separate presses.
import { T, makeDom } from '../../firefox-tools/harness/lib.mjs';
import { boot as bootPlayer } from './player-support.mjs';
import { boot as bootPage, fixture, URLS } from './page-support.mjs';

function rig(settings) {
  const vm = makeDom();
  vm.runScripts([T.extFile('nav/repeat.js')]);
  const R = vm.window.TenfootRepeat;
  let t = 0;
  let timers = [];
  const moves = [];
  const r = R.createRepeater({
    settings: () => settings,
    move: (a) => { moves.push([a, t]); return true; },
    now: () => t,
    setTimeout: (fn, ms) => { const id = { at: t + ms, fn }; timers.push(id); return id; },
    clearTimeout: (id) => { timers = timers.filter((x) => x !== id); },
  });
  const advance = (ms) => {
    const end = t + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > end) break;
      timers.shift();
      t = next.at;
      next.fn();
    }
    t = end;
  };
  const down = (key, repeat = false) => r.keydown({ key, repeat }, 'right');
  const up = (key) => r.keyup({ key });
  return { R, r, moves, advance, down, up, at: () => t };
}

T.run("as the system says (today's): a press moves; the system's repeats move no faster than Repeat Speed", () => {
  const k = rig({ repeatDelay: 'system', repeatRate: 12, bounceMs: 0 });
  T.eq(k.down('ArrowRight'), 'move');
  k.advance(40);
  T.eq(k.down('ArrowRight', true), 'skip', 'too soon after the last move');
  k.advance(50);
  T.eq(k.down('ArrowRight', true), 'move');
  T.eq(k.moves.length, 0, 'no repeats of its own');
});

T.run("Repeat Starts After 0.5 s at 4 a second: Leanback's own repeats, until the button is let go", () => {
  const k = rig({ repeatDelay: 500, repeatRate: 4, bounceMs: 0 });
  T.eq(k.down('ArrowRight'), 'move');
  k.advance(499);
  T.eq(k.moves.length, 0, 'nothing before the wait');
  k.advance(1);
  T.eq(k.moves.map((m) => m[1]), [500]);
  T.eq(k.down('ArrowRight', true), 'skip', "the system's repeats are not moves");
  k.advance(500);
  T.eq(k.moves.map((m) => m[1]), [500, 750, 1000]);
  k.up('ArrowRight');
  k.advance(1000);
  T.eq(k.moves.length, 3, 'let go: no more');
});

T.run('Repeat Starts After Never: a held button moves once', () => {
  const k = rig({ repeatDelay: 'never', repeatRate: 12, bounceMs: 0 });
  T.eq(k.down('ArrowRight'), 'move');
  k.advance(800);
  T.eq([k.down('ArrowRight', true), k.moves.length], ['skip', 0]);
});

T.run('Ignore Quick Second Press: a second press soon after is ignored; a later one counts; another button always counts', () => {
  const k = rig({ repeatDelay: 'system', repeatRate: 12, bounceMs: 300 });
  T.eq(k.down('ArrowRight'), 'move');
  k.advance(50);
  k.up('ArrowRight');
  k.advance(200);
  T.eq(k.down('ArrowRight'), 'skip', 'within 0.3 s of letting go');
  k.up('ArrowRight');
  k.advance(400);
  T.eq(k.down('ArrowRight'), 'move');
  k.up('ArrowRight');
  k.advance(50);
  T.eq(k.down('ArrowLeft'), 'move', 'a different button');
});

T.run("a remote that repeats with separate presses is still a hold: Ignore Quick Second Press doesn't stop it", () => {
  const k = rig({ repeatDelay: 'system', repeatRate: 12, bounceMs: 300 });
  const got = [];
  for (let i = 0; i < 8; i += 1) {
    got.push(k.down('ArrowRight'));
    k.advance(30);
    k.up('ArrowRight');
    k.advance(70);
  }
  T.eq(got[0], 'move');
  T.eq(got.slice(1, 3), ['skip', 'skip'], 'not before the hold is 0.3 s old');
  T.ok(got.slice(3).every((g) => g === 'move'), 'then it keeps moving: ' + got.join(','));
});

T.run("Leanback's own repeats stop if the system's stop arriving without a release", () => {
  const k = rig({ repeatDelay: 250, repeatRate: 10, bounceMs: 0 });
  k.down('ArrowRight');
  k.advance(300);
  k.down('ArrowRight', true);
  const before = k.moves.length;
  k.advance(2000);
  T.ok(k.moves.length - before <= 6, 'stopped within half a second: ' + (k.moves.length - before));
});

T.run('any other button ends a hold', () => {
  const k = rig({ repeatDelay: 250, repeatRate: 10, bounceMs: 0 });
  k.down('ArrowRight');
  T.eq(k.r.keydown({ key: 'Enter', repeat: false }, 'select'), 'pass');
  k.advance(1000);
  T.eq(k.moves.length, 0);
});

T.run('the player keeps its own timing until a Remote setting is changed', () => {
  const k = rig({});
  T.eq([k.R.isCustom({ repeatDelay: 'system', repeatRate: 12, bounceMs: 0 }), k.R.isCustom({ repeatDelay: 'never' }), k.R.isCustom({ repeatRate: 6 }), k.R.isCustom({ bounceMs: 200 })], [false, true, true, true]);
});

T.runAsync('in the player, Repeat Starts After Never: a held ▶ seeks once', async () => {
  const { key, st } = await bootPlayer({ settings: { repeatDelay: 'never', seekStep: 10 } });
  st.currentTime = 20;
  key('ArrowRight');
  const once = st.currentTime;
  key('ArrowRight', { repeat: true });
  key('ArrowRight', { repeat: true });
  T.eq([once, st.currentTime], [30, 30]);
});

T.runAsync('on a page, Repeat Starts After Never: a held ▶ moves once', async () => {
  const p = await bootPage({ html: fixture('home.html'), url: URLS.browse, settings: { repeatDelay: 'never' } });
  await T.sleep(200);
  p.key('ArrowDown');
  await T.sleep(200);
  const first = p.doc.activeElement;
  p.key('ArrowRight');
  const second = p.doc.activeElement;
  await T.sleep(200);
  p.key('ArrowRight', { repeat: true });
  await T.sleep(200);
  T.ok(second !== first, 'the press moved');
  T.eq(p.doc.activeElement, second, 'the repeat did not');
});

await T.exit();
