// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// The notes that travel with a reduced clip. Model-facing, not user-facing, so
// they stay in English and out of `shared/i18n`: they are read by the answering
// model, and they are persisted verbatim in the user envelope.

import type { VideoKind } from "./types";

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
