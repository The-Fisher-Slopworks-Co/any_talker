// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// The Telegram-facing layer: which attachment of a message is a clip, the caps
// a clip has to pass, the download, and the fork between the two routes —
// native bytes for a model that takes video, `decode.ts` for every other model.

import { downloadTelegramFile } from "../photo";
import type { FfmpegSpawnFn } from "../ffmpeg";
import { extractVideoMedia } from "./decode";
import type {
  VideoAttachment,
  VideoClip,
  VideoLike,
  VideoKind,
  VideoMessageLike,
} from "./types";
import { videoExtractionsTotal } from "../../metrics";

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

const DEFAULT_VIDEO_MEDIA_TYPE = "video/mp4";

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
  spawn?: FfmpegSpawnFn | undefined;
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
