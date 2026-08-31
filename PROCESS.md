# Process overview

## What I built

**One More Second**, a Heardle-style song-guessing game: one Linkin Park or My
Chemical Romance song per round, revealed through a fixed ladder of iTunes
preview clips that starts at a tenth of a second and grows to fifteen. Type
the title (or pick it from autocomplete suggestions) and hit Enter — or tap
the Enter button — to guess; get it right and a reveal panel confirms the
song and artist in green before the clip shrinks back down for the next
song, get it wrong five times and the same panel shows the song and artist
in red plus the life you lost. Either way a visible Continue button (or a
tap anywhere on the panel) moves on. Three lives on every difficulty; pick
Easy (5 songs), Medium (10), or Hard (20) — the count is printed right on
each button — before the run starts. Tier pips and a progress bar track
where you are inside it, a play-clip button lets you hear the current clip
again at any time, a skip button gives up on the current tier without
guessing, and a quit button abandons the run back to the difficulty picker.

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
   the pool). [`ec525eb`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-fiardiel/commit/ec525eb)
   corrects the actual cause instead — adding `entity=song` to the query —
   verified against the live API across the full 26-song pool with zero
   regressions, and reverts that offset back to `0` since the correct asset
   has no silence to skip.

4. **A real playtest, not a review, found what actually made the game feel
   bad — and it took two rounds of feedback to land.** Once the build above
   shipped, I asked to actually play it. The first round of feedback was
   concrete: no indicator for the 0.5s tier, the ▶ button disappearing with
   no way to replay a clip, a life lost with zero on-screen acknowledgement,
   and the discovery that the "5 songs" the player assumed they were playing
   was actually a flat 26. [`af3bd6c`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-fiardiel/commit/af3bd6c)
   added a `"reveal"` phase to the state machine (`src/scripts/rules.ts`) so a
   last-tier miss pauses the run on the missed song's title/artist and the
   life count, instead of silently advancing. A second, more specific round
   of feedback then asked for player-chosen difficulty (Easy 5/Medium
   10/Hard 20, all 3 lives) rather than a fixed run length, plus autocomplete
   suggestions on the guess input.
   [`8930bf1`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-fiardiel/commit/8930bf1)
   wired all of it in: a difficulty-picker idle screen (the difficulty tap
   itself is now the audio-autoplay-unlock gesture, replacing the ▶ button),
   tier pips, a progress bar, a replay button backed by a URL cache so
   replaying or advancing tiers never re-fetches iTunes, and a custom
   combobox — not a native `<datalist>`, which only prefix-matches in
   Safari/Firefox — drawing substring-matched suggestions from the full
   26-song list rather than just the current run, so Hard's 20-of-26 songs
   don't leak most of the answer set through the suggestion dropdown. The
   design spec (`docs/superpowers/specs/2026-08-31-song-guess-game-design.md`)
   was updated in the same round to mark the superseded sections and record
   why each change was made, rather than silently drifting from what the
   code now does. A third round of feedback followed once the difficulty
   tiers and autocomplete had actually been played: the replay button
   didn't need to be framed as specifically a *replay* control, there was
   no way to give up on a tier without guessing wrong, and no way to bail
   out of a run back to the difficulty picker.
   [`51a42bd`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-fiardiel/commit/51a42bd)
   renamed `#replay`/↻ to `#play-clip`/▶ (its job was always just "play the
   current clip"), added a skip button that routes through the exact same
   `rules.ts` state transition as a wrong guess — `skipTier` shares the
   `missTier` helper extracted from `applyGuess`, so skipping the last tier
   still costs a life and pauses on the reveal panel, closing off the
   obvious exploit of using skip to dodge the game's one real stake — and
   added an always-visible quit button with no confirmation dialog, since
   abandoning a run and restarting costs nothing worth protecting. This is
   the mandatory "one change verified by playing, not reading code" the
   spec's compliance table promises — it happened three times, because
   each fix round surfaced something (run length, then the strictness of
   typing an exact title from memory, then control affordances the first
   two rounds hadn't touched) that the next round then addressed.
   A fourth round, playing with the skip/quit controls in place, surfaced a
   sharper version of the same "no on-screen confirmation" gap the first
   round had only half-closed: a screenshot showed a miss's reveal panel
   with no visible way to move on (tap-anywhere already worked, it just
   wasn't discoverable), a correct guess still advanced silently with no
   confirmation of the song and artist, there was no explicit Enter control
   next to the guess input, and the difficulty picker didn't say how many
   songs each option actually was. [`585677b`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-fiardiel/commit/585677b)
   extended the `"reveal"` phase to pause on a correct guess too — `Reveal`
   gained an `outcome: "hit" | "miss"` field, and `applyGuess`'s hit branch
   now builds a reveal exactly like `missTier` already did, rather than
   sailing straight through to the next song. [`28d652e`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-fiardiel/commit/28d652e)
   then added the two buttons that gap actually called for, both wired with
   zero new event listeners by reusing plumbing already in place: `#submit-guess`
   is a native `type="submit"` button inside the existing guess form, so it
   triggers the form's own submit handler (already guarded to no-op outside
   `"playing"`); `#reveal-continue` is a DOM child of `#reveal-panel`, so a
   click on it bubbles up to the panel's existing click listener. The same
   commit colored the reveal message green for a hit and red for a miss, and
   moved the difficulty picker's markup into an Astro frontmatter
   `DIFFICULTIES.map()` so the "N songs" subline on each button can never
   drift out of sync with the actual array — a second hardcoded copy of
   5/10/20 was the more obvious move and the one deliberately avoided.

5. **A bug that reading the code could not find, a test that agreed with the
   code, and a screenshot that was right all along.** A fifth playtest
   reported the reveal panel still on screen during the *next* song. Reading
   `main.ts` said the opposite: `render()` sets
   `revealPanel.hidden = state.phase !== "reveal"` unconditionally, and
   `styles.css` had no competing `display` on the controls I thought were at
   fault. Rather than argue with the screenshot, I built the thing the repo
   didn't have —
   [`f9f5662`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-fiardiel/commit/f9f5662)
   loads the *built* `dist/` HTML, CSS and JS into jsdom, re-tags the shipped
   `type="module"` bundle as a classic script so jsdom will actually execute
   it (Vite inlines it fully, so it has no top-level import/export to break),
   and drives it through real clicks and real form submits. Every previous
   test in `spec/` only parsed static markup; none had ever run the game.
   It passed — and I nearly shipped that pass as "the code is fine, hard-refresh
   your browser". It was a false negative: it asserted `.hidden`, which reads
   `true` for the entire time the bug is on screen. The screenshot itself
   held the disproof. Its progress bar drew a third `seg-current`, and
   `renderProgressBar()` only draws `seg-current` outside a reveal — so the
   run had already advanced, the play/skip/input controls I'd blamed were
   correctly visible, and the panel drawn on top of them was stale.
   [`7d28e21`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-fiardiel/commit/7d28e21)
   fixes the actual cause: `#reveal-panel { display: flex }` is an id selector
   (1,0,0) and outranks the UA stylesheet's `[hidden] { display: none }`
   (0,1,0), so `.hidden = true` set the attribute and changed nothing about
   how the element drew. The panel had been permanently visible since the day
   it was added, invisible only because it was empty until the first reveal
   filled it in. `styles.css` already documents this exact trap and guards
   `#idle-screen`/`#play-screen`/`#end-screen`/`#suggestions` against it;
   `#reveal-panel` arrived later without the override. The same commit
   extends the test to assert *computed display* rather than `.hidden` — it
   fails on the old CSS with `expected 'flex' to be 'none'` and passes on
   the new. The lesson worth keeping is not the CSS rule: it's that a test
   asserting the property the bug doesn't touch is more dangerous than no
   test, because it converts a true bug report into false confidence.
