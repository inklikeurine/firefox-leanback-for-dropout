# Development

## Prerequisites

- Firefox 140 or newer. Developer Edition or Nightly lets unsigned extensions
  stay installed (`xpinstall.signatures.required = false`).
- Node.js for `web-ext` (`npm install --global web-ext`). The extension itself
  has no dependencies and no build step.
- A Dropout subscription. Log in **by hand** in the dev profile; credentials
  never go into files in this repository or into an AI chat.

## Running locally

From the repository root:

```sh
# fresh profile each time
web-ext run --source-dir ./leanback-for-dropout --start-url https://watch.dropout.tv/browse

# persistent profile so the Dropout login survives restarts
web-ext run --source-dir ./leanback-for-dropout \
  --firefox-profile leanback-for-dropout-dev --keep-profile-changes \
  --start-url https://watch.dropout.tv/browse

# kiosk, as a TV setup runs it (Escape does not leave kiosk; use the exit hook or kill the process)
web-ext run --source-dir ./leanback-for-dropout --firefox-profile leanback-for-dropout-dev --keep-profile-changes \
  --start-url https://watch.dropout.tv/browse --args=--kiosk
```

Without `web-ext`: `about:debugging#/runtime/this-firefox` → **Load Temporary
Add-on…** → `leanback-for-dropout/manifest.json`.

## Debugging

| What | Where |
| --- | --- |
| Background (relay, settings, frame registry) | `about:debugging` → this extension → **Inspect** |
| Page script | The page's devtools console (top frame) |
| Player script | Same console, frame picker → `embed.vhx.tv` |
| Rules file as loaded | Page console: `browser` is not exposed to the page; log from `page.js` under the `[leanback-for-dropout]` prefix instead |
| Storage | Background inspector → Storage → Extension Storage |

Handy checks in the **player frame** console:

```js
OTTData.video, OTTData.up_next            // what the site knows about this video
document.querySelector("video")           // the media element the extension drives
```

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| No focus ring | Leanback is toggled off (toolbar badge), the page is not on a Dropout host, or the rules file failed to load (background console) |
| Arrows do nothing on a page | The page kind wasn't recognised (URL not in `routes` in `sites/dropout.json`) |
| Keys don't reach the player | The `embed.vhx.tv` script didn't register (frame blocked, or `all_frames` missing) — see the relay in the background console |
| Playback doesn't start | Autoplay blocked — press OK once; check `about:preferences#privacy` → Autoplay for the site |
| Navigation broke after a Dropout update | Re-check the site: [site-notes.md](./site-notes.md#checking-the-site-again) |

## Testing and releasing

The manual test checklist and the release checklist are in
[spec.md](./spec.md#testing). The headless suites and the live check live in
the private workspace (see [README.md](./README.md)).

## Coding conventions

- Plain ES2020, no modules that need bundling. The scripts in one manifest
  entry share a global, and each file publishes one frozen object on it
  (`Tenfoot…`; the list is in [architecture.md](./architecture.md#the-manifest),
  plus `TenfootTransport` in the player frame).
- Log with the `[leanback-for-dropout]` prefix, `console.warn` / `console.error`
  only, for warnings, errors and one-off state changes.
- All site selectors in `sites/dropout.json` — never inline in `content/*.js`.
- Every message type is listed in [architecture.md](./architecture.md#messages)
  before it is used.
