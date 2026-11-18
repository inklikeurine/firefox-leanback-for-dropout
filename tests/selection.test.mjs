// Selection (Accessibility, #56): Ring Edge, Ring Style, Dim Around Selection
// and the thicker ring widths — the settings, what lib/themes.js writes for
// the stylesheets, and the dimming box that follows the ring.
import { T, makeDom } from '../../firefox-tools/harness/lib.mjs';

function load(files) {
  const d = makeDom({ clock: true,
    html: '<!doctype html><html><body><div class="tenfoot-settings"><a id="row" data-rect="1400,100,400,60">Row</a></div><a id="a" data-rect="100,200,352,198">A</a></body></html>',
  });
  d.runScripts(files.map((f) => T.extFile(f)));
  return d.window;
}

T.run('the Selection settings: their values, today\'s look as the default, and anything else back to it', () => {
  const win = load(['lib/settings.js']);
  const S = win.TenfootSettings;
  T.eq([S.RING_EDGES, S.RING_STYLES, S.DIM_AROUND], [['dark', 'light', 'off'], ['solid', 'glow', 'underline', 'corners'], ['off', 'light', 'strong']]);
  const d = S.normalize(null);
  T.eq([d.ringEdge, d.ringStyle, d.dimAround], ['dark', 'solid', 'off']);
  const bad = S.normalize({ ringEdge: 'neon', ringStyle: 'stars', dimAround: 'total' });
  T.eq([bad.ringEdge, bad.ringStyle, bad.dimAround], ['dark', 'solid', 'off']);
  const ok = S.normalize({ ringEdge: 'light', ringStyle: 'corners', dimAround: 'strong', ringWidth: 24 });
  T.eq([ok.ringEdge, ok.ringStyle, ok.dimAround, ok.ringWidth], ['light', 'corners', 'strong', 24]);
  T.eq(S.RING_WIDTHS.slice(-3), [16, 20, 24], 'thicker rings');
});

T.run('the Selection settings are in Accessibility, under Selection, with Ring Width and Enlarge Selection', () => {
  const S = load(['lib/settings.js']).TenfootSettings;
  for (const id of ['ringWidth', 'ringEdge', 'ringStyle', 'dimAround', 'focusZoom']) {
    const r = S.rowOf(id);
    T.eq([r.group, r.menu, r.look], ['Selection', 'accessibility', true], id);
  }
  T.eq([S.rowOf('ringEdge').label, S.rowOf('ringStyle').label, S.rowOf('dimAround').label], ['Ring Edge', 'Ring Style', 'Dim Around Selection']);
  T.eq(S.rowOf('ringColor').group, 'Look', 'Theme Color stays in Look');
});

T.run('the page and the player frame get the Selection choices as attributes; today\'s look writes none', () => {
  const win = load(['lib/settings.js', 'lib/themes.js']);
  const S = win.TenfootSettings;
  const Th = win.TenfootThemes;
  const root = win.document.documentElement;
  Th.apply(root, { ...S.normalize(null), ringEdge: 'light', ringStyle: 'glow', dimAround: 'strong' }, new Date(2026, 6, 4));
  T.eq([root.dataset.tenfootRingEdge, root.dataset.tenfootRingStyle, root.dataset.tenfootDim], ['light', 'glow', 'strong']);
  Th.apply(root, S.normalize(null), new Date(2026, 6, 4));
  T.eq([root.dataset.tenfootRingEdge, root.dataset.tenfootRingStyle, root.dataset.tenfootDim], [undefined, undefined, undefined]);
  Th.applyPlayer(root, { ...S.normalize(null), ringEdge: 'off', ringStyle: 'glow' });
  T.eq([root.dataset.tenfootRingEdge, root.dataset.tenfootRingStyle], ['off', 'glow']);
});

T.runAsync('the dimming box follows the ring, and hides with it or in Leanback\'s own boxes', async () => {
  const win = load(['lib/common.js', 'nav/focus-ring.js']);
  const ring = win.TenfootFocusRing.createRing(win.document, { width: 4, zoom: 0 });
  const dim = win.document.querySelector('.tenfoot-dim');
  T.ok(dim && ring.dimElement === dim, 'one dimming box');
  ring.follow(win.document.getElementById('a'));
  T.eq([dim.hidden, dim.style.transform, dim.style.width], [false, ring.element.style.transform, ring.element.style.width]);
  ring.follow(win.document.getElementById('row'));
  T.eq(dim.hidden, true, 'a selection in the settings panel is not spotlit');
  ring.follow(win.document.getElementById('a'));
  ring.hide();
  T.eq(dim.hidden, true, 'gone with the ring');
});
