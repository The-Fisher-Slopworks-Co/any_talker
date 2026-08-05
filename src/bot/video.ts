// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Telegram video → model input, by either of two routes.
//
// **Native** is the good one: Gemini (and 50-odd other models on OpenRouter)
// consume video directly, so a clip that is going to such a model is sent whole
// as a `video_url` part — full motion, full audio, no local decoding. The
// catalogue's `input_modalities` says which models those are
// (`ModelCatalog.supportsVideoInput`), and `ai/compat-client.ts` does the
// emitting.
//
// **Frames** is the fallback for every model that does not take video: the clip
// is decomposed into a handful of evenly spaced JPEG frames plus the soundtrack
// as mp3 — the two part kinds every vision+audio model already accepts — so the
// bot still says something useful about a video on a non-video model.
//
// In frames mode both ffmpeg passes read the clip from a temp file rather than
// stdin (unlike `transcode.ts`): an mp4 whose `moov` atom sits after `mdat`
// (anything not written with `+faststart`) cannot be demuxed from a
// non-seekable pipe — ffmpeg fails it with "partial file" — and Telegram hands
// out plenty of those.

import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { downloadTelegramFile } from "./photo";
import { videoExtractionsTotal } from "../metrics";

// Telegram's getFile ceiling: bots cannot download a file larger than this, so
// an oversized clip is rejected before the request is even made.
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

// Longest clip accepted at all, in either mode. This is a cost ceiling, not a
// technical one: a model that takes video natively bills by clip length (Gemini
// ~260 tokens per second), so a few minutes of footage would swallow a user's
// entire token window in a single ask. A clip Telegram reports as 0 seconds —
// duration unknown — is not refused; only a stated duration over the cap is.
export const MAX_VIDEO_SECONDS = 60;

// Frames sampled from a clip the ask is *about*. Each frame costs roughly one
// image's worth of tokens, so this is deliberately modest: a user's whole
// 5-hour token window is 30k by default.
export const MAX_VIDEO_FRAMES = 6;

// Frames sampled from a clip that is only supplementary context — the message a
// `/ask` replied to, or one item of an album.
export const REPLY_VIDEO_FRAMES = 3;
export const ALBUM_VIDEO_FRAMES = 3;

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

export type VideoKind = "video" | "video_note" | "animation";

// A clip kept whole, for a model that takes video natively. Telegram states the
// container in `mime_type`; it defaults to mp4, which is what Telegram
// transcodes uploads (and GIFs) into.
export type VideoClip = { bytes: Uint8Array; mediaType: string };

export const DEFAULT_VIDEO_MEDIA_TYPE = "video/mp4";

// The slice of Telegram's Video / VideoNote / Animation objects this module
// needs, kept structural (as `PhotoSizeLike` is) so nothing here depends on
// grammY's types.
export type VideoLike = {
  file_id: string;
  duration?: number;
  file_size?: number;
  mime_type?: string;
  thumbnail?: { file_id: string };
};

export type VideoMessageLike = {
  video?: VideoLike;
  video_note?: VideoLike;
  animation?: VideoLike;
};

export type VideoAttachment = {
  kind: VideoKind;
  fileId: string;
  durationSec: number;
  fileSize: number | null;
  // What to label the bytes as when they go out whole. `video_note` carries no
  // mime_type field at all, hence the default.
  mediaType: string;
  // The still Telegram generates for the clip. It is an ordinary photo file id,
  // so it survives in the photo cache and lets a follow-up turn keep *some*
  // visual without re-downloading and re-decoding the whole video (see how the
  // ask flow fills `imageFileIds`).
  thumbnailFileId: string | null;
};

// The video-ish attachment of a message, if any. An `animation` message also
// carries a `document` for backward compatibility, so animations are matched
// first and the document field is deliberately ignored (a video sent *as a
// file* has no duration metadata to sample against).
export function pickVideo(msg: VideoMessageLike): VideoAttachment | null {
  const candidates: [VideoKind, VideoLike | undefined][] = [
    ["animation", msg.animation],
    ["video", msg.video],
    ["video_note", msg.video_note],
  ];
  for (const [kind, media] of candidates) {
    if (!media) continue;
    return {
      kind,
      fileId: media.file_id,
      durationSec: media.duration ?? 0,
      fileSize: media.file_size ?? null,
      mediaType: media.mime_type?.startsWith("video/")
        ? media.mime_type
        : DEFAULT_VIDEO_MEDIA_TYPE,
      thumbnailFileId: media.thumbnail?.file_id ?? null,
    };
  }
  return null;
}

const VIDEO_LABEL: Record<VideoKind, string> = {
  video: "video",
  video_note: "round video note",
  animation: "silent animation (GIF)",
};

// A one-line, model-facing description of what a clip was reduced to. Without
// it six frames read as six unrelated photos; with it the model knows they are
// a time-ordered sample of one clip, how long that clip is, and whether the
// sound came along. Carried in the user envelope, so it is persisted with the
// turn and a follow-up still knows a video was involved.
export function describeVideoParts(args: {
  kind: VideoKind;
  durationSec: number;
  frames: number;
  hasAudio: boolean;
}): string {
  const length = args.durationSec > 0 ? ` (${args.durationSec}s)` : "";
  const sound = args.hasAudio
    ? ", plus that clip's soundtrack as audio"
    : ", with no soundtrack";
  return (
    `${args.frames} frame${args.frames === 1 ? "" : "s"} sampled in chronological ` +
    `order from a ${VIDEO_LABEL[args.kind]}${length}${sound}`
  );
}

