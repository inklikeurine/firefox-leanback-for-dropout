# Leanback for Dropout — product spec

The product spec: what Leanback does, exactly. What each key does is in
[keymap.md](./keymap.md); how the code realises it, in
[architecture.md](./architecture.md); the site knowledge it rests on, in
[site-notes.md](./site-notes.md). The user-facing description is the
[README](../README.md).

## About

- A Firefox extension that makes **watch.dropout.tv** usable from the couch
  with the buttons a TV remote has. Leanback is a TV shell: Home, Browse, My
  List, the lists, a show's page, a special, search and an episode's details
  page are Leanback's own screens; only sign-in, account, help and legal
  pages are Dropout's.
- Dropout runs on **Vimeo OTT**. The player is a **cross-origin iframe from
  `embed.vhx.tv`**, so there are two content scripts — one for the page, one
  for the player frame — talking through the background script.
- Everything site-specific lives in `sites/dropout.json`, so a site change is
  a data fix. The navigation engine (`nav/*`) knows nothing about Dropout.

## Goals

- A **Home screen that works like a TV app's**: a featured banner, rows that
  slide into place, Continue Watching first.
- Browse → show → season → episode → playback with **▲ ▼ ◀ ▶, OK, back and
  menu** only. No keyboard shortcut is ever required, and **arrow keys never
  mean anything but navigation**.
- A focus ring readable from 3 m.
- Player control from the remote: play/pause, seek, next/previous episode,
  captions.
- Site knowledge kept as data and checkable, so following site changes is
  cheap.

## Non-goals

- Not an ad blocker, not a downloader, not a paywall or DRM workaround. It
  needs a paid Dropout login exactly as the site does.
- No on-screen keyboard. Search and login need a real keyboard or a phone;
  `/` opens search and is the **only** keyboard key the extension maps.
- Not a general spatial-navigation extension — it runs only on Dropout hosts.
- Not the store: Dropout's subscription store (`/products`) is deliberately
  not drawn or linked — a poor fit for a TV UI.

## Who it's for

Anyone watching Dropout on a PC connected to a TV, driving it with a
keyboard, an HID remote or a gamepad mapped to keys. The design target is one
tab opened straight on `/browse`, fullscreen or kiosk, no pointer in normal
use ([targets.md](./targets.md)).

## Core functionality

- **Scope.** Runs on `watch.dropout.tv` (page script) and `embed.vhx.tv`
  (player-frame script). On `https://www.dropout.tv/` (marketing site, root
  only) it forwards to `https://watch.dropout.tv/browse` when *Skip
  dropout.tv Home* is on (default on).
- **Leanback's screens.** Each is a layer over Dropout's page, drawn from what
  Dropout renders there — same links, pictures and titles — with Dropout's
  page left underneath, untouched; Leanback's buttons press Dropout's own.
  Dropout's top bar and footer are hidden on every page but sign-in, account,
  help and legal. A page Leanback cannot read is Dropout's own, driven with
  the arrows and the ring.
