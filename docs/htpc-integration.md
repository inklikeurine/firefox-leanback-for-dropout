# Relationship to the HTPC shell

[the HTPC shell](../../../htpc-shell/) (`~/src/htpc-shell`) is a 10-foot shell for Linux
HTPCs. Four of its 1.0 integrations are Firefox web apps in kiosk profiles,
Dropout among them. This page says how this extension and the HTPC shell fit, so
neither project has to guess.

## What the HTPC shell has decided (do not reopen here)

| The HTPC shell decision | Where | What it means for this extension |
| --- | --- | --- |
| Firefox is the only web-app engine; each web app is a kiosk profile with uBlock Origin and a the HTPC shell TV-navigation extension force-installed by `policies.json` | ADR-0014, proposal §8.5.4 | The extension must be **AMO-signed (unlisted)** to be policy-installed on release Firefox. No popup, no mouse. |
| **One** extension, `tv-nav`, with **per-site rules shipped as data** | ADR-0014, APP-15 | **Superseded for Dropout on 2026-09-20: this extension stays standalone** and is installed next to uBlock Origin in the Dropout profile; `tv-nav` covers the other sites and the text bridge. The HTPC shell should record that as a note superseding this line of ADR-0014 — from the HTPC shell repo, not from here. |
| Input is one action vocabulary (`up`, `select`, `back`, `play_pause`…) | Appendix A, §7.6 | [keymap.md](./keymap.md) uses exactly those names. |
| Focus rules: one focused element always visible, unmistakable ring, nearest-neighbour with overlap preference, no wrap, Back = up one level | §7.5 | The spatial algorithm and ring follow these rules. |
| Dropout is a web app in 1.0 (route A); a native yt-dlp provider is an experiment (route B, spike S10) | §8.5.5, ADR-0006 | This extension **is** route A. Route B does not replace it — it becomes the default with A as fallback only after three stable months. |
| Graceful quit of a web app = "an exit message to the TV-navigation extension" | APP-05, §8.5.3 | The `exitHook` setting is that seam. |
| Text entry on TV goes through the HTPC shell's OSK and a native-messaging bridge | §7.9, APP-15 | Stays in `tv-nav`. This extension does not do text entry. |

## How this extension serves the HTPC shell

1. **Spike S08 step 5** ("Dropout: can a video be found and played with arrows
   + Enter only?") — this extension is the Dropout candidate. Load it in the
   S08 kiosk profile with `web-ext run`/temporary install (unsigned is fine
   for a spike) and run the verification hand-off in
   [development.md](./development.md#verification-hand-off). The unverified
   items in [site-notes.md](./site-notes.md#unverified--check-these-first-in-a-logged-in-web-ext-run-session) are S08 findings to
   record in the spike's *Results*.
2. **Borrowable, not moved** — `nav/*` and the rules-as-data shape are
   public domain (Unlicense, same as the HTPC shell); `tv-nav` may copy them
   for Twitch or YouTube Music. This repository remains the home of the
   Dropout extension; the HTPC shell tracks its releases like it tracks uBlock's.
3. **Web-app definition** — the HTPC shell web-app definition for Dropout
   (proposal Appendix C style) points at this extension:

```toml
# dropout.toml — desktop site; navigation comes from the standalone Leanback for Dropout extension
[webapp]
id          = "tv.dropout"
name        = "Dropout"
url         = "https://watch.dropout.tv/browse"
engine      = "firefox"
extensions  = ["ublock-origin", "leanback-for-dropout"]      # AMO id: leanback-for-dropout@inklikeurine.dev
tvnav       = { mode = "external" }                     # navigation comes from the site extension
keymap      = { back = "Escape", select = "Enter", play_pause = "MediaPlayPause" }
drm_note    = "DRM-free."
exit        = "shell"                                   # extension setting exitHook = "close-tab"
per_profile = true
```

## The exit hook

The HTPC shell's hand-off needs Back at the site's top level to return to the shell.
The cheapest realisation, and the one to try first in S08: the extension
closes its own tab (`tabs.remove(sender.tab.id)`). In a `--kiosk`
single-window profile the last tab closing ends the Firefox process;
`appd` sees the child exit and returns to Home (§8.5.3). To verify (U14): no
session-restore or "close tabs?" prompt on the next start (`user.js` already
disables restore in the HTPC shell's profile generator), and the process exits within
the APP-05 timeout. If it doesn't hold, the fallback is the native-messaging
message the HTPC shell planned, which belongs in `tv-nav`.

## What stays on the HTPC shell's side

Profile generation and `user.js`, `policies.json`, uBlock Origin and its
lists, the user-agent override, the OSK text bridge, native messaging, the
overlay, and any HTPC-shell-specific key (Home, colour keys). This extension must
keep working with none of that present — it is also a product for people who
don't run the HTPC shell.

## Decision: standalone (2026-09-20)

The project lead decided this extension stays standalone. Consequences:

- The HTPC shell's Dropout kiosk profile installs **two** extensions: uBlock Origin
  and this one. `tv-nav` is not loaded there (nothing for it to do;
  two navigation engines on one page would fight).
- The HTPC shell pins a release of this extension per the HTPC shell release, as it does for
  uBlock Origin; updates arrive through AMO's unlisted-update mechanism or a
  new pinned version.
- The HTPC shell's ADR-0014 ("one extension with per-site rules") needs a
  superseding note for Dropout. That is a the HTPC shell change and is not made from
  this repository.
- The HTPC shell-specific needs (native-messaging exit, OSK bridge) that ever turn out
  to be required in the Dropout profile are added here as optional,
  permission-gated features — never as a the HTPC shell dependency.
