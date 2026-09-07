// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import {
  fetchVideoParts,
  pickVideo,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
} from "./fetch";
import { concat, fakeSpawn, jpeg, mp3 } from "./test-fixtures";

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
    expect(pickVideo({ animation: { file_id: "gif" } })?.kind).toBe(
      "animation",
    );
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
      telegramEnv: "prod",
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
      telegramEnv: "prod",
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
      telegramEnv: "prod",
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
      telegramEnv: "prod",
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
      telegramEnv: "prod",
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
      telegramEnv: "prod",
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
      telegramEnv: "prod",
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
      telegramEnv: "prod",
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
      telegramEnv: "prod",
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
      telegramEnv: "prod",
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