- **Home (`/browse`).** The banner's buttons, then one row per shelf.
  Hubs such as `/dimension-20` get the same screen without Continue Watching.
  - **TV-style scrolling.** The selected row always sits at the same height
    near the top; the rows move under it, and what is above it fades out.
    Along a row, the selected card keeps its place and the row slides, until
    the row's end comes into view. Each row remembers its last card.
  - **Cards** show the picture (for a show, its wide picture, the one its own
    page uses, rather than Dropout's tall poster), the title, the running
    time (`6:03`, without Dropout's leading zero), Dropout's badge ("New",
    "New Episode") and progress. The New Releases row shows no "New" badge.
    Dropout's "My list" row is not drawn (My List is on the rail), nor its
    own "Continue Watching" row (its videos are in Leanback's). The selected
    card grows by the selection zoom and its title steps down, so neither the
    card nor the ring touches any text.
  - **More rows.** Two rows from the end, Leanback presses Dropout's own
    *Show more* (and scrolls the page underneath if that does nothing). A row
    of 12 — the most Dropout draws — ends with a **View all** card.
  - **The banner** shows one slide at a time with Dropout's buttons (*Watch
    now*, *Trailer*, *My list*); a **›** after *Watch now* steps to the next
    slide, round the end. The selection starts on its first button. If
    nothing can be read within 10 s, Dropout's page is driven instead.
- **Continue Watching** is Home's first row: the videos in progress, from
  Leanback's watch history and from Dropout's progress bars (which come from
  its Roku and Android apps), merged, most recent first. Each card shows the
  time left, to the second (`2:48 left`). Every card on every screen draws
  the same merged progress.
- **Watch history.** Leanback records how far each video has got while it
  plays here — on pause, seek, the end, the player losing focus, and every
  15 s — in `storage.local`. A video counts as **watched** at 95 % or with
  less than 90 s left, and **in progress** once more than a minute has
  played. Trailers and live streams are not recorded. Dropout's bars carry
  no date, so a bar is dated when Leanback first sees its value; a first
  sighting never outranks Leanback's own reading.
- **Clear Continue Watching** (OK twice) forgets every video not finished: it
  deletes Leanback's readings of them and empties Continue Watching —
  Dropout's bars included — until something is watched again, here or
  elsewhere. Watched videos stay watched; Dropout's bars still show on cards.
- **Resume.** A video in progress starts where it was left, with "Resumed at
  12:04" for a moment: *Resume* on its details page, or straight away when
  it plays without one (the next episode, a reload). *Start Over* is beside
  *Resume* on the details page and heads the playback settings after a
  resume. Resuming never changes whether the video is playing or muted.
- **The rail.** On every page that plays no video — Home, hubs, Browse
  (`/series`), My List (`/my-list`), Search, the lists, every show and
  special, an episode's details page — an icon rail down the left: Search, Home, Browse, My List (a
  bookmark), Dropout 24/7 (`/dropout-24-7`), and a gear for Leanback's
  settings in place. The current page's icon is yellow; the ring is the only
  mark of the selection. Entered on the current page's entry, or the one last
  used; leaving returns to exactly where the selection came from.
- **Browse, My List, collections and lists** (Trending, New Releases, a
  show's new episodes, all movies, Continue Watching in full): the page's name (My List named as on the rail), then
  Home's cards five across, the selected row sliding to the same place, more
  loaded through Dropout's *Load More* near the end. My List's selection
  starts on the first show. New Releases shows no "New" badges.
- **A show's page, one for every show.** Pages at a one-word address are told
  apart by what the page holds, never by address or name, so a show Dropout
  adds later works the same (`pages.series.show.layouts`): a **show**, a
  **special** or a **list** (drawn as above). A hub is Home's screen.
  - **The banner**: the show's wide picture, its name, the number of seasons,
    its description, and the show's buttons.
  - **The main button** (yellow, first) picks the show up: **Resume S9 E3**,
    the episode most recently in progress in any season; else **Play S9 E4**,
    the next unwatched episode after the last one finished (on screen, or the
    one Dropout's up-next named when it played here); else **Play S9 E1**, the
    first episode on screen. Leanback's history and Dropout's bars both count;
    progress from before *Clear Continue Watching* does not resume. Then
    *Trailer*, where there is one, and *My List*, ticked while the show is on
    the list.
  - **Seasons**: with more than one, a row of seasons, newest first, from
    Dropout's own season list; each says "Season N", the one on screen
    yellow. Its full name ("Season 1: All About …") and Dropout's episode
    count head the episodes. Opening a season replaces this page, so Back
    leaves the show.
  - **Episodes**: five across, Home's cards (picture, running time, title,
    "Episode N"); watched dimmed with a tick, in progress with a bar.
  - **Opening a show.** Dropout opens every show on Season 1. At an address
    that names no season, Leanback goes on to the **newest** (*Shows Open On*:
    newest / first season), replacing the page; an address that names its
    season is left alone. The page stays blank until that is decided (never
    more than 2 s), so Season 1 does not flash up.
  - **Where the selection starts:** the episode you are partway through; else
    the first one after the last you finished; else Episode 1.
  - **The order**: Dropout's (Episode 1 first), except with *Shows Open On:
    Newest*, where the episodes run whichever way puts that start episode
    near the top: newest first when it is past the middle of the season
    (caught up with a running season), Episode 1 first before that. Newest
    first loads the whole season (Dropout's *Load More*, pressed until gone).
  - **A special** (a movie and its extras): the banner with *Watch Movie*
    (where the selection starts) and *My List*, then the movie and its Extras.
  - Not drawn: Share, the season drop-down and sort control, and the My List
    button Dropout puts on each episode for a mouse.
- **Search** (`/search`): Leanback's own box at the top, as wide as five
  cards, large text, ringed but not grown; what is typed goes into Dropout's
  box, and Dropout's results come back as Home's cards, five across. Under
  the box, Dropout's type filters (*All (118)*, *Videos (115)*, *Collections
  (4)*) as pills, the one on screen yellow. With nothing typed, Dropout's own
  words ("Start typing to see results"). The selection starts in the box.
  *Load More* is pressed near the end of the results, never while typing.
- **Spatial navigation** on the pages Leanback does not draw: arrow keys
  move DOM focus to the nearest focusable element in that direction. A tile
  with two links counts as one target. Open dialogs (trailer, cookie banner)
  trap focus until closed, and hide Leanback's screen and the rail while
  open. A native `<select>` is a two-step control (OK engages it, ◀ ▶ step,
  OK commits, Back restores), so ◀ ▶ can still pass it. ▼ past the last row
  of a grid presses the site's "Load More".
- **Focus ring.** One overlay drawn over the focused target: 4 px, Dropout
  yellow (`#feea3b`), a dark outer edge, its corners rounded like the
  target's; the target enlarged by the selection zoom (5 % by default).
  Colour, width and zoom are settings. Under `prefers-reduced-motion` nothing
  animates.
- **Back is Firefox's own Back**: Firefox acts on the remote's BrowserBack
  whatever the page does, so Leanback keeps the history in the shape Back
  should follow. Sideways moves — another episode, another season, one rail
  section to another — replace the page; a Back that lands on a sibling (the
  previous episode, after Dropout's up-next went on to the next) carries on
  past it. A video playing is a step of its own above its details page, at
  the same address. So Back walks the video → its details page → the season
  page you came from → Home.
  `Escape` does the same after closing what is open. In a tab opened straight
  on a page, with nothing behind it, Leanback walks up the site itself, and at
  Home runs the **exit hook** (*Back On Home*: does nothing (default), or
  closes the tab — in a kiosk, that ends Firefox).
- **An episode's details page**, as on Dropout's Roku app. Every way
  to an episode — any card, Continue Watching, the show's main button,
  *Watch Movie*, an extra — opens it; nothing plays until *Watch*. Dropout's
  player is loaded underneath and held: a start of its own is taken straight
  back. On the left: the show's name (yellow capitals), the episode's title,
  "Season 2, Episode 1 · 28-Feb-2020", the synopsis (six lines), then one
  row of buttons: *Watch* (yellow), or *Resume* with *Start Over* beside it
  when the episode is in progress (the same reading the player resumes
  from); *Add to My List* / *Remove from My List* (Dropout's own button,
  pressed); *Episodes* (the season's page, else the show's). On the right
  the episode's picture (`og:image`, else the history's), with the progress
  bar and the time left ("15:00 left") when in progress. The selection lands
  on *Watch* or *Resume*; ▲ ▼ do nothing; ◀ from the first button is the
  rail. Play/pause is *Watch*; next/previous open that episode's details
  page. A page with no title to read is driven as Dropout draws it, playing
  at once.
- **Watching.** *Watch*, *Resume* or *Start Over*: the video fills the window
  (CSS, not the Fullscreen API) with the focus in the player, and the press
  is passed on as the viewer's, so the sound may come on with it. Back is the
  details page again, the video held where it stopped, the button now
  *Resume*. The next or previous episode, by the up-next card, the media
  keys or Dropout's own countdown, plays straight away (its details page is
  under it), as does a reload while a video plays. Dropout 24/7's stream
  opened at its own address is an episode here: its details page, with
  *Watch* only, then the stream.
  In the player one press of OK is one: a held OK, and the press of *Watch*
  arriving there too (within 0.4 s of the keys coming), do nothing. A start
  the player stops by itself is made again (five times at most, never after
  the viewer's pause); one Firefox refuses with the sound on starts muted. The seek step is 10 s by default;
  media keys work from anywhere on the page.
- **Dropout 24/7 in place.** On Dropout 24/7's page (a hub: the *Live now*
  banner and *Watch*), *Watch* — any link to a live stream's page
  (`live.path`) — reads that page with the page's own fetch, takes its
  player's address (`live.player`, only `https://embed.vhx.tv`) and title,
  and puts the player over the page in the full window, a history step of
  its own; the press was on this page, so the sound can come on. The
  player's keys, control bar and settings work as for a video playing; Back
  (Escape, the remote's) closes it, the selection back on *Watch*. No player
  to read: the link is followed.
- **Next / previous episode.** The site's up-next when present; otherwise the
  episode order from the show's page. **Autoplay next** on `ended` is a
  setting (default on).
- **The title.** Over the top left of the picture: the show's name in yellow
  capitals, then "S9 · E3 · Whodunnit". It shows for 4 s when an episode
  first plays, and whenever the bar is up.
- **Pause.** A pause the viewer makes brings up the title and the bar for
  4 s, without a selection. The settings panel's own pause, and Firefox
  stopping an unmute, show nothing.
- **Skipping.** Each skip shows ⏪ / ⏩ with the new time in the middle of the
  picture, with the bar, until 1 s after the last skip, so quick presses
  never flicker.
- **Up next.** From Dropout's lead time before the end (8 s), or as soon as
  Dropout's own card is up: a card over the bottom right with the next
  episode's picture in a countdown ring, "UP NEXT · 0:08", "S9 · E4", the
  show, and its keys. Hiding it stops autoplay for this episode. With
  *Autoplay Next Episode* off it counts nothing down, and Dropout's own card
  is told to stand down (its Hide). Dropout's card stays in place, invisible.
- **Transport bar.** Leanback's own: play/pause · position · settings ·
  fullscreen, round buttons on a dark fade along the bottom of the picture,
  the play button larger with a yellow symbol, the time so far under the
  start of the progress bar and the length under its end. The position is
  shown, never selected. The player's own chrome stays hidden.
- **One settings panel.** Full height from the right, narrow (310 of 1920
  units): the title, a ✕ that is only a picture, each value on the line
  under its name, the selected entry in yellow, a switch for each on/off, a
  chevron and the value for an entry with several values, a tick on the
  chosen option, the keys along the foot ("◀ Back · ▲▼ Move · OK Change").
  It never navigates the tab (in a kiosk there would be no way back).
  - **During playback** (the bar's gear, or menu) it pauses the picture and
    holds *Start Over* after a resume, Quality and Speed (the player's own
    menus), Play Next Episode, **Closed Captions** (a switch: on is the
    player's first track; ▶ opens the player's captions menu), **Caption
    Style** (the player's Customize: Font, Background, Window, each listing
    Family, Color, Size, Opacity, Edge Style with the current choice) and
    Leanback Settings.
  - **Everywhere else** (menu, or the rail's gear) it holds Leanback's
    settings, then *Clear Continue Watching* and *Turn Leanback Off*.
  - Leanback's settings are one list (`lib/settings.js` → `ROWS`), the same
    entries in the same order and words in both panels and on the options
    page.
- **Button hints.** Off by default. When on, a bottom strip shows the
  buttons that matter now: always up on pages, briefly on a press during
  playback. Short notices ("No next episode") use the same strip, hints on
  or off.
- **Player controls** (options page only): *The site's own player controls*
  leaves the player's own bar alone and draws nothing over the video, for
  troubleshooting.
- **Toggle.** The toolbar button, *Turn Leanback Off*, or a user-assigned
  shortcut (`commands`, no default binding) turns Leanback off/on for the
  site; the state persists.

## Optional / future functionality

- Gamepad support via the Gamepad API (today: map the pad to keys outside the
  browser).

## Permissions

What each permission is for, and what data collection the manifest declares:
the README's [Permissions](../README.md#permissions). The images Leanback
shows come from Dropout's image server (`vhx.imgix.net`); the one page it
reads is a live stream's, when *Watch* is pressed on Dropout 24/7's page. **Not** requested:
`tabs` (the background closes the sending tab via `sender.tab.id` without
it), `webRequest`, `nativeMessaging`, `<all_urls>`. A new permission is
explained in the README and here.

## Architecture overview

Two content scripts — one in the page, one in Dropout's cross-origin player
frame — relayed by an event-page background, which is also the only writer
of the watch history. Everything Leanback knows about Dropout is in
`sites/dropout.json`; `nav/*` is site-agnostic. Files, messages and
mechanisms: [architecture.md](./architecture.md).

## Settings and storage

`storage.local`, one object under the `settings` key, normalised on every
read by `lib/settings.js` (a missing or corrupt value falls back to the
default rather than throwing):

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | TV navigation on for Dropout hosts |
| `ringColor` | `"#feea3b"` | ring colour, `#rrggbb` |
| `ringWidth` | `4` | px, 2–12 |
| `focusZoom` | `5` | how much bigger the selected item gets, in percent (0–25); 0 turns it off |
| `hintBar` | `false` | show button hints |
| `playerChrome` | `"leanback"` | `leanback` or `site`: the site's own player controls, for troubleshooting. On the options page only |
| `seekStep` | `10` | seconds per ◀ ▶ press in the player: 5, 10, 15, 30, 60, 120 or 300 |
| `autoplayNext` | `true` | play the next episode when one ends |
| `startMuted` | `false` | start videos muted. Off: the extension turns the sound back on once per video |
| `skipMarketingSite` | `true` | forward `www.dropout.tv/` to `watch.dropout.tv/browse` |
| `exitHook` | `"none"` | `none` or `close-tab` — what Back does at the top level (Home) |
| `seasonStart` | `"latest"` | `latest` or `first` — the season a show opens on when its address names none |

The watch history is a separate key, `progress`, so a settings save never
rewrites it: `{ entries: { <video slug>: { url, title, series, image,
duration, show, season, episode, next: { url, season, episode }, local: {
position, at }, dropout: { percent, at } } }, clearedAt }` (`show`, `season`
and `episode` from the episode page, `next` from Dropout's up-next),
normalised on every read by `lib/history.js` and capped at 500 videos (the
least recently touched go first). *Clear Continue Watching* keeps every
watched video whole; of the rest it keeps only Dropout's own readings, and
sets `clearedAt`: nothing unfinished read before it counts for Continue
Watching or resuming. The tab's trail for Back is in `sessionStorage`
(`tenfoot.trail`, `tenfoot.intent`).

## UI requirements

- The ring and hint bar stay legible over light and dark pictures and never
  cover the focused element's text. The ring is the only highlight:
  Leanback's buttons draw no background of their own when hovered or
  selected.
- Leanback's screens follow Dropout's look: its typeface (Helvetica Neue,
  Helvetica, Roboto, Arial), a near-black ground (`#0b0c10`), yellow
  (`#feea3b`) for the ring, badges and progress. Sizes scale with the screen
  width (80 % of a 1920-wide layout), so they read the same on a 1080p and a
  4K television; no text is smaller than 13 px.
- Options page: plain form, ≥ 16 px text, fully operable by Tab/arrows/Enter,
  light/dark via `prefers-color-scheme`.
- No browser-action popup — a popup cannot be driven from a remote.

## Performance notes

- No polling. A debounced `MutationObserver` (100 ms) invalidates the
  focusable-candidate cache; candidates and rects are computed on keypress.
  Changes inside Leanback's own elements do not count.
- Screens redraw only what changed, keyed by link, so a card keeps its
  element (and the selection) when the site redraws. Pictures load lazily.
- The watch history hears from a playing video at most every 15 s; the
  background applies one report at a time.
- Focus ring updates are `requestAnimationFrame`-throttled on scroll/resize.
- Arrow repeat is capped at one move per 80 ms.
- Player state messages are sent on change and at most 4×/s while playing.

## UX guidelines

- Exactly one focused element is always visible; on page load focus lands on
  the first content (never on the header, never nowhere).
- Never trap focus except inside a real dialog, and Escape always closes it.
- Never inject synthetic key events into the page; act on elements directly.
- Never override the site's behaviour for keys the extension doesn't need.
  In a text field only Escape, ◀ at the very start of the text, and ▼ in a
  one-line field are taken.
- Back always leads somewhere sensible, even in a tab opened straight onto a
  deep link (the kiosk case).
- Never fight the browser: what Firefox does with a key regardless (Back) is
  designed around, not blocked.
- **Focus never follows the pointer.** Air-mouse remotes drift; `mouseover`
  must not move the ring, and the site's hover tooltips are suppressed while
  the extension is on. A deliberate click still activates.

## Testing

Run in a logged-in profile unless stated. "Ring" = the focus ring.

| # | Step | Expected |
| --- | --- | --- |
| 1 | Open `https://www.dropout.tv/` | Lands on `watch.dropout.tv/browse`, which shows Leanback's Home: the rail on the left, the featured banner, the ring on *Watch now* |
| 2 | Home: Down, Right ×3, Down, Up | The ring goes into the first row and along it, the row sliding so the selected card keeps its place; each Down brings the next row to the same height, with nothing of the row above showing; Up returns to the card you left in that row. The selected card grows inside the ring, its title steps down, and neither touches the heading; the ring's corners follow the card's |
| 3 | Home: keep pressing Down | New rows arrive before you reach the last one; a row of 12 ends with *View all*, which opens the whole collection with the ring on its first tile. Shows have wide pictures, running times read *6:03*, New Releases has no "NEW" badges, and there is no My List row |
| 4 | Home: on the banner, Right once to **›**, Enter ×2; then Right to *My list*, Enter | **›** sits right after *Watch now*; the next featured show, then the one after; *My list* adds the show to Dropout's My List (a tick shows) and Enter again removes it. *Watch now* is black on yellow, *Trailer* white; **›** and *My list* turn no colour when selected |
| 5 | Home: Left from the first card of a row, Down, Down, Down, Right | The rail, on Home; then Browse; then My List; then Dropout 24/7; Right returns to the card. The current page's icon is yellow; the selected icon has the yellow box round it and no coloured square behind it (hovering with the mouse shows none either). OK on My List opens your saved shows, the bookmark yellow and the ring on the first; OK on Dropout 24/7 opens it with its icon yellow; the gear opens Leanback's settings on the spot |
| 6 | Home: Escape | Nothing happens (*Back On Home*: does nothing); a notice says "Nothing to go back to" |
| 7 | On the rail, Browse, OK; then hold ▼ | "Series" at the top, the shows five across as Home's cards, Browse's icon yellow; no Dropout top bar. ▼ moves a row and the row slides up to the same place; near the end more shows arrive; ◀ from the first column is the rail |
| 8 | On Home, ▼ to New Releases, ▶ to its *View all*, OK | The list drawn the same way, "New Releases" at the top, the rail beside it (no entry lit), no "New" badges; Back returns to Home |
| 9 | Watch an episode for two minutes, go back to Home | It is first in Continue Watching with its progress bar and the time left ("2:48 left"); an episode in progress on the Roku is in the row too |
| 10 | Open that episode again; then Back to its show | It starts where you stopped; "Resumed at …" shows for a moment; in the settings panel, *Start Over* goes back to 0:00. On the show's page the yellow button says *Resume S… E…*, and OK plays it |
| 11 | Enter on a show with several seasons that you have not watched | Leanback's screen opens on the **newest** season, with no flash of Season 1: the show's picture and name, a yellow *Play S… E1*, *Trailer* and *My List*; the seasons newest first with that one yellow; its name and episode count over the episodes, five across; ring on Episode 1; the rail on the left; no Dropout top bar, no Share, no dropdowns |
| 12 | Up to the seasons, Right, OK; then Back | Up lands on the yellow season; Right moves along (the row slides); OK opens that season, which turns yellow; Back leaves the show for Home |
| 13 | Up to the show's buttons, Right to *My List*, OK, OK | A tick appears on *My List*, and goes on the second OK; the button shows no blue when selected |
| 14 | On the show's buttons, *Trailer*, OK; then Escape | The trailer opens with the ring inside it; Escape closes it and the ring returns to *Trailer* |
| 15 | A show you are partway through: open the season you are watching | Watched episodes carry a tick, the one in progress a bar, and the ring starts on the one to watch next |
| 16 | A season you are caught up with (all watched but the newest), *Shows Open On: Newest* | The episodes run newest first; the newest is top left, selected |
| 17 | Leanback settings: *Shows Open On*, OK, ▼ to *First season*, OK; open a show | The list shows both, the newest ticked; afterwards the row reads *First season*; the show opens on Season 1 |
| 18 | Down repeatedly past the last episode | Each row slides up to the same place; more episodes appear before the end; ring continues |
| 19 | Open a special (a stand-up set) | Its picture and name, *Watch Movie* yellow with the ring on it, *My List*; Down to the movie, then its extras |
| 20 | Enter on an episode | Its details page: the show's name, the title, the season line, the synopsis, *Watch* (yellow, ringed), *Add to My List*, *Episodes*; the picture on the right; the rail on the left; nothing plays and nothing is heard. Enter on *Watch*: the video fills the window and plays |
| 21 | In the player: Enter, Enter, Right, Left; then Right ×5 quickly while playing | Play: the show's name and "S… · E… · title" top left for four seconds. Pause: the title and the bar come up, no button ringed; Right, Left skip +10 s, −10 s with the bar still up; after four seconds both go. Right ×5: ⏩ and the new time in the middle, the bar up, steady, gone a second after the last press |
| 22 | Down, then Down again; then Up | The transport bar opens; Down again stays on it; Up closes it |
| 23 | After a minute or more: the remote's Back, Back | The details page, the video stopped; the button says *Resume* with *Start Over* beside it, and the picture shows the progress and the time left; then the season page |
| 24 | From Home, open a show, an episode, *Watch*, let it play into the next (or press Next); then the remote's Back, three times | The next episode plays without stopping at its details page; Back: its details page, then the season page (not the previous episode), then Home |
| 25 | On the season row, switch season, open an episode; then Back, Back | The season you switched to, then Home — not the first season |
| 26 | Watch an episode for a moment, then the remote's Back, Back; on each page, press ◀ ▶ | Every page answers the remote straight away; no page needs a reload |
| 27 | Open any page from the rail, watching the screen as it loads | A dark screen, then Leanback's; Dropout's own page never shows first |
| 28 | `/search`: type a query | Leanback's box at the top, ringed, not grown; letters appear in it and Dropout's results arrive as cards five across; ▼ the filters (*All (…)* yellow), ▼ the results; OK on *Videos* shows only videos. In the box, Left moves the text cursor and at the start of the text reaches the rail; Right returns. Up from the first row of results reaches the filters, then the box |
| 29 | Search: type a word, wait, type another; then ◀ to the rail, Home, OK | Home opens; Escape from the results instead leaves Search in one step |
| 30 | Rail → Dropout 24/7; *Watch*; then Back, Back | Dropout's 24/7 page: its banner picture, "Dropout 24/7", *Watch* ringed, the 24/7 icon yellow; then the stream in the full window, with sound, the address still the 24/7 page's; Back: the 24/7 page, *Watch* ringed; Back: where you were |
| 31 | On a details page, press MediaPlayPause; then again | The video starts as with *Watch*; then pauses |
| 32 | Let an episode end (or seek near the end) | Eight seconds before the end, the "Up next" card: picture, ring counting down, "UP NEXT · 0:08", "S… · E…", the show, *OK Play now · ◀ Hide*; the next episode starts at the end. Again with OK: it starts at once. Again with ◀: the card goes and nothing plays by itself |
| 33 | Press the keyboard's *Menu* key on Home | Leanback's settings slide in from the right: the title and a ✕, the keys along the foot, the selected entry yellow with no ring; switches for on/offs, a value and › for the rest; no context menu; hovering turns nothing blue |
| 34 | In that panel: ▼ to *Seek Step*, OK, ▼, OK; then *Start Videos Muted*, OK; then Left | *Seek Step*'s values open with 10 s ticked; OK on 15 s picks it and goes back up. The switch flips. Left closes the panel and the ring is back where it was |
| 35 | In that panel: *Clear Continue Watching*, Enter, Enter | The first Enter asks; the second clears: Continue Watching disappears (Roku items included); Dropout's bars still show on cards; finished episodes keep their tick |
| 36 | Playing an episode: Down, Right to the gear, Enter | The settings panel opens and the picture pauses |
| 37 | In the panel: Closed Captions, OK, OK; then Caption Style, OK, Font, OK, Color, OK, Yellow, OK; then Left | Captions come on and go off. Caption Style shows Font, Background, Window; Font lists Family, Color, Size, Opacity, Edge Style with their choices; *Font Color* opens, OK on Yellow goes back up with Color showing Yellow (and the captions yellow); Left goes up one level, and from Caption Style straight back to the top |
| 38 | During playback: settings → Leanback Settings | The same entries, in the same order and words, as on Home |
| 39 | Fresh profile, first visit | The cookie dialog is reachable by arrows and closable by Enter, above Home |
| 40 | Wiggle the mouse over cards on Home and tiles on `/series` | The ring does not move; no hover tooltips |
| 41 | Click the toolbar button; click again | The site behaves as stock Firefox (Dropout's own Home); then Leanback is back |
| 42 | Change the ring colour in options, reload | New colour |
| 43 | *Back On Home: Closes the tab*; go to Home; Escape | The tab closes (in kiosk: Firefox exits) |
| 44 | Restart Firefox | Settings kept |
| 45 | `web-ext lint --source-dir ./leanback-for-dropout --warnings-as-errors` | Passes |

## Known limitations

The user-facing list is the README's
[Known limitations](../README.md#known-limitations). Beyond it: the episode
the selection starts on, and the newest-first order, are worked out from the
episodes Dropout has drawn, so in a season longer than Dropout's first page
of episodes one further down is not considered until more are loaded.

## Milestones

### 1.0

- **Watch history syncs between devices that have Leanback.** Leanback's own
  watch history (Continue Watching, resume points, watched marks) is shared
  by every Firefox with Leanback installed; until then it stays in this
  Firefox. Syncing with Dropout's Roku and Android apps is not the goal. How
  the installs share it is decided when the work starts.

## Release checklist

1. If `version` in `manifest.json` is still the last pushed release's, bump
   it and add the CHANGELOG entry. If it was already bumped since the last
   push, keep it and add to that version's CHANGELOG entry.
2. Re-check the site ([site-notes.md](./site-notes.md#checking-the-site-again));
   update `sites/dropout.json` if needed.
3. Run the [Testing](#testing) checklist in a fresh profile and in a
   logged-in profile.
4. `web-ext lint --source-dir ./leanback-for-dropout --warnings-as-errors`.
5. Publish a GitHub release tagged `v<version>` (the manifest's `version`)
   from `main`. The **Sign release** workflow
   (`.github/workflows/release.yml`) submits it to
   [addons.mozilla.org](https://addons.mozilla.org/developers/) as
   **unlisted** (self-distributed) with the repository secrets
   `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`, and attaches the signed
   `leanback-for-dropout.xpi` to the release. That file is what a
   `policies.json` installs and what users can install permanently;
   `releases/latest/download/leanback-for-dropout.xpi` is always the newest.
   A pre-release is skipped by that link.
6. The README says the extension is unofficial and not affiliated with
   Dropout.
