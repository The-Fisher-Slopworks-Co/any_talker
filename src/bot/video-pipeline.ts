// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { TelegramEnv } from "../telegram-env";
import type { PersonaResolver } from "../managed-bots/persona";
import type { ReplyTarget } from "./context-builder";
import type { BotContext } from "./middleware/lang";
import {
  fetchVideoParts,
  describeVideoParts,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  REPLY_VIDEO_FRAMES,
  type VideoAttachment,
  type VideoClip,
  type VideoFetchOutcome,
  type VideoParts,
} from "./video";

export type VideoPipeline = {
  loadParts: (
    chatId: string,
    video: VideoAttachment,
    maxFrames: number,
    forcedMode?: "native" | "frames",
  ) => Promise<VideoFetchOutcome>;
  media: (
    video: VideoAttachment,
    parts: VideoParts,
  ) => {
    images: Uint8Array[];
    audios: Uint8Array[];
    videos: VideoClip[];
    attachments: string | undefined;
  };
  mergeReply: (
    chatId: string,
    video: VideoAttachment,
    replyTarget: ReplyTarget,
    replyImageFileIds: string[],
  ) => Promise<{
    mode: VideoParts["mode"];
    replyImageFileIds: string[];
  } | null>;
};

export function createVideoPipeline(args: {
  botToken: string;
  telegramEnv: TelegramEnv;
  resolver: PersonaResolver;
  supportsVideoInput?: ((modelId: string) => Promise<boolean>) | undefined;
}): VideoPipeline {
  // Which route a clip takes, decided by the model that will actually answer:
  // one advertising `video` input (Gemini & co on OpenRouter) gets the clip
  // whole, anything else gets sampled frames. Costs one settings read, and only
  // on a message that carries a clip. Any failure degrades to frames, which
  // every vision model understands.
  const resolveVideoMode = async (
    chatId: string,
  ): Promise<"native" | "frames"> => {
    if (!args.supportsVideoInput) return "frames";
    try {
      const { settings } = await args.resolver(chatId);
      const model = settings.models[0];
      if (!model) return "frames";
      return (await args.supportsVideoInput(model)) ? "native" : "frames";
    } catch (err) {
      console.error("video mode resolution failed:", err);
      return "frames";
    }
  };

  // Every flow that meets a clip goes through here, so they all decide, sample
  // and fail alike.
  const loadVideoParts = async (
    chatId: string,
    video: VideoAttachment,
    maxFrames: number,
    // Forces the route. Used by the album path, which must not send several
    // whole clips in one request.
    forcedMode?: "native" | "frames",
  ) =>
    fetchVideoParts({
      botToken: args.botToken,
      telegramEnv: args.telegramEnv,
      video,
      mode: forcedMode ?? (await resolveVideoMode(chatId)),
      maxFrames,
    });

  // Fold a resolved clip into the media buckets the ask flow carries. A native
  // clip is one video part; a sampled one is stills + soundtrack, plus the note
  // that keeps the model from reading those stills as loose photos.
  const videoMedia = (video: VideoAttachment, parts: VideoParts) =>
    parts.mode === "native"
      ? {
          images: [] as Uint8Array[],
          audios: [] as Uint8Array[],
          videos: [parts.clip],
          attachments: undefined as string | undefined,
        }
      : {
          images: parts.frames,
          audios: parts.audio ? [parts.audio] : [],
          videos: [] as VideoClip[],
          attachments: describeVideoParts({
            kind: video.kind,
            durationSec: video.durationSec,
            frames: parts.frames.length,
            hasAudio: parts.audio !== null,
          }),
        };

  // Fold a replied-to clip into the reply target it belongs to. A replied-to
  // clip is supplementary context, so it contributes a smaller frame sample than
  // a clip the ask is *about*, and a failure just drops it (the user asked about
  // their own message, not this one). Returns null when nothing could be
  // resolved and the target is left untouched; otherwise the resolved mode and
  // the reply file ids extended with the clip's thumbnail — neither a clip nor a
  // frame carries a Telegram file id, the thumbnail does, so a follow-up turn
  // keeps a still of it.
  const mergeReplyVideo = async (
    chatId: string,
    video: VideoAttachment,
    replyTarget: ReplyTarget,
    replyImageFileIds: string[],
  ): Promise<{
    mode: VideoParts["mode"];
    replyImageFileIds: string[];
  } | null> => {
    const parts = await loadVideoParts(chatId, video, REPLY_VIDEO_FRAMES);
    if (!parts.ok) return null;
    const media = videoMedia(video, parts);
    replyTarget.images = [...replyTarget.images, ...media.images];
    if (media.audios.length > 0) {
      replyTarget.audios = [...(replyTarget.audios ?? []), ...media.audios];
    }
    if (media.videos.length > 0) {
      replyTarget.videos = [...(replyTarget.videos ?? []), ...media.videos];
    }
    replyTarget.mediaNote = media.attachments;
    return {
      mode: parts.mode,
      replyImageFileIds: video.thumbnailFileId
        ? [...replyImageFileIds, video.thumbnailFileId]
        : replyImageFileIds,
    };
  };

  return {
    loadParts: loadVideoParts,
    media: videoMedia,
    mergeReply: mergeReplyVideo,
  };
}

// Every video failure the user is actually told about, in one place: a clip
// past a limit names that limit (the user can trim and resend), anything else
// is a generic notice.
export function videoErrorText(
  ctx: BotContext,
  reason: "too_large" | "too_long" | "unavailable",
): string {
  switch (reason) {
    case "too_large":
      return ctx.t.bot_video_too_large(
        Math.round(MAX_VIDEO_BYTES / (1024 * 1024)),
      );
    case "too_long":
      return ctx.t.bot_video_too_long(MAX_VIDEO_SECONDS);
    case "unavailable":
      return ctx.t.bot_video_cant_fetch;
  }
}
