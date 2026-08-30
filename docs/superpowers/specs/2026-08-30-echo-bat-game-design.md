# Echo — design

A one-button cave game for COMP4020 crit 5 ("A game").
Brief and spec: https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/05-game/

## What it is

Flappy Bird's skeleton — one button, gravity, gaps to thread — with the light
taken away. You play a bat in a dark cave. A flap is also a ping: it throws out
a pulse of light that reveals the cave ahead, then fades. Stop flapping and you
both fall and go blind.

The twist earns its keep because it doubles the meaning of the only input. In
Flappy Bird a tap means "go up". Here it means "go up" *and* "see". The two
pull against each other: the natural instinct is to stop flapping and coast
down, and that is exactly the moment you lose sight of what you are falling
toward. You end up pulsing to keep the world visible even when you do not want
the altitude.

The bat framing is not decoration. A bat sees by echolocation, so the darkness
between pings is what the animal actually experiences — the theme explains the
mechanic without a word of text.

## The spec, and where each line is answered

| Spec line | Where it is answered |
| --- | --- |
| Deployed and live at the Pages URL by the cutoff | CI deploy; `ship` skill at the cutoff |
| It can be lost: a wrong move is possible, play ends | `hits()` in `rules.ts`; `dead` state |
| Teaches itself: no instructions anywhere | `ready` screen; first ping is the tutorial |
| A stranger reaches an ending inside five minutes | Tuning + playtest (human judgement) |
| One rule has a focused automated test | `hits()` unit tests in `spec/game.test.ts` |
| One change came from playing the finished game | Playtest session; cited in `PROCESS.md` |
| Repo shows the process | Commits, `PROCESS.md`, `reflections/crit-5.md` |
| Account for how the work was directed | The crit itself |

Three of these are human judgement and no test can hold them: the stranger
finishing inside five minutes, the opening screen making the first move obvious
through affordance alone, and whether one mechanic stays interesting at five
minutes.

## Mechanics

### Flight

Standard Flappy physics, tuned a notch gentler than the original because a
stranger has to survive long enough to reach the milestone.

- Constant downward gravity per tick.
- A flap sets upward velocity to a fixed impulse (it does not add to it, so
  mashing does not accumulate lift).
- Fall speed is capped.
- The bat's `x` is fixed on screen; the world scrolls past it.

Flapping is free. There is no fuel meter and no resource to manage — the only
cost of a flap is altitude you might not have wanted.

### Light

The piece of genuinely new logic.

- A faint **aura** travels with the bat at all times, roughly one bat-length of
  visibility. This is the fairness floor: the player is never fully blind.
- Each flap fires a **ping** — illumination snaps to its maximum radius, far
  enough to see the next gap and line up for it.
- The ping decays back to the aura over roughly 0.8s on an ease-out curve.

```
sightRadius(ticksSinceFlap) = AURA + (MAX - AURA) * decay(ticksSinceFlap)
```

`decay` falls from 1 to 0 and clamps there. `AURA` never reaches zero.

`render.ts` consumes the radius as a radial-gradient hole punched in a dark
overlay via `globalCompositeOperation = "destination-out"`.

Under `prefers-reduced-motion`, soften to a larger, slowly-breathing glow
instead of a sharp pulse.

### The cave

Stalactites hang from the ceiling and stalagmites rise from the floor, in pairs
with a gap between — Flappy's pillars, reframed.

Generation is endless from a seeded RNG (small xorshift). Each new pillar's gap
centre random-walks from the previous one, **clamped so the step never exceeds
what a single full ping reveals**. That clamp is the constraint that keeps
"dark" from becoming "unfair", and it is asserted by a test rather than left to
care.

### Endings

Endless with a milestone win, so both endings the spec names exist.

- **Loss:** touch a stalactite or stalagmite. The run ends.
- **Win:** cross the milestone distance and the cave mouth resolves out of the
  dark ahead in a wash of daylight — a wordless "you made it out". Play
  continues after it for a personal best.

The milestone is tuned to roughly a minute of clean flight, and its exact value
is set **last**, once a competent run has a known feel.

## Screens

State machine: `ready → flying → dead`, with a `madeItOut` flag that flips once
during `flying` and sticks for the run. `dead` returns to `ready` on a tap.

**`ready`** — the bat hovers mid-screen in the dark, faint aura around it, a
slow idle bob and the occasional wing-twitch: visibly alive and waiting.
Gravity is off, nothing scrolls. The game's name is set as a title treatment,
which is a name and not an instruction. The first tap flaps, fires the first
ping, and starts the world moving. That first ping is the entire tutorial.

**`flying`** — pure game. No HUD, no text, no on-screen distance counter.

**`dead`** — freeze and dim the last frame. Show two numbers, distance reached
and best, plus the daylight tint behind them if the milestone was crossed this
run. A soft pulsing chevron signals "again" without words; any tap restarts.

