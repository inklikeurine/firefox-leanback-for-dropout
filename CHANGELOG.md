# Changelog

## [0.1.1] — 2026-09-21

Fixes found by the headless suites and the live check while finishing the
first version. 0.1.0 below was committed mid-development (`088b119`) and was
never released; this is the first complete version.

### Fixed

- Geometric navigation: the focused tile's 1.04× scale no longer makes a
  same-row neighbour count as "below" it; a large element directly in line
  (the player) beats a far-off, better-centred one; overlapping candidates
  rank by distance along the axis, with the centre offset only breaking ties.
- Arrow auto-repeat was throttled away entirely right after page load.
- Load More is never triggered from inside a dialog, and a pending Load More
  is dropped when a dialog opens or closes.
- On a video page whose player frame has not rendered yet, the ring parks on
  the player mount instead of nowhere; the hand-off happens when the frame
  appears.
- Load More selector corrected to the site's `a.js-load-more-link`
  (the draft matched every episode link).

### Changed

- The Info key (`i`) shows the hints — with title and time on a video page —
  on demand and hides them again; the hint-bar setting only controls the
  automatic hints on keypress.
- The `page:state` snapshot reports the last navigation target and a
  control's value (for the harness).

## [0.1.0] — 2026-09-21

### Added

- First version: arrow-key navigation with a focus ring on every page of
  `watch.dropout.tv` (row-aware on Browse, geometric elsewhere), Enter to
  open, layered Back (dialog → player → history → structural parent → exit
  hook), season switching with Left/Right, Load More on the way down.
- Theater layout on video pages; player control from inside the frame and
  from the page (play/pause, seek, captions, mute, stop, next/previous
  episode, media keys); autoplay next; hint bar and title/time OSD.
- Marketing-site forward to Browse, toolbar toggle with badge, keyboard
  command (unbound by default), options page.
- Site knowledge kept as data in `sites/dropout.json`.
