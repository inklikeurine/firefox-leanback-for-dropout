// content/page.js on an episode: its details page, then the video, the player hand-off, and Back.
import { T } from '../../firefox-tools/harness/lib.mjs';
import { fixture, URLS, boot, SEASON3, EP0, EP2, trailOf, episodeOrder, trailNow, leftAt, watch, firefoxBack } from './page-support.mjs';

T.runAsync('an episode opens on its details page: nothing plays, the selection on Watch, the rail beside it (D1, D6)', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  const s = await p.state();
  T.eq([s.kind, s.watch, s.theater, s.playerFocused, s.focused.text], ['video', 'details', false, false, 'Watch']);
  T.ok(p.doc.activeElement.closest('.tenfoot-screen'), 'on Leanback\'s screen');
  T.ok(s.rail && s.rail.active === false, 'the rail is there');
  T.eq(p.last('player:hold').on, true, 'the player is told to hold the video');
  T.eq((await p.msg({ type: 'page:info' })).hold, true, 'and says so when the player asks');
  T.notOk(p.doc.documentElement.classList.contains('tenfoot-theater'));
  T.ok(p.$('watch-player').hasAttribute('data-tenfoot-theater-root'));
  T.notOk(p.hints().hidden, 'the hint bar, as on any page');
  p.key('ArrowLeft');
  T.eq((await p.state()).rail.active, true, '◀ onto the rail');
});

T.runAsync('the details page: the show, the title, the synopsis, the picture on the right; Watch, Add to My List, Episodes (D2, D3)', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  const s = await p.state();
  T.eq(s.home.episode, { show: 'Game Changer', title: 'Episode', meta: null, actions: ['Watch', 'My List', 'Episodes'], image: 'https://watch.dropout.tv/art-5.svg', left: null });
  const L = p.doc.querySelector('.tenfoot-screen');
  T.eq(L.querySelector('.tenfoot-hero').dataset.tenfootLayout, 'details');
  T.notOk(L.querySelector('.tenfoot-screen-picture').hidden, 'the picture');
  T.eq(L.querySelector('.tenfoot-screen-picture img').getAttribute('src'), 'https://watch.dropout.tv/art-5.svg');
  T.ok(L.querySelector('.tenfoot-screen-picture .tenfoot-card-progress').hidden, 'not started: no progress on it');
  T.eq(L.querySelector('.tenfoot-hero-label').textContent, 'Game Changer');
  T.eq(L.querySelector('.tenfoot-hero-text').textContent, 'Sam asks the contestants to play a game they have never seen.');
  T.eq(L.querySelectorAll('.tenfoot-card').length, 0, 'no row of cards under it');
  T.ok(L.querySelector('.tenfoot-hero-primary').textContent === 'Watch', 'Watch is the yellow one');
  p.key('ArrowRight');
  T.eq([p.doc.activeElement.textContent, p.doc.activeElement.getAttribute('aria-label'), p.doc.activeElement.dataset.tenfootListed], ['My List', 'Add to My List', 'false']);
  p.key('ArrowRight');
  T.eq(p.doc.activeElement.getAttribute('href'), 'https://watch.dropout.tv/game-changer', 'Episodes: the show, as this page names no season');
  p.key('ArrowDown');
  p.key('ArrowUp');
  T.eq(p.doc.activeElement.textContent, 'Episodes', 'nothing above or below the buttons');
  T.eq((await p.state()).theater, false, 'and ▲ is not the player any more');
});

T.runAsync('part-watched: Resume, Start Over beside it, and the picture with its progress and the time left (D3, D4)', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video, progress: leftAt(600) });
  const s = await p.state();
  T.eq([s.home.episode.actions, s.home.episode.left, s.focused.text], [['Resume', 'Start Over', 'My List', 'Episodes', 'Clear Progress'], '15:00 left', 'Resume']);
  T.eq(p.doc.querySelector('.tenfoot-screen-picture .tenfoot-card-progress-fill').style.width, '40%');
  T.eq(p.doc.querySelector('.tenfoot-screen-picture .tenfoot-card-time').textContent, '15:00 left');
  const q = await boot({ html: fixture('video.html'), url: URLS.video, progress: leftAt(1490) });
  T.eq((await q.state()).home.episode.actions, ['Watch', 'My List', 'Episodes', 'Clear Progress'], 'finished: Watch, from the beginning');
});

