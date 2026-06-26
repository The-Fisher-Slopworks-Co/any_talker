// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { transcodeOggToMp3, type SpawnFn } from "./transcode";

const ogg = new Uint8Array([0x4f, 0x67, 0x67, 0x53]); // "OggS"

// A fake subprocess whose stdout streams `out` and which exits with `code`.
const fakeSpawn =
  (out: Uint8Array, code: number): SpawnFn =>
  () => ({
    stdout: new ReadableStream<Uint8Array>({
      start(controller) {
        if (out.byteLength > 0) controller.enqueue(out);
        controller.close();
      },
    }),
    exited: Promise.resolve(code),
  });

describe("transcodeOggToMp3", () => {
  test("returns the transcoded bytes on a clean exit", async () => {
    const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
    const result = await transcodeOggToMp3(ogg, fakeSpawn(mp3, 0));
    expect(result).toEqual(mp3);
  });

  test("returns null on a non-zero exit code", async () => {
    const result = await transcodeOggToMp3(ogg, fakeSpawn(new Uint8Array(), 1));
    expect(result).toBeNull();
  });

  test("returns null when ffmpeg produces no output", async () => {
    const result = await transcodeOggToMp3(ogg, fakeSpawn(new Uint8Array(), 0));
    expect(result).toBeNull();
  });

  test("returns null when spawning throws (e.g. ffmpeg missing)", async () => {
    const throwingSpawn: SpawnFn = () => {
      throw new Error("ENOENT: ffmpeg not found");
    };
    const result = await transcodeOggToMp3(ogg, throwingSpawn);
    expect(result).toBeNull();
  });
});
