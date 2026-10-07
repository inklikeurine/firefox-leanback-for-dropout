# Architecture

Leanback for Dropout is a Manifest V2 WebExtension. Dropout's player is a
cross-origin iframe (`embed.vhx.tv`) inside the page (`watch.dropout.tv`):
while it has focus, keys arrive in the frame's document, and the page can
neither see the `<video>` nor receive those keys. So there are two content
scripts, and the background script relays between them.

## Components

```
                        watch.dropout.tv tab
┌────────────────────────────────────────────────────────────────────┐
│ top frame — content/page.js, home/screen/show/cards.js, nav/*      │
│   screens · rail · spatial nav · ring · hints · theater · back     │
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
| `background.js` | Event page (`persistent: false`) | Serves `sites/dropout.json` (`rules:get`, cached); the per-tab player-frame registry, in `storage.session` because an event page loses plain variables when it unloads (a `Map` if the API is missing); the page ⇄ player relay; toolbar toggle and badge; `commands`; the exit hook (`tabs.remove(sender.tab.id)`); the **only writer** of the watch history. |
| `lib/settings.js` | Every context (first in each script list) and the options page | Defaults, validation on read, `load`/`save`/`watch`. `ROWS`: the one list of Leanback's settings that every settings panel and the options page show (`valueText`, `choicesOf`, `rowOf`). |
| `lib/common.js` | Page, player | `qs`/`qsa`/`matches` that never throw on a bad selector and take a rule's list, `textOf`, `clock`, `send` (a reply that is always an object). |
| `lib/history.js` | Background, page, player | The [watch history](#watch-history-libhistoryjs). Pure apart from `load`/`save`/`watch` on `storage.local` key `progress`. |
| `content/page.js` | Top frame of `watch.dropout.tv` | The page script: URL → page kind; keys → actions; focus, spatial navigation, ring, hints, load-more, dialogs, the two-step `<select>`, the settings panel, messages, life cycle. Its three parts below install into one shared context (`P`: its `state` and the functions the parts call), each calling the others through it. |
| `content/page-back.js` | Top frame | [Back](#back-contentpage-backjs--navtrailjs) and every navigation the page script starts; the trail. |
| `content/page-video.js` | Top frame | An episode's page: theater, [docking](#an-episodes-page), the player hand-off, next/previous episode, the up-next offer, autoplay, media keys, the episode's details to the watch history. |
| `content/page-screens.js` | Top frame | Which [screen](#leanbacks-screens) a page gets; starting, stopping and redrawing it; moves on it; [the rail](#the-rail-navrailjs); the season a show opens on. |
| `content/home.js` | Top frame: Home and hubs | [Home](#home-contenthomejs) read off Dropout's page: `readSite()`, `homeModel()`, `rowOverride()`. |
| `content/screen.js` | Top frame: every page Leanback draws | The one screen engine: a screen drawn from a model (`createScreen()`); the readers for [collections, search](#collections-and-search) and [an episode's page](#an-episodes-page). |
| `content/show.js` | Top frame: one-word addresses | [A show's page](#a-shows-page-contentshowjs): show, special or list; `readDetail()`. |
| `content/cards.js` | Top frame | The card every screen draws, `reconcile()` by key, readers for Dropout's tiles (`textOf`, `parseDuration`, `percentOf`…). |
| `content/player.js` | Every `embed.vhx.tv` frame (`all_frames: true`) | Registers (`player:hello`); finds the `<video>`; keys while the frame has focus; `player:command`; `player:state`, `player:ended`, progress reports; resume; `startMuted` once per video; **when** the transport bar is open and what Back means then. |
| `content/transport.js` | Every `embed.vhx.tv` frame | Draws the [transport bar, title, up-next card and settings panel](#the-transport-bar-and-the-settings-panel); drives the `<video>`. Site-agnostic apart from the `player` rules it is handed. |
| `content/marketing.js` | `www.dropout.tv` at `document_start` | With *skip marketing site* on, `/` → `location.replace("https://watch.dropout.tv/browse")`. Nothing else. |
| `nav/spatial.js` | Top frame | Directional focus search, row-aware moves, focus memory. |
| `nav/trail.js` | Top frame | The trail behind [Back](#back-contentpage-backjs--navtrailjs); `sessionStorage` only. |
| `nav/rail.js` | Top frame | The [rail](#the-rail-navrailjs): its buttons, remembered position, current entry. `page.js` supplies the entries and their actions. |
| `nav/focus-ring.js` | Top frame | The [ring, selection zoom and hint bar](#focus-ring-and-hint-bar-navfocus-ringjs). |
| `nav/panel.js` | Top frame and player frame | The settings panel's look (`render({title, index, entries})`, `open`/`close`), logic-free. Styled by `content/panel.css`. |
| `nav/settings-menu.js` | Top frame and player frame | Leanback's settings as a menu (`ROWS`, Clear Continue Watching, Turn Leanback Off): its levels and keys, `view()` for `nav/panel.js`. `page.js` and `transport.js` each draw it; the player's own menu levels are `transport.js`'s. |
| `nav/keymap.js` | Both content scripts | Keys → actions per context (page / player / typing). Pure. |
| `nav/site-rules.js` | Both content scripts | URL → page kind, selector lists. Pure. |
| `sites/dropout.json` | Fetched by the background | [All Dropout knowledge](#sitesdropoutjson). |
| `options/options.html/.js/.css` | Options page (`open_in_tab`) | The settings form. |

`nav/*` and the message protocol know nothing about Dropout; everything
Leanback knows about Dropout's pages is in `sites/dropout.json`.

## Page kinds

What each key does on each: [keymap.md](./keymap.md).

| Kind | URL ([routes](./site-notes.md#routes)) | Drawn by | Initial focus | When Leanback cannot draw it |
| --- | --- | --- | --- | --- |
| `browse` | `/browse` | Home, with the rail | the banner's first button | nothing to draw within 10 s → row-aware navigation over Dropout's rows (`pages.browse`) |
| `hub` | a one-segment path whose page holds `home.root` (`/dimension-20`, `/dropout-24-7`) | Home without Continue Watching; the rail (Dropout 24/7's entry lit on `/dropout-24-7`, none on other hubs) | as Home | as Home |
| `grid` | `/series`, `/collections/...`, `/my-list` | `screen.js`, with the rail | the first card | geometric navigation over Dropout's tiles; ▼ past the last row clicks Load More |
| `series` | `/<slug>[/season:N]`, not a hub | show or special: `show.js` + `screen.js`; list: `screen.js`. With the rail | show: the episode to watch next; special: *Watch Movie*; list: the first card | Dropout's page, geometric navigation; its season and sort `<select>`s are two-step controls |
| `video` | `/<slug>/season:N/videos/<ep>`, `/videos/<slug>`, `/<hub>/events/<slug>` (Dropout 24/7's stream) | `screen.js` round the [docked player](#an-episodes-page); theater when `theater` is `auto` | the player frame | no title to read: ▼ from the player → the series link, else the first focusable below |
| `search` | `/search` | `screen.js`, with the rail | the search box | no Dropout search box: geometric navigation over Dropout's page |
| `other` | login, account, legal | Dropout | none: the ring follows the page's focus | — (arrows move among `pages.other.focusable`) |

The search app changing the address as you type is not a new page: the
screen is only redrawn.

## Key handling

- One `keydown` listener on `window`, **capture phase**, per content script,
  maps `event.key` to an action (`up`, `down`, `left`, `right`, `select`,
  `back`, `menu`, `search`, `play_pause`, `stop`, `next`, `previous`,
  `fast_forward`, `rewind`) for the current context.
- `preventDefault()`/`stopPropagation()` only when the action was consumed;
  other keys reach the site untouched. Auto-repeat: one move per 80 ms.
- In an editable target (`input`, `textarea`, `[contenteditable]`, an open
  `<select>`) only these are taken: `back`; `left` with the caret at the very
  start and nothing selected (to the rail where there is one, else the
  nearest thing left); `down` in a one-line `input` (to the nearest thing
  below — on search, the filters, then the results — or left to the field
  when there is nothing).
- A `<select>` among the focusables is a two-step control (no rule marks it):
  OK engages it, ◀ ▶ step its options, OK commits, Back restores the old
  value.
- Into the player: `page.js` calls `iframe.focus()` and sends `player:focus`;
  `player.js` focuses the `<video>` (or the player root). Out: `player.js`
  sends `page:focus` with a hint (`below` | `back`); `page.js` picks the
  target.
- `BrowserBack` is Firefox's ([Back](#back-contentpage-backjs--navtrailjs));
  `BrowserHome` is never mapped
  ([keymap.md](./keymap.md#keys-the-browser-or-the-desktop-own)).
- Pointer: `mouseover`/`mousemove` never move focus; while Leanback is on, an
  injected rule hides the site's hover tooltips (`.tooltip`) so a drifting
  air-mouse doesn't litter the screen. Clicks are the site's.

## Back (`content/page-back.js` + `nav/trail.js`)

Back is the browser's Back. Leanback never cancels it or puts history entries
in its way; it keeps the history worth following.

1. **The trail** (`sessionStorage` `tenfoot.trail`): every load records the
   site's pages behind this one, each with its page kind, `group` (the series
   slug, for episodes and season pages) and structural parent. The navigation
   type (`PerformanceNavigationTiming.type`) and the intent Leanback left
   before navigating (`tenfoot.intent`: `push`, `replace`, `back`) say how
   the page was reached. The search app adds a history step per search
   (`history.pushState`, no load); `followSearchHistory()` gives each one a
   trail entry, cuts the trail back to where Firefox's Back landed, or
   updates the top entry's address.
   An empty `unload` listener keeps the site's pages out of the back-forward
   cache, so Back always loads afresh (a page restored from it gets no keys
   until a reload); the `pageshow` handler covers one restored anyway.
2. **Sideways moves replace** (`goSideways()`, `location.replace`): another
   episode (next, previous, autoplay); another season (a pill, or a two-step
   `<select>` whose options are addresses); a show's bare address moved on to
   its newest season; one rail section to another (Browse, Search, My List,
   Dropout 24/7: pushed from Home, replaced from each other). The rail's
   *Home* goes back down the history (`history.go(-n)`) when Home is on the
   trail, else opens it. Leanback's own Back (and `/` on Search) goes to the
   newest trail entry that is another page (`backIndex()`), past all of
   search's steps at once.
3. **Siblings are skipped.** Reaching a page by Back from its sibling (same
   kind and show: the previous episode, after Dropout's up-next went on to
   the next) carries on past every sibling at once, before anything is set
   up.
4. **Escape** runs the layered Back — dialog, settings panel, rail, the player
   frame's bar and panel (asked first, `player:back`), theater — then
   `history.go(-1)`, the same step as the remote's BrowserBack.
5. **Nothing behind** (a tab opened straight on the page: the kiosk case):
   Escape walks up the site with `goSideways()`, so the history never gains a
   page above: an episode → the season page it was opened from if the same
   show, else the show's page (`structuralParent()`); any other page → Home;
   Home → the exit hook. BrowserBack there gives Firefox 800 ms to leave
   (`beforeunload`/`pagehide` cancels the wait), then runs the layered Back.
   BrowserBack pressed while the player frame has the keys is passed to the
   page (`page:action` `browser-back`).

## Before the first paint

Dropout's page never shows before Leanback's screen. `content/early.css`,
injected at `document_start` before any script, keeps `<body>` hidden on
Leanback's dark ground until `page.js` sets `html[data-tenfoot-ready]`: at
the end of `setupPage()` (before the initial focus, which a hidden body
cannot take), when Leanback is off, or when it fails to start. Failing that,
a 3 s animation shows the page. A show's bare address moved on to its newest
season never sets it, so Season 1 stays blank until the new page loads.

A screen not ready when the page is set up (Home's rows come later) also sets
`html[data-tenfoot-pending]`: `content/page.css` keeps `<body>` hidden under
it (the theater root excepted) until `refreshScreen()` finds the screen ready or
`stopScreen()` gives up.

## Spatial navigation (`nav/spatial.js`)

Candidates are the page kind's `focusable` matches that are visible (non-zero
rect, not `visibility:hidden`/`display:none`, no `aria-hidden` ancestor, not
`disabled`), one per **tile** (`tile` → its `target`; the tile's other links
are dropped), and only inside the topmost open `modal` when there is one.

1. **Row-aware** (focus inside a `row`, on a page kind with rows): ◀ ▶ → the
   previous/next `rowItem` target in DOM order, no wrap. ▲ ▼ → the adjacent
   row's remembered target, else the item whose centre x is nearest.
2. **Geometric** (otherwise): a candidate's leading edge must be past the
   current element's trailing edge (2 px tolerance). Score = distance along
   the axis + 2 × the orthogonal offset of the centres, halved when the
   projections overlap on the orthogonal axis (axis-aligned overlap beats
   distance). Lowest wins; none → no move, no wrap.
3. **Entering a row** by a geometric move lands on that row's remembered
   target if it has one.
4. **The rail**: where it is shown, ◀ goes only to a candidate level with the
   selection (vertical extents overlap); otherwise ◀ enters the rail.
5. **Keep on screen**: `focus({preventScroll: true})`, then
   `scrollIntoView({block: "center", inline: "center"})`, smooth unless
   `prefers-reduced-motion`, on a page's first focus too. Dropout's desktop
   rows slide by transform, which `scrollIntoView` cannot move, so
   `nudgeRow()` clicks the row's `scrollNext`/`scrollPrev` (inside the row,
   else up to three ancestors out) once per page of tiles, at most eight
   times, stopping when a click leaves the tile's rect unchanged (a disabled
   arrow, the row's end).
6. **Load more**: ▼ with nothing below, on a page kind with `loadMore` → click
   it, wait for the `MutationObserver` to report new tiles, move ▼ again.

The candidate cache is dropped by a debounced (100 ms) `MutationObserver` on
the document and rebuilt on the next key. Mutations entirely inside
Leanback's own elements are ignored, so the ring or a redraw cannot set off
another round.

## Leanback's screens

Home, hubs, Browse, My List, collections and lists, a show's page, a special,
search and an episode's page are **Leanback's own screens**: a layer
(`div.tenfoot-home`, plus `.tenfoot-screen` except on Home) appended to
`<html>`, outside the site's React tree, fixed and opaque over Dropout's page.
Dropout's page stays underneath, rendered and never moved, re-parented or
rewritten; Leanback reads it, its buttons press Dropout's, and the page's
scrolling is off while a screen is up.

**Which screen.** `page-screens.js` `screenKind()` gives `home` (`browse`, `hub`),
`page` (`grid`, a `series` list), `detail` (a show or special), `search`,
`episode` (`video`) or nothing. `startScreen()` puts
`TenfootScreen.createScreen()` with the matching reader into `state.screen`
(Home's is `TenfootHome.homeModel()`, with `home: true` for its own layer),
so moves, initial focus, the rail's way back and redraws drive every screen
alike. A reader that finds nothing means no screen: Dropout's page is driven
as it is.

**Showing it.** The layer shows only under
`html[data-tenfoot="on"][data-tenfoot-home="on"]`, and not while a dialog is
open (`data-tenfoot-modal`), so a cookie banner or trailer is never hidden
behind it. `stampChrome()` stamps Dropout's top bar and footer
(`common.chrome`) `data-tenfoot-chrome`, which `page.css` hides, on every
page kind but `other`.

**Redrawing.** `page.js` calls `refresh()` on every (debounced) change to the
page and the watch history; the reader builds the model afresh, reconciled
into the layer **by key** (cards through `content/cards.js`). A card still
there keeps its element, so the selection never jumps, and only what changed
is written, which keeps the `MutationObserver` quiet.

**The selection** is rows and columns, not geometry. ◀ ▶ step along a row and
stop at its ends; ▲ ▼ change row and land where that row was left (memory by
key), else on its first item. A move off the model returns an edge:
`{edge: "left"}` enters the rail; on an episode's page `{edge: "up"}` enters
the player. `select(el)` points the model at an element the focus reached
another way (a click, the rail returning).

**Scrolling (TV style).** The selected row's top sits at 7 % of the viewport
height (`ROW_ANCHOR`), every time; what is above the first row of cards is
shown from the top (on Home, `scroll: "rows"`, every row of cards slides up,
the banner with it). Moves animate 260 ms (not under reduced motion), and the
ring follows while they settle.

**Sections** are a grid of `columns` (the default: rows of the grid are rows
of the selection, ▲ ▼ keep the column) or, with `layout: "row"`, one row
that slides sideways (Home's): entered where it was left, else on its first
card. A section may drop its cards' badges (`badges: false`).

**Progress on cards**: the item's own `fraction` when the reader gave one (a
show's episodes, already merged), else the watch history's, else Dropout's
bar. Dropout's bars on screen go to the background as `history:observe`
whenever their values change. `watched` adds a tick and dims the picture; an
item's `watch` is stamped `data-tenfoot-watch` on its card.

**Sizes** (`content/home.css`) are in `--tf-u`, 1/1920 of the viewport width
× 0.8: screens and the rail are an 80 % scale of a 1920-wide layout. The rail
is 89.6 units wide (`--tf-rail-width`), its buttons 60 units square and at
least 40 px; the ring round a selected icon fits inside it from about 1500 px
wide at a zoom of 10 % or less, 2000 px at 25 %. `--tf-reach` (half the zoom,
`--tenfoot-zoom`, on each side plus the ring's offset, width + 2 px) is left
free under each row heading, and the selected card's title and subtitle move
down by it (`.tenfoot-scaled ~`), so neither card nor ring overlaps text.

### Home (`content/home.js`)

`homeModel()` reads the page into a model `screen.js` draws; the parts below
that are the engine's (the banner's slides, sliding rows, rows arriving) are
model options any screen could use.

**Reading.** `readSite()` reads, with the `home` rules, each featured slide
(title, subtitle, description, picture, link, buttons: a link is copied, a
button proxied) and each row (title, *View all* link, tiles: link, picture,
title, subtext, length without a leading zero, Dropout's bar width, badge).
Rows are slick sliders that repeat tiles as `.slick-cloned`; only originals
count, and a link counts once per row. A loaded row's tiles are all in the
DOM, on screen or not.

**A show's wide picture.** A show's tile has a tall poster (`home.itemPoster`:
`aspect_ratio_2_3`); the 16:9 picture is only in the data the tile was drawn
from. `readSite()` reads it from the tile's React fiber, behind
`wrappedJSObject`: up to six components up, the first whose props hold
`home.itemWideArt` (`data.thumbnail.medium`). Only plain data properties are
read (`Object.getOwnPropertyDescriptor(…).value`: a getter is page code and
never run), only an `https://` string is used, and the result is kept per
tile and poster (a `WeakMap`). Without one, the poster is used and a warning
logged once per page.

**The model**: the banner's slides (`hero.slides`), Continue Watching (Home only:
`TenfootHistory.continueWatching()` over the page's copy of the history),
then Dropout's rows, with a *View all* card on any row of 12 (the most
Dropout draws). Rows are keyed by their *View all* link, cards by their link;
a slide's buttons by their place (`slide-0`…), so the selection survives the
slide changing. A row's cards are looked up in that row first after a redraw:
the same video can be on two rows.

**Row tweaks.** `home.rowOverrides` is keyed by the path of a row's *View
all* link, `home.rowTitleOverrides` by its heading in any case (for a row
whose address is uncertain, or that has no *View all*); the address wins.
`title` replaces the heading; `badges: false` drops the badges
(`/new-releases`, whose heading says "New", on Home and on its own page);
`hidden: true` leaves the row out: `/my-list` (on the rail instead) and
Dropout's own Continue Watching (`/continue-watching`, or the heading), which
Leanback's merged row replaces. A hidden row is still read, so its bars still
reach the history.

**The banner** shows one slide. A link button carries the slide button's
address; a proxy (Dropout's *My list*) clicks the real button, and the redraw
picks up its state (`home.slideListed`). **›** steps to the next slide,
wrapping, keeping the selection so OK can repeat. The banner arrives after
Home is up (Continue Watching is ready at once), so a start on a card waits:
when it arrives the selection moves to *Watch now*, unless the viewer has
moved (a key or a click): `start: "slide-0"` with `waitForStart`.

**Scrolling.** The rows' container moves with `translateY` (0 with the banner
selected); each row's track with `translateX`, so the selected card sits at
the row's left edge until the row's end is on screen. With a row selected the
layer carries `data-tenfoot-scrolled="true"` and the top fade reaches down to
the anchor (7vh), so the row above does not peek in; with the banner selected
it stays short, off the banner's picture.

**Rows arriving.** Entering a row two from the end presses Dropout's *Show
more* (`home.showMore`, present only while there are more). With no new rows
(`moreCount`) after 2.5 s the page underneath is scrolled to its end, the
site's other trigger (`moreScroll`); after 6 s the attempt ends. "Loading
more…" shows meanwhile. Every row read, hidden ones too, reports its bars to
the history (`observed`).

**When it cannot draw**: if the page holds `home.root` but nothing can be read
by the initial-focus deadline (10 s), `page.js` removes the layer and drives
Dropout's page with the `browse` rules.

### Collections and search

**The model** `screen.js` draws: a `head` (a title) or a `hero` (Home's
banner: picture, title, meta, description, buttons); a `field` (a search box:
its words, the site's box it types into); `pills` (a row of choices: seasons,
search's filters); `sections` (groups of cards: title, count, columns);
`empty` (what to say with no cards); `more` (Dropout's *Load More*);
`loadAll` (press *Load More* on every redraw until it is gone); `start` (the
key the selection starts on, else the first card).

**Drawing.** The head is the page's name, or the rail's for a page the rail
links to (*My List*). A hero (`.tenfoot-hero*`, 500 units high) has buttons
keyed `data-tenfoot-action`: links (`href`, followed like a card) or proxies
that click Dropout's (`proxy`: *Trailer*, *My List*, which carries
`data-tenfoot-listed`, a tick, while Dropout's says the show is listed).
Pills are `button.tenfoot-season` in a `.tenfoot-season-row` (styled by
the end of `content/home.css`), the current one `aria-current`, sliding sideways to
keep the selection in view; OK on one with a `proxy` (a search filter)
presses Dropout's, else calls `onPill` (`page-screens.js` `onSeasonChosen()`). Each
section is its title (name, count) over a CSS grid of `--tf-cols` columns at
Home's card size.

**Selection rows**, top to bottom: the search box, the buttons, the pills,
then each section's cards in rows of its columns, where ▲ ▼ keep the column
(into a shorter last row, its last card). At first: the season on screen, the
first button, the first card. Two rows from the end of the cards (so never
from the search box), Dropout's *Load More* is clicked once; its tiles join
the grid as a page change, the selection kept by key; after 6 s the attempt
ends.

**Collections** (`collectionModel()`, `readPage()`, rules `screen`): the title
(`h1.collection-title`) and tiles (`li.js-collection-item` in
`ul.js-load-more-items-container`), one per link: picture, title, subtitle,
running time, Dropout's bar, badge. The same markup serves Browse, My List
and every list. One section, `COLUMNS` (5) across.

**Search** (`searchModel()`, `screen.search`): Dropout's box (`input`: words,
placeholder), the type filters (`filter`, the current one `filterSelected`,
keyed by `data-filter-type`), results (the collection readers on
`li.SearchResults-module__search-result`), the "Start typing" message
(`empty`) and *Load More* (`more`). No box, no model. Leanback's box is an
`<input type="search">` whose every `input` event types into Dropout's
(`typeInto()`: the element's own value setter, past React's watcher, then an
`input` event); the results arrive as a page change. It shows Dropout's words
unless focused, so typing is never overwritten; Enter calls `onFieldDone`
(down to the results). It carries `data-tenfoot-nozoom`: ringed, not grown.

### A show's page (`content/show.js`)

Dropout draws three things at a one-word address that is not a hub.
`layoutOf()` tells them apart by what the page holds (`show.layouts`), never
by address or name, so a new show works like Game Changer: an episode
section is a **show**, a movie section a **special**, a collection section a
**list**. A list is a collection (above); a show or special is read by
`readDetail()` and drawn by `screen.js`.

**Opening on a season.** Dropout opens every show on Season 1 at the bare
address. Before anything else, `page-screens.js` `openSeason()` reads the seasons
and, when the address names none, goes to the newest (`seasonStart`:
`latest`, or `first`) with `goSideways()`. An address naming its season
(`/<show>/season:N`) is never moved, so a picked season, or one reached by
Back, stays. The page stays blank meanwhile
([Before the first paint](#before-the-first-paint)).

**What is read** (`readDetail()`, rules `pages.series.show`):

- Banner: the name (`heroTitle`), season count (`heroStats`), description,
  and the last cover picture (`heroImage`: phone-size first, 1280 × 720 last).
- Buttons: a show's main button (below), *Trailer*, *My List*; a special's
  *Watch Movie*, *Trailer* if any, *My List*. *Share* is not drawn.
- Seasons (`readSeasons()`), from Dropout's season control: each option's
  value is the season's page, its number from `/season:N`; current is the one
  the address names, else Dropout's selected option. With two or more they
  are the pills, newest first, labelled with the option text before its first
  colon.
- A show: one section, the season's full name and Dropout's episode count
  over its episodes, five across; each is its link, title, "Episode N",
  picture, running time, state, and its own bar when in progress. A special:
  the movie and its *Extras*, five across, titled as on the page.
- Watched or in progress (`tileStateOf()`): the watch history merged with
  Dropout's `.percentage-bar` on the tile (a Roku play).

A page with no name in its header is not read: it stays Dropout's page.

**The order** (`smartOrder`, while *Shows Open On* is not `first`): newest
first when the start episode (below) is past the middle of what is on the
page, else Dropout's. So a caught-up season has its newest episode top left,
an unstarted one Episode 1. Newest first sets `loadAll`; the order is redone
as episodes arrive, the selection kept by address.

**The main button** (S8, `pickUpOf()`) is `TenfootHistory.pickUp()` over the
show's history entries (by their `show`, or the show in their address) and
the episodes on screen (address; season from the address or the season on
screen; number from `show.episodeNumber`; title; Dropout's bar):

- `resume`: the most recent episode in progress not older than *Clear
  Continue Watching*;
- else `next`: after the most recently finished, the next unwatched episode
  on screen, else its `next` (Dropout's up-next when it played here),
  followed past any already watched;
- else `first`: the first episode on screen.

`pickUpLabel()` words it: "Resume S9 E3", "Play S9 E4", or less where numbers
are unknown. It is a link, yellow and first: OK follows it, like a card.

**The start episode** (S12, `startIndex()`): the anchor is the last episode in
page order, among the tiles drawn, that is watched or in progress. None:
Episode 1. In progress: that one. Watched: the next unwatched after it, else
Episode 1. A special starts on *Watch Movie*.

### An episode's page

`episodeModel()` reads the page under the player with `screen.episode`: the
title (none, no model), the show's name (the banner's yellow kicker), the
season line (`h5.badges-container`, "•" shown as "·"), the description, the
buttons — *Play* (`run: "player"`), *Episodes* (the season link, else the
show link), *My List* (`proxy`) — and *Up Next in Season N* as one section.
Its hero has `dock: true`: in place of a picture, an empty 16:9 box
(`.tenfoot-screen-player`) beside the details, exposed as the screen's
`dock`.

**Docking.** `page-video.js` `syncDock()` sets `html.tenfoot-docked` while the box
exists and writes its rect to `--tf-dock-x/y/w/h`; `content/page.css` makes
the theater root (`#watch-player`) `position: fixed` there, above the layer
(z-index 2147481500 over 2147481000), mount and frame filling it. Style only,
as theater is: moving the frame in the page would reload it.
`html.tenfoot-theater` wins over docking. The rect is rewritten after every
redraw and move (`onLayout`), on `resize`, on each theater change, and every
animation frame for 400 ms after each, so the player follows the screen
sliding. Leanback off, or no screen, removes the class and variables.

**Focus.** Leaving the player (`leavePlayer("below")`, or Back out of theater
in `goBack()`) goes through `focusScreen()`: the screen's current button or
card, at first *Play*. ▲ from the top row (`{edge: "up"}`) is
`enterPlayer()`. *Play* is `playFromScreen()`: `enterPlayer()`, plus
`player:command play` when the last state said paused. While the player has
the keys or theater is on, a redraw never takes the focus (`refreshScreen()`),
nor is focus in the theater root (mount, frame) taken back (`onFocusIn()`).

## The rail (`nav/rail.js`)

A `<nav>` of buttons appended to `<html>`: Search, Home, Browse, the site's
`rail.links` (My List, Dropout 24/7) and the gear at the foot. Shown on the
page kinds in `rail.kinds` (Home, hubs, Browse, My List, Search, `series`:
every page that plays no video) under `html[data-tenfoot-rail="on"]`; a page
Leanback does not draw gets `padding-left` on `<body>`. The current page's
entry has a yellow icon (the ring is the rail's only yellow box) and is where
the rail is first entered; after that the rail remembers its own position. A
page is matched by its link before its kind: `/my-list` is a `grid` page but
lights My List, and the rail's Browse opens Browse from it.

`page-screens.js` makes the rail a focus region with memory on both sides:
`enterRail()` stores where the selection left (`railReturn`); while
`railActive`, ▲ ▼ move without wrapping, OK takes the entry, ◀ is absorbed,
▶ or Back call `leaveRail()`, which returns to `railReturn` (telling the
screen's model when it is a card). Only plain buttons live in the rail, so
the arrows always have a way out. The gear opens the settings panel, with the
gear as its return point.

## Watch history (`lib/history.js`)

One entry per video, keyed by the slug after `/videos/` (the same in tile
links, episode addresses and `OTTData.video.url`), holding up to two
readings — `local` (Leanback's: position and time) and `dropout` (the bar on
Dropout's tiles: percent, and when Leanback first saw that value) — plus the
address, title, show name, picture, length; `show`, `season`, `episode` from
the episode page; and `next`, what Dropout plays after it (address, season,
episode, from the player's up-next titled like "E2, S1 - Game Changer").
Storage shape: [spec.md](./spec.md#settings-and-storage).

The newer reading is believed. A Dropout value first seen for a video
Leanback has its own reading of is dated 0, so an old bar never overrides a
fresh local one; a value that **changes** is dated now (another device played
it). Watched: 95 % or under 90 s left. In progress: more than 60 s played. At
most 500 entries; the least recently touched go first.

Every write goes through the background, one change at a time (read → apply →
save), so reports arriving together never overwrite each other:

| Who | When | Message |
| --- | --- | --- |
| `player.js` | pause, seeked, ended, the frame losing focus or being hidden, every 15 s of `timeupdate` while playing. Never for a trailer or a live stream; a report under 5 s never replaces a stored position | `history:progress` |
| `page.js` | once per episode page: address, title, show name, picture; show, season and episode from the season link ("Season 2, Episode 1", `video.episodeInfo`), else show and season from `og:url` (`video.canonical`) | `history:meta` |
| a screen, through `page.js` | Dropout's bars on screen, when their values change | `history:observe` |
| a settings panel, the options page | *Clear Continue Watching* (asked twice): watched videos are kept whole; of the rest, Leanback's readings and episode-page details go, Dropout's bars stay (still shown on cards), and `clearedAt` is set: nothing unfinished read before it shows in Continue Watching or resumes | `history:clear` |

**Resume.** When the player finds its `<video>` it looks up `resumePoint()`.
For a video in progress it sets `currentTime` once the metadata is in, and
again on the first `playing` if the player put itself back at its start —
never touching `paused` or `muted`, so autoplay and unmuting are undisturbed.
Then `player:resumed` (the page shows "Resumed at 12:04"), and *Start Over*
tops the playback panel until used.

## Focus ring and hint bar (`nav/focus-ring.js`)

- The ring is one `position: fixed` `<div>` appended to `<html>` (beyond the
  site's CSS resets in `<body>`), `pointer-events: none`, very high
  `z-index`, moved to the target's `getBoundingClientRect()` on `focusin`,
  `scroll` (capture) and `resize`, at most once per animation frame.
- It sits `width + 2` px outside the target, its corner radius the target's
  computed `border-top-left-radius` (enlarged by the zoom) plus that offset,
  so the curves run parallel. Style: `--tenfoot-ring-color` (`#feea3b`),
  `--tenfoot-ring-width` (`4px`), a dark outer edge for contrast on light
  pictures, no transition under reduced motion.
- The selection zoom (`focusZoom`, *Enlarge Selection*: `--tenfoot-zoom`,
  class `tenfoot-scaled`) enlarges the focused element, made `inline-block`
  first if inline (a transform does nothing to an inline box), unless marked
  `data-tenfoot-nozoom`. The ring hides while the settings panel has the
  focus: the panel marks its own selection.
- Dropout's CSS turns every link teal and every hovered or focused `<button>`
  blue ([site-notes.md](./site-notes.md#site-wide-css-that-reaches-leanbacks-elements)).
  Leanback's buttons (the rail, the banner's **›** and proxied *My list*, the
  panel's entries) pin their backgrounds with `!important`, so the ring is the
  only mark of the selection.
- The hint bar is a second fixed element at the bottom: key glyphs and labels
  for the context, on a scrim. Off by default (`hintBar`); when on, it stays
  up on pages and, during playback, appears on a keypress and hides 3 s
  later. Short notices ("No next episode", "Nothing to go back to") use the
  same bar, hints on or off.

## The transport bar and the settings panel

Both are Leanback's (`content/transport.js`), drawn in the player frame. What
each key does: [keymap.md](./keymap.md#the-transport-bar).

**The player's own chrome** — control bar, overlay play button, side dock,
title (`player.chrome`) — is stamped `data-tenfoot-bar` and kept invisible
with `opacity: 0`, not `display: none`: the settings panel still reads the
player's menu, and a `display: none` subtree may never mount. In the control
bar, everything not on `player.transportKeep` (and everything on
`player.transportHide`) is stamped `data-tenfoot-hide`; the gear's popover
entries never are.

**The bar**: play/pause · position · settings · fullscreen, elapsed time
under the progress bar's start and length under its end, driving the
`<video>` directly; sized by `content/player.css` in `--tf-pu` (1/1920 of the
frame's width) with pixel minimums. `player.js` decides when it is open;
while it is, ◀ ▶ walk it instead of seeking. With no video, ▼ goes straight
to the page.

**The title and the peek.** `.tenfoot-osd` (top left) shows the show's name,
then "S9 · E3 · Whodunnit" (`setInfo()`), asked of the page once per video
(`page:info`), else `OTTData.video.title`. It shows with the bar, and alone
for 4 s on a video's first `play` (`flashTitle`). A **peek** shows the bar
with no selection (`data-tenfoot-peek`, no button stamped): keys stay
playback's, `open()` takes over, and it ends on its timer or
`endPeek(reason)`. A pause the viewer made (`userPaused`: not the panel's
hold or the unmute rescue) peeks for 4 s, ended by playing. A skip
(`player:command` `seek`, from anyone) calls `seekFeedback()`: `.tenfoot-seek`
with ⏪ / ⏩ and the new time, and a `seek` peek until 1 s after the last skip
(4 s, as a `pause` peek, when paused). Each skip resets the timers, so
nothing flickers between presses.

**Up next** (`showUpNext()`, `.tenfoot-upnext`) is driven by `player.js`
`syncUpNext()` on every `timeupdate`, `seeked`, `ended` and mutation batch.
It shows while the time left is within `OTTData.up_next.offset_seconds`
(8 s), or Dropout's card (`player.upNextOverlay` → `.ott-up-next`, stamped
`data-tenfoot-bar`: invisible, still working) has its play link up, unless
the viewer hid it. Words from Dropout's up-next title ("E2, S1 - Game
Changer" → "S1 · E2", "Game Changer"), picture from `thumbnail_url`,
countdown from the time left. OK is `playNext()`: Dropout's play link
(`player.upNextButton`; never a button, as Hide is the card's first), else
`page:episode`. ◀ or Escape is `dismissUpNext()`: Dropout's Hide
(`player.upNextHide`) is pressed, the card stays down for this video, and
`player:ended` carries `dismissed: true`, stopping the page's autoplay. With
`autoplayNext` off there is no countdown and Hide is pressed once when the
card appears. An empty end screen (Vimeo's outro) is no offer.

**The settings panel** opens from the bar's gear, or the options button
during playback, drawn by `nav/panel.js`. It pauses the picture and holds a
stack of levels: the top (*Start Over* after a resume, Quality, Speed, Play
Next Episode, Closed Captions, Caption Style, Leanback Settings), Leanback's
settings (`ROWS`, Clear Continue Watching, Turn Leanback Off), a setting's
values, or any depth of the player's menu.

- **Closed Captions** is a switch: `toggleCaptions()` opens the player's
  captions entry, clicks *Off* or its first other option, and re-reads the
  root; ▶ opens that menu as a level instead.
- **Caption Style** (`openCaptionStyle()`) clicks through to the entry
  matching *Customize* and pushes it as one level two deep (`backs: 2`), so
  one ◀ presses the player's Back twice.

**Reading the player's menu** (`player.menu`, always in the DOM, so read
without being shown; the markup:
[site-notes.md](./site-notes.md#the-settings-menu)). A level's entries are
the shown `player.menuItem` matches outside any `hidden` ancestor (a
collapsed accordion keeps its options, `hidden`): a *drill*
(`aria-haspopup`/`data-menu-item`), an *expand* (`role="button"` with
`aria-expanded`), an *option* (`menuitemradio` / `radio`, ticked from
`aria-checked`) or an *action* ("Reset all"). Labels from
`player.menuLabel`, the `aria-label` (swatches) or the text; values from
`player.menuValue`; an option's `group` from its `[role="radiogroup"]`'s
`aria-labelledby`, its `accordion` from its `[role="group"]`'s header; the
title from `player.menuTitle` (none at the root).

**Sets of options are levels of their own** (`vendorView()`). Each headed set
(Color, Size, Opacity) and accordion (Family, Edge style) is one entry
showing its current choice. OK pushes a `pick` level ("Font Color") of its
options from the parent's last read (`choicesOf()`), first opening an
accordion in the player's menu unless it is open (a second click would shut
it). OK on a choice clicks the player's option, and the re-read pops back to
the set (`viewIndexOf()`); ◀ pops without touching the player's menu.

**Taking an entry** clicks the original and re-reads once the menu changes. A
drill pushes a level; anything else follows the player: same titled panel →
re-read in place (a caption colour); back up or to the root → pop to match (a
caption track). ◀ and Back press the player's Back (`player.menuBack`) once
per level of depth and pop; without it, the menu starts over at its root. In
Leanback's settings a switch flips on OK or ▶, a choice pushes its values (OK
picks and pops), ▶ never runs an action; `onSetting`/`onAction` hand changes
to `player.js`. Taking and going up are `step()`s: while one waits on the
player's menu, other presses are dropped (OK held down repeats; ▲ ▼ still
move). Steps that ask the player nothing finish at once.

With **Player controls → the site's own** (`playerChrome: "site"`, options
page only), nothing is stamped and no bar drawn: ▼ goes to the page and the
options button to the page's settings.

## Sound and the autoplay policy

Firefox blocks autoplay with sound, so Dropout starts videos muted — that is
*how* it autoplays. An unmute without user activation makes Firefox stop the
video, so insisting trades "starts muted" for "does not play". No extension
can grant the permission: Firefox has no WebExtension API for it
(`contentSettings` is Chrome's, `browserSettings` does not cover autoplay),
and events a content script makes are untrusted, so they carry no user
activation. How a user grants it: README → [Sound on autoplay](../README.md#sound-on-autoplay).

`player.js` asks `navigator.getAutoplayPolicy("mediaelement")` first and
unmutes at once when it answers `"allowed"`.

Otherwise `applyMutePreference()` tries once. If playback stops within 250 ms, the video
is muted again and restarted, `autoplayBlocked` is set so nothing retries,
and the next handled key — a real user gesture — turns the sound on. A profile
that allows autoplay with sound never hits the revert.

The site also restores a remembered mute for a video already watched,
sometimes after `loadedmetadata`, so the preference is re-applied on
`volumechange` for 15 s after the video appears, unless Firefox has already
refused an unmute (`autoplayBlocked`).

## Theater layout

CSS, not the Fullscreen API: that needs a fresh user gesture, exits on Escape
before the extension sees it, and adds nothing in an already-fullscreen kiosk
window.

`content/page.css` holds **no site selectors**: `page.js` stamps what the
rules name (`theaterRoot` → `data-tenfoot-theater-root`, `playerMount` →
`data-tenfoot-player`, each `theaterHide` → `data-tenfoot-hide`) and the
stylesheet targets the stamps, so a site change never means editing CSS:

```css
html.tenfoot-theater [data-tenfoot-theater-root] { position: fixed; inset: 0; z-index: 2147483000; background: #000; }
html.tenfoot-theater [data-tenfoot-theater-root] iframe { width: 100%; height: 100%; }
html.tenfoot-theater body { overflow: hidden; }
html.tenfoot-theater [data-tenfoot-hide] { display: none; }
```

Enter: on a `video` page load with `theater: "auto"`, or OK on the player
with `manual`. Leave: Back while the player has focus, which also
neutralises the site's sticky mini-player if it engages.

## Player control (`content/player.js`)

The `<video>` is found by `player.video` (default `video`), waited for with a
`MutationObserver` (Vimeo's runtime creates it after load), and driven
directly:

| Command | Does |
| --- | --- |
| `state` | replies with the current state; changes nothing |
| `toggle` / `play` / `pause` | `play()` / `pause()` |
| `seek` `{by: ±s}` | `currentTime += by`, clamped to `0…duration`, with the seek feedback |
| `stop` | pause, `currentTime = 0`, `page:focus {hint: "back"}` |

`player:state {paused, currentTime, duration, ended, title, upNext}` goes out
on `play`/`pause`/`ended`/`durationchange` and at most every 250 ms from
`timeupdate`; `upNext` is `OTTData.up_next`.

Next/previous episode (`page-video.js` `goEpisode()`): next takes the site's
up-next overlay on the page when it is up, else `upNext.url`; otherwise both
use the episode order captured from the series page (`captureEpisodeOrder()`,
`sessionStorage`, when the viewer came from there). With neither, a notice
says so.

## Messages

All messages are `{type, ...}` objects over `browser.runtime.sendMessage`
(content → background) and `browser.tabs.sendMessage(tabId, msg, {frameId})`
(background → one frame). The background records the player frame's
`sender.frameId` per tab on `player:hello` and forgets it when a relay to it
finds no receiving end, and on `tabs.onRemoved`. The player frame sends
nothing on `pagehide`: a message from a context being destroyed logs an
error in the parent process.

| Type | From → To | Payload | Purpose |
| --- | --- | --- | --- |
| `settings:get` | any → bg | — | reply: the full settings object |
| `settings:set` | any → bg | `{patch}` | reply: the saved settings object |
| `rules:get` | content → bg | — | reply: `{ok, rules}`, the parsed `sites/dropout.json` |
| `player:hello` | player → bg | `{videoId, title, duration, hasVideo}` | frame registry |
| `player:ready` | bg → page | `{frameId, videoId, title}` | the player frame registered; the page retries a pending hand-off |
| `player:command` | page → bg → player | `{cmd, by?}` | [Player control](#player-control-contentplayerjs) |
| `player:focus` | page → bg → player | — | give the player keyboard focus |
| `player:settings` | page → bg → player | — | open the settings panel (options button during playback); reply `{ok}`; on `false` the page opens its own |
| `player:back` | page → bg → player | — | Escape on the page during playback: the frame closes what it can; reply `{consumed}`; on `false` the page walks its own layers |
| `player:offer` | page → bg → player | `{showing}` | the site's up-next overlay is on the page, so OK in the player takes it |
| `player:state` | player → bg → page | state object | hint bar, autoplay-next, up-next offer (`upNextShowing`; `upNextCard` when it is Leanback's card, which ◀ hides) |
| `player:ended` | player → bg → page | `{upNext, dismissed}` | autoplay next, unless the viewer hid the up-next card |
| `player:resumed` | player → bg → page | `{at}` | picked up at `at` seconds: show the notice |
| `page:focus` | player → bg → page | `{hint: "below" \| "back"}` | leave the player |
| `page:episode` | player → bg → page | `{delta: 1 \| -1}` | next / previous episode |
| `page:action` | player → bg → page, or harness → page | `{action}` | run an action the page owns (`search`, `menu`, …); `browser-back` is BrowserBack pressed in the player frame |
| `page:info` | player → bg → page | — | reply `{ok, series, title, season, episode}` for the title over the video; `ok: false` off an episode page |
| `page:state` | harness → page | — | reply: a snapshot (page kind, theater, focused element and rect, ring/hints, the screen's model, the show page, the rail). Tests only |
| `history:progress` | player → bg | `{key, url, title, position, duration, ended, next}` | where the video is; `next` is Dropout's up-next `{url, title}`, or null |
| `history:meta` | page → bg | `{key, url, title, series, image, show?, season?, episode?}` | what the episode page knows |
| `history:observe` | page → bg | `{items: [{key, url, percent, duration, title, image}]}` | Dropout's progress bars on screen |
| `history:clear` | page / options → bg | — | *Clear Continue Watching* |
| `exit` | page → bg | — | exit hook; the reply says whether the tab was closed |

No `settings:changed` broadcast and no `toggle` message: every context
watches `storage.onChanged` through `lib/settings.js`, so a frame that starts
before the background has nothing to wait for. The page and the player never
`window.postMessage` each other: page scripts could spoof it.

## The manifest

The parts of `manifest.json` (MV2) that are not obvious:

- `"*://www.dropout.tv/"` and `"*://www.dropout.tv/?*"` match only the
  marketing site's root (a bare pattern does not cover a query string); the
  rest of that site is untouched.
- `embed.vhx.tv` needs `all_frames: true`, or the player script never runs:
  that host only ever appears as an iframe.
- Each `js` list starts with `lib/settings.js`, then `lib/common.js` and
  `lib/history.js` where needed. Files in one list share a global, which is
  how `lib/*`, `nav/*` and the content modules publish `TenfootSettings`,
  `TenfootCommon`, `TenfootHistory`, `TenfootSettingsMenu`,
  `TenfootKeymap`, `TenfootSiteRules`, `TenfootSpatial`, `TenfootFocusRing`,
  `TenfootPanel`, `TenfootRail`, `TenfootTrail`, `TenfootCards`,
  `TenfootHome`, `TenfootScreen`, `TenfootShow` and the page script's
  parts (`TenfootPageBack`, `TenfootPageVideo`, `TenfootPageScreens`) to
  `content/page.js`, which installs its parts before it starts.
- The page's `css`: `content/page.css` (ring, hints, theater, the docked
  player), `content/panel.css` (the settings panel; also in the player
  frame's list), and `content/home.css` (the screens, the rail, the pills). All but the panel's
  are gated on `html[data-tenfoot="on"]`; the panel only exists while open.
- A second `watch.dropout.tv` entry, at `document_start`, holds only
  `content/early.css`: content-script stylesheets arrive with their scripts'
  `run_at`, so this is the only way a rule applies before the first paint.
- `sites/dropout.json` is not in `web_accessible_resources`: the background
  fetches it, and an extension reading its own file needs no declaration.
- `commands.toggle-tv-mode` has no default key (set one in `about:addons` →
  Manage Extension Shortcuts). No popup: a popup cannot be driven from a
  remote.
- No `update_url`: distribution is AMO (unlisted) or a temporary load.

## `sites/dropout.json`

The only file that knows Dropout. Which selectors are verified:
[site-notes.md](./site-notes.md).

| Key | Holds |
| --- | --- |
| `routes` | URL → page kind, first match wins: `video` before the `series` catch-all, which stays last; `other` routes catch account and legal paths that would look like a series slug |
| `browseUrl`, `gridUrl`, `searchUrl` | where the rail's own entries go |
| `common` | the header, Dropout's `chrome`, loose `focusable`s, `modals`, `modalClose`, the hover tooltips (`hoverSuppress`) |
| `pages.<kind>` | `rows`/`rowItem` (row-wise moves; `scrollNext`/`scrollPrev` on `browse`), `tile`/`target` (one focus per tile), `focusable`, `loadMore`, `initialFocus` (a list; the first match in page order wins) |
| `pages.series` | also `episodeLinks` (next/previous order) and `show`, what `show.js` reads: `layouts`, the season control and the episode count, the episode section and a tile's parts, the header and its buttons, a special's movie and *Extras*, *Load More* |
| `pages.video` | `theaterRoot`, `playerMount`, `playerFrame`, `theaterHide`, `upNextOverlay`, `seriesLink`; for the history `videoTitle`, `videoImage`, `episodeInfo`, `canonical` |
| `player` | the selectors inside the player frame: `<video>`, captions, chrome and transport keep/hide lists, the up-next card, the gear and fullscreen buttons, the settings menu and its parts |
| `home` | what Home reads: `root`, a slide, a row and a tile with their parts, `rowPageSize`, `showMore`, `rowOverrides`, `rowTitleOverrides` |
| `rail` | `kinds` (the page kinds with the rail), `links` (id, label, icon, url) |
| `screen` | what `screen.js` reads on a collection page (root, title, a tile and its parts, *Load More*); `screen.search` the same plus its box, filters and empty message; `screen.episode` the page under the player (title, show, season line, description, My List, the Up Next tiles) |

Two rules the file has to keep:

- `loadMore` matches the **control**, not the grid:
  `js-load-more-items-container` is the `<ul>` holding the tiles; the control
  is `a.js-load-more-link[data-load-more]` in a sibling `.row.loadmore`.
- `target` is a tile's outer link. A tile has two links to the same place
  (picture and title); `nav/spatial.js` keeps the first per tile, so the ring
  never stops twice on one tile.
