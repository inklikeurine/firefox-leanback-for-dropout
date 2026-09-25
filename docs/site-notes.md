# Site notes — how watch.dropout.tv is built

What the extension relies on, split into **verified** (fetched logged-out on
2026-09-19 with a Firefox 140 user agent, commands at the end) and
**unverified** (needs a logged-in browser — the rows on `/browse` and the
player are client-rendered). Re-check the verified table whenever the site
misbehaves; the class names are Vimeo OTT's and are shared by every Vimeo OTT
site, which makes them more stable than Dropout-specific markup would be.

## Hosts

| Host | Role | Extension involvement |
| --- | --- | --- |
| `www.dropout.tv` | Marketing site. `/browse` there 302-redirects to `watch.dropout.tv/browse`. | Root-only forward to `/browse` (setting) |
| `watch.dropout.tv` | The app — a **Vimeo OTT** site (assets `cdn.vhx.tv`, config `window.VHX.config`) | Page content script |
| `embed.vhx.tv` | The **player iframe**, injected by the page's JS at runtime | Player content script (`all_frames: true`) |
| `cdn.vhx.tv`, `vhx.imgix.net` | JS bundles, images | none |
| `api.vhx.tv`, `api.vhx.com`, `auth.vhx.com` | Site API (used by the page's own JS) | none — the extension makes no requests |
| `f.vimeocdn.com`, `player.vimeo.com` | Vimeo's player runtime and per-clip config, loaded inside the embed frame | none |
| `www.google.com/recaptcha/enterprise.js` | reCAPTCHA Enterprise, loaded on the page shell (login) | risk for kiosk login, see below |
| `global.ketchcdn.com` | Cookie consent (Ketch) | consent dialog must be closable by keys |

## Routes

| URL pattern | Page kind | Notes |
| --- | --- | --- |
| `/browse` | `browse` | Home. Header is server-rendered; rows are rendered by `browse-ottbundle-*.js` (React). |
| `/series` | `grid` | All series as a grid, server-rendered, with a Load More container. |
| `/<series-slug>` | `series` | Series page: details, season/sort selects, episode grid. |
| `/<series-slug>/season:<n>` | `series` | Same page, another season (`?sort=alphabetical|release_date` also seen). |
| `/<series-slug>/season:<n>/videos/<episode-slug>` | `video` | Episode page. |
| `/<series-slug>/videos/<slug>`, `/videos/<slug>` | `video` | Trailer / standalone video page. |
| `/search` | `search` | Search page (its script `search-*.js` is loaded on every page). Needs a keyboard. |
| `/login`, `/checkout/...`, `/contact/...`, `/privacy` | `other` | The extension stays passive: focus ring and Escape only. |

## Verified DOM

### Header (every page)

`.site-header` > `.navigation-container` with `a.browse-link` ("Browse"),
`a.search-link`, `.user-actions` (sign-in / account), `.show-menu-trigger`
(mobile). A `.promo-banner` with `.js-banner-close` may appear at the top.

### Load More (`/series`, series pages) — corrected 2026-09-22

The control is **not** inside `.js-load-more-items-container` (that class is
on the `<ul>` that holds the tiles). It is a sibling:

```
.row.loadmore > div > a.js-load-more-link[data-load-more]
    [data-load-more-target="js-load-more-items-container"]
    [data-text-failed="Failed to load more. Please refresh and try again."]
    href="/series?page=2"                      ← "Show More"
```

So the rules file uses `a.js-load-more-link, [data-load-more]`. The draft's
`.js-load-more-items-container a` matched every tile link instead, which
would have made Down "load more" onto the first episode.

### Series grid (`/series`)

```
.collections .collection-container
  .js-load-more-items-container            ← "Load More" lives here
    .browse-item-card                       ← ONE TILE (60 on the first page)
      .grid-item-padding
        a.browse-item-link[href]            ← FOCUS TARGET (wraps the image)
          [data-track-event="site_series"]
          [data-track-event-properties]     ← JSON: {"type":"series","id":121093,"label":"Game Changer",…}
          .browse-image-container.aspect_ratio_16_9
            [data-testid="thumbnail-badges"] > [data-testid="thumbnail-badge-0"]   ← "New Episode"
            img[alt=<title>]
        .padding-small
          .browse-item-title a > strong[title]   ← second link, same href — NOT a separate target
          .browse-item-subtext .media-count      ← "8 seasons"
      .tooltip                                   ← hover tooltip, ignore
```

### Series page (`/<series-slug>`)

```
.collections-show
  .collection-details-container .collection-details
    .collection-title, .collection-description ([data-truncate] show more/less)
    .collection-actions  a.custom-btn-action-trailer (.icon-play-inverse)   ← "Watch trailer" → opens #modal-trailer
  .season-controls
    select.js-switch-season[data-switch-season]   ← options: value="https://watch.dropout.tv/<slug>/season:N", one [selected]
    select.js-sort-items[data-sort-by]            ← options: ?sort=alphabetical | ?sort=release_date
  .episode-container .item-grid
    .js-load-more-items-container
      .browse-item-card.js-collection-item[data-item-type][data-item-id]   ← same tile structure as above
        a.browse-item-link[href="…/season:N/videos/<episode-slug>"]
```

The site navigates when a select's value changes (`onchange` → the option's
URL). Changing `select.value` and dispatching `change` is therefore enough for
Left/Right season switching — no dropdown needed.

