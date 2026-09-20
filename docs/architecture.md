# Architecture

TV Mode for Dropout is a Manifest V2 WebExtension with no build step. The one
fact that shapes it: **the Dropout player is a cross-origin iframe**
(`embed.vhx.tv`) inside the page (`watch.dropout.tv`). Keys pressed while the
player has focus arrive in the frame's document, not the page's; the page can
neither see the `<video>` nor receive those keys. So there are two content
scripts, and the background script relays between them.

## Components

```
                        watch.dropout.tv tab
┌────────────────────────────────────────────────────────────────────┐
│ top frame — content/page.js (+ nav/spatial.js, nav/focus-ring.js)  │
│   page kind · spatial nav · focus ring · hint bar · theater · back │
│                                                                    │
│   ┌──────────────────────────────────────────────────────────┐     │
│   │ iframe embed.vhx.tv — content/player.js                  │     │
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
| `background.js` | Event page (`persistent: false`) | Settings defaults + persistence; per-tab registry of the player frame id; message relay page ⇄ player; toolbar button toggle and badge; `commands` handler; exit hook (`tabs.remove(sender.tab.id)`). |
| `content/page.js` | Top frame of `watch.dropout.tv` | Loads `sites/dropout.json`; classifies the URL into a page kind; wires keys → actions; drives spatial navigation, focus ring, hint bar, theater layout, structural Back, load-more, season switching, next/previous episode. |
| `content/player.js` | Every frame on `embed.vhx.tv` (`all_frames: true`) | Registers with the background (`player:hello`); finds the `<video>`; handles keys while the frame has focus; executes `player:command`; reports `player:state` and `player:ended`; exposes `OTTData` facts (title, duration, up-next). |
| `content/marketing.js` | `www.dropout.tv` at `document_start` | If the path is `/` and *skip marketing site* is on, `location.replace("https://watch.dropout.tv/browse")`. Nothing else. |
| `nav/spatial.js` | Top frame | Site-agnostic directional focus search over a candidate list; row-aware moves; focus memory. Knows nothing about Dropout. |
| `nav/focus-ring.js` | Top frame | The overlay ring element and its positioning; hint bar element. Site-agnostic. |
| `sites/dropout.json` | Loaded by `page.js` via `fetch(browser.runtime.getURL(...))` | All Dropout knowledge: routes → page kinds, selectors per page kind, modal selectors, player selectors, key overrides. |
| `options/options.html/.js/.css` | Options page (`open_in_tab`) | Settings form. |

`nav/*` and the message protocol are site-agnostic on purpose: a second site
(Twitch) would add a `sites/<site>.json` and a page kind or two, not a second
engine. The extension itself stays standalone
([htpc-integration.md](./htpc-integration.md), [targets.md](./targets.md)).

## Page kinds and what TV Mode does on each

| Page kind | URL (see [site-notes.md](./site-notes.md#routes)) | Behaviour |
| --- | --- | --- |
| `browse` | `/browse` | Row-aware navigation over `.horizontal-row-container`s; hero carousel is one row. Initial focus: first tile of the first row (Continue Watching when present). Back → exit hook. |
| `grid` | `/series`, `/collections/...` | Geometric navigation over tiles; Down past the last row clicks Load More. Back → history / `/browse`. |
| `series` | `/<slug>[/season:N]` | Focusables: trailer button, season select, sort select, episode tiles. Left/Right on a focused select changes its value and dispatches `change`. Initial focus: first episode tile. Back → history / `/browse`. |
| `video` | `/<slug>/season:N/videos/<ep>`, `/videos/<slug>` | Theater layout (setting `auto`), focus the player frame. Down from the player → first focusable under it (series link, related items). Back: theater on → leave theater; else history / series page. Media keys always reach the player. |
| `search` | `/search` | Geometric navigation; the search input keeps the keyboard (only Escape is intercepted while typing). |
| `other` | everything else | Passive: focus ring on whatever the page focuses, Escape = history back. No arrow handling. |

## Key handling

- One `keydown` listener on `window`, **capture phase**, in each content
  script. It maps `event.key`/`event.code` to an **action** (`up`, `down`,
  `left`, `right`, `select`, `back`, `menu`, `info`, `play_pause`, `stop`,
  `next`, `previous`, `fast_forward`, `rewind`, `subtitle`, `search`) — the
  same vocabulary as the HTPC shell's Appendix A — then dispatches the action to the
  current context. Full table: [keymap.md](./keymap.md).
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
  (`KEY_BACK`/`KEY_HOMEPAGE`) rather than Escape. Plan A: the capture-phase
  handler calls `preventDefault()` and runs the layered `back`. If Firefox
  still navigates history on `BrowserBack` (targets.md T2), plan B: entering
  theater and opening a dialog push a history entry
  (`history.pushState({dtv: "theater"})`), and a `popstate` handler leaves
  theater / closes the dialog — so the browser's own back and the
  extension's back behave identically. The user-visible behaviour in
  [keymap.md](./keymap.md) is the same under both plans.
- **Pointer.** `mouseover`/`mousemove` never change focus. While TV Mode is
  on, the page CSS suppresses the site's hover tooltips (`.tooltip`) so a
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
   behaviour is `smooth` unless `prefers-reduced-motion`. If the target is
   still clipped by a row container after one frame, click the row's
   `scrollNext`/`scrollPrev` control (U2 in the site notes).
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
- Style tokens (settings): `--dtv-ring-color` (`#feea3b`), `--dtv-ring-width`
  (`4px`), 2 px dark outer edge (`#0B0C10` at 0.9) for contrast on light
  images, `border-radius: 8px`, transition 150 ms in / 100 ms out, none under
  reduced motion. Optional `transform: scale(1.04)` on the target via a class.
- The hint bar is a second fixed element at the bottom: key glyphs + labels
  for the current context, ≥ 24 px text, scrim background, shown on any
  handled key, hidden 3 s later. Toggle by `info` or setting.

## Theater layout

CSS, not the Fullscreen API: the Fullscreen API needs a fresh user gesture,
exits on Escape before the extension sees it, and offers nothing extra in a
kiosk window that is already fullscreen.

```css
html.dtv-theater #watch-player { position: fixed; inset: 0; z-index: 2147483000; background: #000; }
html.dtv-theater #watch-player .embed, html.dtv-theater #watch-player iframe { width: 100%; height: 100%; }
html.dtv-theater body { overflow: hidden; }
html.dtv-theater .site-header, html.dtv-theater .promo-banner { display: none; }
```

Enter theater: on `video` page load when `theater = "auto"`, or `select` on the
player when `manual`. Leave: `back` while the player has focus. Leaving also
neutralises the site's sticky mini-player if it engages (U8).

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
Secondary path if U4 shows the video is not reachable: the Player.js
postMessage protocol behind `?api=1` (U13).

State reporting: `player:state {paused, currentTime, duration, ended, title,
upNext}` on `play`/`pause`/`ended`/`durationchange` and at most every 250 ms
from `timeupdate`. `upNext` is taken from `OTTData.up_next` when present.

Next/previous episode: `page.js` prefers `upNext.url` from the player; if
absent, it navigates using the episode order it captured from the series page
(stored in `sessionStorage` when the user came from there) — otherwise the
action is unavailable and the hint bar says so.

## Messages

All messages are `{type, ...}` objects over `browser.runtime.sendMessage`
(content → background) and `browser.tabs.sendMessage(tabId, msg, {frameId})`
(background → a specific frame). The background records `sender.frameId` of
the player frame per tab on `player:hello` and forgets it on `tabs.onRemoved`
and on `player:bye` (`pagehide`).

| Type | From → To | Payload | Purpose |
| --- | --- | --- | --- |
| `settings:get` | any → bg | — | reply: full settings object |
| `settings:changed` | bg → all frames of all Dropout tabs | settings | broadcast after `storage.onChanged` |
| `player:hello` / `player:bye` | player → bg | `{videoId, title, duration}` | frame registry |
| `player:command` | page → bg → player | `{cmd, by?}` | see table above |
| `player:focus` | page → bg → player | — | give the player keyboard focus |
| `player:state` | player → bg → page | state object | OSD, hint bar, autoplay-next |
| `player:ended` | player → bg → page | `{upNext}` | autoplay next |
| `page:focus` | player → bg → page | `{hint: "below" \| "back"}` | leave the player |
| `exit` | page → bg | — | exit hook (`close-tab`) |
| `toggle` | bg → page | `{enabled}` | toolbar / command toggled TV Mode |

The page and the player never use `window.postMessage` with each other:
page scripts could spoof it. The runtime relay is isolated from the site.

## Draft manifest

Copied to `manifest.json` when implementation starts.

```json
{
  "manifest_version": 2,
  "name": "TV Mode for Dropout",
  "version": "0.1.0",
  "description": "Drive watch.dropout.tv with arrow keys, Enter and Escape: a big focus ring, a theater player layout and media-key control for the couch.",
  "browser_specific_settings": {
    "gecko": {
      "id": "dropout-tv-mode@inklikeurine.dev",
      "strict_min_version": "140.0",
      "data_collection_permissions": { "required": ["none"] }
    }
  },
  "permissions": [
    "storage",
    "*://watch.dropout.tv/*",
    "*://embed.vhx.tv/*",
    "*://www.dropout.tv/*"
  ],
  "content_scripts": [
    {
      "matches": ["*://watch.dropout.tv/*"],
      "js": ["nav/spatial.js", "nav/focus-ring.js", "content/page.js"],
      "css": ["content/page.css"],
      "run_at": "document_idle"
    },
    {
      "matches": ["*://embed.vhx.tv/*"],
      "js": ["content/player.js"],
      "run_at": "document_idle",
      "all_frames": true
    },
    {
      "matches": ["*://www.dropout.tv/"],
      "js": ["content/marketing.js"],
      "run_at": "document_start"
    }
  ],
  "background": { "scripts": ["background.js"], "persistent": false },
  "options_ui": { "page": "options/options.html", "open_in_tab": true },
  "browser_action": { "default_title": "TV Mode for Dropout — click to toggle" },
  "commands": {
    "toggle-tv-mode": { "description": "Toggle TV Mode on Dropout" }
  },
  "icons": { "48": "icons/icon.svg", "96": "icons/icon.svg" }
}
```

Notes: `"*://www.dropout.tv/"` with no trailing wildcard matches only the site
root (the marketing site's other pages are left alone); `embed.vhx.tv` must
have `all_frames: true` or the script never runs, since that host only appears
as an iframe; no default key for the command — the user sets one in
`about:addons` → Manage Extension Shortcuts.

## Draft `sites/dropout.json`

Shape only; selectors are those in [site-notes.md](./site-notes.md), with the
unverified ones marked `"todo"` until checked. `routes` are tried in order and
the first match wins — `series` is the catch-all and must stay last.

```json
{
  "site": "dropout",
  "hosts": ["watch.dropout.tv"],
  "routes": [
    { "kind": "browse", "path": "^/browse/?$" },
    { "kind": "grid",   "path": "^/(series|collections)(/|$)" },
    { "kind": "video",  "path": "/videos/[^/]+/?$" },
    { "kind": "search", "path": "^/search" },
    { "kind": "series", "path": "^/[^/]+(/season:\\d+)?/?$" }
  ],
  "common": {
    "header": ".site-header",
    "modals": [".reveal-modal.open", "[id^='ketch-']"],
    "modalClose": [".close-reveal-modal"],
    "banner": ".promo-banner .js-banner-close"
  },
  "pages": {
    "browse": {
      "rows": ".horizontal-row-container, .carousel-layout-container",
      "rowItem": ".horizontal-row-item, .featured-carousel-slide",
      "target": "a[href]",
      "scrollNext": ".carousel-arrow--right",
      "scrollPrev": ".carousel-arrow--left",
      "initialFocus": ".horizontal-row-container .horizontal-row-item a[href]"
    },
    "grid": {
      "tile": ".browse-item-card",
      "target": "a.browse-item-link",
      "loadMore": ".js-load-more-items-container button, .js-load-more-items-container a",
      "initialFocus": ".browse-item-card a.browse-item-link"
    },
    "series": {
      "focusable": ["a.custom-btn-action-trailer", "select.js-switch-season", "select.js-sort-items"],
      "tile": ".browse-item-card",
      "target": "a.browse-item-link",
      "selectStep": ["select.js-switch-season", "select.js-sort-items"],
      "loadMore": ".js-load-more-items-container button, .js-load-more-items-container a",
      "initialFocus": ".episode-container a.browse-item-link"
    },
    "video": {
      "playerMount": "#watch-player .embed[data-sticky-player]",
      "playerFrame": "#watch-player iframe[src*='embed.vhx.tv']",
      "unauthorized": "#watch-unauthorized",
      "seriesLink": ".series-title a.context-link",
      "focusable": ["#watch-info a[href]", "[data-similar-items-site] a[href]"],
      "theaterHide": [".site-header", ".promo-banner"]
    },
    "search": {
      "focusable": ["input[type='search'], input[type='text']", "a.browse-item-link"],
      "tile": ".browse-item-card",
      "target": "a.browse-item-link"
    }
  },
  "player": {
    "video": "video",
    "captionsButton": "todo",
    "upNextOverlay": "todo"
  }
}
```
