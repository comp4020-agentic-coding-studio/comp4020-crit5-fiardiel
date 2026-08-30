# Process overview

## What I built

**One More Second**, a Heardle-style song-guessing game: one Linkin Park or My
Chemical Romance song per round, revealed through a fixed ladder of iTunes
preview clips that starts at a tenth of a second and grows to fifteen. Type
the title, get it right and the clip shrinks back down for the next song; get
it wrong five times and you lose a life. Three lives, 26 songs, one round
takes seconds — a stranger reaches a win or a loss well inside five minutes,
with no control on screen beyond a ▶ button and a text input.

## The moments that mattered

1. **The pivot from Echo to a song-guessing game.**
   [`933a500`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-fiardiel/commit/933a500)
   designed the replacement,
   [`12b3cc2`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-fiardiel/commit/12b3cc2)
   rewrote the checkable contract to match it (starting red on purpose —
   `matchesTitle` didn't exist yet), and
   [`692f0e3`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-fiardiel/commit/692f0e3)
   cleared Echo's rules/game/input/render/world modules and their tests and
   dropped in the static song list. The obvious move at that point would have
   been to patch Echo's mechanic into something that could pass a rewritten
   spec; instead the whole implementation was thrown away and rebuilt against
   the new contract, keeping Echo fully recoverable in git history rather
   than half-mutating it into something neither game did well. I knew this
   was the right call because the new spec (`spec/game.test.ts` after
   `12b3cc2`) was red for a real reason — no `matchesTitle`, no reveal
   ladder — not from a half-migrated mechanic failing in a way that would
   have been harder to diagnose.

2. **A contract test assumed Astro always externalizes first-party
   `<script>` tags, which doesn't hold at this bundle's size.**
   [`69c0d2f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-fiardiel/commit/69c0d2f)
   fixed the false failure by widening `game.test.ts`'s script-collection
   logic to also read an inlined `<script type="module">`'s `textContent`,
   not just an external `script[src]` read from `dist/`. The obvious fix
   would have been to pad the bundle so Astro externalizes it and the
   original test keeps working unmodified — that's tuning the code to suit
   the test. I loosened the test's detection instead, because the underlying
   spec line ("runs in this page's own JS — not a recording or an embed") is
   satisfied either way; a small first-party bundle inlined into the page is
   still first-party JS.
   [`b3b3fbb`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-fiardiel/commit/b3b3fbb)
   (same session) did the equivalent for typechecking: rather than excluding
   `spec/` from `astro check` to silence a stub-vs-real-signature mismatch,
   `src/scripts/rules.ts`'s stub was typed to match the real call shape,
   which restored typechecking for `spec/invariants.test.ts` too instead of
   quietly turning it off.

3. **A final whole-branch review — not a playtest — is what caught the real
   audio bug.** Chrome automation stayed unavailable for the entire session
   (see `reflections/crit-5.md`), so the verification that actually ran was
   the live iTunes Search API queried for all 26 songs, plus `ffmpeg`
   loudness measurement (`silencedetect` and mean volume) on the downloaded
   preview assets. That measurement is what surfaced the real defect: the
   query in `audio.ts` (`media=music`, no `entity` filter) was returning a
   `music-video` asset instead of the actual song for 2 of the 26 tracks
   ("Bleed It Out", "Na Na Na") — both measured 13-22dB quieter than the
   other 24, and "Na Na Na"'s wrong asset is dead-flat across all 30 seconds
   with no `startOffsetSec` workaround available at all. That's a more
   fundamental problem than a missing offset: no silent-intro skip can fix a
   query that fetches the wrong file in the first place. An earlier pass had
   raised "Bleed It Out"'s `startOffsetSec` from `0` to `5` to skip what
   looked like a silent intro — that treated a symptom of this same bug and
   didn't even close the gap (the tuned offset still measured ~22dB below
   the pool). This fix corrects the actual cause instead — adding
   `entity=song` to the query — verified against the live API across the
   full 26-song pool with zero regressions, and reverts that offset back to
   `0` since the correct asset has no silence to skip.
