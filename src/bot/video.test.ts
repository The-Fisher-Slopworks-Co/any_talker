// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import {
  audioArgs,
  describeAlbumVideoFrames,
  describeVideoParts,
  extractVideoMedia,
  fetchVideoParts,
  frameArgs,
  frameSampleFps,
  pickVideo,
  splitJpegFrames,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  type VideoSpawnFn,
} from "./video";

// A minimal JPEG: SOI ... EOI. Only the markers matter to `splitJpegFrames`.
const jpeg = (marker: number) =>
  new Uint8Array([0xff, 0xd8, 0xff, 0xe0, marker, 0xff, 0xd9]);

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
};

const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);

// A fake ffmpeg: answers the frame pass (recognised by `image2pipe`) and the
// audio pass separately, and records every argv it was handed.
const fakeSpawn = (opts: {
  frames?: Uint8Array | null;
  audio?: Uint8Array | null;
  calls?: string[][];
}): VideoSpawnFn => {
  return (cmd) => {
    opts.calls?.push(cmd);
    const isFrames = cmd.includes("image2pipe");
    const out = isFrames ? opts.frames : opts.audio;
    return {
      stdout: new ReadableStream<Uint8Array>({
        start(controller) {
          if (out && out.byteLength > 0) controller.enqueue(out);
          controller.close();
        },
      }),
      exited: Promise.resolve(out === null ? 1 : 0),
    };
  };
};

