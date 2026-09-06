// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { describeAlbumVideoFrames, describeVideoParts } from "./describe";

describe("describeVideoParts", () => {
  test("says the frames are a time-ordered sample of one clip", () => {
    expect(
      describeVideoParts({
        kind: "video",
        durationSec: 42,
        frames: 6,
        hasAudio: true,
      }),
    ).toBe(
      "6 frames sampled in chronological order from a video (42s), plus that clip's soundtrack as audio",
    );
  });

  test("names the clip kind and flags a missing soundtrack", () => {
    expect(
      describeVideoParts({
        kind: "animation",
        durationSec: 3,
        frames: 1,
        hasAudio: false,
      }),
    ).toBe(
      "1 frame sampled in chronological order from a silent animation (GIF) (3s), with no soundtrack",
    );
  });

  test("omits an unknown duration rather than claiming 0s", () => {
    expect(
      describeVideoParts({
        kind: "video_note",
        durationSec: 0,
        frames: 2,
        hasAudio: true,
      }),
    ).toContain("from a round video note, plus");
  });

  test("an album note only claims that *some* images are frames", () => {
    expect(describeAlbumVideoFrames(2, 6)).toBe(
      "6 of the attached images are frames sampled in chronological order from 2 videos in the same album (their soundtracks are not included)",
    );
  });
});