### Video page (`/<series>/season:N/videos/<episode>`)

```
.videos-show
  #preview-notification.preview-notification        ← "Live stream preview" (live events only)
  #watch-player.top-container.background-black
    .embed[data-sticky-player]                       ← PLAYER MOUNT; the site injects <iframe src="https://embed.vhx.tv/videos/<id>?api=1&autoplay=1&…"> here
      #watch-unauthorized.embed-content              ← logged-out placeholder ("Watch this video and more on Dropout", sign-in link)
  #watch-info
    .series-title a.context-link[href="/<series>"]   ← back to the series
    .video-title
    .video-content-actions, .share-tools              ← share buttons — low priority targets
    [data-similar-items-site][data-text-load-more]   ← related items container (client-rendered)
  #modal-trailer.reveal-modal.large[data-reveal]
    .embed[data-vimeo-player][data-trailer-url="https://embed.vhx.tv/videos/<id>"]
    a.close-reveal-modal
```

`window.VHX.config.embed_url` on the page holds the full player URL:
`https://embed.vhx.tv/videos/<id>?api=1&autoplay=1&collection_id=<season>&color=feea3b&context=<season url>&playsinline=1&product_id=<n>&vimeo=1`.
`api=1` means the player answers a postMessage API (see below).
`window.COMMENTABLE_ID` = the video id.

### Player frame (`embed.vhx.tv/videos/<id>`)

The document is a 2 KB shell: `<div id="app">`, Vimeo's **standard player
runtime** (`https://f.vimeocdn.com/p/4.46.115/js/player.js` and its CSS), an
OTT wrapper (`cdn.vhx.tv/assets/vite/assets/embed-player-*.js`, ~25 KB) and
`window.OTTData`:

```json
{
  "video": { "id": 612228, "title": "Game Changer Promo", "duration": 67,
             "url": "https://watch.dropout.tv/videos/game-changer-promo",
             "is_live_video": false, "is_trailer": false },
  "config_url": "https://player.vimeo.com/video/<clip>/config?…&token=<jwt: drm:false>&trick_play=1",
  "js_api_enabled": true,
  "up_next": null,
  "initial_time": null,
  "hide_chrome": null,
  "user": { "id": null, "email": null, "profile_id": null },
  "google_cast_app_id": "BA42D416",
  "api_data": { "api_host": "https://api.vhx.tv", "auth_api_host": "https://auth.vhx.com" }
}
```

Consequences for the extension:

