# Changelog

## [0.33.0] — 2026-10-06

### Changed

- Inside, not on screen: Home and every other screen are drawn by one
  engine, Leanback's settings list is one piece shared by the page and the
  playback panel, and helpers that were copied between files are shared.
  Home, the screens and both settings panels look and behave as before.

### Removed

- **The restyled pages Leanback fell back on when it could not read
  Dropout's page.** A show page or search page Leanback cannot read (only
  possible if Dropout changes its site) is now Dropout's own page, still
  driven with the remote and the yellow ring, instead of a restyled one.
- Unused code: actions no remote button sent (subtitles, mute, channel
  up/down), the focus ring in the player frame, which was never drawn, and
  a message nothing sent.

## [0.32.1] — 2026-10-05

### Changed

- Code comments only: one comment reworded so it no longer names a
  particular remote. No change in behaviour.

## [0.32.0] — 2026-10-03

### Changed

- **A season's episodes are five across**, as Home's rows are.
- **The rail is on every page that does not play a video**: show pages,
  specials and the lists (Trending, New Releases…) now have it too.
- **With *Shows Open On: Newest*, the episode to watch next is near the
  top**: a season you are caught up with runs newest first, the newest
  episode top left and selected; a season you have not started (or are
  early in) runs from Episode 1.
- **Caption Style is a menu to click through**: Font, Background and Window
  each list their settings — Family, Color, Size, Opacity, Edge Style — with
  the current choice beside each; OK on one opens its choices (*Font
  Color*: White, Yellow…), and OK on a choice sets it and goes back up.

### Added

- **Dropout 24/7's stream has Leanback's look**: it plays in the full window
  like an episode, and ▼ ▼ (or Escape) shows its page — the stream in a
  large picture at the top left, its title and description, and *Play*.

## [0.31.1] — 2026-10-03

### Fixed

- **Pages no longer freeze after going back.** Going back to a page (for
  example out of an episode) could leave every key doing nothing until the
  page was reloaded; Back now always loads the page afresh.
- **Home on the rail works from Search.** After a search, it did nothing.
  Back from Search, and `/`, also leave Search in one step instead of
  stepping through earlier searches.
- **Dropout's own page no longer shows for a moment** before Leanback's
  screen appears: the screen stays dark until Leanback's is ready.

## [0.31.0] — 2026-10-02

### Changed

