// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// The vocabulary the three video layers share: what Telegram handed over, and
// what a clip looks like on its way to a model.

export type VideoKind = "video" | "video_note" | "animation";

// A clip kept whole, for a model that takes video natively. Telegram states the
// container in `mime_type`; it defaults to mp4, which is what Telegram
// transcodes uploads (and GIFs) into.
export type VideoClip = { bytes: Uint8Array; mediaType: string };

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
