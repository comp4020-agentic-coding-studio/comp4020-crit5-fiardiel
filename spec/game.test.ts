import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import astroConfig from "../astro.config.ts";

// Spec: https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/05-game/
//
// Contract tests for the mechanically-checkable spec lines, checked against the
// BUILT site (dist/) — the shipped HTML and JS, not the source — plus one
// focused unit test of a single game rule (spec line 5), which is yours to
// write once you've decided the rule.
//
// What a test can't reach, and the crit judges instead: a stranger finishing
// inside five minutes, the opening screen making the first move obvious through
// affordance alone, whether one mechanic stays interesting at five minutes. See
// spec/README.md.
//
// These start RED — there's no game yet. Turning them green across the week is
// the work. Adjust them as the design firms up: they encode today's reading of
// the contract, not a frozen one. If your ending or your rules live on a
// <canvas> rather than in the DOM, rewrite the relevant test to assert on that.

const html = readFileSync(resolve("dist/index.html"), "utf8");
const doc = new JSDOM(html).window.document;

// astro.config.ts sets a GitHub Pages `base`; a shipped <script src> is
// base-prefixed while the file on disk isn't — strip the base before resolving.
const base = (astroConfig.base ?? "/").replace(/\/$/, "");
const scripts = [...doc.querySelectorAll("script[src]")]
  .map((el) => el.getAttribute("src"))
  .filter((src): src is string => src != null && !src.startsWith("http"))
  .map((src) => {
    const rel = base && src.startsWith(`${base}/`) ? src.slice(base.length) : src;
    return readFileSync(resolve("dist", rel.replace(/^\.?\//, "")), "utf8");
  })
  .join("\n");

const pageText = (doc.body.textContent ?? "").toLowerCase();

describe("a game", () => {
  it("can be lost: play reaches an ending, and the player is told", () => {
    // crit 4's instrument was defined by the ABSENCE of a fail state; crit 5's
    // game is defined by its presence. Some sequence of moves ends play — a
    // win, a loss or a finish — and the page says so.
    const endWords = [
      "game over", "you win", "you won", "you lose", "you lost",
      "you died", "victory", "defeat", "the end", "well done",
      "play again", "try again", "restart", "new game", "final score",
    ];
    expect(
      endWords.some((w) => pageText.includes(w)),
      "no end-of-play text in the built page — a game you can lose has to resolve somewhere (win/loss/finish). If the ending is drawn on a <canvas>, assert on that instead.",
    ).toBe(true);
  });

  it("runs in this page's own JS — not a recording or an embed", () => {
    expect(
      doc.querySelector("iframe, video[src], audio[src]"),
      "an <iframe>/<video>/<audio> is doing the work — the game should run in this page's own script",
    ).toBeNull();
    expect(
      scripts.trim().length,
      "no first-party script shipped — where does the game run?",
    ).toBeGreaterThan(0);
  });

  it("teaches itself: no how-to-play text or instructions panel", () => {
    // A proxy for spec line 3. A person still judges whether the opening screen
    // actually invites the first move — this only guards against the lazy fix
    // of writing a tutorial instead.
    const tutorialWords = [
      "how to play", "instructions", "controls:", "use the arrow keys",
      "objective:", "your goal is", "tutorial", "rules:",
    ];
    for (const w of tutorialWords) {
      expect(
        pageText.includes(w),
        `found "${w}" — the game is meant to teach itself through play, no instructions on screen or off`,
      ).toBe(false);
    }
    expect(
      doc.querySelector(
        "#instructions, #help, #tutorial, .instructions, .help, [data-help]",
      ),
      "an instructions/help element is in the DOM — cut it; let the opening screen and play do the teaching",
    ).toBeNull();
  });

  it("has a focused automated test for one game rule", () => {
    // Spec line 5: "One rule of the game has a focused automated test."
    // Decide the rule — the losing condition is the natural pick, since it's
    // also spec line 2 — factor it into a pure function under src/scripts/,
    // and replace this placeholder with a real test of it, e.g.:
    //
    //   import { isCaught } from "../src/scripts/rules";
    //   expect(isCaught({ player: 3, chaser: 3 })).toBe(true);
    //   expect(isCaught({ player: 3, chaser: 5 })).toBe(false);
    //
    expect.fail(
      "Write a focused test of one game rule, then delete this placeholder (spec line 5).",
    );
  });
});