- The `<video>` element should render **inside the embed document** (Vimeo's
  runtime is loaded there, not in a further iframe) — so a content script in
  that frame can call `video.play()/pause()` and set `currentTime` directly.
  This is the primary control path; it does not depend on any API.
- `OTTData.video.{title,duration,url}` gives OSD text and a canonical URL
  without touching the page.
- `OTTData.up_next` is where the site would put the next episode (seen as
  `null` on a public trailer without collection context). Logged in, with
  `collection_id`, it is expected to be filled — verify.
- The JWT in `config_url` says `drm: false` — Dropout is DRM-free, as
  The HTPC shell's proposal §8.5.5 states.
- The wrapper bundle contains `"play"`, `"pause"`, `"timeupdate"`, `"ended"`
  strings, consistent with a Player.js-style postMessage API behind `api=1`.
  Secondary path only.

### Player chrome — verified 2026-09-23 from the saved `embed.vhx.tv` document

Vimeo's player is componentised, with hashed CSS-module class names
(`PlayButton_module_playButton__d6312f47`). The hash changes when Vimeo
deploys; the `<Name>_module_` prefix, the `vp-*` markers and the
`*-control-bar-button` **ids** are the stable part.

The previous version of this section was written from the hand-written test
fixture rather than from a capture, and was wrong in three places that cost
real behaviour — see CHANGELOG 0.8.0. This is the actual tree:

```
.ControlBar_module_controlBarWrapper__…
  .PlayButton_module_playButtonWrapper__…        ← play / pause — OUTSIDE the bar,
    button.PlayButton_module_playButton__…         so it is never on the transport row
  .vp-controls.ControlBar_module_controls__…     ← THE TRANSPORT ROW
    .vp-progress.ProgressBar_module_…            ← seek bar; a div, and the focusable
      div[role="slider"][aria-label="Progress Bar"]  target inside it is a div too
    .VolumeControl_module_volumeControlContainer__…
      button[aria-label="Unmute"]                ← NO id; the label flips Mute/Unmute
    .VolumeControl_module_volumeControl__…[role="slider"][aria-label="Volume (use up/down arrow keys to change)"]
    button#cc-control-bar-button.cc[data-cc-button][aria-pressed]   ← captions
    button#prefs-control-bar-button.vp-prefs.PrefsButton_module_…   ← SETTINGS (gear)
    button#transcript-control-bar-button                            ← transcript
    button#pip-control-bar-button.pip[data-pip-button]              ← picture-in-picture
    button#fullscreen-control-bar-button.fullscreen.FullscreenButton_module_…
    .vp-menu.PopoverMenu_module_menu__…          ← the gear's popover, INSIDE the bar
      div[role="menu"][aria-label="Settings"] › div[role="menuitem"] × n
.vp-outro-wrapper.Outro_module_outroWrapper__…   ← end screen; + Outro_module_inactive__
  div.Outro_module_outro__…[role="dialog"]         while not offered (display: none)
#right-content-area › .AIWidget_module_aiWidget__…[aria-label="Ask Vimeo AI"]
```

Consequences, all of them learned the hard way:

- **The control-bar buttons have no `aria-label` at all.** The whole of
  `aria-label` in the frame is exactly: *Progress Bar*, *Unmute*,
  *Volume (use up/down arrow keys to change)*, *Settings* (on the popover, not
  on the gear) and *Ask Vimeo AI*. Every button is matched by id, by its short
  marker class (`.cc`, `.pip`, `.fullscreen`, `.vp-prefs`) or by `[data-cc-button]`
  / `[data-pip-button]`. Matching a control bar button on `aria-label` will
  silently match nothing.
- **There IS a captions button in the bar.** 0.7.0 recorded the opposite and
  routed subtitles through the gear menu only; the keep list then hid the
  button. Fixed in 0.8.0.
- **The play button is outside `.vp-controls`.** Hiding the bar alone left it
  over the picture (fixed in 0.7.0), and collecting the bar's contents never
  includes it — which is why OK toggles playback directly instead.
