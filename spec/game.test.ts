import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import astroConfig from "../astro.config.ts";
import { LIVES_START, TIERS, applyGuess, createInitialState, matchesTitle, start } from "../src/scripts/rules";

// Spec: https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/05-game/
//
// Contract tests for the mechanically-checkable spec lines, checked against the
// BUILT site (dist/) — the shipped HTML and JS, not the source — plus one
// focused unit test of a single game rule (spec line 5): matchesTitle, the
// guess-checking rule the whole loop turns on.
//
// What a test can't reach, and the crit judges instead: a stranger finishing
// inside five minutes, the opening screen making the first move obvious
// through the ▶ button alone, whether the escalating-clip loop stays
// interesting at five minutes. See spec/README.md.
//
// This starts RED — there's no song game yet. Turning it green across the
// build is the work. See
// docs/superpowers/plans/2026-08-31-song-guess-game-implementation.md.

const html = readFileSync(resolve("dist/index.html"), "utf8");
const doc = new JSDOM(html).window.document;

// astro.config.ts sets a GitHub Pages `base`; a shipped <script src> is
// base-prefixed while the file on disk isn't — strip the base before resolving.
const base = (astroConfig.base ?? "/").replace(/\/$/, "");
const scripts = [...doc.querySelectorAll("script")]
  .map((el) => {
    const src = el.getAttribute("src");
    if (src == null) {
      // Astro inlines small bundles directly into the page rather than
      // emitting a separate chunk — this is still first-party JS, just
      // not externalized. Read it straight from the DOM.
      return el.textContent ?? "";
    }
    if (src.startsWith("http")) return ""; // third-party, e.g. an analytics tag
    const rel = base && src.startsWith(`${base}/`) ? src.slice(base.length) : src;
    return readFileSync(resolve("dist", rel.replace(/^\.?\//, "")), "utf8");
  })
  .join("\n");

const pageText = (doc.body.textContent ?? "").toLowerCase();

describe("a game", () => {
  it("can be lost: play reaches an ending", () => {
    // Missing every tier on every song, LIVES_START songs in a row, must end
    // the run in "lost" — the state machine's own losing path, independent
    // of anything drawn on screen.
    let state = start(createInitialState(10));
    for (let song = 0; song < LIVES_START; song++) {
      for (let tier = 0; tier < TIERS.length; tier++) {
        state = applyGuess(state, "not the right answer", "the actual title");
      }
    }
    expect(state.phase, `${LIVES_START} missed songs never reached "lost"`).toBe("lost");
  });

  it("runs in this page's own JS — not a recording or an embed", () => {
    expect(
      doc.querySelector("iframe, video[src]"),
      "an <iframe>/<video> is doing the work — the game should run in this page's own script",
    ).toBeNull();
    // <audio> IS the mechanic here (the clip is the puzzle), not a stand-in
    // for gameplay — but its src must come from the script at runtime, not
    // be baked into the shipped markup, or this would just be a static
    // audio player, not a game.
    const audio = doc.querySelector("audio");
    expect(audio, "no <audio> element — where does the game play clips from?").not.toBeNull();
    expect(
      audio?.getAttribute("src"),
      "<audio> has a static src baked into the HTML — it must be set at runtime by the script",
    ).toBeFalsy();
    expect(
      scripts.trim().length,
      "no first-party script shipped — where does the game run?",
    ).toBeGreaterThan(0);
  });

  it("teaches itself: no how-to-play text or instructions panel", () => {
    const tutorialWords = [
      "how to play", "instructions", "controls:",
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
      "an instructions/help element is in the DOM — cut it; let the ▶ button and play do the teaching",
    ).toBeNull();
  });

  it("has a focused automated test for one game rule: matchesTitle(guess, title)", () => {
    // Spec line 5, paired with spec line 2 (the losing condition). The one
    // rule every round turns on: is this guess actually the song?
    expect(matchesTitle("numb", "Numb")).toBe(true);
    expect(matchesTitle("NUMB", "Numb")).toBe(true);
    expect(matchesTitle("black parade", "The Black Parade")).toBe(true);
    expect(matchesTitle("Im Not Okay", "I'm Not Okay")).toBe(true);
    expect(matchesTitle("Crawling", "Numb")).toBe(false);
    expect(matchesTitle("", "Numb")).toBe(false);
    expect(matchesTitle("Black", "Welcome to the Black Parade")).toBe(false);
  });
});
