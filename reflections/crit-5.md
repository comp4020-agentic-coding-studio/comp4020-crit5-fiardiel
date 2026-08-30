# crit-5 reflection

**What was the breakthrough that moved the work forward?**

This task's brief was "play a full run and tune what you noticed" — but no
headless browser or screenshot tool was available in this repo, and the
Chrome extension I do have access to didn't respond after several retries.
The breakthrough was realizing the brief's own audio pipeline is testable
without a browser at all: `fetchPreviewUrl` and the reveal ladder are pure
enough that I could hit the real iTunes Search API for all 26 songs, download
the actual `previewUrl` clips, and run `ffmpeg -af silencedetect` over each
one's opening seconds. That turned "does the 0.1s clip feel silent" from a
guess into a number: one song's clip measured dead silent for its first 1.1s
and choppy through 4.2s. Tuning `startOffsetSec` for that song from a
measurement, not a hunch, is a stronger playtest than clicking through a run
once and trusting my ear.

**What did this work change about who I want to be as a software developer?**

It sharpened a habit I want to keep: when the "obvious" verification tool
isn't available, look one level down at what the system is actually made of
before treating the check as unrunnable. A game's feel is usually diagnosed
by playing it, but this game's feel, at the tier-1 layer, is just a
measurable property of an audio file fetched from a real, unmocked API —
and that was checkable the whole time. I'd rather build the habit of finding
the checkable substrate under a "just play it and see" task than defer to
"I can't verify this one."
