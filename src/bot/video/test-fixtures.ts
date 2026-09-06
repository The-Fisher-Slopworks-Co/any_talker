// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Shared fixtures for the decode / fetch tests, which drive the same fake
// ffmpeg and assert on the same byte sequences.

import type { FfmpegSpawnFn } from "../ffmpeg";

// A minimal JPEG: SOI ... EOI. Only the markers matter to `splitJpegFrames`.
export const jpeg = (marker: number) =>
  new Uint8Array([0xff, 0xd8, 0xff, 0xe0, marker, 0xff, 0xd9]);

export const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
};

export const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);

// A fake ffmpeg: answers the frame pass (recognised by `image2pipe`) and the
// audio pass separately, and records every argv it was handed.
export const fakeSpawn = (opts: {
  frames?: Uint8Array | null;
  audio?: Uint8Array | null;
  calls?: string[][];
}): FfmpegSpawnFn => {
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