T.runAsync('Clear Progress: the episode unstarted again, the selection back on Watch, a notice', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video, progress: leftAt(600) });
  for (let i = 0; i < 4; i++) p.key('ArrowRight');
  T.eq(p.doc.activeElement.textContent, 'Clear Progress', 'last in the row');
  p.key('Enter');
  await T.sleep(20);
  T.eq(p.last('history:forget').key, 'ep1');
  const s = await p.state();
  T.eq([s.home.episode.actions, s.home.episode.left, s.focused.text], [['Watch', 'My List', 'Episodes'], null, 'Watch']);
  T.ok(p.doc.querySelector('.tenfoot-screen-picture .tenfoot-card-progress').hidden, 'no progress on the picture');
  T.ok(p.hints().textContent.includes('Progress cleared'), p.hints().textContent);
  T.eq((await p.msg({ type: 'page:info' })).hold, true, 'nothing plays');
});

T.runAsync('Watch: the video in the full window, a step of its own in the history, the player told to play — the press being the viewer\'s (D1, D5)', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  await watch(p);
  const s = await p.state();
  T.eq([s.watch, s.theater, s.playerFocused, s.ring], ['playing', true, true, false]);
  T.eq([p.win.history.state, p.win.history.length], [{ tenfootPlay: true }, 2], 'a step above the details page');
  const h = p.last('player:hold');
  T.eq([h.on, h.play, h.restart, h.gesture], [false, true, false, true]);
  T.eq(p.last('player:focus').type, 'player:focus');
  T.eq(trailNow(p).map((e) => Boolean(e.play)), [false, true], 'the trail has the step too');
  T.eq(trailNow(p)[1].kind, 'video', 'described as its page is');
  T.eq((await p.msg({ type: 'page:info' })).hold, false);
});

T.runAsync('the words to the player are numbered; after Watch, a frame still holding the video is told again, twice at most', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  const seqs = () => p.bg.filter((m) => m.type === 'player:hold').map((m) => m.seq);
  await watch(p);
  T.eq(seqs(), [1, 2], 'hold, then play');
  await p.msg({ type: 'player:state', state: { held: true, paused: true } });
  await T.sleep(2600);
  T.eq(seqs(), [1, 2, 3], 'still held: play again');
  await T.sleep(2600);
  T.eq(seqs(), [1, 2, 3, 4]);
  await T.sleep(2600);
  T.eq(seqs(), [1, 2, 3, 4], 'and no more');
  const q = await boot({ html: fixture('video.html'), url: URLS.video });
  await watch(q);
  await q.msg({ type: 'player:state', state: { held: false, paused: false } });
  await T.sleep(2600);
  T.eq(q.bg.filter((m) => m.type === 'player:hold').length, 2, 'playing: nothing more to say');
}, 12000);

T.runAsync('Resume says where it picks up; Start Over plays from the beginning and says nothing', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video, progress: leftAt(600) });
  await watch(p);
  T.ok(p.hints().textContent.includes('Resumed at 10:00'), 'after the key\'s own hints: ' + p.hints().textContent);
  T.eq(p.last('player:hold').restart, false);
  const q = await boot({ html: fixture('video.html'), url: URLS.video, progress: leftAt(600) });
  q.key('ArrowRight');
  T.eq(q.doc.activeElement.textContent, 'Start Over');
  await watch(q);
  T.eq([q.last('player:hold').restart, (await q.state()).watch], [true, 'playing']);
  await q.msg({ type: 'player:resumed', at: 600 });
  T.notOk(q.hints().textContent.includes('Resumed'), 'the frame\'s word on a resume is not shown: ' + q.hints().textContent);
});

