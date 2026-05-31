# Ken Olympics — Hardening Pass (CHANGES)

A focused audit → fix → polish → **test** pass on the single-file scoreboard app.
The product still deploys to GitHub Pages as static files, still uses Firebase
Realtime Database live sync, and the **section-6 game rules are unchanged**
(10/6/3/1, finale 20/12/6/2, dodgeball 8/8/2/2, tiebreak on 1st-place finishes,
brackets only for events 1 & 7, reveal Thu Jun 4 2026 10:30 PM PT).

---

## TL;DR
- **Fixed the room-fork footgun** by collapsing to **one fixed event** (no codes, no
  "create event" — forking is now structurally impossible).
- **Extracted `engine.js`** (pure scoring/standings/bracket/countdown/role logic) so the
  rules are unit-testable; `index.html` keeps the same behaviour via thin wrappers.
- **Mobile/design pass**: real safe-area insets, 44-ish-px touch targets, 16px inputs (no
  iOS zoom), pinch-zoom restored, long-name overflow handled, focus states, honest
  error/empty states, font fallbacks.
- **Built a real automated suite**: 39 Node unit tests + 54 Playwright E2E tests across
  **iPhone (WebKit)** and **Pixel (Chromium)**, including hermetic Firebase live-sync via
  an in-browser mock. One command: `npm test`. **All green.**

---

## What was broken or weak (audit)

**Functional**
1. **Room-fork footgun (the big one).** `boot()` auto-created a *new* Firebase room whenever
   the URL had no `#room=` and no saved room — so opening the bare URL on a second device
   silently forked a second scoreboard.
2. **Safe-area insets were dead.** The viewport meta lacked `viewport-fit=cover`, so the
   `env(safe-area-inset-*)` already used by the nav/sheet evaluated to **0** on notched
   phones; the sticky header had no top-inset handling at all.
3. **`lockDraft()` fell through.** It warned "Add players to all 4 teams" via toast but then
   locked anyway, contradicting the message.
4. **Room-not-found showed a fake event** (default "Team 1–4 / 0 pts") instead of a clear state.
5. **Snapshot honesty.** A `#v=` snapshot before kickoff showed the same countdown that
   promises a *live* board.

**Mobile UI / a11y**
6. Touch targets too small — colour swatches **22px**, plus the captain (©) and place buttons.
7. Sub-16px inputs caused iOS focus-zoom; `user-scalable=no` blocked pinch-zoom.
8. Ugly font fallback (`cursive`) and weak fallback stacks → flash/shift when Google Fonts is slow.
9. Long team/player names could overflow the header, standings, champion, and modal rows.
10. No visible keyboard focus states; clipboard copy had no real failure handling.

**Testing**
11. No automated tests existed in the repo. None of the DOM, modals, live sync, onboarding,
    or layout had ever been exercised in a browser.

---

## What changed

### Architecture
- **New `engine.js`** — a dependency-free classic script holding all pure logic: `EVENTS`,
  `PTS`, scoring (`pointsForEvent`, `totals`, `firstsCount`, `standings`), bracket derivation
  (`bracketSeed`, `deriveBracketRank`), countdown (`countdownParts`, `isLockedAt`, `REVEAL_AT`),
  share codec (`encState`/`decState`), and the role gate (`sha256Hex`, `resolveRole`). It
  exposes `window.KO` (+ a few globals) in the browser and `module.exports` in Node, so the
  **exact shipping code** is what the unit tests import. `index.html` now loads it with
  `<script src="engine.js">` and delegates via thin wrappers — render code is unchanged.
- Still **two static files** (`index.html` + `engine.js`) — no build step, GitHub-Pages-native.

### Onboarding — "one fixed event" (the create-vs-join decision)
You chose the simplest model, and it's also the most robust:
- The whole party is **one fixed room** (`FIXED_ROOM = 'ken-olympics-2026'`). There is **no
  room-creation path**, so forking two scoreboards is *impossible*.
- **Viewer link** = the bare URL. **Editor link** = bare URL + `#edit=<secret>`.
- Opening the editor link once sets a persisted flag, so you stay the commissioner on that
  device even from the bare URL. The Share sheet always surfaces your editor link to copy.
- Trade-off: it's single-use (a future trip needs a new `FIXED_ROOM` value), which is exactly
  what a one-weekend party wants.

### Mobile UI / design
- `viewport-fit=cover`; removed `user-scalable=no`/`maximum-scale` → **pinch-zoom restored**.
- **Safe areas** wired into the header (top), content wrap (left/right), and bottom nav.
- **Touch targets**: colour swatches → **40px** on their own labelled row; captain toggle and
  place buttons → ~40–44px; lineup chips ≥48px.