- **The gear has no label of its own** (the label is on the popover it opens),
  so a keep list that matched only a button's own attributes dropped it, which
  is how Settings disappeared in 0.6.0. Matching also looks at descendants.
- **Every focusable control carries `shared_module_focusable__…` and
  `tabindex="0"`** — a ready-made enumeration of the player's own focus targets
  if the per-control lists ever become unmanageable.
- The saved page is in `.dev/fixtures/saved/` (gitignored). It contains the
  account's email, display name, user id and a **live** `auth-user-token` JWT:
  nothing derived from it may be committed without stripping those first. The
  harness fixture `.dev/fixtures/leanback-for-dropout/embed.html` is generated
  from it with scripts, URLs, tokens and text removed.

### Browse rows (`/browse`) — class names from the bundle, not from rendered HTML

From `browse-ottbundle-*.js` (`className:` strings and `data-testid`s). The
nesting below is the expected shape and must be confirmed logged in:

```
.browse-rows
  .carousel .carousel-layout-container                ← featured hero carousel (transform-based)
    .carousel-slides > .featured-carousel-slide[data-testid="featured-carousel-slide"]
    .carousel-arrow.carousel-arrow--left / --right
  .horizontal-row-container                            ← ONE ROW
    .horizontal-row-header (.row-head)                 ← row title ("Continue Watching", "New Episodes", …)
    .horizontal-row > .horizontal-row-item             ← ONE TILE
      [data-testid="browse-card"]
      [data-testid="play-state-percentage-bar"]        ← progress bar (Continue Watching)
      .browse-item-title, .browse-item-subtext[data-testid="browse-item-subtext"]
      [data-testid="freemium-lock"], [data-testid="coming-soon-overlay"], [data-testid="trailer-link"]
  [data-testid="browse-list-toggle"]                   ← list/grid switch
  .browse-is-live-now-tag, .browse-off-air-tag, .live-carousel-info   ← live events
```

Whether a row scrolls natively (`browse-rows__horizontal-rows--mobile-scrolling`
suggests native scroll on small screens) or only through the arrows on desktop
decides how the extension keeps the focused tile on screen: `scrollIntoView`
first; if the tile is still clipped, click `.carousel-arrow--right/--left`.

## Unverified — check these first in a logged-in `web-ext run` session

Rows struck through were answered on 2026-09-23 from the saved capture in
`.dev/fixtures/saved/leanback-for-dropout/` (gitignored; it holds a live auth
token and the owner's account details, so nothing derived from it may be
committed without stripping those first). The player fixture the harness runs
against, `.dev/fixtures/leanback-for-dropout/embed.html`, is now **generated
from that capture** rather than hand-written — the previous hand-written one
agreed with this rules file instead of with Dropout, which is why the captions
and up-next mismatches survived a passing test suite.