T.runAsync('Back while it plays: the details page again, now saying Resume, and the video held (D5)', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  await watch(p);
  T.notOk(p.key('BrowserBack').defaultPrevented, 'the remote\'s Back is Firefox\'s');
  await firefoxBack(p);
  let s = await p.state();
  T.eq([s.watch, s.theater, s.playerFocused, s.focused.text], ['details', false, false, 'Watch']);
  T.eq([p.last('player:hold').on, p.win.history.state], [true, null]);
  T.eq(trailNow(p).length, 1, 'the step is off the trail');
  T.notOk(p.hints().hidden, 'hints back');
  await p.shim.changeStorage({ 'progress:0': { newValue: leftAt(600) } });
  await T.sleep(20);
  s = await p.state();
  T.eq([s.home.episode.actions.slice(0, 2), s.focused.text], [['Resume', 'Start Over'], 'Resume'], 'where it got to, on the same button');
  await T.sleep(900);
  T.eq([(await p.state()).navigation, p.win.__went], [null, []], 'no Back of Leanback\'s racing Firefox\'s');
  p.win.history.forward();
  await T.sleep(40);
  T.eq((await p.state()).watch, 'playing', 'Forward plays it again');
}, 5000);

T.runAsync('Escape is the same Back: off the video to the details page, then out of the episode', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video, before: trailOf({ url: SEASON3, kind: 'series', group: 'game-changer' }) });
  await watch(p);
  p.key('Escape');
  await T.sleep(30);
  T.eq(p.win.__went, [-1], 'one step back in the history, as BrowserBack would');
  await firefoxBack(p);
  T.eq((await p.state()).watch, 'details');
  p.key('Escape');
  await T.sleep(30);
  T.eq(p.win.__went, [-1, -1], 'then the episode itself');
  const intent = JSON.parse(p.win.sessionStorage.getItem('tenfoot.intent'));
  T.eq([intent.kind, intent.to], ['back', SEASON3]);
});

T.runAsync('BrowserBack with nothing behind the details page (a tab opened on the episode): Leanback walks up to the season', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video, before: episodeOrder });
  p.key('BrowserBack');
  await T.sleep(950);
  const s = await p.state();
  T.eq(s.navigation, SEASON3, 'up to the season you came from');
  T.eq(JSON.parse(p.win.sessionStorage.getItem('tenfoot.intent')).kind, 'replace', 'replacing the episode, so the history never gains a page above');
  const q = await boot({ html: fixture('video.html'), url: URLS.video });
  T.eq((await q.msg({ type: 'page:action', action: 'browser-back' })).consumed, false, 'from inside the player: handed to the page');
  await T.sleep(950);
  T.ok((await q.state()).navigation.endsWith('/game-changer'), 'and the show link when no season is known');
}, 6000);

T.runAsync('the options button: Leanback\'s settings on the details page; the player\'s panel while it plays', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  p.key('ContextMenu');
  await T.sleep(20);
  T.ok((await p.state()).menu.includes('seekStep'), 'the page\'s own panel');
  T.eq(p.last('player:settings'), undefined);
  p.key('ContextMenu');
  T.eq((await p.state()).focused.text, 'Watch', 'closed, the selection back');
  await watch(p);
  p.key('ContextMenu');
  await T.sleep(20);
  T.eq(p.last('player:settings').type, 'player:settings', 'while playing, the frame\'s');
  T.eq((await p.state()).menu, null);
});