describe("pickVideo", () => {
  test("maps a video with all its metadata", () => {
    expect(
      pickVideo({
        video: {
          file_id: "vid",
          duration: 42,
          file_size: 1234,
          thumbnail: { file_id: "thumb" },
        },
      }),
    ).toEqual({
      kind: "video",
      fileId: "vid",
      durationSec: 42,
      fileSize: 1234,
      mediaType: "video/mp4",
      thumbnailFileId: "thumb",
    });
  });

  test("recognises video notes and animations", () => {
    expect(pickVideo({ video_note: { file_id: "vn" } })?.kind).toBe(
      "video_note",
    );
    expect(pickVideo({ animation: { file_id: "gif" } })?.kind).toBe("animation");
  });

  test("optional metadata degrades to zero duration / no size / no thumbnail", () => {
    expect(pickVideo({ video: { file_id: "vid" } })).toEqual({
      kind: "video",
      fileId: "vid",
      durationSec: 0,
      fileSize: null,
      mediaType: "video/mp4",
      thumbnailFileId: null,
    });
  });

  test("returns null for a message with no clip", () => {
    expect(pickVideo({})).toBeNull();
  });
});

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
    const throwing: VideoSpawnFn = () => {
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

describe("fetchVideoParts", () => {
  const video = {
    kind: "video" as const,
    fileId: "vid",
    durationSec: 30,
    fileSize: 1000,
    mediaType: "video/mp4",
    thumbnailFileId: "thumb",
  };

  test("hands a native-video model the clip whole, untouched by ffmpeg", async () => {
    const calls: string[][] = [];
    const bytes = new Uint8Array([1, 2, 3]);
    const result = await fetchVideoParts({
      botToken: "T",
      video,
      mode: "native",
      maxFrames: 2,
      download: async () => bytes,
      spawn: fakeSpawn({ frames: jpeg(1), audio: mp3, calls }),
    });
    expect(result).toEqual({
      ok: true,
      mode: "native",
      clip: { bytes, mediaType: "video/mp4" },
    });
    // The whole point: no decoding, no frame sampling, no soundtrack pass.
    expect(calls).toHaveLength(0);
  });

  test("decomposes a clip into frames and audio for a model without video", async () => {
    const result = await fetchVideoParts({
      botToken: "T",
      video,
      mode: "frames",
      maxFrames: 2,
      download: async () => new Uint8Array([1, 2, 3]),
      spawn: fakeSpawn({ frames: concat(jpeg(1), jpeg(2)), audio: mp3 }),
    });
    expect(result).toEqual({
      ok: true,
      mode: "frames",
      frames: [jpeg(1), jpeg(2)],
      audio: mp3,
    });
  });

  test("rejects a clip longer than the cap without downloading it", async () => {
    let downloaded = false;
    const result = await fetchVideoParts({
      botToken: "T",
      video: { ...video, durationSec: MAX_VIDEO_SECONDS + 1 },
      mode: "native",
      maxFrames: 2,
      download: async () => {
        downloaded = true;
        return new Uint8Array();
      },
      spawn: fakeSpawn({ frames: jpeg(1) }),
    });
    expect(result).toEqual({ ok: false, reason: "too_long" });
    expect(downloaded).toBe(false);
  });

  test("accepts a clip exactly at the duration cap", async () => {
    const result = await fetchVideoParts({
      botToken: "T",
      video: { ...video, durationSec: MAX_VIDEO_SECONDS },
      mode: "native",
      maxFrames: 2,
      download: async () => new Uint8Array([1]),
      spawn: fakeSpawn({ frames: jpeg(1) }),
    });
    expect(result.ok).toBe(true);
  });

  test("an unknown duration is not treated as too long", async () => {
    // Telegram states a duration for every clip kind, but 0 means "unknown"
    // here — refusing on it would reject a perfectly fine clip.
    const result = await fetchVideoParts({
      botToken: "T",
      video: { ...video, durationSec: 0 },
      mode: "native",
      maxFrames: 2,
      download: async () => new Uint8Array([1]),
      spawn: fakeSpawn({ frames: jpeg(1) }),
    });
    expect(result.ok).toBe(true);
  });

  test("rejects an oversized clip without downloading it", async () => {
    let downloaded = false;
    const result = await fetchVideoParts({
      botToken: "T",
      video: { ...video, fileSize: MAX_VIDEO_BYTES + 1 },
      mode: "native",
      maxFrames: 2,
      download: async () => {
        downloaded = true;
        return new Uint8Array();
      },
      spawn: fakeSpawn({ frames: jpeg(1) }),
    });
    expect(result).toEqual({ ok: false, reason: "too_large" });
    expect(downloaded).toBe(false);
  });

  test("reads Telegram's own size complaint as too_large", async () => {
    // A clip that arrived without `file_size` only fails at getFile time.
    const result = await fetchVideoParts({
      botToken: "T",
      video: { ...video, fileSize: null },
      mode: "frames",
      maxFrames: 2,
      download: async () => {
        throw new Error("getFile failed: Bad Request: file is too big");
      },
      spawn: fakeSpawn({ frames: jpeg(1) }),
    });
    expect(result).toEqual({ ok: false, reason: "too_large" });
  });

  test("reports a failed download as unavailable", async () => {
    const result = await fetchVideoParts({
      botToken: "T",
      video,
      mode: "frames",
      maxFrames: 2,
      download: async () => {
        throw new Error("network down");
      },
      spawn: fakeSpawn({ frames: jpeg(1) }),
    });
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  test("reports a clip it could not decode as unavailable", async () => {
    const result = await fetchVideoParts({
      botToken: "T",
      video,
      mode: "frames",
      maxFrames: 2,
      download: async () => new Uint8Array([1, 2, 3]),
      spawn: fakeSpawn({ frames: null, audio: mp3 }),
    });
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  test("skips the audio pass for an animation", async () => {
    const calls: string[][] = [];
    const result = await fetchVideoParts({
      botToken: "T",
      video: { ...video, kind: "animation" },
      mode: "frames",
      maxFrames: 2,
      download: async () => new Uint8Array([1, 2, 3]),
      spawn: fakeSpawn({ frames: jpeg(1), audio: mp3, calls }),
    });
    expect(result).toEqual({
      ok: true,
      mode: "frames",
      frames: [jpeg(1)],
      audio: null,
    });
    expect(calls).toHaveLength(1);
  });
});
