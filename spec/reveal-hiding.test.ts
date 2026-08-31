import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { TIERS } from "../src/scripts/rules";

// A playtest report ("the reveal panel showed, but the play/skip buttons and
// the guess input+Enter were still on screen too") turned out, on reading
// main.ts and styles.css, to look correct on paper: render() unconditionally
// sets .hidden on all three during phase "reveal", and no CSS rule in this
// project gives any of them a competing `display` that would out-cascade the
// browser's default `[hidden] { display: none }`. That mismatch between "the
// code looks right" and "the screenshot says otherwise" is exactly what
// spec/game.test.ts *can't* catch — it only parses dist/index.html's static
// markup, it never executes the shipped bundle against a real DOM. This test
// does: it loads the actual built HTML/CSS/JS from dist/ into jsdom, runs the
// real script against a real document, and drives it through actual clicks
// and a real form submit — so a future regression here fails a test instead
// of only showing up in a screenshot.
//
// The shipped script tag is `<script type="module" src="...">`; jsdom does
// not execute module scripts. The bundle itself has no top-level import/
// export (Astro/Vite fully inlines it), so it's safe to re-tag as a classic
// script for execution here — its behavior is unaffected either way.

function loadGamePage(): { window: InstanceType<typeof JSDOM>["window"]; document: Document } {
  const html = readFileSync(resolve("dist/index.html"), "utf8");
  const scriptSrcMatch = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
  if (!scriptSrcMatch) throw new Error("expected a <script type=\"module\" src=\"...\"> tag in dist/index.html");
  const scriptPath = scriptSrcMatch[1].replace(/^.*\/_astro\//, "dist/_astro/");
  const bundleSrc = readFileSync(resolve(scriptPath), "utf8");

  const linkMatch = html.match(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
  if (!linkMatch) throw new Error("expected a <link rel=\"stylesheet\"> tag in dist/index.html");
  const cssPath = linkMatch[1].replace(/^.*\/_astro\//, "dist/_astro/");
  const cssSrc = readFileSync(resolve(cssPath), "utf8");

  const patchedHtml = html
    .replace(scriptSrcMatch[0], `<script>${bundleSrc}</script>`)
    .replace(linkMatch[0], `<style>${cssSrc}</style>`);

  const dom = new JSDOM(patchedHtml, {
    url: "http://localhost/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      // No real network in a test — fetchPreviewUrl() must not hit iTunes.
      window.fetch = (async () => ({
        ok: false,
        json: async () => ({ results: [] }),
      })) as unknown as typeof window.fetch;
      window.HTMLMediaElement.prototype.play = () => Promise.resolve();
      window.HTMLMediaElement.prototype.pause = () => {};
    },
  });
  return { window: dom.window, document: dom.window.document };
}

function flush(ms = 20): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("the reveal panel actually hides the playing-phase controls", () => {
  it("hides #play-clip, #skip, and #guess-form (and shows #reveal-panel) once a miss ends a song", async () => {
    const { window, document } = loadGamePage();
    await flush(50); // let main.ts's top-level setup / DOMContentLoaded run

    const easyButton = document.querySelector('.difficulty[data-difficulty="easy"]');
    expect(easyButton, "no easy-difficulty button — can't start a run").not.toBeNull();
    easyButton?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await flush(50);

    const guessInput = document.querySelector<HTMLInputElement>("#guess");
    const guessForm = document.querySelector<HTMLFormElement>("#guess-form");
    const playClip = document.querySelector<HTMLButtonElement>("#play-clip");
    const skip = document.querySelector<HTMLButtonElement>("#skip");
    const revealPanel = document.querySelector<HTMLDivElement>("#reveal-panel");
    expect(guessInput && guessForm && playClip && skip && revealPanel, "expected play-screen controls in the DOM").not.toBeNull();

    // Sanity: mid-song, the playing controls are up and the reveal panel isn't.
    expect(guessForm?.hidden).toBe(false);
    expect(playClip?.hidden).toBe(false);
    expect(skip?.hidden).toBe(false);
    expect(revealPanel?.hidden).toBe(true);

    // Miss every tier on this song — TIERS.length wrong guesses in a row.
    for (let i = 0; i < TIERS.length; i++) {
      guessInput!.value = "definitely not a real song title";
      guessForm?.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      await flush(20);
    }

    // Both the DOM property AND the resulting computed style must actually
    // hide these — a `.hidden = true` that a CSS rule silently out-cascades
    // (the exact shape of bug this project already guards `#idle-screen`
    // et al. against) would pass the property check and still show on screen.
    const displayOf = (el: Element | null) => (el ? window.getComputedStyle(el).display : null);

    expect(guessForm?.hidden, "guess input + Enter button stayed visible into the reveal").toBe(true);
    expect(displayOf(guessForm)).toBe("none");
    expect(playClip?.hidden, "the ▶ play-clip button stayed visible into the reveal").toBe(true);
    expect(displayOf(playClip)).toBe("none");
    expect(skip?.hidden, "the ⏭ skip button stayed visible into the reveal").toBe(true);
    expect(displayOf(skip)).toBe("none");

    expect(revealPanel?.hidden, "the reveal panel never showed after the last-tier miss").toBe(false);
    expect(displayOf(revealPanel)).not.toBe("none");
    expect(document.querySelector("#reveal-message")?.textContent).toMatch(/^✗ /);
  });
});
