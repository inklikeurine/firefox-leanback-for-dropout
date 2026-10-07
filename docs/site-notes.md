# Site notes — how watch.dropout.tv is built

What the extension relies on, checked against logged-out fetches (commands at
the end) and against captures of the logged-in site made with
[Leanback Dev Probe](../../leanback-dev-probe/). The class names are Vimeo
OTT's and are shared by every Vimeo OTT site, which makes them more stable than
Dropout-specific markup would be.

**Two naming conventions.** The site's own React code uses
`Name-module__thing`, unhashed, so it can be matched exactly. The Vimeo player
uses `Name_module_thing__<hash>`, and the hash changes when Vimeo deploys, so
it is matched by the `Name_module_` prefix.

## Hosts

| Host | Role | Extension involvement |
| --- | --- | --- |
| `www.dropout.tv` | Marketing site. `/browse` there 302-redirects to `watch.dropout.tv/browse`. | Root-only forward to `/browse` (setting) |
| `watch.dropout.tv` | The app — a **Vimeo OTT** site (assets `cdn.vhx.tv`, config `window.VHX.config`) | Page content script |
| `embed.vhx.tv` | The **player iframe**, injected by the page's JS at runtime | Player content script (`all_frames: true`) |
| `cdn.vhx.tv`, `vhx.imgix.net` | JS bundles, images | Home's cards show pictures from `vhx.imgix.net`: the ones the tiles show, and a show's wide picture from its tile's data |
| `api.vhx.tv`, `api.vhx.com`, `auth.vhx.com` | Site API (used by the page's own JS) | none — the extension makes no requests; pressing Home's *Show more* makes the page ask for more rows, as scrolling does |
| `collector.vhx.tv` | The player's viewing reports | none |
| `f.vimeocdn.com`, `player.vimeo.com` | Vimeo's player runtime and per-clip config, loaded inside the embed frame | none |
| `www.google.com/recaptcha/enterprise.js` | reCAPTCHA Enterprise, loaded on the page shell (login) | risk for kiosk login |
| `global.ketchcdn.com` | Cookie consent (Ketch) | consent dialog must be closable by keys |

## Routes

| URL pattern | What it is | Page kind in `sites/dropout.json` |
| --- | --- | --- |
| `/browse` | Home: a banner and rows (React) | `browse` — Leanback draws its own Home from it |
| `/series` | All series, a server-rendered grid with Show More | `grid` |
| `/new-releases`, `/trending`, `/<row>-new`, `/collections/…` | A collection (Dropout calls it a category): a server-rendered grid of episodes, of shows, or of both shows and specials. Every Home row's *View all* leads to one | `grid` for `/collections/…`; the others fall to `series`, where `content/show.js` sees a **list**; both are drawn by `content/screen.js` |
| `/dimension-20`, `/dropout-24-7` | A hub: a small Home-style page with its own rows | `hub` — a one-segment address whose page holds `#browse-component`; drawn like Home |
| `/<hub>/events/<slug>` | A live event, with the live player (Dropout 24/7: `/dropout-247/events/dropout-24-7`) | `video` — the player in `section#live-event` (theater root), the page under it drawn by `content/screen.js` |
| `/<series-slug>` | A show: details, season and sort selects, episode grid, opened on Season 1 | `series` — a **show**, read by `content/show.js` and drawn by `content/screen.js`; Leanback moves on to the newest season |
| `/<series-slug>/season:<n>` | Same page, another season (`?sort=alphabetical\|release_date` also seen) | `series` — a **show** |
| `/<special-slug>` | A special (stand-up, a film): *Watch Movie*, the video and its Extras | `series` — a **special**, read by `content/show.js` and drawn by `content/screen.js` |
| `/<series-slug>/season:<n>/videos/<episode-slug>` | Episode page | `video` — the player, then the page under it drawn by `content/screen.js` |
| `/<series-slug>/videos/<slug>`, `/videos/<slug>`, `/featured/videos/<slug>` | Trailer or standalone video | `video` |
| `/search` | One React app that changes the address without reloading; `document.title` is empty | `search` — drawn by `content/screen.js`, with the rail |
| `/my-list` | Loaded fresh: a server-rendered collection grid (`li.js-collection-item › .browse-item-card a.browse-item-link`, Dropout's *Remove from my list* button inside the link). Reached from `/search` inside the React app, the address changes and the search results can stay on screen | `grid` (with the rail); the rail opens it with a fresh load |
| `/login`, `/checkout/…`, `/contact/…`, `/privacy`, `/settings`, … | Account and legal pages | `other` — the extension stays passive |

## Pages

### Header (every page)

`.site-header` > `.navigation-container` with `a.browse-link` ("Browse"),
`a.search-link`, `.user-actions` (sign-in / account), `.show-menu-trigger`
(mobile). A `.promo-banner` with `.js-banner-close` may appear at the top. The
footer (`footer.footer--site`) holds Contact Us, Data Preferences, Help, Terms,
Privacy, Cookies, Manage Cookie Preferences, Log out and the language switch.

### Site-wide CSS that reaches Leanback's elements

Dropout's stylesheet (`sites-ottbundle-*.css`) styles every element of its
kind, Leanback's included, since Leanback's elements live in the same page:

- `a:link, a:visited { color: #22b9b0 }` — every link teal.
- `button { background-color: #008cba; border-radius: 3px; transition:
  background-color .3s }` and `button:hover, button:focus { background-color:
  #007095 }` (Foundation's) — every button blue, darker on hover and focus.
  The state rule outranks a single class selector.

Leanback pins the colours that matter on its own links and buttons, in every
state, with `!important`.

### Home (`/browse`)

The header is server-rendered; everything below it is one React tree in
`div#browse-component`.

```text
#browse-component[data-props]                            ← data-props: the first four rows' definitions (JSON)
  .carousel                                              ← the banner: ten slides
    .slide
      .slide-bg-img-wrapper a[href] > img.slide-bg-img   ← the slide's picture (srcset 1920w/3840w)
      .featured-carousel-slide[data-testid="featured-carousel-slide"]   ← .hidden unless current
        .slide-title, .slide-subtitle ("25 seasons"), .slide-description
        .slide-buttons
          a.btn.slide-button[href="/<series>"]           ← "Watch now"
          a.btn.slide-button.slide-button--alt[href="/videos/<trailer>"]   ← "Trailer", when there is one
          button.slide-button.slide-button--alt.slide-button--my-list.icon-watchlist-add[aria-label="Add to my list"]
    .coin, .coin.active                                   ← one dot per slide
  .browse-rows
    .row.browse-row.<row-slug>
      .horizontal-row-container.row-head
        .horizontal-row-header a                          ← the row's title, a link to its collection
        a.view-more-link                                  ← "View all", the same address
      .horizontal-row-container.horizontal-row           ← the row: a slick slider
        .slick-slide[.slick-cloned] › .horizontal-row-item[data-testid="browse-card"]   ← ONE TILE
          .browse-item-card.item-type-<series|video|movie|playlist|live_event>
            .browse-item-title
              div.inline-block[data-testid="browse-list-toggle"]
                button.icon-only.icon-watchlist-add[aria-label="Add to my list"]     ← or -remove / "Remove from my list"
              a[href]                                     ← the tile's link
                .browse-image-container                   ← + .aspect_ratio_2_3 on a show's tile
                  img[src][alt]                           ← not lazy-loaded; a show's is a tall poster (?ar=2:3)
                  [data-testid="thumbnail-badge-0"]       ← "New" / "New Episode", when there is one
                  .duration-container                     ← "1:45:05", "06:03"
                  .percentage-bar[data-testid="play-state-percentage-bar"][style="width: N%"]   ← Dropout's progress
                .subtext-container .truncate, .browse-item-subtext   ← title; "2 videos" / "9 seasons" / empty
          .tooltip                                        ← hover tooltip: title and description
  .see-more-row.see-more-row--show > button "Show more"  ← --hide once every row is drawn
```

- **Rows arrive four at a time**, from the site's API: three are drawn at
  first, more as the page is scrolled or *Show more* is pressed. Pressed
  enough, every row of the hub is drawn (37 in the captures) and the button
  hides (`see-more-row--hide`). Leanback's Home presses it as the selection
  nears the bottom.
- **A row holds at most twelve items**, the first page of its collection. The
  row's title and *View all* link to the collection for the rest.
- **Every item of a loaded row is in the DOM**, on screen or not. The slider
  adds copies of its items at both ends for looping; the copies carry
  `.slick-cloned` and are skipped.
- **Rows move by transform, not native scroll**, so `scrollIntoView` does not
  bring an off-screen tile into view. Leanback's own Home does not need them;
  when Home cannot be drawn, the extension clicks the row's own arrow controls
  (`scrollNext` / `scrollPrev` in the rules).
- `data-props` on the root lists only the first page of row definitions
  (with `items_count` per row) and no progress dates; Leanback does not read
  it.
- **Progress** is drawn on a tile when Dropout has any for it; the width is
  the fraction watched. It comes from the Roku and Android apps: playing in
  Firefox does not update it. There is no date on it.
- **A show's tile shows a tall poster** (`aspect_ratio_2_3`). The wide 16:9
  picture its own page uses is not in the markup: it is in the data the tile
  was drawn from, the props of the React component that renders
  `.horizontal-row-item` (`data.thumbnail.medium`, 640×360; `data` also holds
  `additional_images` for other shapes). An episode's tile is already wide.
- **Row titles are Dropout's own wording**, "My list" included.
- **My List** toggles in place, with no reload, and swaps
  `icon-watchlist-add` ↔ `icon-watchlist-remove` and its label.
- **Dropout's own Continue Watching row** appears on the website only for
  videos started on its Roku or Android app: an ordinary row titled
  "Continue Watching", with *View all*. When there is none in progress there,
  the rows start with My list. Its *View all* address is not in any capture
  (only a screenshot shows the row); the rules hide it by the address
  `/continue-watching`, Dropout's page of that name, and by its heading.
- Below the last row there is only the footer.

### All series (`/series`)

```text
.collections .collection-container
  .js-load-more-items-container            ← the <ul> of tiles (60 on the first page)
    .browse-item-card                       ← ONE TILE
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
.row.loadmore > div > a.js-load-more-link[data-load-more]    ← "Show More": adds 60
    [data-load-more-target="js-load-more-items-container"]
    href="/series?page=2"
```

The Show More control is a **sibling** of the tile list, not inside it; a
selector inside the list matches tile links instead.

### Collections and hubs

`/new-releases` and `/trending` are server-rendered grids of the collection
(the same tile as above), with no Show More when the collection fits.
`/dimension-20` and `/dropout-24-7` are hubs: a `#browse-component` page like
Home, titled "Browse - Dropout", with their own rows and banner.

### Pages at a one-word address: shows, specials, lists

The address says nothing about what the page is; the page does. Four kinds
share it (2026-09-27 captures of 23 such pages):

| Kind | Examples | What marks it | `body[data-track-event]` |
| --- | --- | --- | --- |
| Show | `/game-changer`, `/dimension-20-s-adventuring-party` | `section.episode-container`; `select.js-switch-season` | `site_series` |
| Special | `/aparna-nancherla-hopeful-potato` | `section.movie-container` + `section.extras-container`; `a.custom-btn-action-primary` "Watch Movie" | `site_movie` |
| List | `/trending`, `/new-releases`, `/game-changer-new`, `/trailers`, `/all-series` | `section.collection-container` | `site_category` |
| Hub | `/dimension-20`, `/dropout-24-7` | `#browse-component` | empty |

`sites/dropout.json → pages.series.show.layouts` keys on the sections.
`data-track-event` is an analytics tag, a cross-check only. A hub can also be
a show elsewhere: *All Series* lists "Dimension 20 · 31 seasons", but
`/dimension-20` is a hub, so the hub test comes first. Shows with one season
exist (Thousandaires, Nobody Asked, Toonout); none has been captured, so
whether Dropout draws a one-option season control is not known — Leanback
draws no row under two seasons either way.

**A show** (`/<series-slug>`):

```text
body.collections.collections-show
  section.product-feature
    .collection-details-container .collection-details
      h1.collection-title, .collection-description ([data-truncate] show more/less)
      h2.collection-stats                                   ← "25 Seasons"
      .show-for-small-only.cover-art img[data-image-primary]  ← the cover picture, 640 × 360 (phone copy), before the title
      h1.collection-title …
      .collection-actions
        a.btn.custom-btn-action-trailer                     ← some shows only; opens #modal-trailer
        button.my-list.btn.custom-btn-action-my-list.icon-watchlist-add[data-series-id]
                                                            ← .icon-watchlist-remove while on My List
        a.btn.custom-btn-action-share + div.reveal-modal    ← Share and its dialog (its links are .btn too)
    .hide-for-small-only.cover-art img[data-image-primary]  ← the same picture, 1280 × 720: the LAST match
  section.episode-container
    .season-controls
      select.js-switch-season   ← options oldest first: value="https://watch.dropout.tv/<slug>/season:N", one [selected]
      select.js-sort-items      ← Sort by… | Alphabetical | Release date (?sort=)
      h2.content-label          ← "18 Episodes"
    .item-grid ul.js-load-more-items-container
      li.js-collection-item[data-item-type="video"][data-item-id]
        .browse-item-card .grid-item-padding
          a.browse-item-link[href="…/season:N/videos/<episode-slug>"]
            .browse-image-container.aspect_ratio_16_9
              button.my-list[data-video-id]                  ← per episode, opacity 0 until hover
              img, span.play-outer-circle
              .browse-info-container
                .duration-container                          ← "1:29:06"
                .percentage-bar-container .percentage-bar[style="width: N%"]   ← Dropout's progress (Roku, Android), when there is any
          .padding-small
            .browse-item-title a strong                      ← the title
            .browse-item-subtext .media-episode              ← "Episode 1"
```

Seasons are pages of their own. The bare address is Season 1 (its option
`[selected]`). Names vary by show: "Season 1", or `Season 1: All About "A
Crown Of Candy"` — only the text before the colon is shared. Episodes are in
Dropout's order, Episode 1 first. The site navigates when a select's value
changes (`onchange` → the option's URL). The show's header background is its
art blurred (`?blur=180`).

**A special**: `.collection-actions` holds `a.btn.custom-btn-action-primary`
("Watch Movie", the video's address), `button.custom-btn-action-my-list`
(`[data-movie-id]`, `.icon-watchlist-remove` while on My List) and Share;
the cover picture is as on a show; `section.movie-container` holds the one video
and `section.extras-container` (heading "Extras") the rest.

**A list**: `section.collection-container`, 24 tiles then
`a.js-load-more-link`. Tiles are `li.js-collection-item[data-item-type]`:
`video`, `series` or `movie`. No My List button, no trailer; only Share.

### Video page (`/<series>/season:N/videos/<episode>`)

```text
meta[property="og:image"][content]                   ← the episode's picture (1280×720) — kept in the watch history
.videos-show
  #preview-notification.preview-notification        ← "Live stream preview" (live events only)
  #watch-player.top-container.background-black
    .embed[data-sticky-player]                       ← PLAYER MOUNT
      iframe#watch-embed.sticky-player-child[src="https://embed.vhx.tv/videos/<id>?api=1&auth-user-token=…&autoplay=1&…&up_next_*=…"]
      #watch-unauthorized.embed-content              ← logged-out placeholder ("Watch this video and more on Dropout")
  #watch-info
    h3.series-title a.context-link[href="/<series>"] ← back to the series
    h1.collection-title.video-title strong           ← the episode's title
    h5.badges-container
      a[href="…/<series>/season:N"] "Season N, Episode M"  ← show, season and episode, even at /videos/<slug>
                                                     (another link to the season page reads just "Season N")
      • a.meta-data-link "28-Feb-2020"                ← the release date
    meta[property="og:url"]                          ← "/<series>/season:N/videos/<slug>": show and season
    .read-more-wrap[data-truncate] > p               ← the description; tags follow in .meta-data-info
    .video-content-actions
      button.my-list.custom-btn-action-my-list[data-video-id]   ← toggles in place (.icon-watchlist-remove), like the series button
    .share-tools                                     ← share buttons
    h3.head.secondary "Up Next in <a>Season N</a>"   ← then a ul of li.js-collection-item tiles (the series tile markup;
                                                       Dropout's bar on a watched one): the next episodes, 3 in the capture
    a.meta-data-link[data-similar-items-site][href="#"]   ← related items (the attribute is on the <a>)
  #modal-trailer.reveal-modal.large[data-reveal]
    .embed[data-vimeo-player][data-trailer-url="https://embed.vhx.tv/videos/<id>"]
    a.close-reveal-modal
```

Leanback draws the page under the player from these parts (`screen.episode`
in the rules) and docks `#watch-player` over its own screen by style.
`window.VHX.config.embed_url` holds the player URL; `window.COMMENTABLE_ID` is
the video id. The history keeps the episode's `.video-title`, the
`.series-title` text and `og:image`, keyed by the slug after `/videos/`, which
is the same in this address, in Home's tile links and in the player's
`OTTData.video.url`. The player address carries the next episode as `up_next_url`,
`up_next_title`, `up_next_thumbnail_url`, `up_next_rating` and
`up_next_offset_seconds`.

### A live event (`/<hub>/events/<slug>`)

Dropout 24/7's stream (2026-10-03 capture). The hub page `/dropout-24-7`
holds a single *Live now* banner and no rows; its *Watch* opens this page.

```text
section#live-event.top-container                     ← THEATER ROOT
  .embed.live-event-player
    iframe#watch-embed[src="https://embed.vhx.tv/videos/<id>?…&live=1…"]
section#watch-info
  h1.collection-title.live-event-title strong        ← "Dropout 24/7"
  #live-status-text                                  ← scheduled/live status (empty in the capture)
  .live-event-description > p                        ← the description; a second p links the FAQ
  .share-tools                                       ← share buttons
```

No season line, show link, My List or Up Next. The player reports a live
video (`is_live_video`), which the watch history leaves out.

### Search and My List (`/search`, `/my-list`)

One React app (`#search-react-app`, present on every page as the search
overlay) that changes the address without reloading, and can leave the
previous results on screen after an address change. On `/search` itself it is
**not** the overlay (its props say `overlay: false`; no
`Search-module__overlay`, so not `position: fixed`): it is part of the page.

```text
.Search-module__content-container.Search-module__show   ← padding 32px 200px from 1250 px wide
  .Search-module__search-container
    .SearchForm-module__search-form-container > input.SearchForm-module__search-input
    .Search-module__results-content-container
      .SearchResults-module__search-results-container
        .TypeFilters-module__type-filters-container
          button.TypeFilters-module__type-filter[data-filter-type="all|video|collection"]   ← "All (20)"; .TypeFilters-module__selected on the one on screen
        ul.SearchResults-module__search-results       ← flex, wrapping
          li.SearchResults-module__search-result       ← width 20 % (25 % with filters) from 1250 px
            .horizontal-row-item › .browse-item-card    ← the React tile, margin 0 3 %
              a[href]                                   ← NO class: the tile's link
                .subtext-container .truncate, .browse-item-subtext
        button.SearchResults-module__load-more          ← "Load More"
```

So at 1280–1920 px a result picture is about 150–250 px wide in a centred
column. Leanback draws its own search screen from these parts
(`screen.search`, below). The React tile's link has no
class, so the rules' `target` for search is `a.browse-item-link, a[href]`.
`h3.BlankSearchResults-module__no-results` ("Start typing to see results",
2026-09-27 capture) is the empty state: with nothing typed, the filters, the
list and Load More are all gone. Leanback's search box types into
`input.SearchForm-module__search-input`. The rules also
list `.Filters-module__…` / `.Filter-module__…`, which the captured pages do
not use, in case a page does. The My List page reuses the same results.

## The player frame (`embed.vhx.tv/videos/<id>`)

The document is a small shell: `<div id="app">`, Vimeo's **standard player
runtime** (`f.vimeocdn.com/p/<version>/js/player.js` and its CSS), an OTT
wrapper (`cdn.vhx.tv/…/embed-player-*.js`) and `window.OTTData`:

```text
OTTData
  video       { id, title, duration, url, is_live_video, is_trailer }
  up_next     { url, title: "E2, S1 - Game Changer", thumbnail_url,
                offset_seconds: 8, rating, disable_autoplay }   — null when nothing follows
  initial_time
  user        { id, email, profile_id }     — the account (null when logged out)
  config_url, api_data, analytics_url, google_cast_app_id, js_api_enabled, hide_chrome
```

- The `<video>` renders **inside the embed document**, so a content script in
  that frame calls `play()`/`pause()` and sets `currentTime` directly.
- Captions are native: the `<video>` has a real `<track>`, and the player
  manages its own caption state (setting a `TextTrack`'s mode draws nothing).
- There are no seek-preview thumbnails: no storyboard or frame index, only a
  single poster image.
- The player reports viewing to `collector.vhx.tv/events.gif` (`firstplay`,
  `play`, `pause`, `seeking`, `seeked`, `waiting`, `ended`, and `timeupdate`
  every 10 s). Playback in Firefox is not recorded in Dropout's watch history;
  the progress drawn on tiles comes from the Roku and Android apps.
- Autoplay starts muted (Firefox's policy), and the player shows an Unmute
  button.

### Player chrome

```text
.ControlBar_module_controlBarWrapper__…
  .PlayButton_module_playButtonWrapper__…        ← play / pause — OUTSIDE the bar
    button.PlayButton_module_playButton__…
  .vp-controls.ControlBar_module_controls__…     ← the control bar
    .vp-progress.ProgressBar_module_…            ← seek bar
      div[role="slider"][aria-label="Progress Bar"]
    .VolumeControl_module_volumeControlContainer__…
      button[aria-label="Unmute"]                ← no id; the label flips Mute/Unmute
    .VolumeControl_module_volumeControl__…[role="slider"]
    button#cc-control-bar-button.cc[data-cc-button][aria-pressed]   ← captions
    button#prefs-control-bar-button.vp-prefs.PrefsButton_module_…   ← settings (gear)
    button#transcript-control-bar-button
    button#pip-control-bar-button.pip[data-pip-button]
    button#fullscreen-control-bar-button.fullscreen.FullscreenButton_module_…
    .vp-menu.PopoverMenu_module_menu__…          ← the gear's popover, INSIDE the bar
.vp-sidedock.SideDock_module_root__…
.vp-title.Title_module_title__…
#right-content-area › .AIWidget_module_aiWidget__…[aria-label="Ask Vimeo AI"]
```

- **The control-bar buttons have no `aria-label` of their own.** They are
  matched by id, by their short marker class (`.cc`, `.pip`, `.fullscreen`,
  `.vp-prefs`) or by `[data-cc-button]` / `[data-pip-button]`.
- **The play button is outside `.vp-controls`**, so hiding the bar alone leaves
  it over the picture.
- **The gear has no label of its own** (it is on the popover it opens), so
  anything matching it must look at its descendants too.
- **Every focusable control carries `shared_module_focusable__…` and
  `tabindex="0"`.**

### The end of an episode

Two things appear, and only one of them has anything in it.

**Dropout's "Next Up" card**, when there is a next episode. It is appended to
the frame's `div#app` `up_next.offset_seconds` (8) before the end, and is not in
the DOM before that:

```text
.ott-up-next > .ott-up-next-container
  .ott-up-next-header
    span.ott-up-next-label "Next Up"
    button.ott-up-next-hide "Hide"
  .ott-up-next-content > a.ott-up-next-thumb-link
    .ott-up-next-thumb (background-image: the next episode's picture)
    .ott-up-next-rating-badge "TV-MA"
    .ott-up-next-play-icon
      svg.ott-up-next-ring › circle.ott-up-next-ring-progress   ← a countdown ring: stroke-dashoffset runs to 0
    h3.ott-up-next-title "E2, S1 - Game Changer"
```

When the ring completes, the page goes to the next episode by itself. Whether
Hide also stops that is not known.

**Vimeo's end screen**, `div.Outro_module_outroWrapper__….vp-outro-wrapper`
with `div.Outro_module_outro__…[role="dialog"]` inside, is always in the DOM and
carries `Outro_module_inactive__…` (`display: none`) until the video ends. It
stays empty, with or without a next episode: the picture darkens, the play
button becomes Replay (`PlayButton_module_replayIcon__…`) and the side dock
gets `SideDock_module_outroVisible__…`.

### The settings menu

The one piece of the player the extension still drives rather than replaces:
the settings panel proxies it (see
[architecture.md](./architecture.md#the-transport-bar-and-the-settings-panel)).

#### The popover

`div.vp-menu.PopoverMenu_module_menu__…[data-menu="prefs"]`, a **child of
`.vp-controls`**, five levels down.

It is always in the DOM. Closed, it carries an inline
`style="opacity: 0; height: 0px; max-height: 0px; …; display: none;"`; open, an
inline `opacity: 1` and a pixel height that changes per panel. So:

- **Reading its contents does not require opening it** — the entries are there
  either way. That is why the settings panel can populate itself quickly.
- **`element.hidden` is false even when it is closed.** Anything deciding
  whether the menu is "up" must look at computed `display`, not the `hidden`
  attribute.

Inside: `div.PopoverMenu_module_menuBody__…` → `div.PopoverMenu_module_menuPanel__…[role="menu"][aria-label="Settings"]`.

#### The header, on every panel below the root

Once you drill in, a header appears **above** `menuBody`:

| Part | Selector |
|---|---|
| Wrapper | `div.MenuHeader_module_menuHeader__…`, plus `MenuHeader_module_hasBack__…` when there is a back |
| Back | `button[aria-label="Back"].MenuHeader_module_backButton__…` |
| Title | `h2.MenuHeader_module_title__…` — the panel's name |
| Close | `button[aria-label="Close menu"].MenuHeader_module_closeButton__…` |

**The Back button is the way out of a submenu**: it keeps the position and
costs no redraw. `aria-label="Back"` is stable and unhashed.

#### The tree

```text
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

#### The four kinds of row, and how to tell them apart

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

#### Known values

| Group | `data-id` values |
|---|---|
| Font family | `monospace_serif`, `proportional_serif`, `monospace_sans_serif`, `proportional_sans_serif` (default), `casual`, `cursive`, `small_capitals` |
| Font colour | `#fff` (default), `#ff0`, `#0f0`, `#0ff`, `#00f`, `#f0f`, `#f00`, `#000` |
| Font size | `0.5`, `1` (default), `1.5`, `2` |
| Opacity | `25`, `50`, `75`, `100` (default) |
| Edge style | `none` (default), `shadow`, `raised`, `depressed`, `outline` |

#### The gear that opens it

`#prefs-control-bar-button`, which also carries `.vp-prefs`,
`[data-prefs-button="true"]`, `PrefsButton_module_prefsButton__…`,
`aria-haspopup="true"` and an `aria-expanded` that is **cleared while a submenu
is showing** — so `aria-expanded` is not a reliable "is the menu open" signal.
Its tooltip reads "Settings".

## Still unknown

| # | Question | How to check |
| --- | --- | --- |
| U5 | Does Vimeo's runtime handle keys itself when the frame has focus, and does it fight Leanback's handlers? | Focus the iframe, press keys, watch |
| U8 | The class the sticky mini-player adds when the video page is scrolled | Scroll the video page |
| U9 | Does any site script listen to `keydown` globally (search shortcut, carousel keys)? | `getEventListeners(window)` / `document` in devtools |
| U11 | The cookie consent dialog's markup, and whether Enter on its buttons dismisses it | Fresh profile, first visit |
| U12 | The login page's fields, and whether reCAPTCHA Enterprise challenges a kiosk profile | Log in once in the dev profile — **by hand, never in chat** |

Browse tiles bind their own `onKeyDown` on the `<a>`. Leanback's capture-phase
`keydown` with `stopImmediatePropagation()` is what keeps them from fighting it;
do not move it to the bubble phase.

## Checking the site again

**Logged out**, from any shell (output is HTML):

```sh
UA='Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0'
curl -sL -A "$UA" https://watch.dropout.tv/series               -o series.html
curl -sL -A "$UA" https://watch.dropout.tv/game-changer         -o show.html
curl -sL -A "$UA" https://watch.dropout.tv/game-changer/season:1/videos/whodunnit -o video.html
curl -sL -A "$UA" 'https://embed.vhx.tv/videos/612228?api=1&autoplay=0' -H 'Referer: https://watch.dropout.tv/' -o embed.html

# every selector the rules file uses should hit at least once on the page kind it belongs to
grep -c 'browse-item-card' series.html show.html
grep -o 'js-switch-season\|js-sort-items\|js-load-more-items-container\|data-sticky-player' show.html video.html | sort | uniq -c

# class names Home and search use (client-rendered, so read them from the bundle)
bundle=$(grep -oE 'https://cdn\.vhx\.tv/assets/webpack/browse-ottbundle-[a-z0-9]+\.js' series.html | head -1)
curl -sL -A "$UA" "$bundle" | grep -oE 'className:"[^"]+"|"data-testid":"[^"]+"' | sort -u
```

The bundle file names carry a content hash and change with every deploy; read
them from the page rather than hard-coding.

**Logged in**, load [Leanback Dev Probe](../../leanback-dev-probe/) and browse:
it saves each page as drawn on screen, the player included, with the account's
details blanked. "Save Page As" and view-source give only the server's shell,
without anything React draws. The captures stay private; nothing from a
logged-in page is committed.

**What each rules selector matches**, on captured pages:

| Where | Selector | Matches |
|---|---|---|
| `common.header` | `.site-header` | 1 |
| `common.focusable` | `.site-header a[href]` | 16–17 |
| `common.chrome` | `.site-header`, `footer.footer--site` | 1 each |
| `screen.root` | `section.collection-container ul.js-load-more-items-container` | 1 on `/series`, `/my-list` and every list |
| `screen.title` | `h1.collection-title` | 1 ("Series", "My list", "Trending"…) |
| `screen.item` / `itemLink` | `li.js-collection-item` / `.browse-item-card a[href]` | one per tile |
| `screen.more` | `a.js-load-more-link` | 1 while there are more |
| `series.focusable` | `select.js-switch-season`, `select.js-sort-items`, `a.custom-btn-action-trailer`, `button.custom-btn-action-my-list`, `a.custom-btn-action-primary` | 1 each where the page has it (the selects on a show, *Watch Movie* on a special) |
| `series.show.layouts` | `section.episode-container`, `section.movie-container`, `section.collection-container` | 1 on a show, a special, a list respectively |
| `series.show.actions` | `.collection-actions > .btn` | the header's 2–3 buttons (not the share dialog's) |
| `series.episodeLinks` | `.episode-container .browse-item-card a.browse-item-link` | one per episode |
| `video.theaterRoot` / `playerMount` / `playerFrame` | `#watch-player…` | 1 each |
| `video.seriesLink` | `.series-title a.context-link` | 1 |
| `video.focusable` | `#watch-info a[href]`, `a[data-similar-items-site]` | many |
| `video.episodeInfo` | `#watch-info a[href*='/season:']` | 2: "Season N" and "Season N, Episode M"; the one with an episode is used |
| `video.canonical` | `meta[property='og:url']` | 1 |
| `series.show.actionsBox` | `.collection-actions` | 1 on a show and a special |
| `series.show.episodeNumber` | `.media-episode` | one per episode ("Episode 1") |
| `player.transport` | `.vp-controls` | 1 |
| `player.upNextOverlay` | `.vp-outro-wrapper`, `.ott-up-next` | 1 each in the frame, near the end |
| `player.upNextButton` | `a.ott-up-next-thumb-link` | 1 on Dropout's card: plays the next episode |
| `player.upNextHide` | `button.ott-up-next-hide` | 1 on Dropout's card, before the play link |

`common.modals` (`.reveal-modal.open`) matches only while a dialog is open.