- **An episode's page is Leanback's own screen.** Out of the full-window
  video (▼ twice, or Escape), the video carries on in a large picture at the
  top left; beside it the show's name, the episode's title, its season and
  number, its description, and *Play* (back into the video, playing),
  *Episodes* (the season's page) and *My List*. Under them, *Up Next in
  Season N* as cards. ▲ from the buttons goes back into the video.

## [0.30.0] — 2026-10-02

### Changed

- **Search is Leanback's own screen**: a large search box at the top, with
  the selection in it, ready to type; what you type goes to Dropout's
  search, and the results arrive as Home's cards, five across, as you type.
  Under the box, Dropout's filters (*All*, *Videos*, *Collections*): OK on
  one shows only those results. ▼, OK or Back leave the box for the filters
  and results; ▲ comes back up; ◀ at the start of the text is the rail.
  More results arrive near the end.
- The search box is ringed but does not grow when selected.

## [0.29.0] — 2026-10-02

### Changed

- **A show's page is Leanback's own screen**, drawn like Home from what
  Dropout puts on the page: the show's wide picture, its name, the number of
  seasons and its description, with the yellow button that picks the show up,
  *Trailer* and *My List* (ticked while the show is on your list). Under
  them, the row of seasons, newest first, and the season's episodes three
  across as Home's cards, with their pictures and running times, watched ones
  dimmed with a tick. Rows of episodes slide up to the same place as you go
  down, and more arrive near the end. ▲ from the episodes goes to the season
  on screen, and ▼ back to the episode you came from.
- **A special** (a stand-up set, a film) is drawn the same way: its picture
  and name, *Watch Movie* (where the selection starts) and *My List*, then
  the video and its extras.
- A show Leanback cannot read (if Dropout changes the page) is still shown
  as Dropout's page, restyled as before.

## [0.28.0] — 2026-10-02

### Changed

- **Browse, My List and the lists are Leanback's own screens**, drawn like
  Home: the page's name at the top, then its shows or episodes as Home's
  cards, five across, with their running times, badges and progress. ◀ ▶ move
  along a row, ▲ ▼ go up and down a row, and the selected row slides up to
  the same place each time. More arrive by themselves near the end (Dropout's
  own *Load More*). The lists — Trending, New Releases, a show's new
  episodes, the trailers… — are the pages Home's *View all* opens.
- **Dropout's own top bar and footer are hidden** on every page you browse
  or watch; they stay on its sign-in, account, help and legal pages.

## [0.27.0] — 2026-10-02

### Changed

- **The settings panel is half as wide.** Each setting's value is on the line
  under its name, and its text is a little smaller; a long name takes two
  lines.

## [0.26.3] — 2026-10-02

### Fixed

- With the "Up next" card up, the button hints said ◀ ▶ skip; they now say
  ◀ hides the card.

## [0.26.2] — 2026-10-02

### Fixed

- Holding OK in the playback settings (on Closed Captions, say) could act
  several times over while the player was still answering the first press,
  leaving its menu in a muddle. A press that arrives meanwhile is ignored.

## [0.26.1] — 2026-10-02

### Fixed

- Moving through a long list in the settings panel could scroll the page
  behind it. Only the list scrolls now.
- The settings panel keeps its own typeface and spacing on every page,
  whatever Dropout's own styles say.

## [0.26.0] — 2026-10-02

### Changed

- **One settings panel, the same everywhere.** Leanback's settings on any
  page and during playback are now the same list, in the same order and
  words, drawn the same way: full height from the right, the selected entry
  in yellow, a switch for each on/off, the value and a › for the rest, and
  the keys along the foot. The options page uses the same words.
- **Changing a setting**: OK (or ▶) flips a switch, or opens the setting's
  short list of values, where OK picks one — it is ticked — and goes back.
  ◀ or Back goes back one step, and closes the panel from its top.
- **Closed Captions is a switch** in the playback panel: OK turns them on or
  off. **Caption Style**, under it, goes straight to the font, background and
  window settings, and one ◀ comes straight back. ▶ on Closed Captions still
  opens the player's own captions menu, for another track.
- Clear Continue Watching and Turn Leanback Off are in the playback panel's
  Leanback Settings too.
- The ✕ at the top of the panel is only a picture: Back closes.
- Seek steps of a minute and more read "1 min", "2 min", "5 min".

### Removed

- Home and Search from the settings panel: the rail does them.

## [0.25.0] — 2026-10-02

### Added

- **An "Up next" card** over the bottom right of the picture, from eight
  seconds before the end of an episode: the next episode's picture inside a
  countdown ring, "UP NEXT · 0:08", "S9 · E4" and the show. **OK** plays it
  now; **◀** hides the card, and then nothing plays by itself when the
  episode ends. With *Play next episode* off, the card counts nothing down.

### Fixed

- OK on Dropout's own "Next Up" card pressed its *Hide* button, which comes
  first on the card, rather than playing the next episode.

## [0.24.0] — 2026-10-02

### Added

- **Skipping shows where you landed**: ⏪ or ⏩ with the new time in the
  middle of the picture, and the control bar, until a second after the last
  skip. Pressing ◀ ▶ quickly keeps them steady rather than flickering. On a
  paused video they stay as long as the pause's own showing.

## [0.23.0] — 2026-10-01

### Added

- **The title over the video**: the show's name in yellow, then "S9 · E3 ·
  Whodunnit", over the top left of the picture. It shows for four seconds
  when an episode starts, and whenever the control bar is up.
- **Pausing brings up the title and the control bar** for four seconds. The
  remote's buttons still do what they do during playback: ◀ ▶ skip, OK
  plays, ▼ takes you into the bar.

## [0.22.0] — 2026-10-01

### Changed

- **The control bar over the video has a new look**, the one in the TV
  mockup: a dark fade along the bottom of the picture, a round play button
  with a yellow symbol, round settings and full-screen buttons, and the
  selection a yellow ring around the button. It is the same share of the
  screen on a 1080p and a 4K television.
- **The times sit under the ends of the progress bar**: the time so far under
  its start, the length under its end, instead of "12:04 / 24:30" at the
  right.

## [0.21.0] — 2026-10-01

### Added

- **▼ leaves the search box** for what is below it: the result filters, then
  the results. ▲ goes back up into the box; the other keys still type.

## [0.20.0] — 2026-10-01

### Added

- **A show's page has a button that picks the show up where you left it**,
  yellow, first among the show's buttons. It says **Resume S9 E3** for the
  episode you were most recently partway through, in any season; otherwise
  **Play S9 E4** for the one after the last you finished, following
  Dropout's own "up next" into the next season; otherwise **Play** the first
  episode on the page. Episodes watched on the Roku or the Android app count
  too.
- The watch history notes each episode's show, season and episode number,
  and the episode Dropout plays after it, as it plays in Firefox.

## [0.19.1] — 2026-10-01

### Fixed

- **Home could show two Continue Watching rows.** On days when something
  was in progress on the Roku or the Android app, Dropout drew its own
  Continue Watching row as well as Leanback's. Dropout's row is no longer
  drawn. What was on it still appears in Leanback's row, merged with what you
  watched in Firefox, most recent first.

## [0.19.0] — 2026-09-27

The show page. It works the same way for every show, including ones Dropout
adds later: Leanback reads each page as it loads rather than knowing any show
by name.

### Added

- **A row of seasons at the top of a show's episodes, newest first.** ◀ ▶
  move along it and OK opens that season. The season on screen is the yellow
  one, and its full name and episode count head the episodes. A show with one
  season has no row.
- **Shows open on their newest season.** Dropout opens every show on Season
  1. A new setting, *Shows open on*, switches back to the first season.
  Leanback settings and the options page both have it.
- **The selection starts on the episode to watch next**: Episode 1 of a
  season you have not started, otherwise the episode you are partway
  through, or the one after the last you finished.
- **Watched episodes are marked** with a tick. An episode in progress has a
  bar along the bottom showing how far you got.
- **◀ is the way out of panels**: it closes Leanback settings and the top of
  the playback settings, as Back does. With the text cursor at the start of
  the search box, ◀ leaves it for the rail.
- *My List* on a show's page, and *Watch Movie* on a special's, can now be
  reached with the remote.

### Changed

- **Episodes are three across**, the size of Home's cards, with the title
  and episode number under each.
- **"Forget watch history" is now "Clear Continue Watching"**, and it only
  forgets what you have not finished. Watched episodes stay watched.
- The show's buttons keep their own colours when selected, instead of
  Dropout's blue.

### Removed

- From a show's page: Dropout's season drop-down (the row replaces it), the
  sort control and the Share button. Episode cards lose the My List button
  that only a mouse could reach.

## [0.18.3] — 2026-09-27

### Added

- **My List on the rail**, a bookmark between Browse and Dropout 24/7. Its
  page, your saved shows and videos, has the rail too, with the bookmark lit,
  and the selection starts on the first one.

### Removed

- **The My List row on Home.** It is on the rail instead. The banner's
  *My list* button stays.

## [0.18.2] — 2026-09-27

### Fixed

- **Home opened on the first Continue Watching card instead of the featured
  banner's *Watch now*.** Continue Watching is ready before Dropout has drawn
  the banner, and the selection stayed where it first landed. It now moves to
  *Watch now* when the banner arrives, unless you have already moved.

## [0.18.1] — 2026-09-27

### Changed

- **The rail is 20 % narrower.** Its icons and the selection box around them
  are the same size as before; the pages beside it gain the width.

## [0.18.0] — 2026-09-27

From the owner's testing of 0.17.0.

### Changed

- **Shows on Home use their wide picture**, the one on the show's own page,
  instead of Dropout's tall poster cropped to fit a wide card. Where the wide
  picture cannot be found, the poster is used as before.
- **The selection box's corners follow what it surrounds**: rounded like the
  card, the banner button or the rail icon inside it, instead of one fixed
  rounding everywhere.

### Fixed

- **The rail's icons turned into a blue square when selected or hovered**,
  a second highlight inside the yellow selection box and a different size
  from it. It was Dropout's own colour for every button on the site. The
  rail's icons, the banner's **›** and *My list*, and the rows of Leanback's
  settings panel now keep their own background, so the yellow box is the only
  highlight.

## [0.17.0] — 2026-09-27

Home polish, from the owner's review of 0.16.0.

### Changed

- **Home and the rail are 20 % smaller** — the banner, the rows, the cards and
  the rail, on every page the rail is on. More of each row fits on screen.
  Search results keep their size.
- **The rail shows the page you are on with a yellow icon** instead of a
  yellow square, so the only yellow box on the rail is the selection. The
  square was a different size from the selection box around it.
- **The time left on a Continue Watching card is exact**: *2:48 left*,
  *1:12:05 left*, instead of whole minutes rounded down.
- **No "New" badge on the New Releases row**, which says so already. Other
  rows keep Dropout's badges ("New Episode" on Trending, say).
- **Running times read *6:03*** rather than Dropout's *06:03*.
- **Dropout's "My list" row is headed *My List***, like the other rows.

### Fixed

- The selected card crowded the text around it: enlarged, with the ring
  round it, it touched the row's heading above and its own title below, and
  covered them at larger *Enlarge selection* settings or in a small window.
  There is now room under each heading, and the selected card's title steps
  down out of the way.
- With a row selected, the bottom line of the row above peeked in at the top
  of the screen; it now fades out.

## [0.16.0] — 2026-09-26

Fixes from the owner's review of 0.15.0.

### Added

- **Dropout 24/7 on the rail**, under Browse, with its own TV icon. It is lit
  on the Dropout 24/7 page.

### Changed

- **Back is Firefox's own Back.** Firefox goes back on the remote's back button
  whatever a page does with it, so Leanback no longer tries to hold it — the
  history entry it kept for that did not work. Instead the history is kept in
  the shape Back should follow: the next or previous episode, another season or
  sort, and one rail section to another replace the page rather than adding
  one; Home from the rail or the settings goes back down the history when Home
  is behind; and a Back that lands on the previous episode, when Dropout's own
  up-next card went on to the next, carries on to the season page. In a tab
  opened straight on a page, with nothing behind it, Back walks up the site
  itself. Escape closes what is open on the page first, then does the same.
- **The featured banner's › button is right after *Watch now***, before
  *Trailer* and *My list*.
- **"N min left" is on the Continue Watching picture**, in the corner where
  other cards show the running time; the line under the title is the show.
- **Forget watch history empties Continue Watching**, Dropout's own progress
  from the Roku included, until something is watched again here or on another
  device. Dropout's progress bars still show on its cards.
- **Search results are laid out for a TV**: four across the full width beside
  the rail, with larger titles, instead of Dropout's desktop column of small
  pictures.

### Fixed

- *Watch now* and *Trailer* on the banner were teal: Dropout's colour for
  every link won over Leanback's. *Watch now* is black on yellow and *Trailer*
  white again.
- Search results could not be reached with the arrows: their link carries no
  class, and the rules looked for one. The type filters (All / Videos /
  Collections) and *Load More* are reachable too.
- The selected search result shrank instead of growing.
- Back to a page Firefox kept in memory left Leanback unable to reach the
  background until the next page load.

## [0.15.0] — 2026-09-26

The Home screen: the first screen of the TV shell.

### Added

- **Home is Leanback's own screen.** `/browse` is drawn by Leanback from what
  Dropout puts on the page — the featured banner and every row of shows, with
  the same links — over Dropout's page, which stays underneath untouched.
  Rows are cards with a picture, a title, the length, a "New" badge and a
  progress bar. ▼ brings each row up to the same place near the top, and
  along a row the selected card keeps its place while the row slides. More
  rows arrive as the selection nears the bottom (Leanback presses Dropout's own
  *Show more*). A row of 12 ends with a **View all** card. The banner shows
  one featured show at a time with Dropout's own *Watch now*, *Trailer* and
  *My list*, and a **›** button for the next one. Hubs such as `/dimension-20`
  get the same screen.
- **Continue Watching**, first on Home: what you started in Firefox and what
  you started on Dropout's Roku or Android app, in one row, most recent first.
- **Watch history.** Leanback remembers how far you got in each video, in this
  Firefox only. A video counts as watched at 95 % or with under 90 seconds
  left, and as started after a minute. It is never sent anywhere.
- **Picking up where you left off.** An episode you stopped halfway starts
  where you stopped, with "Resumed at 12:04" for a moment; **Start Over** at
  the top of the playback settings goes back to the beginning.
- **The rail**: Search, Home, Browse and Leanback's settings down the left of
  Home, Browse (all shows) and Search. ◀ from the left edge enters it; ▶ or
  Back return you exactly where you were.
- **Forget watch history**, in Leanback's settings (OK twice) and on the
  options page (click twice).

### Changed

- The page that Back reaches from a show and the page the *Back on Home*
  setting (was *Back on Browse*) applies to are both called **Home** now, and
  the settings panel's *Browse* entry is *Home*. **Browse** is the rail's
  name for all shows (`/series`).
- On a page with the rail, ◀ moves only to something level with the
  selection; past that is the rail.

### Fixed

- A collection page — where a row's *View all* leads, such as
  `/new-releases` — waited ten seconds before putting the ring anywhere. The
  ring now starts on its first tile.
- The options page's *Theater layout* control sat in the same row as *Player
  controls*.

## [0.14.0] — 2026-09-26

A cleanup release, before the TV shell work starts.

### Changed

- **Button hints are off by default.** The bar along the bottom listing the keys
  can be turned on in *Leanback Settings* or on the options page. This reaches
  new installs only: an existing install keeps the setting it has. Short
  notices ("No next episode", "Nothing to go back to") still appear with hints
  off.
- **The playback panel has no duplicate rows.** Button Hints and Seek Step are
  in *Leanback Settings* only. The panel's top level is Quality, Speed, Play
  Next Episode, Closed Captions and Leanback Settings.
- **"Player controls: the site's own" is on the options page only**, as a
  troubleshooting switch. It is no longer in the options panel or in
  *Leanback Settings*.
- The options button on an episode page whose player cannot be reached opens
  Leanback's settings, like everywhere else. The old list of actions (Subtitles,
  Next and Previous Episode, Go To The Show) is gone; those are on the remote's
  keys and in the playback panel.
