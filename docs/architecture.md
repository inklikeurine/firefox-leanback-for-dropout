# Architecture

Leanback for Dropout is a Manifest V2 WebExtension with no build step. The one
fact that shapes it: **the Dropout player is a cross-origin iframe**
(`embed.vhx.tv`) inside the page (`watch.dropout.tv`). Keys pressed while the
player has focus arrive in the frame's document, not the page's; the page can
neither see the `<video>` nor receive those keys. So there are two content
scripts, and the background script relays between them.

## Components

```
                        watch.dropout.tv tab
┌────────────────────────────────────────────────────────────────────┐
│ top frame — content/page.js (+ nav/spatial, focus-ring, menu)      │
│   page kind · spatial nav · focus ring · hint bar · theater · back │
│                                                                    │
│   ┌──────────────────────────────────────────────────────────┐     │
│   │ iframe embed.vhx.tv — content/player.js + transport.js   │     │
│   │   <video> control · key handling while focused · state   │     │
│   └──────────────────────────────────────────────────────────┘     │
└──────────────┬──────────────────────────────────▲──────────────────┘
               │ runtime.sendMessage               │ tabs.sendMessage(tabId, msg, {frameId})
               ▼                                  │
        ┌──────────────────────────────────────────┴───┐
        │ background.js (event page)                   │
        │   settings · frame registry · relay ·        │
        │   toolbar toggle · commands · exit hook      │
        └──────────────────────────────────────────────┘
                              │
                        storage.local
```