| # | Question | How to check | Affects |
| --- | --- | --- | --- |
| U1 | ~~Exact tile markup inside `.horizontal-row-item`~~ — **answered 2026-09-23** from `search-4174697f.js`: the tile renders `div.card-enter.horizontal-row-item[data-testid="browse-card"]` › `div.browse-item-card.item-type-<type>` › `div.browse-item-title` › **`a[href]`**. `target: "a[href]"` is correct; `data-testid="browse-card"` is a steadier tile hook than the class | — | closed |
| U2 | Do rows scroll natively or by arrow buttons only? | Focus a tile at the row's right edge, call `scrollIntoView({inline:"center"})` | row scrolling strategy |
| U3 | Is there a "Continue Watching" row, and does its tile link resume (`initial_time`)? | Watch half an episode, reload `/browse` | resume behaviour, hint text |
| U4 | ~~Player frame DOM / control bar selectors~~ — **answered 2026-09-23** from the saved `embed.vhx.tv` document. `.vp-controls` is the bar and holds 6 buttons + the gear popover; the **play button is outside it**, in `ControlBar_module_controlBarWrapper__`. The control-bar buttons carry **no `aria-label`** — they are `#cc-control-bar-button` (also `.cc`, `[data-cc-button]`), `#prefs-control-bar-button` (`.vp-prefs`), `#transcript-control-bar-button`, `#pip-control-bar-button` (`.pip`), `#fullscreen-control-bar-button` (`.fullscreen`), plus an unnamed mute button whose label flips Mute/Unmute. Every focusable control also carries `shared_module_focusable__…` and `tabindex="0"` | — | closed |
| U5 | Does Vimeo's runtime handle Space/arrows/`c`/`m` itself when the frame has focus? Does it fight our handlers? | Focus the iframe, press keys, watch | which keys we must `preventDefault` |
| U5a | **Partly answered 2026-09-23**: browse tiles bind their own `onKeyDown` on the `<a>`. Our capture-phase `keydown` + `stopImmediatePropagation()` is what keeps them from fighting us — do not move to the bubble phase | — | partly |
| U6 | ~~`OTTData.up_next` filled and its shape~~ — **answered 2026-09-23**: present in the embed document as `up_next: { url: "https://watch.dropout.tv/<series>/season:N/videos/<slug>" }`. `normalizeUpNext()` handles it | — | closed |
| U7 | ~~Up-next overlay selector~~ — **answered 2026-09-23**: there is no `.ott-up-next`. Vimeo's end screen is `div.Outro_module_outroWrapper__….vp-outro-wrapper`, with `div.Outro_module_outro__…[role="dialog"]` inside. While not offered it also carries `Outro_module_inactive__…`, which the player stylesheet sets to `display: none` — so a visibility check gates the state and no `:not()` guard is needed. **Still open**: whether Dropout populates it at all, and what the button inside it is | Let an episode end | partly |
| U8 | ~~`data-sticky-player`~~ — **answered 2026-09-23**: the wrapper is `div.embed[data-sticky-player]` inside `#watch-player`, and the iframe is `#watch-embed.sticky-player-child`. The shrink-on-scroll class itself is still unseen | Scroll the video page | partly |
| U9 | Does any site script listen to `keydown` globally (search shortcut, carousel keys)? | `getEventListeners(window)`/`document` in devtools | capture-phase handling |
| U10 | ~~Related items under the video~~ — **answered 2026-09-23**: `data-similar-items-site` is on the **`<a>` itself** (`a.meta-data-link[data-similar-items-site]`, `href="#"`), not on a container, so `[data-similar-items-site] a[href]` matched nothing. They are inside `#watch-info`, so `#watch-info a[href]` already reached them | — | closed |
| U11 | Cookie consent dialog: markup, and can Enter on its buttons dismiss it? | Fresh profile, first visit | modal rules |
| U12 | Login page fields and whether reCAPTCHA Enterprise challenges a kiosk profile | Log in once in the dev profile — **by hand, never in chat** | The HTPC shell S08 login notes |
| U13 | Postmessage API behind `api=1`: Player.js protocol (`{context:"player.js", method:"play"}`)? | `iframe.contentWindow.postMessage(...)` from the page console | secondary control path |
| U14 | Firefox `--kiosk`: does closing the only tab (`tabs.remove`) end the process cleanly, with no restore prompt next start? | The HTPC shell S08 | exit hook |

## Reproducing the verified findings

Run from any shell (no login needed; output is HTML):

