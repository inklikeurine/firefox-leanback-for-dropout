# Leanback for Dropout — documentation

| Document | Read this when… |
| --- | --- |
| [architecture.md](./architecture.md) | You're implementing or changing anything: components, why there are two content scripts, the message relay, the spatial-navigation algorithm, theater layout, the draft `manifest.json` and `sites/dropout.json`. |
| [site-notes.md](./site-notes.md) | Navigation broke or you're filling in a `"todo"` selector: what the site's markup looks like, what was verified logged-out, what still needs a logged-in browser (U1–U14), and the commands to re-check. |
| [keymap.md](./keymap.md) | You're adding a key or changing what one does in some context, or need to know how a remote's buttons (the W1's, for one) map. |
| [targets.md](./targets.md) | You're setting it up on a TV box — the Bigscreen appliance with the W1 remote, or the HTPC shell — and need the constraints, the launch recipe and the on-box checks (T1–T8). |
| [leanback-layout.md](./leanback-layout.md) | You are looking at making the site's own pages TV-shaped: what can be decluttered, zoomed, snapped or reflowed, what is verified and what still needs a logged-in session. A proposal, not yet built. |
| [development.md](./development.md) | You're running it locally, debugging a frame, running the test checklist, handing verification to the HTPC shell lead, or cutting a release. |
| [htpc-integration.md](./htpc-integration.md) | You're working on the HTPC shell's Dropout web app or `tv-nav` and need to know what moves where. |

The product spec is [spec.md](./spec.md) in this folder. The extension is
implemented as of 0.1.1; `architecture.md` is the file to read before
changing code, and `site-notes.md` before changing a selector.

The headless suites, fixtures and verification journal live in the private
workspace (`.dev/tests/leanback-for-dropout/`, `.dev/fixtures/leanback-for-dropout/`,
`.dev/review/leanback-for-dropout/`) and are not part of the published extension. The rules AI coding
agents follow for every extension in this repository are in the root
[`AGENTS.md`](../../AGENTS.md).
