# Making the pages themselves leanback

Research for the owner's items 7 and 8: what can be done to the Browse page
and the show page to make them TV-shaped, by replacing CSS or JS if needed.
**Nothing here is implemented yet** — this is the menu to choose from.

## What we are working against

Dropout is a stock Vimeo OTT theme built for a desk: a 16-column grid, ~14 px
body text, hover affordances, and a footer of legal links. On a TV at three
metres, roughly a third of the screen is chrome nobody can use from a sofa,
and the text is at the edge of legibility.

**A caveat that shapes everything below.** The Browse rows are rendered by
`browse-ottbundle-*.js` after login, so the logged-out HTML this repository can
fetch contains none of them. Every selector below is split into *verified*
(present in the logged-out HTML, so safe to target now) and *needs a session*
(one screenshot or DOM dump away). See
[site-notes.md](./site-notes.md#unverified--check-these-first-in-a-logged-in-web-ext-run-session).

## Option A — Declutter (low risk, high payoff)

Hide what a remote cannot use and a sofa cannot read. Pure CSS, driven by a
list in `sites/dropout.json` and stamped with `data-tenfoot-hide`, exactly the
way the player's unwanted controls already work.

**Verified now** (all present logged out):

| Selector | What it is |
| --- | --- |
| `.promo-banner` | the marketing strip above the header |
| `.show-menu-trigger`, `.show-menu-container` | the small-screen menu button |
| `.legal-link`, `.helper-links`, `.vhx-link` | footer legal and "powered by" links |
| `#cookie-banner-react-app` | once consent is given, it leaves a container behind |
| `#hs-script-loader` | HubSpot chat loader |

**Needs a session:** the "list/grid" toggle (`[data-testid="browse-list-toggle"]`),
the hero carousel's arrows, and whatever marketing rows sit below the content
rows.

Cost: an hour. Risk: low — a wrong selector hides nothing, and the list is
data, so a fix never touches code.

## Option B — Zoom the page (low risk, large payoff)

A single `zoom` on the site root scales everything — text, tiles, spacing —
without fighting the site's grid. `zoom: 1.25` on Dropout's 1080p layout gives
roughly the tile size of a TV app.

Implemented as a setting (`pageZoom`, 100–200 %, default 100 so nothing changes
for anyone who does not want it) applied as a CSS variable on `<html>`.

Two things to watch: our fixed-position ring and hint bar must be **outside**
the zoomed element or they inherit the zoom (they are appended to `<html>`, so
this already holds), and `getBoundingClientRect()` returns zoomed coordinates,
which is what the spatial engine wants anyway.

Cost: an hour, plus a careful check that the focus ring still lines up.
Risk: low, and it is a setting.

## Option C — Row snapping on Browse (medium risk, the biggest visual win)

The thing that most makes a TV interface feel like one: the focused row sits
at a **fixed** height on screen and the rows slide under it, instead of the
page scrolling to wherever the browser decides.

`content/page.js` already knows which row is focused (`rowOf()` and the focus
memory). Snapping means translating the rows container so the focused row's
top lands on a constant offset, and letting the existing arrow nudging handle
the horizontal part.

Cost: half a day with the fixture, and it needs the logged-in row markup to be
worth anything. Risk: medium — it fights the site's own scrolling, and a
mistake here makes the page unusable rather than merely ugly. Worth doing only
after A and B are on the box and confirmed.

## Option D — Reflow the show page (medium risk)

The episode grid is `small-block-grid-1 medium-block-grid-3 large-block-grid-4`
(verified). Forcing three columns at TV widths gives noticeably bigger
thumbnails, and hiding the description's show-more/less, the share tools and
the comments section removes three stops the ring currently has to walk past.

| Selector | Action | Verified |
| --- | --- | --- |
| `.large-block-grid-4` | force 3 columns | yes |
| `[data-truncate]` show-more control | hide, show the text in full | yes |
| `.share-tools`, `.video-content-actions` | hide | yes (video page) |
| `.collection-description` | cap to a few lines | yes |

Cost: 2–3 hours. Risk: medium-low, all CSS, all reversible from the rules file.

## Recommendation

**A and B first**, together, behind one "TV layout" setting that is on by
default with a way to turn it off — they are cheap, they are data-driven, and
between them they fix the two things that actually hurt from a sofa (clutter
and text size). **D next**, since it is the same kind of change. **C last, and
only if the first three leave you still wanting it**, because it is the only
one that can make the site worse rather than merely unimproved.

## What I need to finish the selector lists

One logged-in session on the box, with devtools open:

1. On `/browse`: right-click a tile → Inspect, and send the outer HTML of one
   `.horizontal-row-container` (two levels deep is plenty).
2. On `/browse`: the same for anything above or below the rows that is not a
   row — the hero, any marketing band, the list/grid toggle.
3. On a show page: the outer HTML of `.collection-details-container`.

With those three, options A, B and D can be finished and tested against a
fixture that matches the real thing.
