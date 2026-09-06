// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Telegram video → model input, by either of two routes.
//
// **Native** is the good one: Gemini (and 50-odd other models on OpenRouter)
// consume video directly, so a clip that is going to such a model is sent whole
// as an `input_video` item — full motion, full audio, no local decoding. The
// catalogue's `input_modalities` says which models those are
// (`ModelCatalog.supportsVideoInput`), and `ai/responses-input.ts` does the
// emitting.
//
// **Frames** is the fallback for every model that does not take video: the clip
// is decomposed into a handful of evenly spaced JPEG frames plus the soundtrack
// as mp3 — the two part kinds every vision+audio model already accepts — so the
// bot still says something useful about a video on a non-video model.
//
//   types.ts     the shared vocabulary (attachment, clip, kind)
//   fetch.ts     Telegram side: pickVideo, the caps, download, route choice
//   decode.ts    ffmpeg side: frame/audio argv, mjpeg splitting, extraction
//   describe.ts  the model-facing note that travels with a reduced clip
//
// This barrel is the whole public surface. The ffmpeg primitives and the
// attachment plumbing are reachable from the modules themselves (the tests do
// that) but are deliberately not re-exported here.

export {
  ALBUM_VIDEO_FRAMES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_FRAMES,
  MAX_VIDEO_SECONDS,
  REPLY_VIDEO_FRAMES,
  fetchVideoParts,
  pickVideo,
  type VideoFetchOutcome,
  type VideoParts,
} from "./fetch";
export { describeAlbumVideoFrames, describeVideoParts } from "./describe";
export type { VideoAttachment, VideoClip } from "./types";
