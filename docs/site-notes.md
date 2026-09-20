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
| `/login`, `/checkout/...`, `/contact/...`, `/privacy` | `other` | TV Mode stays passive: focus ring and Escape only. |

## Verified DOM

### Header (every page)

`.site-header` > `.navigation-container` with `a.browse-link` ("Browse"),
`a.search-link`, `.user-actions` (sign-in / account), `.show-menu-trigger`
(mobile). A `.promo-banner` with `.js-banner-close` may appear at the top.

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

| # | Question | How to check | Affects |
| --- | --- | --- | --- |
| U1 | Exact tile markup inside `.horizontal-row-item` on `/browse` — is the focus target an `<a href>` or a clickable `<div>`? | Devtools on `/browse`, inspect one tile | `sites/dropout.json` `tile`/`focusable` for `browse` |
| U2 | Do rows scroll natively or by arrow buttons only? | Focus a tile at the row's right edge, call `scrollIntoView({inline:"center"})` | row scrolling strategy |
| U3 | Is there a "Continue Watching" row, and does its tile link resume (`initial_time`)? | Watch half an episode, reload `/browse` | resume behaviour, hint text |
| U4 | Player frame DOM: `<video>` present in the embed document? Vimeo control bar selectors (`.vp-controls`?) | Devtools → frame picker → `embed.vhx.tv` | `content/player.js` |
| U5 | Does Vimeo's runtime handle Space/arrows/`c`/`m` itself when the frame has focus? Does it fight our handlers? | Focus the iframe, press keys, watch | which keys we must `preventDefault` |
| U6 | `OTTData.up_next` filled when playing an episode with `collection_id`? Shape? | Console in the frame: `OTTData.up_next` | next/previous episode |
| U7 | Does the site autoplay the next episode itself (OTT "up next" overlay)? Selector of the overlay/countdown? | Let an episode end | avoid double-advance; focus the overlay's buttons |
| U8 | `data-sticky-player`: does the player shrink into a corner on scroll, with which class? | Scroll the video page | CSS override when leaving theater layout |
| U9 | Does any site script listen to `keydown` globally (search shortcut, carousel keys)? | `getEventListeners(window)`/`document` in devtools | capture-phase handling |
| U10 | Related items under the video (`[data-similar-items-site]`) — markup once rendered | Devtools on a video page | `video` page focusables |
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
