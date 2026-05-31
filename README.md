# The Ken Olympics 🌴

A mobile-first, live-synced scoreboard for a bachelor-party olympics — **4 teams × 3 players,
14 events, San Diego, June 4–7 2026.** One commissioner runs it from their phone; everyone else
opens a link and watches the scoreboard update live (with a sealed countdown that auto-reveals
at kickoff).

- **Live site:** https://zaintest.github.io/ken-olympics/
- **Stack:** a static `index.html` + `engine.js`, Firebase Realtime Database for live sync.
  No build step — GitHub Pages serves the files as-is.

## The two links (one fixed event)
| Link | Who | What |
|---|---|---|
| `…/` (bare URL) | the whole group | live, **read-only** scoreboard |
| `…/#edit=<secret>` | **you only** | commissioner: run the draft, record results |

There are no room codes and no "create event" step, so you can't accidentally fork into two
scoreboards. Your private editor link is in **`MY-EDITOR-LINK.txt`** (gitignored). Open it once
on your phone and you stay the commissioner.

## Files
| File | Purpose |
|---|---|
| `index.html` | the app (HTML/CSS + DOM/Firebase glue). **Deploy this.** |
| `engine.js` | pure game logic (scoring, standings, bracket, countdown, role gate). **Deploy this too.** |
| `database.rules.json` | recommended Firebase Realtime Database rules |
| `tests/` | unit (Node) + E2E (Playwright) suites |
| `tools/serve.cjs` | tiny static server for local dev / tests |
| `CHANGES.md` | what was fixed and why; honest security notes |

## Run it locally
```bash
npm install          # one-time (installs Playwright test runner)
npm run serve        # → http://localhost:5050
```

## Tests
```bash
npm install
npx playwright install chromium webkit   # one-time: browser binaries (large download)

npm run test:unit    # 39 Node unit tests (no browser needed)
npm run test:e2e     # 54 Playwright E2E tests (iPhone/WebKit + Pixel/Chromium)
npm test             # both
```

- **Unit tests** import `engine.js` directly and pin the scoring/standings/bracket/countdown/
  role logic (incl. the section-6 game rules).
- **E2E tests** drive the real app on mobile viewports. Live-sync tests use a **hermetic
  in-browser Firebase mock** (`tests/e2e/firebase-mock.js`) injected via request interception —
  they never touch the production database.

Capture device-viewport screenshots into `screenshots/`:
```bash
SHOTS=1 npx playwright test screens --project="Mobile Safari"
```

### Want the real Firebase emulator instead of the mock?
The emulator needs the JDK + `firebase-tools` (not installed here). Once you have them:
```bash
npm i -g firebase-tools
firebase emulators:start --only database
```
…then point the app's `databaseURL` at the emulator in a test build. The in-browser mock is the
zero-dependency default and covers the app's sync wiring (listeners, roles, reconnect, live render).

## Deploy
Commit and push `index.html` **and** `engine.js` to the `main` branch; GitHub Pages serves them
at the URL above. The Firebase web config is embedded (it's not a secret). Apply
`database.rules.json` in the Firebase console.

See **`CHANGES.md`** for the full audit, the create-vs-join decision, and the honest
soft-edit-gate security posture.
