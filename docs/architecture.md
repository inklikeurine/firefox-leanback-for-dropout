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
| `background.js` | Event page (`persistent: false`) | Serves `sites/dropout.json` (`rules:get`, cached); per-tab registry of the player frame id in **`storage.session`** (an event page loses a plain variable when it unloads; a `Map` is the fallback if the API is missing); message relay page ⇄ player; toolbar button toggle and badge; `commands` handler; exit hook (`tabs.remove(sender.tab.id)`). |
| `content/page.js` | Top frame of `watch.dropout.tv` | Loads `sites/dropout.json`; classifies the URL into a page kind; wires keys → actions; drives spatial navigation, focus ring, hint bar, theater layout, structural Back, load-more, season switching, next/previous episode. |
| `content/player.js` | Every frame on `embed.vhx.tv` (`all_frames: true`) | Registers with the background (`player:hello`); finds the `<video>`; handles keys while the frame has focus; executes `player:command`; reports `player:state` and `player:ended`; exposes `OTTData` facts. Owns **when** the transport bar is open and what Back means while it is, and applies the `startMuted` preference once per video. It loads `nav/site-rules.js`, `nav/spatial.js`, `nav/focus-ring.js` and `content/transport.js`, plus `content/player.css`. |
| `content/transport.js` | Every frame on `embed.vhx.tv` | Draws the transport bar (**play/pause · position · settings · fullscreen**) and drives the `<video>` directly. Also draws the full-height settings panel, which holds the player's settings (Quality, Speed, Closed Captions) and Leanback's in one list. The player's are **proxied** — see [The transport bar and the settings panel](#the-transport-bar-and-the-settings-panel). Leanback's are read from and written to `storage.local` through `content/player.js`. Site-agnostic apart from the `player` block of the rules it is handed. |
| `content/marketing.js` | `www.dropout.tv` at `document_start` | If the path is `/` and *skip marketing site* is on, `location.replace("https://watch.dropout.tv/browse")`. Nothing else. |
| `nav/spatial.js` | Top frame | Site-agnostic directional focus search over a candidate list; row-aware moves; focus memory. Knows nothing about Dropout. |
| `nav/menu.js` | Top frame | The options panel the menu button opens: a list of `<button>`s the ring moves through like anything else. Site-agnostic; `content/page.js` supplies the entries and says what they do. |
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
| `browse` | `/browse` | Row-aware navigation over `.horizontal-row-container`s; hero carousel is one row. Initial focus: first tile of the first row. Back → exit hook. |
| `grid` | `/series`, `/collections/...` | Geometric navigation over tiles; Down past the last row clicks Load More. Back → history / `/browse`. |
| `series` | `/<slug>[/season:N]` | Focusables: trailer button, season select, sort select, episode tiles. Left/Right on a focused select changes its value and dispatches `change`. Initial focus: first episode tile. Back → history / `/browse`. |
| `video` | `/<slug>/season:N/videos/<ep>`, `/videos/<slug>` | Theater layout (setting `auto`), focus the player frame. Down from the player → first focusable under it (series link, related items). Back: theater on → leave theater; else history / series page. Media keys always reach the player. |
| `search` | `/search` | Geometric navigation; the search input keeps the keyboard (only Escape is intercepted while typing). |
| `other` | everything else | Passive: focus ring on whatever the page focuses, Escape = history back. No arrow handling. |

## Key handling

- One `keydown` listener on `window`, **capture phase**, in each content
  script. It maps `event.key` to an **action** (`up`, `down`, `left`,
  `right`, `select`, `back`, `menu`, `search`, `play_pause`, `stop`, `next`,
  `previous`, `fast_forward`, `rewind`) — the same vocabulary as the HTPC shell's
  Appendix A — then dispatches the action to the current context. Full table:
  [keymap.md](./keymap.md).
- If the event target is editable (`input`, `textarea`, `[contenteditable]`,
  or an open `<select>`), only `back` is handled.
- `preventDefault()`/`stopPropagation()` only when the action was consumed.
  Unconsumed keys reach the site untouched.