T.runAsync('media keys: play/pause on the details page is Watch; while playing they go to the player; next/previous use the episode order', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  p.key('MediaStop');
  p.key('MediaFastForward');
  T.eq(p.last('player:command'), undefined, 'nothing playing to stop or skip');
  p.key('MediaPlayPause');
  await T.sleep(20);
  T.eq([(await p.state()).watch, p.last('player:hold').play], ['playing', true]);
  p.key('MediaPlayPause');
  T.eq(p.last('player:command').cmd, 'toggle');
  p.key('MediaStop');
  T.eq(p.last('player:command').cmd, 'stop');
  p.key('MediaFastForward');
  T.eq([p.last('player:command').cmd, p.last('player:command').by], ['seek', 30]);
  p.key('MediaRewind');
  T.eq(p.last('player:command').by, -30);
  p.win.sessionStorage.setItem('tenfoot.episodes', JSON.stringify({ series: '/game-changer', urls: [EP0, URLS.video, EP2] }));
  p.key('MediaTrackPrevious');
  T.ok((await p.state()).navigation.endsWith('/videos/ep0'));
  T.eq((await p.msg({ type: 'page:episode', delta: 1 })).done, true);
  T.ok((await p.state()).navigation.endsWith('/videos/ep2'));
  T.eq(JSON.parse(p.win.sessionStorage.getItem('tenfoot.intent')).kind, 'replace', 'another episode is sideways');
});

T.runAsync('arriving from an episode that was playing (up next, the next key, Dropout\'s countdown): this one plays straight away', async () => {
  const fromPlaying = (from) => (win) => {
    trailOf({ url: SEASON3, kind: 'series', group: 'game-changer' }, { url: EP0, kind: 'video', group: 'game-changer' }, from)(win);
  };
  const p = await boot({ html: fixture('video.html'), url: URLS.video, before: fromPlaying({ url: EP0, kind: 'video', group: 'game-changer', play: true }) });
  let s = await p.state();
  T.eq([s.watch, s.theater, s.playerFocused], ['playing', true, true]);
  T.eq(p.win.history.state, { tenfootPlay: true }, 'with its own step, so Back is its details page');
  const h = p.last('player:hold');
  T.eq([h.on, h.play, h.gesture], [false, true, false], 'played, no press of the viewer\'s claimed');
  T.eq(trailNow(p).map((e) => [e.url.split('/').pop(), Boolean(e.play)]), [['season:3', false], ['ep0', false], ['ep0', true], ['ep1', false], ['ep1', true]]);
  const q = await boot({ html: fixture('video.html'), url: URLS.video, before: fromPlaying({ url: EP0, kind: 'video', group: 'game-changer' }) });
  T.eq((await q.state()).watch, 'details', 'from its details page: the details page');
  const r = await boot({ html: fixture('video.html'), url: URLS.video, before: fromPlaying({ url: 'https://watch.dropout.tv/other/season:1/videos/x', kind: 'video', group: 'other', play: true }) });
  T.eq((await r.state()).watch, 'details', 'from another show: the details page');
});

T.runAsync('a reload while it plays carries on playing; Back is still the details page', async () => {
  const p = await boot({
    html: fixture('video.html'),
    url: URLS.video,
    before: (win) => {
      win.history.replaceState({ tenfootPlay: true }, '', win.location.href);
      trailOf({ url: URLS.video, kind: 'video', group: 'game-changer' }, { url: URLS.video, kind: 'video', group: 'game-changer', play: true })(win);
      win.performance.getEntriesByType = () => [{ type: 'reload' }];
    }
  });
  T.eq([(await p.state()).watch, p.win.history.length], ['playing', 1], 'playing, no second step');
  p.key('Escape');
  await T.sleep(30);
  T.eq(p.win.__went, [-1]);
});

T.runAsync('arriving by Back on a sibling episode (Dropout went on to the next by itself) carries on to the season page', async () => {
  const p = await boot({
    html: fixture('video.html'),
    url: URLS.video,
    before: (win) => {
      trailOf(
        { url: 'https://watch.dropout.tv/browse', kind: 'browse' },
        { url: SEASON3, kind: 'series', group: 'game-changer' },
        { url: URLS.video, kind: 'video', group: 'game-changer' },
        { url: EP2, kind: 'video', group: 'game-changer' }
      )(win);
      win.performance.getEntriesByType = () => [{ type: 'back_forward' }];
    }
  });
  T.eq(p.win.__went, [-1], 'on past the previous episode');
  T.eq(JSON.parse(p.win.sessionStorage.getItem('tenfoot.intent')).to, SEASON3);
  T.eq(p.doc.querySelector('.tenfoot-screen'), null, 'and this page was not set up on the way through');
});