```sh
UA='Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0'
curl -sL -A "$UA" https://watch.dropout.tv/series               -o series.html
curl -sL -A "$UA" https://watch.dropout.tv/game-changer         -o show.html
curl -sL -A "$UA" https://watch.dropout.tv/game-changer/season:1/videos/whodunnit -o video.html
curl -sL -A "$UA" 'https://embed.vhx.tv/videos/612228?api=1&autoplay=0' -H 'Referer: https://watch.dropout.tv/' -o embed.html

# every selector the rules file uses should hit at least once on the page kind it belongs to
grep -c 'browse-item-card' series.html show.html
grep -o 'js-switch-season\|js-sort-items\|js-load-more-items-container\|data-sticky-player\|watch-unauthorized' show.html video.html | sort | uniq -c

# class names the browse rows will use (client-rendered, so read them from the bundle)
bundle=$(grep -oE 'https://cdn\.vhx\.tv/assets/webpack/browse-ottbundle-[a-z0-9]+\.js' series.html | head -1)
curl -sL -A "$UA" "$bundle" | grep -oE 'className:"[^"]+"|"data-testid":"[^"]+"' | sort -u
```

The bundle file names carry a content hash and change with every deploy; read
them from the page rather than hard-coding.

## Selector audit — 2026-09-23

Every selector in `sites/dropout.json` run against fresh logged-in captures of
the series page (`/game-changer`), an episode
(`/game-changer/season:1/videos/…`), the search page and the `embed.vhx.tv`
player document. Counts are matches in that saved markup.

### Confirmed

| Where | Selector | Matches |
|---|---|---|
| `common.header` | `.site-header` | 1 |
| `common.focusable` | `.site-header a[href]` | 16–17 |
| `series.focusable` | `select.js-switch-season`, `select.js-sort-items`, `a.custom-btn-action-trailer` | 1 each |
| `series.episodeLinks` | `.episode-container .browse-item-card a.browse-item-link` | 5 |
| `video.theaterRoot` / `playerMount` / `playerFrame` | `#watch-player…` | 1 each |
| `video.seriesLink` | `.series-title a.context-link` | 1 |
| `video.focusable` | `#watch-info a[href]` 39, `a[data-similar-items-site]` 17 | |
| `player.transport` | `.vp-controls` | 1 |
| `player.captionsButton` | `#cc-control-bar-button` | 1 |
| `player.upNextOverlay` | `.vp-outro-wrapper` | 1 (in the frame) |

### Corrected

- **The search page renders entirely in React.** Neither a "Save Page As →
  Web Page, complete" nor a view-source capture contains its field or its
  results — both hold only the server shell. The selectors now come from the
  site's own shipped CSS and script bundles, where the CSS-module classes are
  **unhashed** and so can be matched exactly:
  `.SearchForm-module__search-input` (also `custom-css-search-input`),
  `.SearchForm-module__search-form-container`,
  `.Filters-module__filters-toggle`, `.Filter-module__filter`,
  `.Filter-module__load-more`, `.BlankSearchResults-module__no-results`.
  Results reuse the browse tile (`.browse-item-card` → `a.browse-item-link`).
  **Note the two conventions**: this site uses `Name-module__thing` with no
  hash; the Vimeo player uses `Name_module_thing__<hash>` and must be matched
  by prefix.
- `pages.video.upNextOverlay` matched nothing on the page and 1 in the frame —
  the outro belongs to the player, not the page.

### Not matched, and why that is expected

- `common.modals` (`.reveal-modal.open`) and `video.unauthorized` only exist
  while a modal is open or a video is barred.
- `series.loadMore` — the page captured has five episodes and no more to load.
  The container (`.js-load-more-items-container`) is there; the link is not.
  **Still unverified.**
- `.promo-banner` in `video.theaterHide` matched nothing; harmless, kept.

### The player's own controls

`.vp-controls` holds, in order: volume, `#cc-control-bar-button`,
`#prefs-control-bar-button`, `#transcript-control-bar-button`,
`#pip-control-bar-button`, `#fullscreen-control-bar-button`. The ids are
unhashed and are the reliable hooks. **There is no play/pause button in the
bar** — the overlay play button sits outside it. There is no timecode in it
either.

The gear popover is `.vp-menu[data-menu="prefs"]`, a **child of
`.vp-controls`**, holding `[role="menu"]` with entries marked
`[data-menu-item="true"][data-menu-option="true"]`; each carries a label span
and a value span (`Text_module_text…`). Those data attributes are unhashed and
are what the settings and captions panels read.