// The album variant: frames are interleaved with the album's photos in message
// order, so the note can only say which of the images are video frames.
export function describeAlbumVideoFrames(
  videos: number,
  frames: number,
): string {
  return (
    `${frames} of the attached images are frames sampled in chronological order ` +
    `from ${videos} video${videos === 1 ? "" : "s"} in the same album ` +
    `(their soundtracks are not included)`
  );
}

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
  return starts.map((start, i) => buf.slice(start, starts[i + 1] ?? buf.length));
}

// The slice of `Bun.spawn` this module uses, narrowed so tests can inject a
// fake subprocess (mirrors `transcode.ts`, but reads its input from a path
// instead of stdin).
type SpawnedProcess = {
  stdout: ReadableStream<Uint8Array>;
  exited: Promise<number>;
};
export type VideoSpawnFn = (
  cmd: string[],
  opts: {
    stdin: "ignore";
    stdout: "pipe";
    stderr: "ignore";
    signal: AbortSignal;
  },
) => SpawnedProcess;

const defaultSpawn: VideoSpawnFn = (cmd, opts) =>
  Bun.spawn(cmd, opts) as unknown as SpawnedProcess;

async function runFfmpeg(
  cmd: string[],
  spawn: VideoSpawnFn,
): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FFMPEG_TIMEOUT_MS);
  try {
    const proc = spawn(cmd, {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
      signal: controller.signal,
    });
    const [bytes, code] = await Promise.all([
      new Response(proc.stdout).arrayBuffer(),
      proc.exited,
    ]);
    if (code !== 0) return null;
    const out = new Uint8Array(bytes);
    return out.byteLength > 0 ? out : null;
  } catch {
    // ffmpeg missing (ENOENT), aborted on timeout, or a stream error. Every
    // caller treats null as "this pass produced nothing".
    return null;
  } finally {
    clearTimeout(timer);
  }
}

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
  spawn?: VideoSpawnFn;
}): Promise<ExtractedVideo> {
  const spawn = args.spawn ?? defaultSpawn;
  const path = join(tmpdir(), `any-talker-video-${randomUUID()}`);
  try {
    await Bun.write(path, args.bytes);
    const raw = await runFfmpeg(
      frameArgs(path, args.durationSec, args.maxFrames),
      spawn,
    );
    const frames = raw ? splitJpegFrames(raw).slice(0, args.maxFrames) : [];
    const audio = args.withAudio ? await runFfmpeg(audioArgs(path), spawn) : null;
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

export type VideoParts =
  // The clip itself, for a model that takes `video_url` (Gemini & co).
  | { mode: "native"; clip: VideoClip }
  // The portable reduction, for every other model.
  | { mode: "frames"; frames: Uint8Array[]; audio: Uint8Array | null };

export type VideoFetchOutcome =
  | ({ ok: true } & VideoParts)
  // "too_large" and "too_long" are the failures worth naming to the user: both
  // are theirs to fix (send a smaller / shorter clip), not transient glitches.
  | { ok: false; reason: "too_large" | "too_long" | "unavailable" };

// Download a Telegram clip and turn it into model-ready parts. The single entry
// point for every flow that meets a video (own message, reply target, album
// item, guest query). `mode` comes from the answering model's advertised
// modalities — native when it takes video, frames when it doesn't.
export async function fetchVideoParts(args: {
  botToken: string;
  video: VideoAttachment;
  mode: "native" | "frames";
  maxFrames: number;
  download?: (botToken: string, fileId: string) => Promise<Uint8Array>;
  spawn?: VideoSpawnFn;
}): Promise<VideoFetchOutcome> {
  const { video } = args;
  if (video.durationSec > MAX_VIDEO_SECONDS) {
    videoExtractionsTotal.inc({ outcome: "too_long" });
    return { ok: false, reason: "too_long" };
  }
  if (video.fileSize !== null && video.fileSize > MAX_VIDEO_BYTES) {
    videoExtractionsTotal.inc({ outcome: "too_large" });
    return { ok: false, reason: "too_large" };
  }

  let bytes: Uint8Array;
  try {
    bytes = await (args.download ?? downloadTelegramFile)(
      args.botToken,
      video.fileId,
    );
  } catch (err) {
    console.error("video download failed:", err);
    // Fallback for a clip that arrived without `file_size`: getFile rejects an
    // oversized file by description, so keep the honest message in that case.
    const tooBig = /too big/i.test(err instanceof Error ? err.message : "");
    videoExtractionsTotal.inc({
      outcome: tooBig ? "too_large" : "download_failed",
    });
    return { ok: false, reason: tooBig ? "too_large" : "unavailable" };
  }

  if (args.mode === "native") {
    videoExtractionsTotal.inc({ outcome: "native" });
    return {
      ok: true,
      mode: "native",
      clip: { bytes, mediaType: video.mediaType },
    };
  }

  const { frames, audio } = await extractVideoMedia({
    bytes,
    durationSec: video.durationSec,
    maxFrames: args.maxFrames,
    // A GIF-style animation has no audio stream; skip a pass that could only
    // fail. Video notes do carry sound.
    withAudio: video.kind !== "animation",
    spawn: args.spawn,
  });

  if (frames.length === 0) {
    videoExtractionsTotal.inc({ outcome: "extract_failed" });
    return { ok: false, reason: "unavailable" };
  }
  videoExtractionsTotal.inc({ outcome: "frames" });
  return { ok: true, mode: "frames", frames, audio };
}
