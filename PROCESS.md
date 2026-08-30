# Process overview

A reading-guide to how the work came together --- a map to your process, not an
essay about it.

This file is the shape; the course site's
[assessment page](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#what-you-submit)
is the requirement, and its
[word counts](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#word-counts)
cover every deliverable.

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

3. **This task's own playtest-driven tuning change.** Playing a full run
   (reasoned from the actual state machine plus the real iTunes Search API,
   see `reflections/crit-5.md` for why no browser was available this
   session) turned up one song, "Bleed It Out", whose `previewUrl` — fetched
   live, the same call the game itself makes — decodes as dead silence for
   its first ~1.1s and stays choppy through ~4.2s (confirmed by downloading
   the actual clip and running `ffmpeg -af silencedetect` on it, not by
   guessing). That's precisely tier 1 (0.1s) and most of tier 2 (0.5s)
   landing on nothing, for every player, on every run that draws this song.
   The obvious "safe" move would have been to swap in a different song
   entirely; instead the design's actual tuning knob —
   `startOffsetSec` — was raised from `0` to `5` for that one song, landing
   past the choppy intro in continuous audio with 25 of the preview's ~30
   seconds still free for the 15s max tier. I know it's right because it's
   the single lowest-risk fix available (touches one field, on one song, in
   `src/scripts/songs.ts`) and it's checkable against real, fetched data
   rather than an assumption about how the song opens — see the diff for the
   exact value and the comment recording the measured silence window.

## Before you ship

`pnpm check:evidence` verifies your citations resolve to real commits, that a
reflection entry the marker reads is in `reflections/`, and that your
`CLAUDE.md` is there --- before a marker ever opens the file. It checks that
your map is traceable, not that it is good: the marker judges whether your
small, deliberately chosen set of moments shows real judgement and reflection.
A green check is not a substitute for that curation.