**No seek-preview thumbnails exist.** The bundle has no storyboard, sprite or
frame index; `config.video.thumbnail_url` is a single imgix poster, and the
`ThumbnailPreview` component shows a timecode over it. Captions *are* native:
the bundle uses `addTextTrack`, `VTTCue` and `cuechange`, and the `<video>`
carries a real `<track>` child.

### How to capture a page that renders in React

"Save Page As" writes the served HTML, not what is on screen. Use DevTools →
Inspector → right-click `<html>` → **Copy Outer HTML**, and paste that into a
file. For the player, open the frame on its own first (right-click inside it →
**This Frame** → **Show Only This Frame**).

## The player's settings menu — verified 2026-09-24

Captured from the live player with [Leanback Dev Probe](../../leanback-dev-probe/),
walking the whole tree. This is the most detailed part of these notes because it
is the one piece of the player the extension still drives rather than replaces.

### The popover

`div.vp-menu.PopoverMenu_module_menu__…[data-menu="prefs"]`, a **child of
`.vp-controls`**, five levels down.

It is always in the DOM. Closed, it carries an inline
`style="opacity: 0; height: 0px; max-height: 0px; …; display: none;"`; open, an
inline `opacity: 1` and a pixel height that changes per panel. So:

- **Reading its contents does not require opening it** — the entries are there
  either way. That is why the settings panel can populate itself quickly.
- **`element.hidden` is false even when it is closed.** Anything deciding
  whether the menu is "up" must look at computed `display`, not the `hidden`
  attribute. (The probe's `menuIsUp()` checks for entries instead, which works
  because a closed menu still has the root entries in it — a weaker test than it
  looks. Worth tightening.)

Inside: `div.PopoverMenu_module_menuBody__…` → `div.PopoverMenu_module_menuPanel__…[role="menu"][aria-label="Settings"]`.

### The header, on every panel below the root

Once you drill in, a header appears **above** `menuBody`:

| Part | Selector |
|---|---|
| Wrapper | `div.MenuHeader_module_menuHeader__…`, plus `MenuHeader_module_hasBack__…` when there is a back |
| Back | `button[aria-label="Back"].MenuHeader_module_backButton__…` |
| Title | `h2.MenuHeader_module_title__…` — the panel's name |
| Close | `button[aria-label="Close menu"].MenuHeader_module_closeButton__…` |

**The Back button is the right way out of a submenu.** Closing the whole popover
and reopening it at the root — which is what `content/transport.js` does today —
works but loses the position and costs a redraw. `aria-label="Back"` is stable
and unhashed.

### The tree

```
Settings (root)
├── Quality            value: e.g. "1080p"
├── Speed              value: e.g. "Normal"
└── CC/subtitles       value: e.g. "Off"
    ├── Off                       role=menuitemradio  data-id="off"
    ├── English CC                role=menuitemradio  data-id="7409703"
    └── Customize
        ├── Font
        │   ├── Family            accordion: 7 options
        │   ├── Color             8 swatches
        │   ├── Size              50% / 100% / 150% / 200%
        │   ├── Opacity           25% / 50% / 75% / 100%
        │   ├── Edge style        accordion: 5 options
        │   └── Reset all
        ├── Background            (same shape: colour + opacity)
        ├── Window                (same shape: colour + opacity)
        └── Reset all
```

`data-id` on the caption track entries is the **track's numeric id**, and it
matches the `<track id="telecine-track-7409703">` on the `<video>`. So a track
can be identified either from the menu or from the media element.

### The four kinds of row, and how to tell them apart

Everything selectable carries `data-menu-option="true"`. Beyond that:

