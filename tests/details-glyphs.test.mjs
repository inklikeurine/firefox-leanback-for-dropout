// An episode's details page: Watch (or Resume) keeps its words, with a play
// glyph; Start Over, Episodes and Clear Progress are round glyph-only buttons,
// each named by its words, which show under it while it is selected.
import { T } from '../../firefox-tools/harness/lib.mjs';
import { fixture, boot, URLS, leftAt } from './page-support.mjs';

const btn = (p, key) => p.doc.querySelector(`.tenfoot-hero-actions [data-tenfoot-action="${key}"]`);
const glyphOf = (b) => b && b.querySelector('svg.tenfoot-hero-glyph') && b.querySelector('svg.tenfoot-hero-glyph').dataset.glyph;

T.runAsync('details page: Resume has a play glyph and its words; Start Over, Episodes and Clear Progress are glyph-only, named by their words', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video, progress: leftAt(600) });
  await T.sleep(100);
  const resume = btn(p, 'watch');
  T.eq([resume.textContent.trim(), glyphOf(resume), resume.hasAttribute('data-tenfoot-icon')], ['Resume', 'play', false], 'Resume: words and a play glyph');
  for (const [key, glyph, words] of [['restart', 'restart', 'Start Over'], ['episodes', 'episodes', 'Episodes'], ['clear', 'clear', 'Clear Progress']]) {
    const b = btn(p, key);
    T.ok(b, key + ' is there');
    T.eq([b.getAttribute('data-tenfoot-icon'), glyphOf(b), b.getAttribute('aria-label'), b.querySelector('.tenfoot-hero-word').textContent], ['true', glyph, words, words], key + ': glyph-only, named by its words');
  }
  T.notOk(btn(p, 'mylist').hasAttribute('data-tenfoot-icon'), 'My List keeps its words');
});

T.runAsync('details page: never watched, Watch has its play glyph and Episodes is glyph-only', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  await T.sleep(100);
  T.eq([btn(p, 'watch').textContent.trim(), glyphOf(btn(p, 'watch'))], ['Watch', 'play']);
  T.eq(btn(p, 'episodes').getAttribute('data-tenfoot-icon'), 'true');
});
await T.exit();