T.runAsync('arriving by Back on the step of the episode before: on past its details page too, to the season', async () => {
  const p = await boot({
    html: fixture('video.html'),
    url: URLS.video,
    before: (win) => {
      win.history.replaceState({ tenfootPlay: true }, '', win.location.href);
      trailOf(
        { url: 'https://watch.dropout.tv/browse', kind: 'browse' },
        { url: SEASON3, kind: 'series', group: 'game-changer' },
        { url: URLS.video, kind: 'video', group: 'game-changer' },
        { url: URLS.video, kind: 'video', group: 'game-changer', play: true },
        { url: EP2, kind: 'video', group: 'game-changer' }
      )(win);
      win.performance.getEntriesByType = () => [{ type: 'back_forward' }];
    }
  });
  T.eq(p.win.__went, [-2], 'both of its entries at once');
  T.eq(JSON.parse(p.win.sessionStorage.getItem('tenfoot.intent')).to, SEASON3);
});

T.runAsync('Firefox\'s Back passing over the details page of a video that started by itself (nobody interacted with it): on to it', async () => {
  const trail = [
    { url: 'https://watch.dropout.tv/browse', kind: 'browse' },
    { url: SEASON3, kind: 'series', group: 'game-changer' },
    { url: URLS.video, kind: 'video', group: 'game-changer' },
    { url: URLS.video, kind: 'video', group: 'game-changer', play: true },
    { url: EP2, kind: 'video', group: 'game-changer' },
    { url: EP2, kind: 'video', group: 'game-changer', play: true }
  ];
  const land = (onStep) => (win) => {
    if (onStep) win.history.replaceState({ tenfootPlay: true }, '', win.location.href);
    trailOf(...trail)(win);
    win.performance.getEntriesByType = () => [{ type: 'back_forward' }];
  };
  const p = await boot({ html: fixture('video.html'), url: URLS.video, before: land(true) });
  T.eq(p.win.__went, [1], 'from this episode\'s step, one forward');
  T.eq(trailNow(p).map((e) => [e.url.split('/').pop(), Boolean(e.play)]), [['browse', false], ['season:3', false], ['ep1', false], ['ep1', true], ['ep2', false]], 'the trail ends on that details page');
  T.eq(p.doc.querySelector('.tenfoot-screen'), null, 'and this page was not set up on the way through');
  const q = await boot({ html: fixture('video.html'), url: URLS.video, before: land(false) });
  T.eq(q.win.__went, [2], 'from this episode\'s details page, two forward');
});

T.runAsync('coming to a details page by Back (or on to it): the details page, not playing; Dropout 24/7\'s too', async () => {
  const p = await boot({
    html: fixture('video.html'),
    url: URLS.video,
    before: (win) => {
      trailOf({ url: SEASON3, kind: 'series', group: 'game-changer' }, { url: URLS.video, kind: 'video', group: 'game-changer' })(win);
      win.performance.getEntriesByType = () => [{ type: 'back_forward' }];
    }
  });
  T.eq([(await p.state()).watch, p.win.history.length], ['details', 1]);
  const live = 'https://watch.dropout.tv/dropout-247/events/dropout-24-7';
  const q = await boot({
    html: fixture('live.html'),
    url: live,
    before: (win) => {
      trailOf({ url: 'https://watch.dropout.tv/dropout-24-7', kind: 'hub' }, { url: live, kind: 'video' })(win);
      win.performance.getEntriesByType = () => [{ type: 'back_forward' }];
    }
  });
  T.eq([(await q.state()).watch, q.last('player:hold').on], ['details', true], 'the stream waits for Watch');
});