Restart returns to `ready` rather than straight into `flying`, so a panic-tap
after a crash does not fling the player into a wall they cannot see. This is a
deliberate choice and an explicit playtest question.

### Input

One intent, `flap()`, bound to: click, touch, `Enter`, `Space`, `ArrowUp`, `W`.
Space and ArrowUp must `preventDefault()` so the page does not scroll.

## Architecture

All game rules live in pure functions with no DOM and no canvas, so vitest
tests them directly.

| Module | Owns | Tested |
| --- | --- | --- |
| `src/scripts/rules.ts` | Physics step, collision, light decay, milestone. Pure. | Yes — the spec test lands here |
| `src/scripts/world.ts` | Seeded RNG, pillar generation, gap random-walk | Yes |
| `src/scripts/game.ts` | Mutable state, the state machine, fixed-timestep loop | Lightly |
| `src/scripts/render.ts` | All canvas drawing, the darkness mask | No — judged by eye |
| `src/scripts/input.ts` | Input bindings → one `flap()` intent | No |
| `src/scripts/main.ts` | Wiring, `requestAnimationFrame` loop | No |

### State

```ts
type Bat = { y: number; vy: number };            // x is fixed on screen
type Pillar = { x: number; gapY: number; gapHalf: number };
type Game = {
  phase: "ready" | "flying" | "dead";
  bat: Bat;
  pillars: Pillar[];
  distance: number;        // metres travelled
  best: number;            // from localStorage
  madeItOut: boolean;      // milestone crossed this run
  ticksSinceFlap: number;  // drives the light
};
```

### Fixed timestep

The world advances in fixed 60Hz steps via an accumulator, regardless of frame
rate, with rendering interpolated between steps. This matters twice: the game
plays identically on a 60Hz and a 144Hz monitor — a real and common bug in
Flappy clones — and the rules become deterministic, so a test can step N times
and assert an exact outcome with no timing flake.

### Tuning

Every tunable constant lives in one exported `TUNING` object at the top of
`rules.ts`: gravity, flap impulse, terminal velocity, `AURA`, `MAX`, decay
duration, scroll speed, gap size, gap-walk clamp, milestone distance. Tuning is
then editing numbers in one place rather than hunting through code — which
matters because the tuning band here is narrow.

### Persistence

`best` in `localStorage`, wrapped in try/catch: private windows and blocked
site data throw, and the game must still run when it does.

## Testing

Replaces the `expect.fail` placeholder already committed in `spec/game.test.ts`.

**The focused rule test — `hits(bat, pillar)`.** A pure box-vs-gap check, the
rule that makes the game losable. Explicit cases: dead-centre in the gap is
false; grazing the stalactite is true; grazing the stalagmite is true; just past
the pillar's trailing edge is false. This answers spec lines 2 and 5 together.

**The light — `sightRadius(ticksSinceFlap)`.** Full radius on the flap tick,
monotonically decreasing after, and never below `AURA`. The last assertion is
the fairness guarantee encoded as a test.

**Reachability — `world.ts`.** Generate 200 pillars from a fixed seed and
assert every gap-to-gap step is within what a single ping reveals. This is the
test that stops "dark" from becoming cheap.

**Already committed, go green as the build lands:** an ending exists and the
page says so; first-party JS ships; no instructions text or help element.

**Shipped invariants** (`spec/invariants.test.ts`) require a `<nav>`, exactly
one `<h1>`, a title, a meta description and an `og:image`, even though the page
is essentially one canvas. Satisfy them honestly: a visually-hidden `<h1>`
carrying the game's name, and a minimal visually-hidden `<nav>` with one real
link to the source repo. The canvas has no `<img>`, so the alt-text invariant
does not apply.

## Risks

1. **The tuning band is narrow.** This was the known cost of choosing this
   twist. Decay time, `MAX`, `AURA`, gravity, gap size and scroll speed all
   interact, and "fair but dark" is a narrow target: too dark or too fast a
   decay and a stranger feels cheated by hits they had no chance to see; too
   bright and the twist evaporates. Mitigated by the single `TUNING` object and
   by budgeting real play time.
2. **The milestone distance is a guess** until the game is played. Set it last.
3. **A stranger's first thirty seconds is the whole spec.** The spec separately
   requires one change that came from playing rather than reading code, so the
   playtest session is not optional. Whatever it changes, keep it — it is a
   `PROCESS.md` citation.

## Verification

- `pnpm check` green (astro check, build, all spec tests).
- `pnpm check:evidence` green before shipping — it gates the CI deploy, and
  `pnpm check` does not run it.
- Looked at under the Pages base path (`pnpm dev`, then
  `/comp4020-crit5-fiardiel/`), not just at the root.
- Played. By someone who has not read the code, if at all possible.

## Out of scope

Deliberately not built: sound, a fuel or energy meter, multiple levels, enemies,
a settings screen, difficulty selection, a leaderboard beyond the local best.
One mechanic and the light it interacts with is the whole game.