- Every document describes Leanback as it is now; history is in this file only.

### Fixed

- **In *Leanback Settings*, values could only go up.** OK now goes round the
  list (from the last value back to the first), so every value is reachable
  with OK alone. ▶ still steps on and stops at the last; ◀ leaves.
- **The player's menus could only be entered one level deep.** Closed Captions
  → Customize bounced back to the top, so caption style was out of reach. The
  panel now follows the player's menu as deep as it goes: CC/subtitles →
  Customize → Font, Background, Window.
- **Reading the player's menu:** options inside a collapsed section are no
  longer listed as if they were on screen; groups of options keep their
  headings (Color, Size, Opacity); leaving a submenu uses the player's own Back
  button, one level at a time; picking an option shows what the player shows
  next — a caption colour stays on its panel with the tick moved, a caption
  track goes back up with the new value.

### Removed

- Code and styles nothing used: an on-screen display and its styles, the
  captions button styles, an unused message (`page:info`), and site selectors
  that matched nothing in the code (`hosts`, `headerLinks`, `unauthorized`,
  `noResults`, `transportSkip`, `ccButton`, `captionsRenderer`).

## [0.13.1] — 2026-09-24

### Fixed

- **The settings panel no longer loses the player's rows to one bad read.** If
  the player's menu could not be read at the moment the panel opened — it being
  busy, re-rendering, or driven by something else at the same time — Quality,
  Speed and Closed Captions were dropped for the whole life of the panel,
  leaving only Leanback's own rows. It tries a second time before giving up.