T.runAsync('arriving by Back on the details page of the episode before (its step passed over): on to the season page', async () => {
  const p = await boot({
    html: fixture('video.html'),
    url: URLS.video,
    before: (win) => {
      trailOf(
        { url: 'https://watch.dropout.tv/browse', kind: 'browse' },
        { url: SEASON3, kind: 'series', group: 'game-changer' },
        { url: URLS.video, kind: 'video', group: 'game-changer' },
        { url: URLS.video, kind: 'video', group: 'game-changer', play: true },
        { url: EP2, kind: 'video', group: 'game-changer' }
      )(win);
      win.performance.getEntriesByType = () => [{ type: 'back_forward' }];
    }
  });
  T.eq(p.win.__went, [-1], 'one step: this is the page itself, not its step');
});

T.runAsync('arriving by Back on the season page stays there', async () => {
  const p = await boot({
    html: fixture('series.html'),
    url: SEASON3,
    before: (win) => {
      trailOf(
        { url: 'https://watch.dropout.tv/browse', kind: 'browse' },
        { url: SEASON3, kind: 'series', group: 'game-changer' },
        { url: URLS.video, kind: 'video', group: 'game-changer' }
      )(win);
      win.performance.getEntriesByType = () => [{ type: 'back_forward' }];
    }
  });
  T.eq(p.win.__went, []);
  const trail = JSON.parse(p.win.sessionStorage.getItem('tenfoot.trail'));
  T.eq(trail.map((e) => e.url), ['https://watch.dropout.tv/browse', SEASON3], 'the episode is off the trail');
  T.eq([trail[1].kind, trail[1].group, trail[1].parent], ['series', 'game-changer', 'https://watch.dropout.tv/browse'], 'and the page described itself');
});

T.runAsync('series: the season page records itself, season and all', async () => {
  const p = await boot({ html: fixture('series.html'), url: 'https://watch.dropout.tv/game-changer/season:3' });
  const stored = JSON.parse(p.win.sessionStorage.getItem('tenfoot.episodes'));
  T.eq(stored.href, 'https://watch.dropout.tv/game-changer/season:3');
});

T.runAsync('while it plays: the hints say OK plays the up-next card and ◀ hides it', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  await watch(p);
  await p.msg({ type: 'player:ready' });
  await p.msg({ type: 'player:state', state: { paused: false, upNextShowing: true, upNextCard: true } });
  const text = () => p.hints().textContent;
  T.ok(text().includes('Play next episode') && text().includes('Hide up next'), text());
  T.notOk(text().includes('+10 s'), 'not a skip while the card is up');
  await p.msg({ type: 'player:state', state: { paused: false, upNextShowing: false, upNextCard: false } });
  p.key('MediaPlayPause');
  T.ok(text().includes('−10 s / +10 s') && !text().includes('Hide up next'), 'gone with the card: ' + text());
});

T.runAsync('player:ended → autoplay next after a short delay while playing, unless turned off or hidden; never from the details page', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  await watch(p);
  await p.msg({ type: 'player:ended', upNext: { url: EP2 } });
  T.eq((await p.state()).navigation, null, 'not yet');
  await T.sleep(1400);
  T.ok((await p.state()).navigation.endsWith('/videos/ep2'));
  const q = await boot({ html: fixture('video.html'), url: URLS.video, settings: { autoplayNext: false } });
  await watch(q);
  await q.msg({ type: 'player:ended', upNext: { url: 'https://watch.dropout.tv/x' } });
  const h = await boot({ html: fixture('video.html'), url: URLS.video });
  await watch(h);
  await h.msg({ type: 'player:ended', upNext: { url: 'https://watch.dropout.tv/x' }, dismissed: true });
  const d = await boot({ html: fixture('video.html'), url: URLS.video });
  await d.msg({ type: 'player:ended', upNext: { url: 'https://watch.dropout.tv/x' } });
  const r = await boot({ html: fixture('video.html'), url: URLS.video });
  await watch(r);
  await r.msg({ type: 'player:ended', upNext: null });
  await T.sleep(1400);
  T.eq((await q.state()).navigation, null, 'autoplay off');
  T.eq((await h.state()).navigation, null, 'the viewer hid the up-next card: nothing plays by itself (P5)');
  T.eq((await d.state()).navigation, null, 'held behind the details page: nothing');
  T.eq((await r.state()).navigation, null, 'no up-next and no episode order: stays');
  T.ok(r.hints().textContent.includes('No next episode'));
}, 8000);