- **16px inputs** (no iOS focus-zoom); textareas too.
- **Font fallbacks**: real stacks (`system-ui`, `Arial Black`, `ui-monospace`…) instead of `cursive`.
- **Overflow**: long names wrap/ellipsis across hero, standings, champion, roster, modal rows;
  `overflow-x:hidden` backstop. Verified no horizontal scroll on any tab, even with a 60-char team name.
- **Focus states** (`:focus-visible`), aria-labels on colour/captain buttons, lighter muted
  colour and larger nav labels for legibility.
- **Honest states**: clear "Can't reach the scoreboard" (with Retry) when offline; "Setting the
  stage" when a viewer arrives pre-draft; snapshot is labelled **"SNAPSHOT · NOT LIVE"** and
  skips the countdown; the viewer "● LIVE" pill only shows on a real connection; robust clipboard
  copy with a manual-copy fallback.
- Countdown is now a clean full-screen takeover (header hidden while sealed).

### Live sync
- Same `rooms/{room}` model and editor-writes / viewer-`.on('value')` design, now pointed at
  the single fixed room. The editor seeds the room on first connect so viewers always have data.

### Security
- The editor secret is no longer plaintext-in-source: only its **SHA-256 hash** ships in
  `index.html`. The secret lives only in your editor URL + your device (and the gitignored
  `MY-EDITOR-LINK.txt`).

---

## Security posture (honest)
This is a **soft gate**, and that's an appropriate choice for a bachelor party:
- The role is decided **client-side**. Anyone you hand the editor link to can edit.
- Because there's no Firebase Auth, the database rules **cannot** verify the secret, so writes
  to the room are effectively open at the API level. The shipped `database.rules.json` scopes
  and validates the data shape (and blocks everything outside `/rooms`), but it can't enforce
  "only the editor writes."
- Hashing the secret means **view-source no longer leaks it** — a meaningful upgrade over a
  plaintext key — but a determined guesser with the random secret could still write.
- **For a hard gate**: add Firebase Auth (even anonymous + a custom claim, or a single
  sign-in) and change the write rule to require it. Left for you to decide (see below).

---

## Tests & results
- **Unit (Node, zero deps): 39 tests, all pass.** Scoring (standard/finale/dodgeball), totals,
  first-place tiebreak, bracket derivation, countdown math + the exact `REVEAL_AT` instant,
  `encState/decState` round-trip (emoji/accents), `sha256Hex` vs NIST + Node-crypto vectors,
  `resolveRole`, and a rules-guard that pins the section-6 constants.
- **E2E (Playwright, iPhone 13 / WebKit + Pixel 5 / Chromium): 54 tests, all pass.**
  - Editor: draft → score **all 14 events** (placement, bracket, dodgeball, double finale) →
    champion; correct a saved result and watch points recompute; reload the bare URL and stay editor.
  - Viewer: read-only (no Draft/record/share), live update lands on an editor change, countdown
    shows then **auto-reveals** at kickoff via a fake clock, snapshot is non-live.
  - Live sync (hermetic, in-browser Firebase mock): editor→viewer round-trip, a viewer joining
    mid-event, and **offline→online** catch-up; correct/wrong/missing key → right role.
  - Countdown: editor never locked (incl. at the exact reveal instant); viewer locked 1s before,
    live 1s after.
  - Mobile UI: touch-target sizes, 16px inputs, long-name wrapping, no horizontal scroll,
    safe-area wiring, empty/error states, and **zero console errors** across a full session.

Run it all with **`npm test`** (see README). Sync tests use a hermetic in-browser mock — they
never touch your production Firebase. (Java/the Firebase emulator aren't installed here; the
mock is the chosen substitute and the README notes how to add the real emulator later.)

---

## Left for you to decide
- **Deploy**: commit + push `index.html` **and** `engine.js` (both are required). I didn't push.
- **Open your editor link once** (in `MY-EDITOR-LINK.txt`) to claim commissioner; share the bare URL.
- **Apply `database.rules.json`** in the Firebase console; decide whether you want Firebase Auth
  for a hard edit gate.
- **Real-device pass**: Playwright emulates the iPhone/Pixel *engines + viewports* but isn't a
  physical device — a quick look on your actual phone is worth it. Optionally install Java +
  `firebase-tools` later to also run sync tests against the real emulator.
- Optional: rotate the editor secret (instructions in `MY-EDITOR-LINK.txt`).