| Kind | Selector | Label from | State from |
|---|---|---|---|
| Drills into a submenu | `div[role="menuitem"][data-menu-item="true"][aria-haspopup="true"]` | `span[class*="MenuItem_module_label"]` | value in `span[class*="MenuItem_module_value"]` |
| Pick-one in a list | `div[role="menuitemradio"][data-id="…"]` | `span[class*="MenuOptionListItem_module_text"]` | `aria-checked`, plus `MenuOptionListItem_module_active__…` |
| Colour swatch | `li[role="radio"][data-id="#fff"]` in `ul[class*="ColorSwabs_module"]` | **`aria-label`** ("White", "Yellow", …) | `aria-checked` |
| Value in a row | `li[role="radio"][data-id="1.5"]` in `ul[class*="ButtonRow_module"]` | `span[class*="ButtonRow_module_label"]` | `aria-checked` |

Plus `button[role="menuitem"][class*="ResetButton_module"]` — "Reset all".

**Two traps for anything reading this menu flat:**

1. **Accordions hide their options with the `hidden` attribute.** A collapsed
   accordion (`div.Accordion_module_accordion__…[role="group"]`, header
   `div[role="button"][aria-expanded="false"]`, content
   `div.Accordion_module_content__…[role="menu"][id="…-accordion"]`) still has
   every option in the DOM, each `hidden` with `tabindex="-1"`. Reading them
   without filtering `[hidden]` produces a list of things that are not on
   screen. Expanded, `hidden` goes, `tabindex` becomes `0`, `aria-expanded`
   becomes `true` and the content gets an inline `height`.
2. **Group labels are not menu items.** "Color", "Size", "Opacity" live in
   `div[class*="MenuFieldLabel_module_menuField"]` → `span#vp-cc-font-color-label`
   (and `-size-`, `-opacity-`), referenced by the group's `aria-labelledby`.
   They carry no `data-menu-option`, so a flat read drops them — and without
   them a list reads "White, Yellow, … 50%, 100%, … 25%, 50%" with nothing
   saying which is which. Use the `aria-labelledby` on each
   `[role="radiogroup"]` to recover the heading.

### Known values

| Group | `data-id` values |
|---|---|
| Font family | `monospace_serif`, `proportional_serif`, `monospace_sans_serif`, `proportional_sans_serif` (default), `casual`, `cursive`, `small_capitals` |
| Font colour | `#fff` (default), `#ff0`, `#0f0`, `#0ff`, `#00f`, `#f0f`, `#f00`, `#000` |
| Font size | `0.5`, `1` (default), `1.5`, `2` |
| Opacity | `25`, `50`, `75`, `100` (default) |
| Edge style | `none` (default), `shadow`, `raised`, `depressed`, `outline` |

### What this means for `content/transport.js`

Not yet acted on — recorded so the next session starts from fact rather than
from the menu again:

- The **Closed Captions** row opens `CC/subtitles`, which is a mixed panel: two
  radio entries and a `Customize` item. The panel renders it flat today, which
  is correct but loses the divider between "which track" and "how it looks".
- **`[hidden]` options must be filtered**, or Font's accordions will pour seven
  families and five edge styles into the list whether or not they are showing.
- **Group labels should be carried**, or Colour/Size/Opacity become
  indistinguishable runs of radio buttons.
- **`button[aria-label="Back"]` should be preferred** over closing and reopening
  the popover when leaving a submenu.
- Everything selectable has `data-menu-option="true"`, so that is the one
  attribute worth keying on; `data-menu-item="true"` marks only the rows that
  drill in.

### The gear that opens it

`#prefs-control-bar-button`, which also carries `.vp-prefs`,
`[data-prefs-button="true"]`, `PrefsButton_module_prefsButton__…`,
`aria-haspopup="true"` and an `aria-expanded` that is **cleared while a submenu
is showing** — so `aria-expanded` is not a reliable "is the menu open" signal.
Its tooltip reads "Settings".

### How to capture more of it

Load [Leanback Dev Probe](../../leanback-dev-probe/), turn **Pin** on, walk the
menu, then copy the **Markup** tab. Captures accumulate, one per press. "Save
Page As" cannot do this: it writes the HTML that was served, not what is on
screen.