| File | Runs in | Owns |
| --- | --- | --- |
| `lib/settings.js` | Every context (first script of each list) | The settings object: defaults, validation on read, `load`/`save`/`watch`. Shared rather than broadcast, so no context waits for another to start. |
| `nav/trail.js` | Top frame | The trail: which pages of the site are behind the current one in the tab's history, how a page was reached, and which pages are siblings. Site-agnostic; `sessionStorage` only. See [Back](#back-contentpagejs--navtrailjs). |
| `lib/history.js` | Background, page and player | The watch history: video keys, the watched / in-progress thresholds, merging Leanback's readings with Dropout's progress bars, Continue Watching, resume points, the size cap, `load`/`save`/`watch` on `storage.local` key `progress`. Pure apart from those three. |
| `background.js` | Event page (`persistent: false`) | Serves `sites/dropout.json` (`rules:get`, cached); per-tab registry of the player frame id in **`storage.session`** (an event page loses a plain variable when it unloads; a `Map` is the fallback if the API is missing); message relay page ⇄ player; toolbar button toggle and badge; `commands` handler; exit hook (`tabs.remove(sender.tab.id)`); the **only writer of the watch history**, one change at a time. |
| `content/page.js` | Top frame of `watch.dropout.tv` | Loads `sites/dropout.json`; classifies the URL into a page kind; wires keys → actions; starts the Home screen on Home and hubs and the show page on a show; opens a show on its newest (or first) season; drives the rail, spatial navigation, focus ring, hint bar, theater layout, structural Back, load-more, next/previous episode; sends the episode page's details to the watch history. |
| `content/home.js` | Top frame, Home and hubs | The Home screen: reads the featured banner and the rows off Dropout's page (rules `home`), draws Leanback's own layer from them, keeps the selection model and the TV-style scrolling, presses Dropout's *Show more*, builds Continue Watching. See [The Home screen](#the-home-screen-contenthomejs). |
| `content/show.js` | Top frame, pages at a one-word address | A show's page, a special or a list: tells which from the page, draws the row of seasons from Dropout's season list, marks what Leanback hides and the parts `content/show.css` restyles, stamps episodes watched or in progress, picks the episode to start on. See [A show's page](#a-shows-page-contentshowjs). |
| `content/player.js` | Every frame on `embed.vhx.tv` (`all_frames: true`) | Registers with the background (`player:hello`); finds the `<video>`; handles keys while the frame has focus; executes `player:command`; reports `player:state` and `player:ended`; exposes `OTTData` facts; reports progress to the watch history and resumes a video in progress. Owns **when** the transport bar is open and what Back means while it is, and applies the `startMuted` preference once per video. It loads `lib/history.js`, `nav/site-rules.js`, `nav/spatial.js`, `nav/focus-ring.js` and `content/transport.js`, plus `content/player.css`. |
| `content/transport.js` | Every frame on `embed.vhx.tv` | Draws the transport bar (**play/pause · position · settings · fullscreen**) and drives the `<video>` directly. Also draws the full-height settings panel, which holds the player's settings (Quality, Speed, Closed Captions) and Leanback's in one list. The player's are **proxied** — see [The transport bar and the settings panel](#the-transport-bar-and-the-settings-panel). Leanback's are read from and written to `storage.local` through `content/player.js`. Site-agnostic apart from the `player` block of the rules it is handed. |
| `content/marketing.js` | `www.dropout.tv` at `document_start` | If the path is `/` and *skip marketing site* is on, `location.replace("https://watch.dropout.tv/browse")`. Nothing else. |
| `nav/spatial.js` | Top frame | Site-agnostic directional focus search over a candidate list; row-aware moves; focus memory. Knows nothing about Dropout. |
| `nav/menu.js` | Top frame | The options panel the menu button opens: a list of `<button>`s the ring moves through like anything else. Site-agnostic; `content/page.js` supplies the entries and says what they do. |
| `nav/rail.js` | Top frame | The icon rail: buttons down the left edge, its own remembered position, which entry is the current page. Site-agnostic; `content/page.js` supplies the entries and says what they do. |
| `nav/focus-ring.js` | Top frame | The overlay ring element and its positioning; hint bar element. Site-agnostic. |
| `nav/keymap.js` | Both content scripts | Keys → action names, per context (page / player / typing). Pure and site-agnostic. |
| `nav/site-rules.js` | Both content scripts | Helpers over the rules object: URL → page kind, selector lists. Pure. |
| `sites/dropout.json` | Fetched by `background.js`, handed to the content scripts on `rules:get` | All Dropout knowledge: routes → page kinds, selectors per page kind, modal selectors, player selectors. |
| `options/options.html/.js/.css` | Options page (`open_in_tab`) | Settings form. |

`nav/*` and the message protocol are site-agnostic on purpose: a second site
(Twitch) would add a `sites/<site>.json` and a page kind or two, not a second
engine. The extension itself stays standalone
([htpc-integration.md](./htpc-integration.md), [targets.md](./targets.md)).

## Page kinds and what the extension does on each

| Page kind | URL (see [site-notes.md](./site-notes.md#routes)) | Behaviour |
| --- | --- | --- |
| `browse` | `/browse` | **Home**: Leanback's own screen ([below](#the-home-screen-contenthomejs)) and the rail. Initial focus: the featured banner's first button. Back → exit hook. If Home finds nothing to draw within 10 s: row-aware navigation over Dropout's own rows (`pages.browse`). |
| `hub` | a one-segment path whose page holds `home.root` (`/dimension-20`, `/dropout-24-7`) | The same screen without Continue Watching; the rail with no entry marked as the current page. Back → Home. |
| `grid` | `/series`, `/collections/...`, `/my-list` | Geometric navigation over tiles, and the rail; Down past the last row clicks Load More. Initial focus: the first tile. Back → Home. |
| `series` | `/<slug>[/season:N]` | Everything at a one-word address that is not a hub: a show, a special or a list, told apart by `content/show.js` from the page. A show gets the row of seasons, opens on its newest season, and starts on the episode to watch next; focusables are the show's buttons (*Trailer*, *My list*, *Watch Movie* on a special), the seasons (a row) and the tiles. A page whose layout is not recognised keeps Dropout's season and sort selects, each a two-step control: OK engages it, ◀ ▶ step its options, OK commits (going to the option's page), Back puts the old value back. A list's initial focus is its first tile. Back → Home. |
| `video` | `/<slug>/season:N/videos/<ep>`, `/videos/<slug>` | Theater layout (setting `auto`), focus the player frame. Down from the player → the series link, else the first focusable under it. Back: theater on → leave theater; else the season page it was opened from when it is the same show, else the show's page. Media keys always reach the player. |
| `search` | `/search` | Geometric navigation, and the rail; the search input keeps the keyboard (only Escape is intercepted while typing). |
| `other` | everything else (login, account, legal pages) | No initial focus: the ring follows whatever the page focuses. Arrows move among links, buttons and form fields (`pages.other.focusable`). Back → Home. |

## Key handling

- One `keydown` listener on `window`, **capture phase**, in each content
  script. It maps `event.key` to an **action** (`up`, `down`, `left`,
  `right`, `select`, `back`, `menu`, `search`, `play_pause`, `stop`, `next`,
  `previous`, `fast_forward`, `rewind`) — the same vocabulary as the HTPC shell's
  Appendix A — then dispatches the action to the current context. Full table:
  [keymap.md](./keymap.md).
- If the event target is editable (`input`, `textarea`, `[contenteditable]`,
  or an open `<select>`), only `back` is handled, and `left` when the text
  cursor is at the very start of the field with nothing selected: that leaves
  the field for the rail where there is one, else for the nearest thing to
  its left.
- `preventDefault()`/`stopPropagation()` only when the action was consumed.
  Unconsumed keys reach the site untouched.
- Repeat: OS auto-repeat is accepted but throttled to one move per 80 ms.
- Focus handoff into the player: `page.js` calls `iframe.focus()` and sends
  `player:focus`; `player.js` focuses the `<video>` (or the player root).
  Out of the player: `player.js` sends `page:focus` with a hint (`below` |
  `back`) and `page.js` picks the target.
- **Browser-owned keys.** Remotes send `BrowserBack`/`BrowserHome`
  (`KEY_BACK`/`KEY_HOMEPAGE`) rather than Escape. Firefox goes back on
  `BrowserBack` whatever the page does with it ([targets.md](./targets.md)
  T2), so Leanback lets it, and keeps the history in the shape Back should
  follow instead — see [Back](#back-contentpagejs--navtrailjs). `BrowserHome`
  is never mapped.
- **Pointer.** `mouseover`/`mousemove` never change focus. While the
  extension is on, an injected style rule suppresses the site's hover tooltips (`.tooltip`) so a
  drifting air-mouse pointer doesn't litter the screen. Clicks are left to
  the site.

## Back (`content/page.js` + `nav/trail.js`)

Back is the browser's Back. Leanback does not cancel it or put history
entries of its own in its way; it makes sure the history is worth following:

1. **The trail.** Every page load records where the page sits in the tab's
   history (`sessionStorage` key `tenfoot.trail`): a list of the site's pages
   behind the current one, each with its page kind, the show it belongs to
   (`group`: the series slug, for episodes and season pages) and its
   structural parent. The load's navigation type
   (`PerformanceNavigationTiming.type`), and the intent Leanback left before
   navigating (`tenfoot.intent`: `push`, `replace` or `back`), say whether the
   page was pushed, replaced or gone back to. A page restored from Firefox's
   back-forward cache does the same from `pageshow`.
2. **Sideways moves replace.** Another episode (next / previous / autoplay),
   another season (a button in the row of seasons, or a two-step select whose
   options are addresses, goes there with `location.replace` instead of
   letting the site navigate), a show's bare address moved on to its newest
   season, and
   one top-level page to another from the rail (Browse, Search, My List,
   Dropout 24/7:
   pushed from Home, replaced from each other) never add a history entry. The
   rail's and the options panel's *Home* go back down the history to Home
   when it is on the trail (`history.go(-n)`), and open it otherwise.
3. **Siblings are skipped on the way back.** When a page is reached by Back
   and the page left is its sibling (same kind and same show: the previous
   episode, after Dropout's own up-next card went on to the next), it carries
   on back past every sibling at once, before setting anything up.
4. **Escape** runs the layered Back — dialog, options panel, rail, transport
   bar and settings panel (asking the player frame first, `player:back`),
   theater — and then the browser's Back (`history.go(-1)`), the same step
   the remote's BrowserBack takes.
5. **Nothing behind.** With no page of the site behind this one (a tab opened
   straight on it, the kiosk case), Escape walks up the site instead:
   episode → its season (`location.replace`, so the history never gains a
   page above) → Home → the exit hook. BrowserBack there gets 800 ms for
   Firefox to leave (any `beforeunload`/`pagehide` cancels it); if the page is
   still there, Leanback runs the same layered Back. BrowserBack pressed while
   the player frame has the keys is passed to the page (`page:action`
   `browser-back`).

## Spatial navigation (`nav/spatial.js`)

Input: a direction, the current focused element, and a candidate list.
Candidates come from the page kind's `focusable` selectors, filtered to
elements that are visible (non-zero rect, not `visibility:hidden`/`display:none`,
not `aria-hidden` ancestors, not `disabled`), deduplicated per **tile** (rule
`tile` → `target` selector; other links inside a tile are dropped), and scoped
to the topmost open **modal** when one is open (`modal` selectors).

1. **Row-aware move** (when the focused element is inside a `row` and the page
   kind defines rows): Left/Right → previous/next `rowItem` target in DOM
   order within the row (no wrap). Up/Down → the adjacent row; inside it,
   restore that row's remembered target (focus memory), else the item whose
   centre x is nearest the current centre x.
2. **Geometric move** (everything else): reject candidates whose leading edge
   is not past the current element's trailing edge in the pressed direction
   (2 px tolerance). Score = distance along the axis + 2 × orthogonal offset
   of the centres; halve the score if the projections overlap on the
   orthogonal axis (the HTPC shell §7.5 rule 3: axis-aligned overlap beats Euclidean
   distance). Lowest score wins. Nothing qualifies → no move (no wrap).
3. **Keep on screen**: `target.focus({preventScroll:true})` then
   `scrollIntoView({block:"center", inline:"center", behavior})` where
   behaviour is `smooth` unless `prefers-reduced-motion`. This happens on
   the **first** focus of a page too, not only on later moves. Dropout's
   desktop rows slide by transform rather than scroll, so `scrollIntoView`
   moves nothing inside them and the focused tile would sit off screen with
   the page apparently frozen. `nudgeRow()` therefore
   clicks the row's own `scrollNext`/`scrollPrev` control, looking for it
   inside the row and then up to three ancestors outwards (a carousel usually
   puts its arrows beside the row, not in it), once per page of tiles, up to
   eight times — and stops as soon as a click moves the tile's rect by
   nothing, which is how a disabled arrow or the end of a row announces
   itself.
4. **Load more**: Down with no candidate below, on a page kind with a
   `loadMore` selector → click it, then wait for the `MutationObserver` to
   report new tiles and move Down once more.

5. **Coming into a row from outside it**: when a geometric move lands in a
   row, `page.js` puts the selection on that row's remembered target instead,
   when it has one. A
   show's row of seasons starts out remembering the season on screen, so ▲
   from the episodes lands there rather than on the nearest button.

6. **The rail**: where the rail is shown, ◀ moves only to a candidate level
   with the selection (their vertical extents overlap). Anything else — no
   candidate, or a header link up and to the left — is the edge, and ◀
   enters the rail.

The candidate cache is invalidated by a debounced (100 ms) `MutationObserver`
on the document and recomputed lazily on the next key. Mutations entirely
inside Leanback's own elements (the ring moving, Home redrawing a card) are
ignored, so they cannot set off another round.

## The Home screen (`content/home.js`)

Home is **replaced**, not restyled: Leanback draws its own screen from what
Dropout renders, as a layer of its own (`div.tenfoot-home`, a child of
`<html>`, outside the site's React tree). Dropout's page stays underneath,
fully rendered and never moved, re-parented or rewritten; the layer covers it
(`position: fixed`, opaque) and the page's scrolling is switched off while it
is up. The layer shows only under
`html[data-tenfoot="on"][data-tenfoot-home="on"]`, and not while a dialog is
open (`data-tenfoot-modal`), so a cookie banner or trailer dialog is never
hidden behind it.

**Reading.** `readSite()` reads, with the selectors in `sites/dropout.json →
home`: each featured slide (title, subtitle, description, picture, link, and
its buttons — a link is copied as a link, a button is proxied), and each row
(title, *View all* link, and its tiles: link, picture, title, subtext, length
without a leading zero, Dropout's progress bar width, badge). Rows are slick
sliders that repeat their tiles as `.slick-cloned` copies; only the originals
count, and a link counts once per row. Everything needed is in the DOM for
every tile of a loaded row, on screen or not — except a show's wide picture.

**A show's wide picture.** Dropout draws a show's tile with a tall poster
(`home.itemPoster`: the image container's `aspect_ratio_2_3`); the wide 16:9
picture its own page uses is only in the data the tile was drawn from.
`readSite()` reads it from the tile element's React fiber, behind
`wrappedJSObject`: up to six components up from the element, the first whose
props hold `home.itemWideArt` (`data.thumbnail.medium`). Only plain data
properties are read (`Object.getOwnPropertyDescriptor(…).value`); a getter is
page code and is never run. Only an `https://` string is used. Found once per
tile and poster (a `WeakMap`); where there is none, the poster is used and a
warning is logged once per page.

**Drawing.** The model — Continue Watching, then Dropout's rows, with a *View
all* card on any row of 12 (the most Dropout draws in a row) — is reconciled
into the layer **by key**: rows by their *View all* link, cards by their link.
A card that is still there keeps its element, so a redraw never moves the
selection off it; only what changed is written, which also keeps the
`MutationObserver` quiet. `page.js` calls `refresh()` on every (debounced)
change to the site and every change to the watch history.

**Per-row tweaks** come from `home.rowOverrides`, keyed by the path of the
row's *View all* link, and `home.rowTitleOverrides`, keyed by the row's
heading in any case, for a row whose address is not certain; the address
wins. `title` replaces Dropout's heading, `badges: false` drops the tiles'
badges (`/new-releases`, where "New" says what the heading does), and
`hidden: true` leaves the row out of Home altogether: `/my-list`, which is on
the rail instead, and Dropout's own Continue Watching (`/continue-watching`,
or the heading "Continue Watching"), which Leanback's merged row replaces. A
hidden row is still read, so its progress bars still reach the watch history
and Leanback's Continue Watching. A row without a *View all* link is matched
by its heading only.

**Sizes** (`content/home.css`) are in `--tf-u`, 1/1920 of the viewport width
× 0.8: Home and the rail are drawn at 80 % of a 1920-wide layout. The rail is
89.6 units wide (`--tf-rail-width`) and its icon buttons 60 units square, at
least 40 px; the ring around a selected icon fits inside the rail from about
1500 px wide up at a selection zoom of 10 % or less, and from about 2000 px
at 25 %. The search
results' grid, on a page Leanback does not replace, uses `--tf-grid-u` (the
same without the 0.8). `--tf-reach` is how far the selected card extends past
its picture — half the zoom (`--tenfoot-zoom`) on each side, plus the ring's
offset (ring width + 2 px) — and is left free under each row heading; the
selected card's title and subtitle move down by it (`.tenfoot-scaled ~`), so
neither the card nor the ring overlaps text at any selection zoom.

**The selection** is a model of rows and columns, not geometry: the banner's
buttons are row −1, then one row per shelf. ◀ ▶ step along a row and stop at
its ends (`{edge: "left"}` is the cue for the rail). ▲ ▼ change row and restore
the card remembered for that row (by key), or its first card. `select(el)`
points the model at an element the focus reached some other way (a click,
the rail returning). Dropout draws the featured banner after Home is already
up (Continue Watching is ready at once), so a start on a card waits for the
banner: when it arrives the selection moves to *Watch now*, unless the viewer
has moved first (an arrow key or a click).

**Scrolling (TV style).** The rows sit in one container moved with
`translateY` so the selected row's top is 7 % of the viewport height from the
top, every time; with the banner selected the container is at 0. Each row's
track moves with `translateX` so the selected card sits at the row's left
edge, until the row's end is on screen. Both animate (260 ms, none under
reduced motion); the ring keeps following while they settle. With a row
selected the layer carries `data-tenfoot-scrolled="true"`, and the fade at the
top of the view reaches down to the anchor (7vh), so the row above does not
peek in; with the banner selected the fade stays short and leaves the banner's
picture alone.

**Rows arriving.** Entering a row two from the end presses Dropout's own
*Show more* (`home.showMore`, present only while there are more). If no rows
have arrived after 2.5 s, the page underneath is scrolled to its end, which is
the site's other trigger; after 6 s the attempt ends. "Loading more…" shows
meanwhile.

**The banner** shows one slide. Its buttons are Leanback's: a link button
carries the slide button's own address; a proxy button (Dropout's *My list*)
clicks the real button on the same slide, and the redraw picks up its new
state (`home.slideListed`). The **›** button after them steps to the next
slide, wrapping, and keeps the selection so OK can repeat.

**Continue Watching** comes from `TenfootHistory.continueWatching()` over the
page's copy of the history store. Dropout's bars on the loaded rows are sent
to the background as `history:observe` whenever the set of values changes.

**When it cannot draw**: if the page holds `home.root` but nothing can be read
from it by the initial-focus deadline (10 s), `page.js` removes the layer and
drives Dropout's page with the `browse` rules instead.

## A show's page (`content/show.js`)

Every page at a one-word address that is not a hub is a `series` page, and
Dropout draws three different things there. `layoutOf()` tells them apart by
what the page holds (`show.layouts`), never by its address or the show's
name: an episode section is a **show**, a movie section a **special**, a
collection section a **list**. So a show Dropout adds tomorrow works the same
as Game Changer. Dropout's page stays underneath and keeps its nodes (it is
server-rendered, not React); Leanback adds one element of its own and stamps
the rest.

**Opening on a season.** Dropout opens every show on Season 1, at the bare
address. Before anything else is set up, `page.js` `openSeason()` reads the
seasons and, when the address names none, goes to the newest (setting
`seasonStart`: `latest`, or `first`) with `goSideways()`. An address that
names its season (`/<show>/season:N`) is never moved, so a season picked
from the row, or reached by Back from an episode, stays. `content/early.css`
keeps `body.collections-show` with a season control blank until `page.js`
sets `html[data-tenfoot-ready]`, at the end of every setup, when Leanback is
turned off, and when it fails to start; if nothing sets it, a 2 s animation
shows the page anyway.

**The row of seasons.** `readSeasons()` reads Dropout's season control: each
option's value is the season's own page, and the season number comes from
`/season:N`. The season on screen is the one the address names, else the
option Dropout selected. With two or more seasons, `createShow()` builds a
`<div data-tenfoot-seasons>` of `<button data-tenfoot-season>`s, newest
first, labelled with the option text before its first colon, the season on
screen carrying `aria-current`. Under it, a heading with the season's full
name and Dropout's episode count; a show with one season gets the heading
only. The block goes in where Dropout's `.season-controls` was, which is
hidden. The row is a `rows`/`rowItem` pair in the rules, so ◀ ▶ are
row-wise with no wrap, and `page.js` seeds the row's focus memory with the
season on screen. A button's click (OK) calls back into `page.js`: another
season is `goSideways()` to its page; the season on screen moves the
selection to the start episode.

**Marks.** `refresh()`, run at start, on every batch of page mutations and
whenever the watch history changes, stamps `data-tenfoot-omit` on what the
rules hide, `data-tenfoot-action` on the header's buttons (`primary` for
*Watch Movie*), and on a show the episode grid's parts
(`data-tenfoot-ep-grid`, `-ep`, `-ep-link`, `-ep-art`, `-ep-text`), which is
all `content/show.css` targets. Each episode tile gets `data-tenfoot-watch`
(`watched` or `in-progress`), a tick or a progress bar inside its picture,
from the watch history merged with Dropout's own `.percentage-bar` on the
tile (a Roku play). Everything is written only when it changed, so the
mutation observer does not come back round for nothing.

**The start episode** (`startEpisode()`): the last episode in page order that
is watched or in progress is the anchor. None: Episode 1. In progress: that
one. Watched: the next episode after it that is not watched, or Episode 1
when there is none. Only the tiles Dropout has drawn are considered.

`destroy()` removes the row and every stamp, which is what turning Leanback
off does.

## The rail (`nav/rail.js`)

A `<nav>` of buttons appended to `<html>`: Search, Home, Browse, the site's
own links from `rail.links` (My List, Dropout 24/7), and the gear at the foot. Shown on the page kinds in `rail.kinds` (Home, hubs, Browse,
My List and Search) under `html[data-tenfoot-rail="on"]`; pages that are not replaced
get `padding-left` on `<body>` to make room. The entry for the page on screen
has its icon in yellow (the ring is the rail's only yellow box) and is where
the rail is first entered; after that the rail remembers
its own position. A page the rail links to is lit by its link before its page
kind is considered: `/my-list` is a `grid` page but lights My List, not
Browse, and the rail's Browse opens Browse from it.

`page.js` keeps the rail as a focus region with memory on both sides:
`enterRail()` stores the element the selection left (`railReturn`) and moves
onto the rail; while `railActive`, ▲ ▼ move inside it without wrapping, OK
takes the entry, ◀ is absorbed, and ▶ or Back call `leaveRail()`, which puts
the selection back on `railReturn` (telling Home's model when it is a card).
Only plain buttons live in the rail, so the arrows always have a way out. The
gear opens the options panel with the gear as its return point.

## Watch history (`lib/history.js`)

One entry per video, keyed by the slug after `/videos/` (the same in tile
links, episode page addresses and `OTTData.video.url`). An entry holds up to
two readings — `local` (Leanback's: position and time) and `dropout` (the bar
on Dropout's tiles: percent, and the time Leanback first saw that value) —
plus the address, title, show, picture and length. The newer reading is
believed. A first sighting of a Dropout value is dated 0 when Leanback already
has its own reading of that video, so an old bar never overrides a fresh local
one; a value that **changes** is dated now, since another device played it
in between.

Watched: 95 % or under 90 s left. In progress: more than 60 s played. The
store is capped at 500 entries; the least recently touched go first.

Every write goes through the background, one change at a time (read → apply
→ save), so reports that arrive together never overwrite each other:

| Who | When | Message |
| --- | --- | --- |
| `player.js` | pause, seeked, ended, the frame losing focus or being hidden, and every 15 s of `timeupdate` while playing. Never for a trailer or a live stream; a report under 5 s never replaces a stored position | `history:progress` |
| `page.js` | once per episode page: its address, title, show and picture | `history:meta` |
| `home.js`, through `page.js` | the loaded rows' progress bars, when their values change | `history:observe` |
| options panel, options page | *Clear Continue Watching* (asked twice): a watched video is kept whole. Of every other video, Leanback's own readings and the details from episode pages are deleted; Dropout's bars stay (they are Dropout's, and still show on cards) but the store notes `clearedAt`, and nothing unfinished read before it appears in Continue Watching or resumes | `history:clear` |

**Resume.** When the player finds its `<video>` it looks up
`resumePoint()` for the video. For a video in progress it sets `currentTime`
once the metadata is in, and once more on the first `playing` if the player
put itself back at its own start — never touching `paused` or `muted`, so the
autoplay and unmute logic is undisturbed. It then sends `player:resumed` (the
page shows "Resumed at 12:04") and offers *Start Over* at the top of the
playback panel until it is used.

## Focus ring and hint bar (`nav/focus-ring.js`)

- The ring is a single `position: fixed` `<div>` appended to `<html>` (outside
  `<body>` so the site's CSS resets don't touch it), moved to the focused
  target's `getBoundingClientRect()` with `pointer-events: none` and a very
  high `z-index`. Repositioned on `focusin`, `scroll` (capture) and `resize`,
  throttled to one `requestAnimationFrame`.
- Style tokens (settings): `--tenfoot-ring-color` (`#feea3b`),
  `--tenfoot-ring-width` (`4px`), a dark outer edge for contrast on light
  images, and no transition under reduced motion. The focused element itself
  is enlarged by the selection zoom (`focusZoom`: *Enlarge selection* on the
  options page and the options panel, *Selected Item Zoom* in the playback
  panel; `--tenfoot-zoom`, class `tenfoot-scaled`); an inline target is made `inline-block` first, because a
  transform does nothing to an inline box.
- The ring sits `width + 2` px outside the target and its corner radius is
  the target's (its computed `border-top-left-radius`, enlarged by the zoom)
  plus that offset, so the two curves run parallel on anything rounded.
- Dropout's own CSS reaches Leanback's elements: every link teal
  (`a:link`), and every `<button>` blue on hover and focus (`button:hover,
  button:focus { background-color: #007095 }`, which outranks a single class).
  Leanback's buttons — the rail, the banner's **›** and proxied *My list*,
  the options panel's rows — pin their backgrounds in those states with
  `!important`, so the ring is the only mark of the selection.
- The hint bar is a second fixed element at the bottom: key glyphs and labels
  for the current context, on a scrim. **Off by default** (`hintBar`). When on,
  it stays up on pages and, during playback, appears on a keypress and hides
  3 s later. Short notices ("No next episode", "Nothing to go back to") use the
  same bar and appear even with hints off.

## The transport bar and the settings panel

The bar is Leanback's own (`content/transport.js`), drawn in the player frame
and driving the `<video>` directly. The player's own chrome — the control bar,
the overlay play button, side dock and title (rule `player.chrome`) — is
stamped `data-tenfoot-bar` and kept invisible with `opacity: 0`, not
`display: none`, because the settings panel still reads the player's menu and
a `display: none` subtree may never mount. Inside the player's control bar,
everything not on `player.transportKeep` (and everything on
`player.transportHide`) is stamped `data-tenfoot-hide`; the gear's popover
entries are never stamped.

`▼` on a playing video opens the bar: **play/pause · position · settings ·
fullscreen**. While it is open, `left`/`right` walk it instead of seeking,
`select` takes the control, `up` and `back` close it and give `left`/`right`
back to seeking, and `down` closes it and hands focus to the page. With no
video to drive, `down` goes straight to the page.

**The settings panel** opens from the bar's gear or from the options button
during playback. It pauses the picture and holds a stack of levels: the top
rows (Quality, Speed, Play Next Episode, Closed Captions, Leanback Settings),
then Leanback's own settings or as many levels of the player's menu as it has.
The player's menu (`player.menu`) is always in the DOM, so it is read without
being shown. On each level:

- entries are the shown elements matching `player.menuItem`, skipping anything
  inside a `hidden` ancestor (a collapsed accordion keeps its options in the
  DOM, marked `hidden`);
- each is a *drill* (opens a submenu: `aria-haspopup`/`data-menu-item`), an
  *expand* (an accordion header, `role="button"` with `aria-expanded`), an
  *option* (`menuitemradio` / `radio`, ticked from `aria-checked`) or an
  *action* ("Reset all");
- labels come from `player.menuLabel`, the `aria-label` (colour swatches) or
  the text; values from `player.menuValue`; each option carries the heading of
  its `[role="radiogroup"]`, found through `aria-labelledby`, and the panel
  draws that heading above the group;
- the level's title is the player's own header (`player.menuTitle`), absent at
  the root.

Taking an entry clicks the original and re-reads the menu once it has changed.
A drill pushes a level. Anything else follows the player: if its menu stays on
the same titled panel, that level is re-read in place (a caption colour); if
it goes back up or to the root, the panel pops to match (a caption track).
◀ and Back press the player's own Back button (`player.menuBack`) and pop one
level; without one, the menu is started over at its root. In Leanback's own
submenu, OK steps a value round its list and ▶ steps it on to the last.

With **Player controls → the site's own** (`playerChrome: "site"`, on the
options page only), nothing of the player is stamped and no bar is drawn: ▼
goes to the page and the options button to the page's settings.

## Sound and the autoplay policy

Firefox blocks autoplay with sound, so Dropout starts its videos muted — that
is *how* it autoplays. Turning the sound on therefore cannot be done naively:
an unmute without user activation makes Firefox stop the video, and insisting
trades "starts muted" for "does not play".

`applyMutePreference()` tries once. If playback stops within 250 ms, the video
goes back to muted and is restarted, `autoplayBlocked` is set so nothing keeps
retrying, and the next handled key — a real user gesture — turns the sound on
for good. A profile that allows autoplay with sound (the kiosk case in
[targets.md](./targets.md)) never hits the revert at all.

Separately, the site restores a remembered mute for a video you have already
watched, sometimes after `loadedmetadata`, so the preference is re-applied on
`volumechange` for 15 s after the video appears. Any explicit choice — the
`mute` command, or taking anything on the transport row — ends that
immediately: the user's last word wins.

## Theater layout

CSS, not the Fullscreen API: the Fullscreen API needs a fresh user gesture,
exits on Escape before the extension sees it, and offers nothing extra in a
kiosk window that is already fullscreen.

`content/page.css` holds **no site selectors**. `page.js` stamps the elements
the rules file names with attributes and the stylesheet targets those, so
following a site change never means editing CSS:

```css
html.tenfoot-theater [data-tenfoot-theater-root] { position: fixed; inset: 0; z-index: 2147483000; background: #000; }
html.tenfoot-theater [data-tenfoot-theater-root] iframe { width: 100%; height: 100%; }
html.tenfoot-theater body { overflow: hidden; }
html.tenfoot-theater [data-tenfoot-hide] { display: none; }
```

(`theaterRoot` → `data-tenfoot-theater-root`, `playerMount` →
`data-tenfoot-player`, each `theaterHide` selector → `data-tenfoot-hide`.)

Enter theater: on `video` page load when `theater = "auto"`, or `select` on the
player when `manual`. Leave: `back` while the player has focus. Leaving also
neutralises the site's sticky mini-player if it engages.

## Player control (`content/player.js`)

Primary path — direct `<video>` control inside the frame:

| Command | Implementation |
| --- | --- |
| `toggle` / `play` / `pause` | `video.paused ? video.play() : video.pause()` |
| `seek` `{by: ±s}` | `video.currentTime = clamp(video.currentTime + by, 0, video.duration)` |
| `captions` | click the player's captions button (rule `player.captionsButton`) — Vimeo manages tracks itself |
| `mute` | `video.muted = !video.muted` |
| `stop` | pause + `currentTime = 0` + `page:focus {hint:"back"}` |

The `<video>` is located by rule `player.video` (default `video`), waited for
with a `MutationObserver` because Vimeo's runtime creates it after load.

State reporting: `player:state {paused, currentTime, duration, ended, title,
upNext}` on `play`/`pause`/`ended`/`durationchange` and at most every 250 ms
from `timeupdate`. `upNext` is taken from `OTTData.up_next` when present.

Next/previous episode: `page.js` prefers `upNext.url` from the player; if
absent, it navigates using the episode order it captured from the series page
(stored in `sessionStorage` when the user came from there) — otherwise the
action is unavailable and a short notice says so.

## Messages

All messages are `{type, ...}` objects over `browser.runtime.sendMessage`
(content → background) and `browser.tabs.sendMessage(tabId, msg, {frameId})`
(background → a specific frame). The background records `sender.frameId` of
the player frame per tab on `player:hello` and forgets it on `tabs.onRemoved`
and on `player:bye` (`pagehide`).

| Type | From → To | Payload | Purpose |
| --- | --- | --- | --- |
| `settings:get` | any → bg | — | reply: full settings object |
| `settings:set` | any → bg | `{patch}` | reply: the saved settings object |
| `rules:get` | content → bg | — | reply: `{ok, rules}` — the parsed `sites/dropout.json` |
| `player:hello` / `player:bye` | player → bg | `{videoId, title, duration, hasVideo}` | frame registry |
| `player:ready` | bg → page | `{frameId, videoId, title}` | the player frame has registered; the page retries a pending hand-off |
| `player:command` | page → bg → player | `{cmd, by?}` | see table above |
| `player:focus` | page → bg → player | — | give the player keyboard focus |
| `player:settings` | page → bg → player | — | open the settings panel (the options button during playback); reply `{ok}` — the page opens its own settings when `ok` is false |
| `player:back` | page → bg → player | — | Back (Escape) on the page during playback: the frame closes what it can; reply `{consumed}` — the page walks its own layers when `consumed` is false |
| `player:offer` | page → bg → player | `{showing}` | the site's up-next overlay is on the page, so OK in the player takes it |
| `player:state` | player → bg → page | state object | hint bar, autoplay-next, up-next offer |
| `player:ended` | player → bg → page | `{upNext}` | autoplay next |
| `page:focus` | player → bg → page | `{hint: "below" \| "back"}` | leave the player |
| `page:episode` | player → bg → page | `{delta: 1 \| -1}` | next / previous episode |
| `page:action` | player → bg → page, or harness → page | `{action}` | run an action the page owns (`search`, `menu`, …); `browser-back` is BrowserBack pressed in the player frame |
| `page:state` | harness → page | — | reply: a snapshot (page kind, theater, focused element and its rect, ring/hints, Home's model, the show page, the rail). For the tests; the extension never sends it |
| `exit` | page → bg | — | exit hook; the reply says whether the tab was closed |
| `history:progress` | player → bg | `{key, url, title, position, duration, ended}` | where the video is |
| `history:meta` | page → bg | `{key, url, title, series, image}` | what the episode page knows |
| `history:observe` | page → bg | `{items: [{key, url, percent, duration, title, image}]}` | Dropout's progress bars on Home |
| `history:clear` | page / options → bg | — | *Clear Continue Watching* |
| `player:resumed` | player → bg → page | `{at}` | the video picked up at `at` seconds: show the notice |

There is no `settings:changed` broadcast and no `toggle` message: every
context watches `storage.onChanged` through `lib/settings.js` instead, so a
frame that starts before the background has nothing to wait for.

The page and the player never use `window.postMessage` with each other:
page scripts could spoof it. The runtime relay is isolated from the site.

## The manifest

The shipped `manifest.json` (MV2). Notes on the parts that are not obvious:

- `"*://www.dropout.tv/"` and `"*://www.dropout.tv/?*"` as content-script
  matches hit only the marketing site's root (a bare match pattern does not
  cover a query string), so the rest of that site is untouched.
- `embed.vhx.tv` needs `all_frames: true` or the player script never runs —
  that host only ever appears as an iframe.
- Each `js` list starts with `lib/settings.js`, then `lib/history.js` where
  it is needed; the files in one list share a global, which is how `lib/*`,
  `nav/*` and `content/home.js` publish `TenfootSettings`, `TenfootHistory`,
  `TenfootKeymap`, `TenfootSiteRules`, `TenfootSpatial`, `TenfootFocusRing`,
  `TenfootMenu`, `TenfootRail`, `TenfootTrail`, `TenfootHome` and
  `TenfootShow` to `content/page.js`.
- The page's `css` is `content/page.css` (ring, hints, panel, theater),
  `content/home.css` (Home and the rail) and `content/show.css` (a show's
  page), all gated on `html[data-tenfoot="on"]`.
- A second `watch.dropout.tv` entry, at `document_start`, holds only
  `content/early.css`. Content-script stylesheets arrive with their scripts'
  `run_at`, so this is the only way a rule applies before the first paint: it
  keeps a show's page blank until `page.js` has decided its season. It is the
  one stylesheet that names Dropout's classes, since no script has run yet to
  stamp anything.
- `sites/dropout.json` is **not** in `web_accessible_resources`: the
  background fetches it and hands it to the content scripts, and an extension
  reading its own packaged file needs no declaration.
- No default key for `commands.toggle-tv-mode` — the user sets one in
  `about:addons` → Manage Extension Shortcuts. No popup: a popup cannot be
  driven from a remote.
- No `update_url`; distribution is AMO (unlisted) or a temporary load.

## `sites/dropout.json`

The only file that knows Dropout. `routes` are tried in order and the first
match wins, so `video` comes before the `series` catch-all, which stays last;
`other` lists the account and legal paths that would otherwise look like a
series slug. Per page kind: `rows`/`rowItem` (row-wise navigation),
`tile`/`target` (one focus target per tile), `focusable` (loose selectors),
`loadMore`, `initialFocus` (a list: the first match in page order wins), and
the `video` kind's player and theater selectors, plus `videoTitle` and
`videoImage` for the watch history. Any `<select>` among the focusables is a
two-step control; no rule marks them. `common` holds the header, the modal and
hover-tooltip selectors; `player` holds the selectors used inside the frame.
`home` holds everything the Home screen reads (root, slide and its parts,
row and its parts, tile and its parts, `rowPageSize`, `showMore`); `rail.kinds`
lists the page kinds that get the rail and `rail.links` the site's pages it
links to (id, label, icon, url); `browseUrl`, `gridUrl` and `searchUrl` are
where its own entries go. `pages.series.show` holds what `content/show.js`
reads: `layouts` (the marker of a show, a special and a list), the season
control and the controls around it, the episode section and a tile's parts,
the header's buttons, and `omit`, what Leanback hides everywhere (`all`) and
on a show (`show`). A page kind's `tvGrid` names the parts of a results
grid laid out for a desktop (search: container, wrap, grid, item, title,
subtitle); `page.js` marks them and `content/home.css` spreads them across a
television: four across, the full width beside the rail, larger text.

Two rules the file has to keep:

- `loadMore` must match the **control**, not the grid. `js-load-more-items-container`
  is the `<ul>` that holds the tiles; the control is
  `a.js-load-more-link[data-load-more]` in a sibling `.row.loadmore`.
- `target` must be the outer link of a tile. A tile has two links to the same
  place (image and title); `nav/spatial.js` keeps the first per tile, so the
  ring never stops twice on one tile.

Which selectors are verified and which are not:
[site-notes.md](./site-notes.md).
