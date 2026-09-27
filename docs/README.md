# Leanback for Dropout — documentation

| Document | Read this when… |
| --- | --- |
| [architecture.md](./architecture.md) | You're implementing or changing anything: components, why there are two content scripts, the message relay, the spatial-navigation algorithm, the Home screen, the rail, the watch history, the transport bar and settings panel, theater layout, the manifest and `sites/dropout.json`. |
| [site-notes.md](./site-notes.md) | Navigation broke or you're changing a selector: what each page's markup looks like, the player and its settings menu, what is still unknown, and how to check the site again. |
| [keymap.md](./keymap.md) | You're adding a key or changing what one does in some context (Home, the rail, a page, the player), or need to know how a remote's buttons (the W1's, for one) map. |
| [targets.md](./targets.md) | You're setting it up on a TV box — the Bigscreen appliance with the W1 remote, or the HTPC shell — and need the constraints, the launch recipe and the on-box checks (T1–T8). |
| [development.md](./development.md) | You're running it locally, debugging a frame, running the test checklist, handing verification to the HTPC shell lead, or cutting a release. |
| [htpc-integration.md](./htpc-integration.md) | You're working on the HTPC shell's Dropout web app or `tv-nav` and need to know what moves where. |

The product spec is [spec.md](./spec.md) in this folder, with the milestones
for 1.0. `architecture.md` is the file to read before changing code, and
`site-notes.md` before changing a selector.

The headless suites, fixtures and verification journal live in the private
workspace (`.dev/tests/leanback-for-dropout/`, `.dev/fixtures/leanback-for-dropout/`,
`.dev/review/leanback-for-dropout/`) and are not part of the published extension. The rules AI coding
agents follow for every extension in this repository are in the root
[`AGENTS.md`](../../AGENTS.md).
