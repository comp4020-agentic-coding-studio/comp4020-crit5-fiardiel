# Song-guess game — design spec

**Working title:** One More Second

**Replaces:** the Echo bat-cave game (`docs/superpowers/specs/2026-08-30-echo-bat-game-design.md`)
as this repo's crit-5 submission. Echo's implementation stays in git history,
untouched and recoverable — nothing is deleted, it's just superseded.

## Why this satisfies the crit-5 spec

The published brief (`comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/05-game/`)
requires, mapped to this design:

| Spec requirement | How this design meets it |
|---|---|
| Genre open, one mechanic, obvious in 10s | One mechanic: type a guess, hear a longer clip if wrong. No second control. |
| No tutorial content anywhere | A text input and nothing else. The convention (type → Enter → find out) needs no explanation. |
| Static, no backend, ships to GitHub Pages | Audio comes from a client-side `fetch` to the iTunes Search API (no auth, no server). Song data is a static file in the repo. |
| It can be lost | 3 lives; exhausting them ends the run. |
| A stranger reaches an ending inside 5 minutes | ~26-song list, one round takes 5-20s; a full run or a loss both land well under 5 minutes. |
| One rule has a focused automated test | The scoring ladder and the title-matching function are pure, and are exactly what gets unit-tested. |
| One change verified by playing, not reading code | Match strictness and/or per-song start offsets are the tuning knobs — see "Tuning knobs" below. |
| PROCESS.md, reflections/crit-5.md, incremental commits | Carried over from the existing harness unchanged. |

No IP/licensing constraint is stated in the brief. See "Audio pipeline and
copyright rationale" below for why this design's approach is still the
better-behaved choice, independent of the course not requiring it.

## Core mechanic

One song per round. Attempts against that song follow a fixed reveal ladder:

```
Attempt 1 → clip length 0.1s
Attempt 2 → clip length 0.5s
Attempt 3 → clip length 2s
Attempt 4 → clip length 8s
Attempt 5 → clip length 15s
```

The ladder is identical for every song and every round — no song is
individually harder, and rounds don't escalate in difficulty. The only
lever is player skill against a fixed curve.