## [0.13.0] — 2026-09-24

Built against a capture of the player's settings popover rather than a guess at
what is in it.

### Changed

- **The settings panel matches what the player actually offers.** Its popover
  holds exactly three entries — **Quality**, **Speed** and **CC/subtitles** —
  and each opens a submenu. The panel now carries Quality, Speed, Seek Step,
  Play Next Episode, Button Hints, Closed Captions and Leanback Settings.
- **Speed is reachable**, which it was not before.
- **Closed Captions is the player's own entry.** Turning captions on by setting
  a `TextTrack`'s mode drew nothing — the player keeps its own captions state —
  so the row opens the player's captions menu in our list instead. That menu is
  also where the caption font, background and window options are.

### Removed

- The separate **Closed Caption Font / Background / Window** rows. They were
  matched against the popover's top level by guessed labels, where they have
  never existed: they are one level down, inside CC/subtitles, and are reached
  by opening that row. Nothing is lost — they were matching nothing.
- The native `TextTrack` captions toggle and its fallback, now that the row is
  a proxy of the player's own menu.

## [0.12.0] — 2026-09-24

### Added

- **Player controls: Leanback's, or the site's own.** A new setting
  (`playerChrome`) that hands the player its own control bar back. With it set
  to *the site's own*, nothing of ours is drawn over the video and nothing of
  the player's is hidden: ▼ goes to the page as it did before there was a bar,
  and the options button goes back to the page's list.

  It exists for two reasons. Reaching a part of the player's UI that Leanback
  has no equivalent for — which is what it was written for — and as the way out
  if our bar ever breaks on a player redesign, without having to turn the whole
  extension off and lose arrow navigation with it.

  It is in the options page, in the options panel, and in *Leanback Settings*
  inside the playback panel. Changing it takes effect at once, with no reload.

## [0.11.0] — 2026-09-24

### Fixed

- **Back walks one layer per press again.** The player frame kept a history
  entry of its own *and* the page kept a guard entry, so one press popped both:
  leaving the transport bar also dropped the video out of its full-window
  layout, and leaving the settings panel went all the way back to the video.
  There is one guard now, in the page. It asks the frame first
  (`player:back`), and the frame closes the panel, then the bar, then says it
  has nothing left — only then does the page walk its own layers.
