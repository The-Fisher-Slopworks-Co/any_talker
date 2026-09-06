// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import {
  audioArgs,
  extractVideoMedia,
  frameArgs,
  frameSampleFps,
  splitJpegFrames,
} from "./decode";
import { concat, fakeSpawn, jpeg, mp3 } from "./test-fixtures";
import type { FfmpegSpawnFn } from "../ffmpeg";

describe("frameSampleFps", () => {
  test("spreads the sample evenly over a long clip", () => {
    expect(frameSampleFps(60, 6)).toBe("6/60");
  });

  test("caps the density on a short clip so frames aren't near-duplicates", () => {
    expect(frameSampleFps(2, 6)).toBe("2");
  });

  test("falls back to the density cap when the duration is unusable", () => {
    expect(frameSampleFps(0, 6)).toBe("2");
    expect(frameSampleFps(-5, 6)).toBe("2");
    expect(frameSampleFps(Number.NaN, 6)).toBe("2");
  });
});

describe("ffmpeg arguments", () => {
  test("the frame pass reads the file, samples and caps the count", () => {
    const args = frameArgs("/tmp/clip", 60, 6);
    expect(args[0]).toBe("ffmpeg");
    expect(args).toContain("/tmp/clip");
    expect(args.join(" ")).toContain("fps=6/60");
    expect(args[args.indexOf("-frames:v") + 1]).toBe("6");
    // Frames only — the soundtrack is a separate pass.
    expect(args).toContain("-an");
  });

  test("the audio pass demands an audio stream and bounds its length", () => {
    const args = audioArgs("/tmp/clip");
    expect(args).toContain("/tmp/clip");
    expect(args).toContain("-vn");
    // No trailing "?": a silent clip must fail the pass, not produce silence.
    expect(args[args.indexOf("-map") + 1]).toBe("0:a");
    expect(args).toContain("-t");
  });
});

describe("splitJpegFrames", () => {
  test("splits a concatenated mjpeg stream into whole frames", () => {
    const frames = splitJpegFrames(concat(jpeg(1), jpeg(2), jpeg(3)));
    expect(frames).toEqual([jpeg(1), jpeg(2), jpeg(3)]);
  });

  test("returns nothing for an empty or marker-less buffer", () => {
    expect(splitJpegFrames(new Uint8Array())).toEqual([]);
    expect(splitJpegFrames(new Uint8Array([1, 2, 3, 4]))).toEqual([]);
  });
});

describe("extractVideoMedia", () => {
  test("returns the frames and the soundtrack, then removes the temp file", async () => {
    const calls: string[][] = [];
    const result = await extractVideoMedia({
      bytes: new Uint8Array([0, 1, 2, 3]),
      durationSec: 30,
      maxFrames: 2,
      withAudio: true,
      spawn: fakeSpawn({ frames: concat(jpeg(1), jpeg(2)), audio: mp3, calls }),
    });

    expect(result.frames).toEqual([jpeg(1), jpeg(2)]);
    expect(result.audio).toEqual(mp3);

    // ffmpeg needs a seekable input (an mp4 with a trailing `moov` atom can't be
    // demuxed from a pipe), so the clip is staged on disk — and cleaned up.
    const path = calls[0]![calls[0]!.indexOf("-i") + 1]!;
    expect(await Bun.file(path).exists()).toBe(false);
  });

  test("never samples more frames than asked for", async () => {
    const result = await extractVideoMedia({
      bytes: new Uint8Array([0]),
      durationSec: 30,
      maxFrames: 2,
      withAudio: false,
      spawn: fakeSpawn({ frames: concat(jpeg(1), jpeg(2), jpeg(3)) }),
    });
    expect(result.frames).toHaveLength(2);
  });

  test("skips the audio pass entirely when the caller doesn't want it", async () => {
    const calls: string[][] = [];
    const result = await extractVideoMedia({
      bytes: new Uint8Array([0]),
      durationSec: 5,
      maxFrames: 2,
      withAudio: false,
      spawn: fakeSpawn({ frames: jpeg(1), audio: mp3, calls }),
    });
    expect(result.audio).toBeNull();
    expect(calls).toHaveLength(1);
  });

  test("keeps the frames when the clip has no soundtrack", async () => {
    const result = await extractVideoMedia({
      bytes: new Uint8Array([0]),
      durationSec: 5,
      maxFrames: 2,
      withAudio: true,
      // A silent clip makes the audio pass exit non-zero.
      spawn: fakeSpawn({ frames: jpeg(1), audio: null }),
    });
    expect(result.frames).toEqual([jpeg(1)]);
    expect(result.audio).toBeNull();
  });

  test("yields nothing when ffmpeg is missing or fails", async () => {
    const throwing: FfmpegSpawnFn = () => {
      throw new Error("ENOENT: ffmpeg not found");
    };
    const result = await extractVideoMedia({
      bytes: new Uint8Array([0]),
      durationSec: 5,
      maxFrames: 2,
      withAudio: true,
      spawn: throwing,
    });
    expect(result).toEqual({ frames: [], audio: null });
  });
});
