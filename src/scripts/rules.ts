// Pure game rules: no DOM, no canvas. Every tunable number lives in TUNING
// so balancing the game is editing values here, not hunting through code.
export const TUNING = {
  // flight
  gravity: 0.35, // px/tick^2, downward
  flapImpulse: 6.2, // px/tick, upward velocity a flap SETS (not adds)
  terminalVelocity: 8, // px/tick, fall speed cap
  batRadius: 14, // px, collision half-size
  batX: 120, // px, the bat's fixed screen x

  // light
  aura: 40, // px, floor radius — never fully blind
  maxSight: 220, // px, radius snapped to on a flap
  decayTicks: 48, // ticks for a ping to decay back to AURA (~0.8s @ 60Hz)

  // the cave
  playHeight: 600, // px, logical height of the play field
  floorMargin: 30, // px, gap centres never come within this of the edges
  gapSize: 130, // px, vertical opening in a pillar
  pillarWidth: 60, // px, horizontal thickness of a pillar
  pillarSpacing: 260, // px, distance between consecutive pillar centres
  gapWalkClamp: 90, // px, max step a gap centre takes between pillars
  scrollSpeed: 2.2, // px/tick, world scroll speed == distance per tick

  // endings
  milestoneDistance: 7900, // distance to the cave mouth (~60s clean flight)
};

export type Bat = { y: number; vy: number };
export type Pillar = { x: number; gapY: number; gapHalf: number };
export type Phase = "ready" | "flying" | "dead";

/** Box-vs-gap collision: does `bat`, sat at TUNING.batX, touch `pillar`'s
 *  stalactite or stalagmite? `pillar.x` is in the same screen-space as
 *  TUNING.batX — the caller subtracts distance travelled before calling
 *  this, so a pillar already behind the bat correctly never hits. */
export function hits(bat: Bat, pillar: Pillar): boolean {
  const halfWidth = TUNING.pillarWidth / 2;
  const overlapsX =
    TUNING.batX + TUNING.batRadius >= pillar.x - halfWidth &&
    TUNING.batX - TUNING.batRadius <= pillar.x + halfWidth;
  if (!overlapsX) return false;

  const topOfGap = pillar.gapY - pillar.gapHalf;
  const bottomOfGap = pillar.gapY + pillar.gapHalf;
  return bat.y - TUNING.batRadius <= topOfGap || bat.y + TUNING.batRadius >= bottomOfGap;
}