- **Captions turn captions on.** Setting a `TextTrack`'s mode looked right and
  drew nothing: the player keeps its own captions state and its own renderer,
  and only its button tells it to turn them on. The toggle presses that button
  and reads the result back off the tracks.
- **The Quality row stopped vanishing.** The player's settings button is a
  toggle; pressing it when its menu was already open closed it, the re-read
  came back empty, and the row disappeared until the panel was reopened. The
  menu is read before it is pressed.
- **The settings panel rolls in over 250 ms.** It was being unhidden and moved
  in the same frame, which transitions nothing.
- **The picture stays stopped while settings are open.** Reading the player's
  menus means clicking the player's own controls, and those wake its
  click-to-play; rather than chase each path, the panel holds the video paused
  for as long as it is up.

### Changed

- **The options button opens the settings.** During playback it opens the
  panel in the player frame; everywhere else it opens Leanback's settings
  directly. The list of actions that used to come first is gone — Browse,
  Search and *Turn Leanback off* are at the foot of the settings list.
- **Leanback's own settings are a submenu** of the playback panel, under
  *Leanback Settings*, so one button reaches everything from either place.
- **Play Next Episode is a link, not a toggle**: it names the next episode and
  goes there. Whether one starts by itself at the end is *Autoplay Next
  Episode*, in the Leanback submenu.
- ◀ always means "leave this submenu", whichever kind of submenu it is; values
  are stepped with ▶ and with OK.

## [0.10.0] — 2026-09-24

### Fixed

- **A paused video no longer restarts on the next button press.** The autoplay
  rescue — which puts back a video Firefox stopped for unmuting without user
  activation — was resuming *any* paused, unmuted video a quarter second after
  an unmute, including one deliberately paused. It now knows whose decision the
  pause was and leaves the viewer's alone.
- **Back goes one layer up, not "back to the previous page".** `goBack()` called
  `history.back()`, which returns you to whatever you last looked at rather than
  to where you are in the site. It is structural now: transport → playback,
  episode → the season you were watching, season → Browse. A single
  same-document guard entry sits on top of the history so that Firefox acting on
  the remote's `BrowserBack` itself lands there instead of navigating away; both
  routes are deduplicated so one press is one layer.

### Changed

- **The CC button is gone from the transport bar.** It opened the same list as
  the settings button, which is one control too many on a row walked with
  arrows. The bar is now **play/pause · position · settings · fullscreen**.
- **The settings panel is a full-height panel that flies in from the right**,
  rather than a sheet under the bar — the thing to read was the thing you were
  pointing at. Black, bold, Dropout's own font stack, and the first item starts
  highlighted in Dropout's yellow.
- **Opening settings pauses the picture**, and closing it starts playback again
  unless the video was already paused before it opened.
- The panel now holds the player's settings and Leanback's together, in one
  order: **Quality · Seek Step · Play Next Episode · Button Hints · Closed
  Captions**, and — only while captions are on — **Closed Caption Font ·
  Background · Window**.
- Navigation in the panel: ▲ ▼ move, **▶ enters a submenu and ◀ leaves it**, OK
  toggles or steps, back closes. A row with no submenu steps its value with
  ◀ ▶ instead.
- Closed Captions is driven by the video's own `TextTrack` list, so the toggle
  works whatever the player's menu offers.

## [0.9.0] — 2026-09-23

Every selector in `sites/dropout.json` was run against fresh logged-in captures
of the series, episode and search pages and of the `embed.vhx.tv` player
document. What follows is what that found, plus the transport bar it made
possible.

### Added

- **A transport bar of our own** (`content/transport.js`), drawn by the
  extension instead of borrowed from Vimeo. `▼` during playback opens
  **play/pause · position · CC · settings · fullscreen**; `◀ ▶` walk it, OK
  takes a control, back closes it. Play/pause, seeking and fullscreen drive the
  `<video>` and the frame directly, so none of it depends on Vimeo's markup.
- **Captions and settings panels in the extension's own UI.** Captions and
  quality are the player's to know, so the panels *proxy* its menus: the real
  menu is opened out of sight, its entries are read, and they are drawn in our
  own list. Taking one clicks the player's original; a submenu is read back and
  drawn the same way. Nothing of Vimeo's menu markup reaches the screen.
  Captions fall back to the video's own `TextTrack` list when no menu is found.

### Changed

- The position readout is **shown but never selected** — `◀ ▶` seek whenever
  the row is not holding a button, which is the rule the rest of the extension
  follows.
- All of the player's own chrome now stays hidden for good, rather than being
  revealed while the row was in use. It is hidden with `opacity` rather than
  `display` so the menus the panels read still mount.
- Search page selectors are the ones the site actually renders:
  `.SearchForm-module__search-input` for the field, `.Filter-module__filter`
  and `.Filters-module__filters-toggle` for the filters,
  `.Filter-module__load-more` for load more. On this site the CSS-module
  classes are unhashed, so they are matched exactly.
- Gone with the borrowed row: the keep/hide/skip lists that decided what it
  held, the keepalive that stopped Vimeo hiding its bar, and the mouse events
  that woke it. The rules they used are kept only for the panels.

### Fixed

- **Seek preview thumbnails are not possible with this player** and are not
  attempted. Vimeo's bundle carries no storyboard, sprite or frame index — its
  own preview shows a timecode over a single poster image. The bar shows
  elapsed and total time instead.

### Documentation

- `README.md` gains a **Sound on autoplay** section with the deployment
  recipe: the per-site permission, `media.autoplay.default` for a kiosk
  profile, and a `policies.json` `Permissions` → `Autoplay` block for a managed
  machine. No extension can grant this, and there is no command-line switch.