There are two controls: a large centered ▶ button, and a text input.
Browsers block audio autoplay before any user gesture, so the very first
clip of the run cannot simply play on page load — tapping ▶ is that first
gesture (a universal media-control icon, not instructional text, so it
doesn't count as "how to play" copy). It plays the first clip and is never
shown again for the rest of the run: every clip after that plays inside
the Enter-key handler itself, which is itself a user gesture, so no
further button is needed.

Once a run is underway, typing a guess and pressing Enter is the only
action available:

- **Correct** (after normalizing, see "Title matching" below): the round
  ends, points are awarded for the tier the player was on, and the next
  song's round begins (tier resets to 1, clip auto-plays).
- **Incorrect**: the input clears, and the *next* tier's clip plays
  automatically (attempt 1 wrong → tier-2 clip plays; and so on).
- **Incorrect on attempt 5** (the 15s clip): the round is a miss. One life
  is lost, and the next song's round begins.

No play button, no skip button, no visible instructions — the loop teaches
itself the same way Wordle/Heardle-style games do, through the one
available action.

## Scoring and lives

- Correct on tier 1 (0.1s): **5 points**
- Correct on tier 2 (0.5s): **4 points**
- Correct on tier 3 (2s): **3 points**
- Correct on tier 4 (8s): **2 points**
- Correct on tier 5 (15s): **1 point**
- Miss (wrong on all 5 tiers): **0 points**, lose one life

**Lives:** the player starts with 3. A miss costs one life. Losing the
third life ends the run immediately (loss — final score shown, tap
anywhere/press Enter to restart). Correctly finishing every song in the
list without running out of lives ends the run as a win (final score
shown, same restart affordance).

This is the entire loss/win surface: no timer, no other fail state.

## Title matching

Guesses are normalized before comparison:

1. Lowercase
2. Strip punctuation (apostrophes, commas, parens, etc.)
3. Collapse whitespace
4. Drop a leading "the "

A guess matches if its normalized form equals the song title's normalized
form. This is intentionally strict for the MVP (no fuzzy/edit-distance
matching, no partial-title credit) — see "Tuning knobs" for why this is the
first thing to loosen if the playtest shows it's too punishing.

This function (`matchesTitle(guess, title): boolean`) and the scoring table
(`scoreForTier(tier): number`) are the pure, deterministic rules this
design's one required automated test covers.

## Song data and audio pipeline

Song data is a static list in source (title + artist; no live chart, no
scraping) — see the confirmed list below. At runtime:

1. For the current round's song, `fetch` the iTunes Search API:
   `https://itunes.apple.com/search?term=<artist>+<title>&media=music&entity=song&limit=1`
   (no key, no auth, CORS-enabled, confirmed working during design — see
   spot-check results below). `entity=song` matters: without it, the API can
   return a `music-video` asset instead of the actual song for some queries.
2. Read `previewUrl` from the first result. This is a ~30s AAC clip hosted
   on Apple's own CDN.
3. Play it through an `<audio>` element starting at a per-song
   `startOffsetSec` (default `0`; tunable per song so a 0.1s clip doesn't
   land on silence or a count-in), and stop it via `setTimeout` at the
   current tier's duration.

Fetching per-round (not all 26 up front) keeps the initial page load light
and matches "no backend" cleanly — there's nothing to precompute or cache
server-side.

### Audio pipeline and copyright rationale

The game never stores, bundles, or rehosts copyrighted audio — it links to
Apple's own preview CDN at play-time, the same mechanism legitimate embed
widgets and the iTunes/Apple Music apps themselves use for previews. This
is a meaningfully different posture than shipping ripped MP3s in
`public/audio/`, independent of the fact that the course brief doesn't
require it.

### Confirmed song list (spot-checked against the iTunes Search API)

**Linkin Park:** One Step Closer, Crawling, Papercut, Points of Authority,
In the End, Faint, Numb, Breaking the Habit, Somewhere I Belong, What I've
Done, Bleed It Out, New Divide, Burn It Down, Castle of Glass, Waiting for
the End.

**My Chemical Romance:** Helena, Welcome to the Black Parade, I'm Not
Okay, Teenagers, Famous Last Words, Na Na Na, The Ghost of You, Sing,
Mama, Disenchanted, Thank You for the Venom.

26 songs total, every one returning a real `previewUrl` as of this design
session.

## UI

Single screen, dark background (visual continuity with this repo's
existing dark aesthetic is a nice-to-have, not a requirement):

- Score and lives (e.g. 3 dots/hearts) shown at all times — this is what
  lets a player infer the stakes without being told.
- Before the run starts: just the ▶ button, centered, nothing else on
  screen.
- Once running: a single text input, auto-focused, with no visible label
  (a placeholder like "song title…" carries the affordance without being
  instructional copy — this is a genre convention, not a how-to-play
  message). Pressing Enter with an empty input does nothing (not treated
  as a wrong guess) — nothing plays, nothing is scored, no life is lost.
- No round counter, tier indicator, or artist name shown during a round —
  showing the tier number would functionally be a difficulty readout,
  which adds nothing the player needs to act on.
- End-of-run screen: final score, win or loss state, "tap to play again."

## Technical architecture

Reuses the existing harness from the Echo build, same shape:

- `src/scripts/game.ts` — pure logic: the tier ladder, `scoreForTier`,
  `matchesTitle`, and a state reducer (`applyGuess(state, guess): state`)
  covering round transitions, scoring, and lives. No DOM, no fetch — fully
  unit-testable.
- `src/scripts/songs.ts` — the static song list (title + artist +
  `startOffsetSec`).
- `src/scripts/audio.ts` — the iTunes fetch + clip-playback wiring
  (isolated from `game.ts` so the pure logic never touches `fetch`/`Audio`).
- `src/scripts/main.ts` — DOM wiring: input handling, calling into
  `game.ts` and `audio.ts`, rendering state to the screen.
- `src/pages/index.astro`, `src/styles/styles.css` — page shell and
  styling, same pattern as Echo's.
- `spec/*.test.ts` — Vitest, same pattern as Echo's `spec/rules.test.ts`:
  pure-function tests against `game.ts`.

## Tuning knobs (for the mandatory playtest-driven change)

Pick **one** after actually playing a full run, cite it in `PROCESS.md`:

- Loosen `matchesTitle` (e.g. allow a partial/prefix match, or small edit
  distance) if strict matching feels unfair rather than skillful.
- Adjust a song's `startOffsetSec` if its 0.1s/0.5s clip is unrecognizable
  silence or a count-in rather than a hook.
- Adjust the ladder itself (e.g. `[0.2, 1, 3, 8, 15]`) if 0.1s is
  imperceptible rather than merely hard.
- Adjust lives (3 → 2 or 4) if runs end too fast or drag on too long.

## Explicitly out of scope for this build

- No live/current chart data (Indonesian top-50 or otherwise) — the list
  is a fixed, curated snapshot.
- No fuzzy/typo-tolerant matching in the MVP (a tuning candidate, not a
  day-one feature).
- No difficulty variation between songs or rounds (per the "just do the
  points thingy" decision — lives + scoring are the only stakes).
- No album art, lyrics, or metadata beyond title/artist — avoids any
  reproduction-of-copyrighted-text question entirely.