- Repeat: OS auto-repeat is accepted but throttled to one move per 80 ms.
- Focus handoff into the player: `page.js` calls `iframe.focus()` and sends
  `player:focus`; `player.js` focuses the `<video>` (or the player root).
  Out of the player: `player.js` sends `page:focus` with a hint (`below` |
  `back`) and `page.js` picks the target.
- **Browser-owned keys.** Remotes send `BrowserBack`/`BrowserHome`
  (`KEY_BACK`/`KEY_HOMEPAGE`) rather than Escape. The page sees
  `BrowserBack`, but cancelling it does not stop Firefox's own history-back
  ([targets.md](./targets.md) T2). So `content/page.js` keeps **one**
  same-document history entry on top (`history.pushState({tenfoot: "guard"})`).
  Firefox's navigation lands on it; `onPopState` puts it straight back, asks
  the player frame first (`player:back`, which closes the settings panel or the
  transport bar if one is open), and otherwise runs the layered `back`. The
  capture-phase handler runs the same `back` for `Escape` and for any Back the
  page receives, and a press is never acted on twice. `BrowserHome` is never
  mapped.
- **Pointer.** `mouseover`/`mousemove` never change focus. While the
  extension is on, an injected style rule suppresses the site's hover tooltips (`.tooltip`) so a
  drifting air-mouse pointer doesn't litter the screen. Clicks are left to
  the site.

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

The candidate cache is invalidated by a debounced (100 ms) `MutationObserver`
on `document.body` and recomputed lazily on the next key.

## Focus ring and hint bar (`nav/focus-ring.js`)

- The ring is a single `position: fixed` `<div>` appended to `<html>` (outside
  `<body>` so the site's CSS resets don't touch it), moved to the focused
  target's `getBoundingClientRect()` with `pointer-events: none` and a very
  high `z-index`. Repositioned on `focusin`, `scroll` (capture) and `resize`,
  throttled to one `requestAnimationFrame`.
- Style tokens (settings): `--tenfoot-ring-color` (`#feea3b`),
  `--tenfoot-ring-width` (`4px`), a dark outer edge for contrast on light
  images, and no transition under reduced motion. The focused element itself
  is enlarged by *Selected Item Zoom* (`--tenfoot-zoom`, class
  `tenfoot-scaled`); an inline target is made `inline-block` first, because a
  transform does nothing to an inline box.
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
| `player:back` | page → bg → player | — | the page's guard caught Back: the frame closes what it can; reply `{consumed}` — the page walks its own layers when `consumed` is false |
| `player:offer` | page → bg → player | `{showing}` | the site's up-next overlay is on the page, so OK in the player takes it |
| `player:state` | player → bg → page | state object | hint bar, autoplay-next, up-next offer |
| `player:ended` | player → bg → page | `{upNext}` | autoplay next |
| `page:focus` | player → bg → page | `{hint: "below" \| "back"}` | leave the player |
| `page:episode` | player → bg → page | `{delta: 1 \| -1}` | next / previous episode |
| `page:action` | player → bg → page, or harness → page | `{action}` | run an action the page owns (`home`, `search`, `menu`, …) |
| `page:state` | harness → page | — | reply: a snapshot (page kind, theater, focused element, ring/hints). For the tests; the extension never sends it |
| `exit` | page → bg | — | exit hook; the reply says whether the tab was closed |

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
- Each `js` list starts with `lib/settings.js`; the files in one list share a
  global, which is how `nav/*` publishes `TenfootKeymap`, `TenfootSiteRules`,
  `TenfootSpatial` and `TenfootFocusRing` to `content/page.js`.
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
`loadMore`, and the `video` kind's player and theater selectors. Any
`<select>` among the focusables is a two-step control; no rule marks them. `common` holds the header, the modal and hover-tooltip selectors;
`player` holds the selectors used inside the frame.

Two rules the file has to keep:

- `loadMore` must match the **control**, not the grid. `js-load-more-items-container`
  is the `<ul>` that holds the tiles; the control is
  `a.js-load-more-link[data-load-more]` in a sibling `.row.loadmore`.
- `target` must be the outer link of a tile. A tile has two links to the same
  place (image and title); `nav/spatial.js` keeps the first per tile, so the
  ring never stops twice on one tile.

Which selectors are verified and which are not:
[site-notes.md](./site-notes.md).
