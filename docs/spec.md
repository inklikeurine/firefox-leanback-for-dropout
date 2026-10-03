# Leanback for Dropout — product spec

This is the product spec. How the code realises it is in
[architecture.md](./architecture.md); the site knowledge it rests on, checked
against captures of the logged-in site, is in [site-notes.md](./site-notes.md).
Leanback is a TV shell: Home, Browse, My List, the lists, a show's page, a
special, search and the episode's page under the player are Leanback's own
screens; only sign-in, account, help and legal pages are Dropout's.
The [milestones](#milestones) below are what 1.0 needs.

## About

- A Firefox extension that makes **watch.dropout.tv** usable from the couch:
  arrow keys move a big focus ring between tiles, Enter plays, Escape goes
  back, media keys drive the player. Five keys are enough; no mouse.
- Dropout runs on **Vimeo OTT**. The site's pages are server-rendered or
  React-rendered on `watch.dropout.tv`; the **player is a cross-origin iframe
  from `embed.vhx.tv`** wrapping Vimeo's standard player. The extension
  therefore has two content scripts — one for the page, one for the player
  frame — talking through the background script.
- Everything site-specific (routes, selectors, key map) lives in one data file,
  `sites/dropout.json`, so a site change is a data fix. The navigation engine
  (`nav/*`) knows nothing about Dropout, so the same approach can serve another
  site later (Twitch is the obvious candidate) and other projects can borrow it.
- **Standalone.** It is not a part of the HTPC shell's `tv-nav`; the HTPC shell
  installs it as-is in its Dropout kiosk profile
  ([htpc-integration.md](./htpc-integration.md)).

## Goals

- A **Home screen that works like a TV app's**: a featured banner, rows that
  slide into place, Continue Watching first.
- Browse → series → season → episode → playback using only the buttons a TV
  remote has: **▲ ▼ ◀ ▶, OK, back and menu**. No keyboard shortcut is ever
  required, and **arrow keys never mean anything but navigation**.
- A focus ring readable from 3 m.
- Player control from the remote: play/pause, seek, next/previous episode,
  captions.
- A **theater layout** on video pages: the player fills the viewport; the
  episode's page is one Escape away.
- Site knowledge kept as data and checkable with a script, so following site
  changes is cheap.

## Non-goals

- Not an ad blocker, not a downloader, not a paywall or DRM workaround. It
  needs a paid Dropout login exactly as the site does.
- No on-screen keyboard. Search and login need a real keyboard or a phone
  (the HTPC shell supplies its own OSK bridge). `/` opens the search field and is the
  **only** keyboard key the extension maps.
- Not a general spatial-navigation extension — it runs only on Dropout hosts.
- No Chromium build for now. Stay on the `browser.*` promise API so a port
  remains possible.

## Who it's for

1. Anyone watching Dropout on a PC connected to a TV, driving it with a
   keyboard, an HID remote (arrows, Enter, Escape, media keys) or a gamepad
   mapped to keys.
2. **The bedroom HTPC** — a KDE Plasma Bigscreen appliance driven only by a
   WeChip W1 air-mouse remote, where Dropout today runs as an Android TV app
   inside Waydroid. Firefox + this extension is the candidate replacement.
   Its constraints (which keys the remote actually sends, no global remaps,
   release-channel Firefox) are in [targets.md](./targets.md).
3. **The HTPC shell** (`~/src/htpc-shell`): its Dropout web app (ADR-0014) installs this
   extension in the Dropout kiosk profile. The HTPC shell's spike S08 uses it for the
   Dropout step.

Both TV setups share the rules that shape this spec: one tab opened straight
on `/browse`, fullscreen or kiosk, no pointer in normal use, and "leaving"
means Back at the top level closes Firefox.

## Core functionality

- **Scope.** Runs on `watch.dropout.tv` (page script) and `embed.vhx.tv`
  (player-frame script). On `https://www.dropout.tv/` (marketing site, root
  only) it forwards to `https://watch.dropout.tv/browse` when the
  *skip marketing site* setting is on (default on).
- **Home (`/browse`) is Leanback's own screen.** It is drawn from what
  Dropout renders on the page — the featured banner's slides and every row of
  tiles, with the same links, pictures and titles — as a layer of Leanback's
  over the site, which stays underneath untouched. Hubs such as
  `/dimension-20`, drawn by the same component, get the same screen without
  Continue Watching.
  - **Rows and columns.** The banner's buttons, then one row per shelf. ▲ ▼
    change row and restore the card last selected in that row; ◀ ▶ move along
    a row and stop at its ends.
  - **TV-style scrolling.** The selected row always sits at the same height
    near the top; the rows move under it, and what is above the selected row
    fades out. Along a row, the selected card keeps its place and the row
    slides, until the row's end comes into view.
  - **Cards** show the picture (for a show, its wide picture, the one its own
    page uses, rather than the tall poster Dropout's Home draws), the title,
    the running time (`6:03`, without Dropout's leading zero), Dropout's badge
    ("New", "New Episode") and the progress bar. The New Releases row shows
    no "New" badge, since the row says so already. Dropout's "My list" row is
    not drawn: My List is a page of its own, on the rail. Nor is Dropout's own
    "Continue Watching" row (shown when something is in progress on its apps):
    its videos are in Leanback's Continue Watching. The selected card
    grows by the selection zoom and its
    title steps down, so neither the card nor the ring touches any text.
  - **Rows arrive as the selection goes down.** Dropout draws a few rows at a
    time. Two rows from the end, Leanback presses Dropout's own *Show more*
    (and scrolls the page underneath if that does nothing). A row of 12 shows
    — the most Dropout draws in a row — ends with a **View all** card that
    opens the whole collection.
  - **The featured banner** shows one slide at a time with Dropout's own
    buttons (*Watch now*, *Trailer*, *My list*): links are followed, *My list*
    presses Dropout's own button on that slide. A **›** button right after
    *Watch now* steps to the next slide, round the end.
  - The selection starts on the banner's first button. If nothing can be read
    off the page within 10 s, Home is not drawn and Dropout's page is driven
    by the rules below.
- **Continue Watching** is Home's first row: the videos in progress, from
  Leanback's own watch history and from Dropout's progress bars (which come
  from its Roku and Android apps), merged into one row, most recent first.
  Each card shows the time left on its picture, to the second (`2:48 left`,
  `1:12:05 left`).
  Every card on Home draws the same merged progress.
- **Watch history.** Leanback records how far each video has got while it plays
  here — on pause, seek, the end, the player losing focus, and every 15 s of
  playback — in `storage.local`, in this Firefox only. A video counts as
  **watched** at 95 % or with less than 90 s left, and as **in progress** once
  more than a minute has played. Trailers and live streams are not recorded.
  Dropout's bars carry no date, so a bar is dated when Leanback first sees its
  value; a first sighting never outranks Leanback's own reading of the same
  video. *Clear Continue Watching* forgets every video not finished: it
  deletes Leanback's readings of them and empties Continue Watching —
  Dropout's bars included — until something is watched again, here or
  elsewhere. Watched videos are kept whole, so they stay watched; Dropout's
  bars still show on its cards.
- **Picking up where you left off.** A video in progress starts where it was
  left, with "Resumed at 12:04" for a moment. *Start Over* heads the playback
  panel after a resume and goes back to 0:00. Resuming never changes whether
  the video is playing or muted.
- **The rail.** On Home, Browse (`/series`, all shows), My List, Search and
  Dropout 24/7, an icon rail runs down the left: Search, Home, Browse, My List
  (a bookmark, `/my-list`), Dropout 24/7 (`/dropout-24-7`), and a gear for
  Leanback's settings in place. My List is a grid of tiles like Browse, the
  selection starting on the first. The current
  page's icon is yellow; the icons have no background of their own, hovered
  or selected, so the ring is the only mark of the selection.
  ◀ from the first card of a row (or anything at the left edge) enters it on
  the current page's entry, or on the one last used; ▲ ▼ move, OK opens, ▶
  (and Escape) return to exactly where the selection came from. Not on a
  show's page, not during playback.
- **A show's page, one for every show.** Pages at a one-word address are
  sorted by what the page holds, never by address or name, so every show
  works the same way, including ones Dropout adds later
  (`sites/dropout.json` → `pages.series.show.layouts`). A show and a special
  are **Leanback's own screen**, drawn as Home is from what the page holds,
  Dropout's page untouched underneath (G6):
  - **The banner**, Home's: the show's wide picture (the one on its page),
    its name, the number of seasons and its description, and the show's
    buttons.
  - **a show** (an episode grid): if it has more than one season, a **row of
    seasons, newest first**, built from Dropout's own season list, above the
    selected season's episodes. Each season button says "Season N"; the whole
    name ("Season 1: All About …") and Dropout's episode count head the
    episodes. The season on screen is filled yellow. ◀ ▶ move along the row,
    which slides to keep the selection in view and stops at its ends; ▲ into
    the row lands on the season on screen, or where the row was left. OK
    opens that season's page in place of this one (seasons are sideways, so
    Back leaves the show); OK on the season already on screen goes down to its
    episodes. Episodes are three across, in Dropout's order, Home's cards
    (picture, running time, title, "Episode N"); a watched one is dimmed
    with a tick, one in progress has a bar. Rows of episodes past the first
    slide to the same place near the top, as Home's rows do; more load
    through Dropout's own *Load More* near the end. Above the seasons: the
    show's buttons, Leanback's own first.
  - **The main button** (yellow, first of the show's buttons) picks the show
    up: **Resume S9 E3**, the episode most recently in progress in any
    season; else **Play S9 E4**, the next unwatched episode after the last
    one finished, on screen or, past the end of what is on screen, the one
    Dropout's up-next named when it played here; else **Play S9 E1**, the
    first episode on screen. Leanback's history and Dropout's own bars on the
    tiles both count; progress from before *Clear Continue Watching* does not
    resume. Then *Trailer*, where the show has one, and *My List*, which
    presses Dropout's own button and carries a tick while the show is on the
    list.
  - **Opening a show.** Dropout opens every show on Season 1. At an address
    that names no season, Leanback goes on to the **newest** season (setting:
    *Shows Open On* newest / first), replacing the page; an address that
    names its season is left alone. The page stays blank until that is
    decided (never more than 2 s), so Season 1 does not flash up.
  - **Where the selection starts:** the episode you are partway through; else
    the first one after the last you finished; else, for a season not started
    or finished all the way through, Episode 1. Watched and in progress come
    from the watch history and from Dropout's own bars on the tiles.
  - **a special** (a movie and its extras): the banner with *Watch Movie*
    (where the selection starts) and *My List*, then the movie and its
    Extras. **A list** (Trending, New Releases, a show's
    new episodes, trailers): its tiles, of episodes or of shows, with load
    more. **A hub** (Dimension 20) gets Home's screen.
  - Not drawn: Share, the season drop-down and sort control (S2), and the My
    List button Dropout puts on each episode for a mouse (M7).
  - **A show Leanback cannot read** (no name in its header: Dropout has
    changed the page) is restyled instead: Dropout's page with the same
    buttons, row of seasons and episode marks.
- **Pages Leanback draws.** Besides Home: Browse (`/series`), My List
  (`/my-list`), `/collections/…`, and the lists at a one-word address
  (Trending, New Releases, a show's new episodes…): `content/screen.js` reads
  the page's title and tiles (`sites/dropout.json` → `screen`) and draws
  Leanback's own screen over it, as Home is drawn — the page's name, then
  Home's cards five across, the selected row sliding to the same place, more
  loaded through Dropout's own *Load More* near the end. Browse and My List
  have the rail; the lists do not (they are reached from Home's *View all*).
  My List is named as on the rail. New Releases shows no "New" badges.
- **Dropout's top bar and footer** are hidden on every page but sign-in,
  account, help and legal (the `other` pages); the rail and Back do their
  jobs.
- **Search is Leanback's own screen**, drawn from Dropout's search app
  (`sites/dropout.json` → `screen.search`), which stays underneath:
  Leanback's own search box at the top, as wide as five cards, with large
  text; what is typed into it is typed into Dropout's box, and Dropout's
  results come back as Home's cards, five across beside the rail. Under the
  box, Dropout's type filters (*All (118)*, *Videos (115)*, *Collections
  (4)*) as a row of pills, the one on screen yellow; OK presses Dropout's
  own. With nothing typed, Dropout's own words ("Start typing to see
  results"). The selection starts in the box. ▼, OK or Back leave the box
  for the filters, then the results; ▲ comes back up; ◀ at the start of the
  text is the rail (N1, N2). Dropout's *Load More* is pressed near the end
  of the results, never while typing. The box is ringed but not zoomed.
  Without Dropout's search box on the page, the page is driven as it is.
- **Spatial navigation** everywhere else. Arrow keys move DOM focus to the
  nearest focusable element in that direction. A tile with two links (image +
  title) counts as one target. ◀ moves only to something level with the
  selection; past that is the rail, where there is one. Open dialogs (trailer
  modal, cookie banner) trap focus until closed, and hide Home and the rail
  while they are open. Details: [architecture.md](./architecture.md).
- **Focus ring.** One overlay element drawn over the focused target: 4 px ring
  in Dropout yellow (`#feea3b`) with a dark edge, its corners rounded like the
  target's, and the target itself enlarged by the selection zoom (5 % by
  default; *Enlarge Selection* in Leanback's settings). Follows scroll and
  resize.
  Colour, width and zoom are settings. Under `prefers-reduced-motion` nothing
  animates.
- **Select / Back.** OK activates the focused element (native activation for
  links and buttons, synthetic click otherwise). **Back is Firefox's own
  Back**: Firefox acts on the remote's BrowserBack whatever the page does, so
  Leanback keeps the history in the shape Back should follow instead. Moving
  sideways — another episode, another season, one rail section to
  another — replaces the page rather than adding one; a Back that lands on a
  sibling (the previous episode, when Dropout's own up-next card went on to
  the next) carries on past it. So Back walks video → the season page you
  came from → Home. `Escape` does the same after closing what is open on the
  page (a dialog, the settings panel, the rail, the player's bar, theater). In
  a tab opened straight on a page, with nothing of the site behind it, Back
  walks up the site itself, and at Home runs the **exit hook** (setting:
  *nothing* (default) or *close this tab* — the HTPC shell kiosk hand-off).
- **Drop-downs.** A native `<select>` Leanback has not replaced (the season
  and sort controls on a page whose layout is not recognised) is a
  **two-step control**: Enter engages it, Left/Right then step its options
  without opening the native dropdown and without firing `change`, Enter
  commits (going to the option's page, in place of this one) and Escape
  restores the value it had. Arrows only reach the options while the control
  is engaged — otherwise Left/Right could never carry the ring past a dropdown
  to the control beside it.
- **Load more.** Moving Down past the last row of a grid triggers the site's
  "Load More" control and continues once new tiles arrive.
- **Video pages.** On load: enter theater layout, focus the player. Inside the
  player: OK and Play-Pause toggle playback, Left/Right seek by the seek step
  (10 s by default), Down opens the transport bar and Down again goes to the
  episode's page; back leaves theater layout, and again goes up a layer. Media keys (Play/Pause, Stop, Next, Previous) work from anywhere
  on a video page. Full table: [keymap.md](./keymap.md).
- **The episode's page is Leanback's own screen** (G6), drawn from Dropout's
  page under the player (`sites/dropout.json` → `screen.episode`): Dropout's
  player, moved by style only (moving the frame would reload it), sits in a
  large 16:9 place at the top left, over Leanback's screen, and keeps
  playing; beside it the show's name (yellow capitals), the episode's title,
  "Season 2, Episode 1 · 28-Feb-2020", the description (four lines) and the
  buttons *Play* (yellow: into the video, theater as the setting says,
  playing if it was paused), *Episodes* (the season's page, else the show's)
  and *My List* (Dropout's own button, ticked while on the list). Under them
  Dropout's *Up Next in Season N* as Home's cards. The selection lands on
  *Play* leaving the video (▼ out of the bar, or Back out of theater); ▲
  from the buttons goes back into the video. A page with no title to read
  is driven as Dropout draws it.
- **Next / previous episode.** Uses the site's own up-next data when present;
  otherwise the episode order from the series page. **Autoplay next** on
  `ended` is a setting (default on).
- **Up next.** From Dropout's lead time before the end (8 s) — or as soon as
  Dropout's own card is up — a card over the bottom right: the next episode's
  picture in a countdown ring, "UP NEXT · 0:08", "S9 · E4", the show, and
  its keys. OK plays the next episode now (through Dropout's own card when it
  is there). ◀, or Escape, hides it for this episode, and then nothing plays
  by itself at the end. With *Autoplay Next Episode* off it counts nothing down,
  and Dropout's own card is told to stand down (its Hide). Dropout's card
  stays in place, invisible.
- **The title.** Over the top left of the picture: the show's name in yellow
  capitals, then "S9 · E3 · Whodunnit" (the page's season link and title;
  the player's own title when the page does not answer). It shows for 4 s
  when an episode first plays, and with the bar whenever the bar is up.
- **Pause.** A pause the viewer makes brings up the title and the bar for
  4 s, without the selection: ◀ ▶ still skip, OK plays (and the bar goes), ▼
  enters the bar. The settings panel's own pause, and Firefox stopping an
  unmute, show nothing.
- **Skipping.** Each skip (◀ ▶, the media keys' rewind and fast-forward)
  shows ⏪ / ⏩ with the new time in the middle of the picture, and peeks the
  bar, until 1 s after the last skip; each skip restarts that second, so quick
  presses never flicker. On a paused video the bar stays for the pause's 4 s.
- **Transport bar.** ▼ on a playing video opens Leanback's own bar: play/pause
  · position · settings · fullscreen, as round buttons on a dark fade along
  the bottom of the picture, the play button larger with a yellow symbol; the
  time so far under the start of the progress bar, the length under its end. ◀ ▶ walk it (and stop seeking while it is
  open), OK takes a control, back closes it. ▼ again continues to the page
  below. The player's own chrome stays hidden.
- **One settings panel.** Leanback's settings are one list
  (`lib/settings.js` → `ROWS`) drawn by one panel (`nav/panel.js`), the same
  on a page and during playback: full height from the right and narrow (310
  of 1920 units), each value on the line under its name, the title and a ✕
  that is only a picture, the selected entry in yellow, a switch for each
  on/off, a chevron and the value for an entry with several values, a tick on
  the chosen option, headings over groups, and the keys along the foot
  ("◀ Back · ▲▼ Move · OK Change"). ▲ ▼ move; OK or ▶ take an entry (a switch
  flips, an entry with several values opens its short list, where OK picks one
  and goes back up; ▶ never runs an action); ◀ or Back go up one level and at
  the top close the panel. The options page shows the same entries in the
  same words as a form.
- **Settings panel (playback).** The bar's settings, or the menu button during
  playback, opens it: *Start Over* after a resume, Quality and Speed (the
  player's own menus), Play Next Episode, **Closed Captions** as a switch (on:
  the player's first track; off: Off; ▶ opens the player's captions menu),
  **Caption Style** (the player's Customize: font, background, window, as many
  levels deep as they go; one ◀ comes all the way back) and Leanback
  Settings. It pauses the picture while open.
- **Settings everywhere else.** The menu button (or the rail's gear) opens
  Leanback's settings as a panel on the page, with *Clear Continue Watching*
  (OK twice) and *Turn Leanback Off* under the settings. It fills a panel
  rather than opening a tab: any navigation away from the site would tear the
  extension's state down, and in a kiosk there is no way back.
- **Button hints.** Off by default. When on, a bottom strip shows the buttons
  that matter in the current context: it stays on screen on pages, and during
  playback appears briefly on a press. Short notices ("No next episode") use
  the same strip and appear with hints off too.
- **Toggle.** Clicking the toolbar button, the settings panel's "Turn Leanback
  Off", or a user-assigned keyboard shortcut (`commands` API, no default
  binding) turns the extension off/on for the site; state persists.

## Optional / future functionality

- Native-messaging exit hook and OSK text bridge (the HTPC shell only — stays in
  The HTPC shell's own extension; this extension keeps the seam, not the feature).
- Gamepad support via the Gamepad API (today: map the pad to keys outside the
  browser).
- Selector drift check script (`tools/check-site.sh`) run in CI weekly.

## Permissions

- `storage` — settings and the watch history.
- Host permissions `*://watch.dropout.tv/*`, `*://embed.vhx.tv/*` (content
  scripts; `embed.vhx.tv` needs `all_frames: true` because it only ever loads
  as an iframe) and `*://www.dropout.tv/*` (root redirect only).
- `data_collection_permissions: { required: ["none"] }` — nothing leaves the
  browser. The watch history stays in this Firefox's extension storage. The
  only requests the extension causes are for pictures: Home's cards load
  Dropout's own pictures from Dropout's image server (`vhx.imgix.net`),
  including a show's wide picture, which Dropout's own Home does not show.
  Pressing Dropout's *Show more* loads rows the way scrolling does.
- **Not** requested: `tabs` (the background can message the sending tab and
  close it via `sender.tab.id` without it), `webRequest`, `nativeMessaging`,
  `<all_urls>`. If a permission is added, explain it here, in the README, and
  in the options page.

## Architecture overview

- `background.js` (event page, `persistent: false`): settings defaults and
  storage, relay between the page frame and the player frame (keyed by tab and
  frame id), `commands` handler, toolbar toggle, exit hook.
- `background.js` is also the only writer of the watch history.
- `content/page.js` (top frame of `watch.dropout.tv`): loads
  `sites/dropout.json`, detects the page kind from the URL, runs spatial
  navigation, focus ring, hint bar, the rail, theater layout, back logic,
  load-more, and starts Leanback's screen on Home, hubs and the pages it
  draws.
- `content/home.js`: the Home screen — reads the banner and rows off
  Dropout's page (and a show's wide picture from the data its tile was drawn
  from) and draws Leanback's own layer from them.
- `content/screen.js`: the pages Leanback draws besides Home — a title or a
  banner, a row of seasons, sections of cards — from a model its reader
  builds; it reads collection pages itself.
- `content/show.js`: a show's page (and specials and lists) — tells which it
  is from the page, reads a show or special for `content/screen.js` (banner,
  buttons, seasons, episodes, what is watched, the episode to start on), and
  restyles Dropout's page when it cannot. `content/show.css` styles the
  seasons and the restyle; `content/early.css`, the one stylesheet
  loaded before the page is drawn, keeps Dropout's page blank until Leanback
  has started, so Dropout's page never shows first.
- `content/player.js` (every `embed.vhx.tv` frame): finds the `<video>`,
  handles keys while the frame has focus, executes player commands, reports
  state (`paused`, `currentTime`, `duration`, `ended`, up-next) to the page,
  reports progress to the watch history and resumes.
- `content/transport.js`: the transport bar and the playback settings panel.
- `lib/history.js`: the watch history — keys, thresholds, merging, Continue
  Watching — shared by the background, the page and the player.
- `nav/spatial.js`, `nav/focus-ring.js`, `nav/panel.js`, `nav/rail.js`:
  site-agnostic pieces — they only see the rules object or what they are
  handed, never Dropout selectors — so they can be reused for another site or
  borrowed by another project without edits.
- `sites/dropout.json`: routes, page kinds, focusable/tile/row selectors,
  modal selectors, player selectors, key map overrides.
- `options/`: settings page (keyboard-operable, follows system theme).

## Settings and storage

`storage.local`:

One object under the `settings` key, normalised on every read (a missing or
corrupt value falls back to the default rather than throwing) by
`lib/settings.js`, which every context shares.

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | TV navigation on for Dropout hosts |
| `ringColor` | `"#feea3b"` | ring colour, `#rrggbb` |
| `ringWidth` | `4` | px, clamped to 2–12 |
| `focusZoom` | `5` | how much bigger the selected item gets, in percent; 0 turns it off. Under reduced motion it changes without animating |
| `hintBar` | `false` | show button hints |
| `theater` | `"auto"` | `auto` on every video page, `manual` (OK on the player), `off` |
| `playerChrome` | `"leanback"` | `leanback` or `site`: the site's own player controls, for troubleshooting. On the options page only |
| `seekStep` | `10` | seconds per ◀ ▶ press in the player; one of 5, 10, 15, 30, 60, 120, 300 |
| `autoplayNext` | `true` | play the next episode when one ends |
| `startMuted` | `false` | start videos muted. Off by default: Dropout starts them muted to satisfy Firefox's autoplay policy, and the extension turns the sound back on once per video |
| `skipMarketingSite` | `true` | forward `www.dropout.tv/` to `watch.dropout.tv/browse` |
| `exitHook` | `"none"` | `none` or `close-tab` — what Back does at the top level (Home) |
| `seasonStart` | `"latest"` | `latest` or `first` — the season a show opens on when its address names none |

The watch history is a separate key, `progress`, so a settings save never
rewrites it: `{ entries: { <video slug>: { url, title, series, image,
duration, show, season, episode, next: { url, season, episode }, local: {
position, at }, dropout: { percent, at } } } }` (`show`, `season` and
`episode` from the episode page, `next` from Dropout's up-next), normalised
on every read by `lib/history.js` and capped at 500 videos (the least recently
touched go first). *Clear Continue Watching* keeps every watched video whole;
of the rest it keeps only Dropout's own readings, and it sets `clearedAt`:
nothing unfinished read before it counts for Continue Watching or resuming. The tab's trail for Back is in `sessionStorage` (`tenfoot.trail`,
`tenfoot.intent`), not `storage.local`.

## UI requirements

- Leanback's own UI on a page: the focus ring, the hint bar, the options
  panel, the rail, and on Home the whole screen. The ring and hint bar must
  stay legible over light and dark thumbnails and must never cover the focused
  element's text. The ring's corners follow the rounding of what it
  surrounds, and it is the only highlight: Leanback's buttons draw no
  background of their own when hovered or selected.
- Home follows Dropout's look: its typeface (Helvetica Neue, Helvetica,
  Roboto, Arial), a near-black ground (`#0b0c10`), yellow (`#feea3b`) for the
  ring, badges and progress. Sizes scale with the screen width, so it reads
  the same on a 1080p and a 4K television; no text is smaller than 13 px.
  Home, the rail and every page Leanback draws are at 80 % of a 1920-wide
  layout.
- Options page: plain form, ≥ 16 px text, fully operable by Tab/arrows/Enter,
  light/dark via `prefers-color-scheme`.
- No browser-action popup — a popup cannot be driven from a remote.

## Performance notes

- No polling. A debounced `MutationObserver` (100 ms) invalidates the
  focusable-candidate cache; candidates and rects are computed on keypress.
  Changes inside Leanback's own elements do not count.
- Home redraws only what changed, keyed by link, so a card keeps its element
  (and the selection) when the site redraws. Pictures load lazily.
- The watch history hears from a playing video at most every 15 s; the
  background applies one report at a time.
- Focus ring updates are `requestAnimationFrame`-throttled on scroll/resize.
- Arrow repeat is capped at one move per 80 ms.
- Player state messages are sent on change and at most 4×/s while playing.

## UX guidelines

- Exactly one focused element is always visible; on page load focus lands on
  the first content (never on the header, never nowhere): on Home, the
  featured banner's first button.
- Never trap focus except inside a real dialog, and Escape always closes it.
- Never inject synthetic key events into the page; act on elements directly.
- Never override the site's behaviour for keys the extension doesn't need.
  Typing in an input field is left alone except for Escape, ◀ at the very
  start of the text, and ▼ in a one-line field, which have nothing to do
  there.
- Back must always lead somewhere sensible even when the tab was opened
  straight onto a deep link (kiosk case): with nothing behind, Leanback walks
  up the site.
- Never fight the browser: what Firefox does with a key regardless (Back)
  is designed around, not blocked.
- **Focus never follows the pointer.** Air-mouse remotes drift; `mouseover`
  must not move the ring, and the site's hover tooltips over tiles are
  suppressed while the extension is on. A deliberate click still activates.
- Keys the browser or desktop own (`BrowserBack`, `BrowserHome`,
  `ContextMenu`, volume) are handled as in [keymap.md](./keymap.md):
  intercept what the page can, never fight what it can't.

## Testing

Manual checklist (full version with expected results in
[development.md](./development.md)):

- Home: Leanback's screen replaces Dropout's; arrows move between and along
  rows, each row keeps its place, the selected row sits at the same height;
  more rows arrive near the bottom; View all ends a full row; Enter opens a
  series or episode; Escape at Home does nothing (exit hook off).
- Home's cards: shows have wide pictures; running times read `6:03`; no
  "New" on New Releases; the selected card and its ring touch no text; the
  ring's corners follow the card's.
- Highlights: the rail's icons, the banner's buttons and the settings panel's
  rows show no coloured background when selected or hovered; the ring is the
  only highlight.
- Continue Watching: an episode watched a few minutes in Firefox appears first
  on Home; one in progress on the Roku appears too.
- Resume: reopening that episode starts where it stopped, says so, and
  *Start Over* goes back to 0:00.
- Rail: ◀ from the first card enters it; ▶ returns to that card; My List and
  Dropout 24/7 open; the gear opens settings in place; not on a show's page.
- My List: no My List row on Home; the rail's bookmark opens the page, lit
  yellow there, the ring on the first saved show.
- Back: episode → season → Home with the remote's back button, including after
  Dropout played the next episode by itself.
- Search: Leanback's box at the top with the selection in it; typing brings
  Dropout's results as cards five across; ▼ the filters, ▼ the results; OK
  on a filter shows only those.
- `/series` grid: Down past the last row loads more; focus continues.
- A show's main button: *Resume S9 E3* for an episode partway through,
  *Play S9 E4* after one finished, *Play S9 E1* for a show not started; OK
  plays it.
- A show's page: opening a show from Home lands on its newest season, with no
  flash of Season 1; the seasons run newest first with the one on screen
  yellow; ▲ from the episodes lands on it; ◀ ▶ walk the row, OK opens a season
  and Back then leaves the show; episodes three across, watched ones ticked,
  one in progress with a bar; the selection starts on the episode to watch
  next; *Trailer* and *My List* reachable, Share gone; Enter on an episode
  plays it. It is Leanback's screen: the show's picture and name at the top,
  Dropout's top bar hidden.
- A special: Leanback's screen with *Watch Movie* (selected) and *My List*;
  the movie and the extras below.
- ◀ closes Leanback's settings and the top of the playback settings; ◀ at the
  start of the search box moves to the rail; ▼ from the search box reaches
  the results, ▲ goes back into it.
- *Clear Continue Watching*: Continue Watching empties; episodes already
  watched keep their ticks.
- Video page: theater layout appears; OK toggles; Left/Right seeks; Down opens
  the transport bar, Down again reaches the episode's page, the video carrying
  on at the top left, the ring on *Play*; ▲ back into the video; back returns
  to the season page.
- Settings panel: Closed Captions → Customize → Font is reachable, each group
  of options headed; ◀ goes up one level. Closed Captions flips on OK;
  Caption Style opens the player's Customize, and one ◀ comes back.
- Leanback's settings: the same list on a page and in the playback panel;
  a switch flips on OK; Seek Step opens its list, OK picks a value (ticked).
- Media keys work on a video page from anywhere on the page.
- Autoplay next: the next episode starts when one ends.
- Trailer modal and cookie banner: Escape closes; focus returns.
- Toggle off: the site behaves as stock Firefox; toggle on restores it.
- Pointer drift: moving the mouse over tiles does not move the ring.
- Settings persist across restarts.
- `web-ext lint --warnings-as-errors` passes.

## Known limitations

- Depends on Dropout's markup; class names can change without notice.
  `sites/dropout.json` and the drift check are the mitigation. If Home finds
  nothing to draw, Dropout's own page is shown and driven directly.
- Opening a show on its newest season loads that season's page after
  Dropout's, so the screen is blank for a moment. The episode the selection
  starts on is chosen from the episodes Dropout has drawn (its first page of a
  long season).
- Continue Watching sees Dropout's progress only on the rows Home has loaded,
  and watching in Firefox does not reach Dropout's history (see Milestones).
- A show's wide picture comes from the data Dropout's page was built from,
  not from its markup. If Dropout changes that, show cards fall back to the
  tall poster, cropped to the card.
- Login and search need a keyboard or the HTPC shell OSK bridge; login also loads
  reCAPTCHA Enterprise, which may block a kiosk login flow.
- Firefox's autoplay policy may block autoplay-with-sound until the site has
  played once by user gesture (Enter counts) or autoplay is allowed for the
  site.
- **Release-channel Firefox (Fedora's, Mint's) keeps only AMO-signed
  extensions installed.** Until the first unlisted signing, the extension can
  only be loaded temporarily — fine for development, useless on an appliance.
  Signing is therefore an early milestone, not a release-day step.

## Milestones

### 1.0

- **Watch history syncs between devices.** Leanback's own watch history
  (Continue Watching, resume points, watched marks) stays in this Firefox
  until then. It will not sync through a Firefox account. The approach
  — for example writing into Dropout's own history, so the Roku and Android
  apps see what was watched here — is decided when the work starts.

## Release checklist

- Bump `version` in `manifest.json`.
- Re-run the selector drift check; update `sites/dropout.json` if needed.
- Run the manual test checklist in a fresh profile and in a logged-in profile.
- `web-ext lint --warnings-as-errors`, `web-ext build`.
- Sign on AMO as **unlisted** (needed for a permanent install on release
  Firefox and for policy install in the HTPC shell). Check the add-on name against
  Mozilla's trademark rules before the first submission.

## Troubleshooting

- No focus ring: the extension is toggled off (toolbar badge), or the page is not on a
  Dropout host, or the rules file failed to load (background console).
- Arrows do nothing on a page: the page kind wasn't recognised (URL not in
  `routes`) — check `sites/dropout.json`.
- Keys don't reach the player: the `embed.vhx.tv` script didn't register
  (frame blocked, or `all_frames` missing) — see the relay log in the
  background console.
- Playback doesn't start: autoplay blocked — press Enter once; check
  `about:preferences#privacy` → Autoplay for the site.
