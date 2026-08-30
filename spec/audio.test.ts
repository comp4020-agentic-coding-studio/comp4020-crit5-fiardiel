import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPreviewUrl, playClip } from "../src/scripts/audio";

describe("fetchPreviewUrl", () => {
  it("queries the iTunes Search API with artist+title and returns previewUrl", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ previewUrl: "https://example.com/clip.m4a" }] }),
    });
    const url = await fetchPreviewUrl("Linkin Park", "Numb", fakeFetch as unknown as typeof fetch);
    expect(url).toBe("https://example.com/clip.m4a");
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const calledUrl = fakeFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("itunes.apple.com/search");
    expect(calledUrl).toContain("media=music");
    expect(calledUrl).toContain(encodeURIComponent("Linkin Park Numb"));
  });

  it("returns null when the response isn't ok", async () => {
    const notOk = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(await fetchPreviewUrl("X", "Y", notOk as unknown as typeof fetch)).toBeNull();
  });

  it("returns null when there are no results or no previewUrl", async () => {
    const empty = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    expect(await fetchPreviewUrl("X", "Y", empty as unknown as typeof fetch)).toBeNull();

    const noPreview = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{}] }) });
    expect(await fetchPreviewUrl("X", "Y", noPreview as unknown as typeof fetch)).toBeNull();
  });
});

describe("playClip", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("seeks to the start offset, plays, and stops itself after durationSec", () => {
    vi.useFakeTimers();
    const audio = { play: vi.fn(), pause: vi.fn(), currentTime: 0, src: "" };

    playClip(audio, "https://example.com/clip.m4a", 12, 2);

    expect(audio.src).toBe("https://example.com/clip.m4a");
    expect(audio.currentTime).toBe(12);
    expect(audio.play).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1999);
    expect(audio.pause).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(audio.pause).toHaveBeenCalledTimes(2);
  });

  it("pauses whatever was already playing before starting the new clip", () => {
    vi.useFakeTimers();
    const audio = { play: vi.fn(), pause: vi.fn(), currentTime: 0, src: "old.m4a" };
    playClip(audio, "new.m4a", 0, 0.1);
    // one defensive pause before the seek/play, one scheduled stop:
    expect(audio.pause).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(audio.pause).toHaveBeenCalledTimes(2);
  });
});