T.runAsync('while it plays, the page-side up-next card is taken rather than navigated past (item 7)', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  await watch(p);
  const card = p.$('page-upnext');
  const clicks = [];
  p.$('page-upnext-link').addEventListener('click', (e) => { e.preventDefault(); clicks.push('link'); });
  card.hidden = false;
  card.setAttribute('data-rect', '900,600,300,120');
  await T.sleep(200);
  T.ok(p.bg.some((m) => m.type === 'player:offer' && m.showing === true), 'the frame is told the offer is up');
  T.eq((await p.msg({ type: 'page:episode', delta: 1 })).done, true);
  T.eq(clicks, ['link'], 'the card was clicked, keeping the site\'s own resume behaviour');
  T.eq((await p.state()).navigation, null, 'nothing was navigated by hand');
});

T.runAsync('a late player frame: Watch parks the ring on its place; the frame arriving takes the keys, and player:ready says play again', async () => {
  const html = fixture('video.html').replace(/<iframe[^>]*><\/iframe>/, '');
  const p = await boot({ html, url: URLS.video });
  await watch(p);
  let s = await p.state();
  T.eq([s.watch, s.theater, s.playerFocused, s.focused.id], ['playing', true, false, 'mount'], 'waiting for the frame');
  const f = p.doc.createElement('iframe');
  f.id = 'frame'; f.src = 'https://embed.vhx.tv/videos/612228?api=1'; f.setAttribute('data-rect', '0,60,1280,720');
  p.$('mount').appendChild(f);
  await T.sleep(200);
  s = await p.state();
  T.eq([s.playerFocused, p.doc.activeElement.id], [true, 'frame']);
  const before = p.bg.filter((m) => m.type === 'player:hold').length;
  await p.msg({ type: 'player:ready', frameId: 7 });
  T.eq((await p.state()).playerReady, true);
  const holds = p.bg.filter((m) => m.type === 'player:hold');
  T.eq([holds.length - before, holds.at(-1).on, holds.at(-1).play], [1, false, true]);
});

T.runAsync('on the details page the player frame taking the focus gives it back', async () => {
  const p = await boot({ html: fixture('video.html'), url: URLS.video });
  p.$('frame').focus();
  await T.sleep(20);
  const s = await p.state();
  T.eq([s.playerFocused, s.focused.text], [false, 'Watch']);
});

T.runAsync('Dropout 24/7\'s stream opens on its details page — its name, its words, Watch, the rail — and Watch plays it, the press being the viewer\'s', async () => {
  const p = await boot({ html: fixture('live.html'), url: 'https://watch.dropout.tv/dropout-247/events/dropout-24-7' });
  let s = await p.state();
  T.eq([s.kind, s.watch, s.theater, s.playerFocused, s.focused.text, Boolean(s.rail)], ['video', 'details', false, false, 'Watch', true]);
  T.eq(s.home.episode, { show: null, title: 'Dropout 24/7', meta: null, actions: ['Watch'], image: null, left: null });
  T.eq(p.doc.querySelector('.tenfoot-screen .tenfoot-hero-text').textContent, 'An always-on channel featuring your favorite Dropout content, ad-free.');
  T.eq(p.last('player:hold').on, true, 'nothing plays until Watch');
  T.ok(p.$('live-event').hasAttribute('data-tenfoot-theater-root'));
  await watch(p);
  s = await p.state();
  T.eq([s.watch, s.theater, s.playerFocused], ['playing', true, true]);
  const h = p.last('player:hold');
  T.eq([h.on, h.play, h.gesture], [false, true, true], 'so the sound can come on with it');
  await firefoxBack(p);
  T.eq((await p.state()).watch, 'details', 'Back: its details page');
  T.eq(p.last('history:meta'), undefined, 'a live stream is not a video for the watch history');
});

await T.exit();