- `docs/site-notes.md` records the selector audit against the fresh captures.

## [0.8.1] — 2026-09-23

### Fixed

- **The settings panel no longer shuts itself the moment it opens.** The panel
  closed whenever the focus landed outside it, and Dropout moves the focus on
  its own whenever it re-renders. Keys are read at window capture, so the
  panel never needed the focus to work — it takes the focus back instead of
  closing, and gives up quietly rather than fight a focus trap. Activating an
  entry no longer synthesises a DOM click that the site can react to.
- **The panel's selection is visible again during playback.** It was drawn by
  the focus ring, which is parked on the video in theater mode and follows the
  focus everywhere else. `nav/menu.js` now stamps the current entry and
  `content/page.css` highlights it, so the selection cannot be lost to the
  page.
- **Opening search focuses the search field.** Two faults: the field is
  rendered after the site's framework starts, and the initial-focus fallback
  spent its one shot on the first result or link that already existed; and the
  field was matched only as `input[type='search']` or `input[type='text']`.
  A declared initial-focus target is now waited for until the timeout, and the
  search page matches any real text field.
- **"Go to the show" returns to the season you are watching.** It followed the
  bare series link, which drops the season and lands on season 1. It now uses
  the same stored season page that Back does.

### Documentation

- `docs/targets.md` gains the autoplay recipe: audible autoplay is a profile
  setting (`media.autoplay.default = 0`, a `policies.json` `Permissions` →
  `Autoplay` entry, or the per-site permission), it cannot be granted from an
  extension, and there is no command-line flag for it.

## [0.8.0] — 2026-09-23

Rebuilt against a saved logged-in capture of `watch.dropout.tv` and, for the
first time, of the `embed.vhx.tv` player document itself. Every selector in
`sites/dropout.json` was run against that markup; what follows is what it
disagreed with.

### Fixed

- **Turning Leanback off gives the player its own controls back.** The rules
  that hide Vimeo's chrome were not gated on the extension being enabled, and
  nothing took the marks off again, so switching Leanback off left the control
  bar invisible until the page was reloaded. The stylesheet is now gated on
  `html[data-tenfoot-player="on"]`, the marks are removed on the way out, and
  the player script stops touching the page entirely while it is off.
- **Captions are back on the transport row.** Vimeo's captions button carries
  no `aria-label` and no `CaptionsButton_module_…` class, so the keep list
  missed it and the "anything not kept goes" rule hid the one control the
  options panel points at. It is matched by `#cc-control-bar-button`,
  `.cc` and `[data-cc-button]` now, and is the **first** stop on the row.
- **The up-next overlay is found.** `.ott-up-next` exists nowhere in this
  player; Vimeo's end screen is `.vp-outro-wrapper` (`Outro_module_…`), which
  is `display: none` until it is offered, so the existing visibility check
  gates it correctly.
- **The related-tags links under a video are matched properly.**
  `data-similar-items-site` sits on the `<a>` itself, not on an ancestor, so
  `[data-similar-items-site] a[href]` matched nothing. (No behaviour changed:
  `#watch-info a[href]` was already reaching them.)

### Changed

- `player.transportHide` targets picture-in-picture and the transcript button
  by their real ids rather than by class and `aria-label` substrings that
  match nothing in this player. The old patterns are kept as fallbacks for
  other Vimeo builds.
- Dropped `common.banner`: it was read by no code and matched nothing.

## [0.7.0] — 2026-09-22

### Fixed

- **The Settings menu is no longer empty.** Vimeo's gear popover is a child of
  the control bar, so the keep list that tidies the bar was hiding the menu's
  own entries. Anything inside a popover is now left alone — which is also
  where **captions** live in this player, since there is no captions button on
  the bar at all.
- **The picture is clean again.** The overlay play button sits *outside* the
  control bar, so hiding the bar left it on screen; all player chrome is now
  kept off screen until the transport row is in use.
- **Sound without pressing anything, where Firefox permits it.** The extension
  asks `navigator.getAutoplayPolicy()`: when the profile allows autoplay with
  sound the video is unmuted immediately, and only otherwise does it wait for a
  button press. To get that, allow autoplay for watch.dropout.tv (Firefox
  settings → Privacy & Security → Autoplay → Allow Audio and Video), or set
  `media.autoplay.default = 0` in a kiosk profile.
- **The back button closes the transport row** instead of leaving the episode.
  `BrowserBack` reaches the browser before the player frame can cancel it, so
  the row now pushes one history entry **in the player frame** and pops it when
  it closes: Firefox's own Back closes the row, and the page's history is
  untouched. ▲ still closes it too.

## [0.6.1] — 2026-09-22

Built against the real player markup for the first time, from a saved
logged-in page. What the rules file guesses at is now largely what the player
actually is — see docs/site-notes.md.

### Fixed

- **Autoplay, for good.** The sound is no longer touched until the page has
  been interacted with. Two cleverer attempts both cost the autoplay, because
  Firefox stops a video that unmutes without a user gesture; the rule now is
  simply to wait for the first button press. A profile that allows autoplay
  with sound has sound from the first frame either way.
- **The Settings (gear) button is back on the transport row.** Vimeo's gear
  carries no label of its own — the label sits on a child element — so a keep
  list that checked only the button's own attributes threw it away.
- **The control bar no longer sits over the picture.** With no pointer in the
  room the player never starts the idle timer that would hide its own bar, so
  it simply stayed. It is now kept off screen unless the transport row is in
  use.
