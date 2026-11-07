# Accessibility

Leanback exists to make Dropout usable without a mouse: from the sofa, with a
TV remote, a keyboard or a gamepad mapped to keys. Making it usable for as
many people as possible is part of that job.

## What Leanback commits to

- **Every feature is reachable with a handful of keys**: the arrows, OK and
  Back. No feature needs a pointer or a letter key.
- **You can always see where you are**: a big focus ring, the selected item
  kept on screen, and a ring that doesn't follow a drifting pointer.
- **An Accessibility menu** in Leanback's settings, with:
  - *Interface Size*: 100, 115 or 130 % for everything Leanback draws
  - *High Contrast*: black and white, white edges on buttons, a thicker ring
  - *Reduce Motion*: follows your system setting, or on or off; when on,
    nothing of Leanback's slides or fades
  - *Caption Size*, *Caption Color* and *Caption Background*, over the
    player's own captions
  - *Color Filter (Experimental)*: shifts colours that red-, green- or
    blue-weak colour vision loses into colours it keeps

## Supported environments

- **Firefox 140 or newer**, desktop. Permanent installs need the signed build
  from the [latest release](https://github.com/inklikeurine/firefox-leanback-for-dropout/releases/latest).
- **Input**: a TV remote that sends key presses, a keyboard, or a gamepad
  mapped to keys. Direct gamepad support is planned, not here yet.
- **Designed for** one Firefox window on a TV, fullscreen or kiosk. It also
  works in a normal desktop window.
- **Only the latest release** gets fixes.

## Known limitations

- **Leanback depends on Dropout's site.** When Dropout changes their pages,
  parts of Leanback can break until it's updated. When Leanback can't read a
  page, it shows Dropout's own page instead, and Leanback's accessibility
  settings don't apply there.
- **Screen readers** are not something Leanback has been designed or tested
  around.
- **Sign-in may need a pointer** if Dropout's reCAPTCHA ever shows a puzzle.
  That puzzle is Dropout's, not Leanback's.
- **A profile's PIN screen** is Dropout's own page with Leanback's number pad
  on it. It is the least tried part of Leanback.
- **The colour filter** helps some people and not others, and it may make
  playback stutter on a slow computer.
- **Caption styles** apply on this computer only.
- **Interface Size** covers what Leanback draws, not Dropout's own pages.

More in the README's [Known limitations](../README.md#known-limitations).

## Reporting a barrier

If something gets in your way, please
[open an issue](https://github.com/inklikeurine/firefox-leanback-for-dropout/issues/new/choose)
with the **Bug report** template and start the title with
`Accessibility:`. Say what you were trying to do, what stopped you, and what
you use (remote, screen reader, settings).

You never have to explain or disclose a disability to report a barrier.

This is a hobby project, maintained on a **best-effort basis, with no
timeline**, but accessibility reports are read and taken seriously.

## Who looks after this

[inklikeurine](https://github.com/inklikeurine), the maintainer. Suggestions
for this page are welcome as issues or pull requests.
