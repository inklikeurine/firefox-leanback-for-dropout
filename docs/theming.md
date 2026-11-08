# Theming — lessons and plan

How Leanback's look is themed, what was learned while researching a theming
engine (November 2026), and the milestones that build it. The milestones are
in [spec.md](./spec.md#milestones); how the current look is applied is in
[architecture.md](./architecture.md#the-look-libthemesjs).

## Where theming stands

Leanback has a first version of theming: four themes (Dropout Dark, Midnight
Blue, OLED Black, Warm Dark), a *Theme Color* that takes the place of
Dropout's yellow, holiday looks by date, the Accessibility look (Interface
Size, High Contrast, Reduce Motion, the caption style, the video's colour
filter) and *Theme This Page* on four kinds of page. Each theme is written
in `lib/themes.js` as eight colours; the stylesheets read them as CSS custom
properties (`--tf-*`, `--tenfoot-accent`).

What it does not reach yet, counted in the stylesheets:

| Gap | Effect |
| --- | --- |
| About 100 colours and 40 translucent ones written directly | A theme cannot change them |
| The settings panel (`panel.css`) reads no theme values | Theme and High Contrast leave the panel as it is |
| The player frame gets the accent only | Themes stop at the video |
| The typeface written out in eight places, one of them a different face | No theme can change the type |
| About 45 corner radii written directly | No theme can change shapes |
| Black text on the accent is assumed | A dark accent of the viewer's own would make unreadable buttons |
| Theme values are set on `<html>` | Every change restyles Dropout's whole page as well |
| Each *Theme This Page* choice is wired by hand in four or five files | New choices are slow to add |

## Lessons learned

### 1. Screens use names; themes supply values

Kodi, the closest relative (a 10-foot media interface), keeps a skin's
colours in a separate file of *named* colours, and its screens only ever use
the names: swapping the file re-colours the whole skin. Fonts work the same
way, as named font sets. A theme can only change what is named, so **every
colour, typeface, size, corner and timing in Leanback's stylesheets must be a
name** — the gaps above are exactly the places that are not.

### 2. Free-form CSS themes break — and an add-on may not load them

Jellyfin's web themes are custom CSS, usually one `@import` of a hosted
stylesheet. They break when the app updates and reach only the web client.
For a Firefox add-on they are not an option at all: Mozilla's add-on rules
forbid loading code from outside the add-on, and Mozilla's guidance is that
stylesheets fetched from elsewhere fall under that. **Themes beyond the
built-in ones must be data that Leanback checks** — colours, sizes and
choices from Leanback's own lists — never CSS.

### 3. A theme can declare what may be adjusted

Stylus (UserCSS) lets a style declare its own adjustable values — a colour,
a choice from a list, an on/off, a number in a range — and draws the
controls for them. **A Leanback theme can carry the same kind of
declarations**, and the settings panel and the options page draw themselves
from them, so a new adjustable value needs no new settings code.

### 4. Derive most colours from a few, then check contrast

Material Design 3 works out a whole colour scheme from one seed colour, then
adjusts text colours until a contrast target is met; how much contrast is
itself a setting. **A Leanback theme names a few seeds** (background, text,
accent, and optionally a surface tint), **and Leanback derives the rest**:
surfaces, lines, dim text, the text on the accent — with a contrast check
that guarantees readable text whatever accent is picked.

### 5. Use a standard data shape

The Design Tokens format (W3C community group, first stable version 2025.10)
is a standard JSON shape for named design values — colours, sizes, type,
timing — with groups and references between them. **Themes described in
that shape** are plain data that other tools can read and write, which is
what import and export need.

### 6. The TV sets limits of its own

TV design guidance (as summarised from Google, Amazon and Apple): keep
content 5 % in from the edges of the screen, make the selection unmissable
from the sofa, make text far larger than on a desktop, and avoid large white
areas, which halo on TV screens. **No theme is light**, and **focus styling
is part of every theme**.

### 7. What Firefox provides (Leanback's minimum is Firefox 140)

| Feature | Since Firefox | Use |
| --- | --- | --- |
| Relative colours (`oklch(from var(--accent) …)`) | 128 | Lighter, darker and translucent shades from one theme colour, in CSS |
| `color-mix()` | 113 | Blending a theme colour into the background (lines, dimmed states) |
| `@property` | 128 | Theme colours that can fade from one theme to the next |
| Cascade layers (`@layer`) | 97 | Leanback's rules in one layer: its `!important` rules beat Dropout's unlayered `!important` ones by rule, not by a specificity race |
| View Transitions (`startViewTransition`) | 144 | Elements sliding to their new places when a look changes — above the minimum, so used where present, with Leanback's own animation otherwise |
| `contrast-color()` | 146 | Black or white text for a colour — above the minimum, so done in Leanback's own code |

### 8. Where theme values are set decides how fast a theme switches

Measured on Dropout's Browse page (about 2,860 elements, about 520 of them
Leanback's), in Firefox on a desktop: changing one theme value on `<html>`
costs about **8 ms**, because custom properties are inherited and the whole
page is restyled; the same change on Leanback's own screen layer costs
**under 1 ms**. A TV box is several times slower, and *Theme This Page*
previews on every arrow press. **Theme values go on Leanback's own layers**
(they sit beside Dropout's page, not inside it), **written in one go** per
look.

### 9. Dropout's own styles

Wherever Leanback restyles Dropout's boxes (sign-in, the profile forms, its
dialogs, the cookie windows), Dropout's rules compete with Leanback's. Today
that is settled with many `!important` rules; **one cascade layer for all of
Leanback's rules** makes the order explicit.

## The rules a theme lives by

The owner's direction (2026-11-01): **theming is constrained by what
Leanback allows, but what it allows is generous**, so themes can be creative
and built from parts:

- A theme is **data**, checked against Leanback's lists: no CSS, no code, no
  pictures from the internet.
- It may change **colours, the typeface, sizes, corners, timing and
  decorations**, and from 0.41.0 **the layout of whole screens**, by choosing
  among layouts Leanback provides.
- It is **made of parts** — colours, type, shapes, a decoration, a layout per
  screen — which can be mixed from different themes.
- **Accessibility always wins**: High Contrast, Interface Size and Reduce
  Motion apply over any theme.
- Things on the screen do not move by themselves: decorations are still
  overlays. The one exception is snow for the winter holidays, which is a
  switch of its own, off under Reduce Motion.

## Milestones

### 0.39.0 — the foundations, in the refactor

- **One list of named theme values** — about 30, in five groups: colours
  (background, surface, raised surface, text, dim text, line, accent, text on
  the accent, danger, text on danger, focus ring, shadow, scrim), type
  (typeface, text scale, weights), shape (corner sizes), motion (quick,
  normal, slow) and layout sizes (card width, gaps, the gutter).
- **Every stylesheet uses only those names** — the settings panel, the boxes,
  the forms, the cookie windows and the player frame included — and a
  workshop check fails on any colour, typeface, radius or timing written
  directly.
- **The four themes become data**, with the other values derived from a few
  seeds and the text on the accent chosen by a contrast check.
- **Theme values set on Leanback's own layers**, in one write per look, with
  the timing checked in the live test.

Nothing looks different after 0.39.0; every theme then reaches everything.

### 0.40.0 — the theming engine

- **Themes as parts** in the Design Tokens shape: colours, type, shapes,
  decoration; a theme may declare which of its values the viewer can adjust.
- **Themes of the viewer's own** on the options page: seed colours, a
  typeface and corner style from Leanback's lists, checked for contrast.
- **Holiday decorations** drawn by Leanback as overlays (a frame, a corner
  piece), nothing that moves; for the winter holidays, falling snow as a
  switch of its own, off under Reduce Motion.
- **_Theme This Page_ on every kind of signed-in page reachable from the
  interface** — Home, hubs, Browse, My List, the lists, Search, a show's page,
  a special, an episode's details page, Dropout 24/7, the profile picker,
  Manage profiles, Add and Edit Profile, and the playback screen — each with
  *Reset This Page*, built from one registry of choices, with View
  Transitions where Firefox has them.
- **Contrast tests** for every built-in theme with every Theme Color and with
  High Contrast.

### 0.41.0 — themes that rearrange whole screens

- **Layouts as modules**: for each screen, Leanback provides layouts (Home as
  rows, as a grid, led by a large banner, as a list beside a preview; a
  details page with the picture beside or behind the text; and so on), and a
  theme chooses one per screen, with its settings.
- **Navigation follows the layout**: the screen engine builds its rows from
  the layout chosen, so the remote moves the same way it looks.
- **Each layout tested** for navigation, safe areas and reaching every
  control, as the screens are tested today.

### 1.0.0

- **Theme import and export**: a theme saved to a file and loaded from one,
  as data in the Design Tokens shape, checked against Leanback's lists when
  loaded (alongside the watch-history sync, the 1.0.0 milestone in
  [spec.md](./spec.md#milestones)).

## Sources

- Kodi: [Colour themes](https://kodi.wiki/view/Colour_themes),
  [Fonts](https://kodi.wiki/view/Fonts),
  [Skinning Manual](https://kodi.wiki/view/Skinning_Manual)
- Jellyfin: [custom CSS guide](https://www.jellywatch.app/blog/jellyfin-custom-css-snippets-netflix-theme-guide-2026),
  [Skin Manager](https://jellywatch.app/blog/best-jellyfin-themes-skin-manager-2026)
- Stylus: [Writing UserCSS](https://github.com/openstyles/stylus/wiki/Writing-UserCSS)
- Material Design 3: [material-color-utilities, making schemes](https://www.github.com/material-foundation/material-color-utilities/blob/main/make_schemes.md)
- Design Tokens: [first stable version](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/),
  [Format Module 2025.10](https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/)
- TV design: [Spyrosoft](https://spyro-soft.com/blog/media-and-entertainment/8-ux-ui-best-practices-for-designing-user-friendly-tv-apps),
  [UI/UX Atlas](https://uiux-atlas.pages.dev/lessons/responsive/tv-and-10-foot-ui-design),
  [Android: TV layouts](https://developer.android.com/training/tv/playback/compose/layouts)
- Firefox: [relative colours and `@property` (Firefox 128)](https://web.dev/blog/web-platform-07-2024),
  [View Transitions (Firefox 144)](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available),
  [`contrast-color()` (Firefox 146)](https://web.dev/blog/web-platform-12-2025);
  MDN for cascade layers, `color-mix()` and `@property`
- Mozilla's add-on rules: [Mozilla Discourse on loading CSS](https://discourse.mozilla.org/t/is-it-allowed-for-an-extension-to-load-css-and-html-dynamically/138960),
  [Sophos on the remote-code ban](https://www.sophos.com/en-us/blog/mozilla-bans-firefox-extensions-for-executing-remote-code)