- **The selection really does get bigger.** A size change is not motion, so a
  reduced-motion preference no longer switches it off; it only drops the
  animation. The live check now measures the rendered transform
  (`matrix(1.05, …)`) rather than taking it on trust.

### Changed

- The transport row's keep, hide and skip lists are built from the player's
  real component classes (`PlayButton_module_`, `PrefsButton_module_`,
  `FullscreenButton_module_`, `VolumeControl_module_`, `.vp-prefs`,
  `.vp-progress`) instead of guesses.

## [0.6.0] — 2026-09-22

### Fixed

- **Autoplay, properly this time.** 0.5.x unmuted the video before it had
  started, which is exactly what makes Firefox refuse the autoplay — and then
  the revert never ran, because the video had never been playing to begin with.
  Nothing touches the sound until playback has actually started; a beat after
  that the sound goes on, and if Firefox stops the video for it, it goes
  straight back to muted and waits for your first keypress.
- **The transport row no longer stays on screen for good.** It could only be
  left with the back button, and the back button was reaching the browser
  rather than the player frame — so the row was never closed and the bar stayed
  pinned open until the page was reloaded.
- **Volume and picture-in-picture are hidden from the moment the bar first
  appears**, not only once ▼ has been pressed.
- **The transcript button is gone.** It could not be identified by class, so
  the controls are now a **keep list** rather than a block list: play/pause,
  subtitles, settings and full screen stay, everything else in the bar is
  hidden. An unknown button is exactly what a block list misses.
- **Enlarging the selection works.** It was applied to an inline element,
  where a transform does nothing at all.

### Added

- **▲ leaves the transport row** and gives ◀ ▶ back to seeking. The remote's
  back button is a browser-level key that Firefox may act on before this
  extension can stop it; ▲ is ours for certain, and moving up out of a bar at
  the bottom of the video is navigation like any other.
- **How much the selection grows is a setting** (0–25 %, default 5 %),
  replacing the old on/off toggle.

### Changed

- **Seek step is a fixed list**: 5 s, 10 s, 15 s, 30 s, 1 min, 2 min, 5 min,
  default 10 s. An out-of-range value snaps to the nearest.
- The player script no longer registers in `embed.vhx.tv` frames that hold no
  player, which is one source of "Actor 'Conduits' destroyed before query
  'RuntimeMessage'" on every page load.

## [0.5.1] — 2026-09-22

Both of these were introduced by 0.5.0.

### Fixed

- **Videos autoplay again.** Dropout starts them muted because that is the only
  way Firefox allows autoplay at all; 0.5.0's unmute tripped the autoplay
  blocker, which stopped the video and then refused to restart it. The unmute
  is tried once, and if playback stops as a result it is put straight back and
  retried on your first keypress — a keypress is the user gesture Firefox
  wants. Where the profile allows autoplay with sound, the sound is on from the
  first frame.
- **▼ opens the transport row again** instead of jumping to the show title.
  The selectors that hide volume, picture-in-picture and transcript are
  substring matches, and one of them matched an ancestor of the whole control
  bar — hiding it took every control with it, so the row looked empty and ▼
  fell through to the page. Hiding is now scoped to inside the bar and can
  never stamp the bar itself, and if the filters ever remove everything the
  unfiltered controls are used instead, so ▼ cannot become a dead key.
- An explicit mute (media key or the options panel) is no longer undone by the
  "start videos unmuted" preference while its enforcement window is open.
- The page script no longer sends messages while the page is unloading, which
  is the other source of "Actor 'Conduits' destroyed before query
  'RuntimeMessage'" in the console.

## [0.5.0] — 2026-09-22

### Fixed

- **The transport row stayed open only as long as the player felt like it.**
  Vimeo hides its control bar a few seconds after the pointer stops moving,
  which left the ring pointing at nothing and — worse — dropped the focus out
  of the frame, so **back** was handled by the page and left the video
  entirely. The bar is now pinned open for as long as the row is in use, and
  the focus is taken back if the player rebuilds it.
- **A video you had already watched came back muted.** The site restores its
  own remembered preference after we unmute, sometimes well after the metadata
  has loaded, so the preference is now held for fifteen seconds after the
  video appears. Anything you do yourself — on the transport row, or after
  that window — is left alone.
- **The next-episode offer is found properly.** The real marker is
  `.ott-up-next` and the site renders several of them, only one visible; the
  visible one is what counts now. The page can also render the card instead of
  the player frame, so the page tells the frame when it is showing, and taking
  the offer clicks the site's own card rather than navigating by hand.
- **▲ from under the player returns to the video.** It was skipping past to a
  header link when the page had scrolled far enough that the header was
  geometrically nearer.

### Changed

- The seek bar is no longer a stop on the transport row — seeking is ◀ ▶.
- **Volume, picture-in-picture and transcript controls are removed from the
  player entirely.** Volume is the TV's job: the extension assumes unmuted and
  full volume.

## [0.4.0] — 2026-09-22

### Added

- **The player's own transport row is now where playback is controlled.** ▼ on
  a playing video opens it, ◀ ▶ walk along it (they stop seeking while it is
  open), OK takes a control and **back** closes it and gives ◀ ▶ back to
  seeking. This is the intended way to turn subtitles on and off. ▼ again
  carries on past the row to the page below. If no control bar can be found,
  ▼ falls back to what it did before and moves to the page.
- **Settings open in a panel on the page**, reached from the menu button. They
  never navigate the tab away — in a kiosk there would be no way back. Each
  row is the same two-step control as the season dropdown: OK starts changing
  it, ◀ ▶ change, OK confirms, back undoes.
