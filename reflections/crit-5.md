# crit-5 reflection

**What was the breakthrough that moved the work forward?**

A playtest report said the reveal panel stayed on screen through the next
song. Reading `main.ts` said the opposite — `render()` unconditionally sets
`revealPanel.hidden = state.phase !== "reveal"` — and the jsdom test I wrote
to check it agreed: passed clean. I nearly reported back "the code is fine,
hard-refresh your browser." The breakthrough was treating that agreement as
suspicious rather than reassuring, and going back to the screenshot for
evidence instead of an anecdote to explain away. Its progress bar had already
drawn a third segment as "current," which `renderProgressBar()` only ever
does outside a reveal — proof the game state had moved on while the panel
stayed drawn on top of it. That pointed straight at `#reveal-panel`'s own
CSS: an id selector's `display: flex` outranks the browser's default
`[hidden] { display: none }`, so setting `.hidden = true` changed an
attribute and nothing on screen. My first test had asserted `.hidden`, not
computed `display` — it read true for the entire time the bug was live.

**What did this work change about who I want to be as a software developer?**

It sharpened a distrust of tests that pass by asserting a property next to
the bug instead of the bug itself — that kind of green is worse than no
test, because it turns a correct report into false confidence and a wrong
answer for whoever filed it. When a specific, repeatable report disagrees
with code that reads correctly, the report is a clue I haven't located yet,
not noise to reason past. I want to keep checking the rendered outcome, not
the property I assume produces it.
