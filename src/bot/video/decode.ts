// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// The ffmpeg half of the frames route: how a downloaded clip is reduced to a
// handful of evenly spaced JPEGs plus its soundtrack as mp3. Nothing here knows
// about Telegram or about which model asked — it takes bytes and returns bytes.
//
// Both passes read the clip from a temp file rather than stdin (unlike
// `transcode.ts`): an mp4 whose `moov` atom sits after `mdat` (anything not
// written with `+faststart`) cannot be demuxed from a non-seekable pipe —
// ffmpeg fails it with "partial file" — and Telegram hands out plenty of those.

import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultFfmpegSpawn, runFfmpeg, type FfmpegSpawnFn } from "../ffmpeg";

// Frames are spread evenly over the clip, but never denser than this — on a
// three-second clip "evenly spread" would otherwise mean near-duplicate frames.
const MAX_SAMPLE_FPS = 2;

// Longest side of a sampled frame. Well under the 1280 `pickPhotoSize` allows a
// single photo, because a video contributes several frames at once.
const FRAME_MAX_DIMENSION = 640;

// mjpeg quality scale (2 = best, 31 = worst).
const FRAME_QUALITY = 5;

// Speech-grade mono mp3: the soundtrack is there to be understood, not enjoyed,
// and the base64 payload is charged to the request either way.
const AUDIO_SAMPLE_RATE = 16000;
const AUDIO_BITRATE = "48k";

// Only the first stretch of a long clip's soundtrack is sent, so a 20 MB
// low-bitrate video can't turn into a multi-megabyte base64 blob.
const MAX_AUDIO_SECONDS = 300;

const FFMPEG_TIMEOUT_MS = 60_000;

// Fit inside a FRAME_MAX_DIMENSION box without ever scaling *up* (the target box
// is capped by the source's own dimensions) and keep both sides even, which the
// mjpeg encoder's chroma subsampling wants.
const FRAME_SCALE_FILTER =
  `scale='min(${FRAME_MAX_DIMENSION},iw)':'min(${FRAME_MAX_DIMENSION},ih)'` +
  `:force_original_aspect_ratio=decrease:force_divisible_by=2`;

// The `fps` filter value that spreads `maxFrames` over the clip. An unknown or
// nonsensical duration (Telegram always sends one, but the field is a number we
// don't control) falls back to the density cap.
export function frameSampleFps(durationSec: number, maxFrames: number): string {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return String(MAX_SAMPLE_FPS);
  }
  if (maxFrames / durationSec >= MAX_SAMPLE_FPS) return String(MAX_SAMPLE_FPS);
  // An exact rational, so ffmpeg does the rounding rather than a float literal.
  return `${maxFrames}/${durationSec}`;
}

export function frameArgs(
  path: string,
  durationSec: number,
  maxFrames: number,
): string[] {
  return [
    "ffmpeg",
    "-hide_banner",
    "-loglevel",
    "error",
    // Frames only — don't spend time decoding the soundtrack in this pass.
    "-an",
    "-i",
    path,
    "-vf",
    `fps=${frameSampleFps(durationSec, maxFrames)},${FRAME_SCALE_FILTER}`,
    "-frames:v",
    String(maxFrames),
    "-f",
    "image2pipe",
    "-c:v",
    "mjpeg",
    "-q:v",
    String(FRAME_QUALITY),
    "pipe:1",
  ];
}

export function audioArgs(path: string): string[] {
  return [
    "ffmpeg",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    path,
    "-vn",
    // No trailing "?" on the stream selector: on a silent clip ffmpeg then
    // exits non-zero, which the caller already reads as "no soundtrack".
    "-map",
    "0:a",
    "-ac",
    "1",
    "-ar",
    String(AUDIO_SAMPLE_RATE),
    "-c:a",
    "libmp3lame",
    "-b:a",
    AUDIO_BITRATE,
    "-t",
    String(MAX_AUDIO_SECONDS),
    "-f",
    "mp3",
    "pipe:1",
  ];
}

// Split the mjpeg stream ffmpeg wrote to stdout into individual JPEGs.
//
// Scanning for the SOI marker is sound for this input: inside entropy-coded
// data every literal 0xFF is byte-stuffed as `FF 00`, so `FF D8` cannot occur
// there, and ffmpeg's mjpeg encoder writes no APPn segment that could embed a
// second JPEG (an EXIF thumbnail would be the classic false positive).
export function splitJpegFrames(buf: Uint8Array): Uint8Array[] {
  const starts: number[] = [];
  for (let i = 0; i + 2 < buf.length; i++) {
    if (buf[i] === 0xff && buf[i + 1] === 0xd8 && buf[i + 2] === 0xff) {
      starts.push(i);
    }
  }
  // Copy rather than subarray: a view would pin the whole mjpeg buffer for as
  // long as any single frame is alive.
  return starts.map((start, i) =>
    buf.slice(start, starts[i + 1] ?? buf.length),
  );
}

// Both passes here read their input from a path rather than stdin, so ffmpeg
// gets to seek (see the header note on `moov` atoms).
const runPass = (cmd: string[], spawn: FfmpegSpawnFn) =>
  runFfmpeg(cmd, spawn, { stdin: "ignore", timeoutMs: FFMPEG_TIMEOUT_MS });

export type ExtractedVideo = {
  frames: Uint8Array[];
  // null when the clip is silent, carries no audio stream, or the pass failed —
  // the frames are still worth sending on their own.
  audio: Uint8Array | null;
};

// Decode a downloaded clip into frames + soundtrack. Never throws: a failed
// pass yields an empty/null result and the caller decides what to tell the user.
export async function extractVideoMedia(args: {
  bytes: Uint8Array;
  durationSec: number;
  maxFrames: number;
  withAudio: boolean;
  spawn?: FfmpegSpawnFn | undefined;
}): Promise<ExtractedVideo> {
  const spawn = args.spawn ?? defaultFfmpegSpawn;
  const path = join(tmpdir(), `any-talker-video-${randomUUID()}`);
  try {
    await Bun.write(path, args.bytes);
    const raw = await runPass(
      frameArgs(path, args.durationSec, args.maxFrames),
      spawn,
    );
    const frames = raw ? splitJpegFrames(raw).slice(0, args.maxFrames) : [];
    const audio = args.withAudio ? await runPass(audioArgs(path), spawn) : null;
    return { frames, audio };
  } catch (err) {
    console.error("video extraction failed:", err);
    return { frames: [], audio: null };
  } finally {
    await Bun.file(path)
      .delete()
      .catch(() => {});
  }
}