- **A "Start videos muted" setting, off by default.** Dropout starts videos
  muted because Firefox blocks autoplay with sound; the extension now turns
  the sound back on once per video, unless you ask for muted. A mute you make
  yourself is never undone.

### Changed

- **Back no longer pushes history entries.** 0.3.0 made theater layout a
  history entry; that was a misreading — the back button was already working,
  the ask was only to stop needing the keyboard. The key is intercepted and
  layered again, as it was before.
- The options panel drops Play/Pause and Mute, which belong to the transport
  row. Subtitles stays as a fallback until the transport row is confirmed
  against the real player chrome.

### Fixed

- Back from an episode returns to the **season you were watching**, not the
  series' default season.
- The remote's menu button no longer opens Firefox's own context menu while a
  video is playing: the player frame had no suppression of its own.
- OK on a finished video starts the next episode even when the site's up-next
  overlay cannot be found, instead of doing nothing.
- `/` on the search page closes search and returns you where you were,
  instead of only refocusing the field.

## [0.3.0] — 2026-09-22

Renamed to **Leanback for Dropout** (extension id `leanback-for-dropout@inklikeurine.dev`).
Nothing has been released under the old name, so no migration is needed.

### Changed

- **Only the remote's face is mapped now.** Every keyboard shortcut is gone —
  no letters, no Space, no Backspace, no Page keys. The single exception is
  `/`, which opens the search field, because searching needs a keyboard from
  that point anyway. The **home** key is reserved for the TV shell and is
  never intercepted, and volume never was.
- **Arrow keys navigate and do nothing else.** The one place they did more —
  ▲ starting the next episode — is gone. In the player they move the
  playhead and leave for the page, which is navigation of the same kind.
- **The menu button opens an options panel**, which is where every feature
  without a button of its own now lives: subtitles, mute, play/pause, next and
  previous episode, the link to the show, Browse, Search, settings and a way
  to turn the extension off. ▲ ▼ move through it, OK takes an entry, back
  closes. This replaces the old "menu jumps to the site header" behaviour.
- The hint bar stays on screen and follows the selection, instead of fading
  after three seconds. During playback it keeps out of the way, appearing
  briefly on a keypress.

### Added

- Leaving the player with ▼ now lands on the link back to the show.
- The next episode can be started early: while the site offers it, OK takes
  the offer; otherwise the options panel has "Next episode".
- Theater layout is a history entry, so the remote's **back** button leaves
  the player before it leaves the episode, whether or not Firefox lets the
  page see the key first.

### Removed

- The title/time OSD and the `info` action. Their only trigger was the `i`
  key, and this extension no longer has keyboard shortcuts.

### Fixed

- The player frame no longer sends a message while it is being torn down,
  which is what logged "Actor 'Conduits' destroyed before query
  'RuntimeMessage' was resolved" in the console.

## [0.2.0] — 2026-09-22

First round of fixes from real use on a TV, with a remote.

### Changed

- **A dropdown is now a two-step control.** Left/Right no longer change the
  focused season or sort dropdown; they move the ring to the next thing on the
  page, like everywhere else. Enter engages the dropdown (the hint bar says
  so), Left/Right then step through its values, Enter confirms and Escape puts
  the old value back. Stepping no longer reloads the page once per option —
  the change fires once, when you confirm.

### Fixed

- The season dropdown could not be reached at all: because Left/Right stepped
  the focused sort dropdown instead of moving, the ring could never travel
  left from "Sort by" to "Season".
- The first selection on a page did not scroll itself into view, so on a long
  page the ring started somewhere off screen and you had to press a key once
  before the page caught up.
- Rows that move by sliding rather than scrolling left the ring on tiles that
  were off screen, which made the page impossible to navigate. The row's own
  left/right arrows are now used to bring the focused tile into view: they are
  looked for beside the row as well as inside it, clicked once per page of
  tiles, and abandoned as soon as one click moves nothing.

## [0.1.1] — 2026-09-21

Fixes found by the headless suites and the live check while finishing the
first version. 0.1.0 below was committed mid-development (`088b119`) and was
never released; this is the first complete version.

### Fixed

- Geometric navigation: the focused tile's 1.04× scale no longer makes a
  same-row neighbour count as "below" it; a large element directly in line
  (the player) beats a far-off, better-centred one; overlapping candidates
  rank by distance along the axis, with the centre offset only breaking ties.
- Arrow auto-repeat was throttled away entirely right after page load.
- Load More is never triggered from inside a dialog, and a pending Load More
  is dropped when a dialog opens or closes.
- On a video page whose player frame has not rendered yet, the ring parks on
  the player mount instead of nowhere; the hand-off happens when the frame
  appears.
- Load More selector corrected to the site's `a.js-load-more-link`
  (the draft matched every episode link).

### Changed

- The Info key (`i`) shows the hints — with title and time on a video page —
  on demand and hides them again; the hint-bar setting only controls the
  automatic hints on keypress.
- The `page:state` snapshot reports the last navigation target and a
  control's value (for the harness).

## [0.1.0] — 2026-09-21

### Added

- First version: arrow-key navigation with a focus ring on every page of
  `watch.dropout.tv` (row-aware on Browse, geometric elsewhere), Enter to
  open, layered Back (dialog → player → history → structural parent → exit
  hook), season switching with Left/Right, Load More on the way down.
- Theater layout on video pages; player control from inside the frame and
  from the page (play/pause, seek, captions, mute, stop, next/previous
  episode, media keys); autoplay next; hint bar and title/time OSD.
- Marketing-site forward to Browse, toolbar toggle with badge, keyboard
  command (unbound by default), options page.
- Site knowledge kept as data in `sites/dropout.json`.
