// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Bot } from "grammy";
import type { BotRuntime } from "../runtime";
import type { BotContext } from "../middleware/lang";
import { matchAsk } from "../routing";
import { matchDigestCommand } from "../handlers/digest";
import { matchFeedbackCommand } from "../handlers/feedback";
import { matchUsageCommand } from "../handlers/usage";
import {
  dispatchTextCommand,
  dispatchDigestCommand,
  dispatchFeedbackCommand,
  dispatchUsageCommand,
} from "../dispatch/commands";
import { dispatchAsk } from "../dispatch/ask";
import type { MediaGroupDispatcher } from "../dispatch/media-group";
import { pickPhotoSize, downloadTelegramFile } from "../photo";
import { transcodeOggToMp3 } from "../transcode";
import { pickVideo, MAX_VIDEO_FRAMES } from "../video";
import { videoErrorText } from "../video-pipeline";

export function registerMessageListeners(
  bot: Bot<BotContext>,
  rt: BotRuntime,
  mediaGroup: MediaGroupDispatcher,
): void {
  bot.on("message:text", async (ctx) => {
    if (matchDigestCommand(ctx.message.text, ctx.me.username)) {
      await dispatchDigestCommand(rt, ctx);
      return;
    }
    if (matchUsageCommand(ctx.message.text, ctx.me.username)) {
      await dispatchUsageCommand(rt, ctx);
      return;
    }
    const feedback = matchFeedbackCommand(ctx.message.text, ctx.me.username);
    if (feedback) {
      // Every family bot in the chat matched this one identically; only the one
      // that owns the shared commands here files the report.
      if (await rt.shouldHandleSharedCommand(ctx, feedback.explicit))
        await dispatchFeedbackCommand(rt, ctx, feedback.text);
      return;
    }
    const match = matchAsk(ctx.message.text, ctx.me.username);
    if (!match) return;
    if (!(await rt.shouldAnswer(ctx, match, ctx.message.reply_to_message)))
      return;
    await dispatchTextCommand(rt, ctx, match.detailLevel, match.userText);
  });

  bot.on("message:photo", async (ctx) => {
    const msg = ctx.message;
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;

    const captionRaw = msg.caption ?? "";
    const match = matchAsk(captionRaw, ctx.me.username);
    rt.debugLog("photo_received", {
      chat_id: chatId,
      message_id: msg.message_id,
      media_group_id: msg.media_group_id ?? null,
      caption_len: captionRaw.length,
      ask_caption: match !== null,
      photo_sizes: msg.photo.length,
    });

    if (msg.media_group_id !== undefined) {
      const picked = pickPhotoSize(msg.photo);
      if (picked) {
        void rt.scopedStorage.photos
          .appendAlbum(String(chatId), msg.media_group_id, {
            messageId: msg.message_id,
            fileId: picked.file_id,
          })
          .catch((err) => console.error("photos.appendAlbum failed:", err));
      }
      mediaGroup.push(chatId, msg.media_group_id, ctx, msg);
      return;
    }

    if (!match) return;
    if (!(await rt.shouldAnswer(ctx, match, msg.reply_to_message))) return;
    const detailLevel = match.detailLevel;
    const userText = match.userText;

    let image: Uint8Array | null = null;
    let imageFileId: string | null = null;
    const picked = pickPhotoSize(msg.photo);
    if (picked) {
      try {
        image = await rt.fetchPhoto(picked.file_id);
        imageFileId = picked.file_id;
      } catch (err) {
        console.error("photo download failed:", err);
        await ctx.reply(ctx.t.bot_photo_cant_fetch);
        return;
      }
    }

    await dispatchAsk(rt, ctx, {
      userText,
      askMessageId: msg.message_id,
      images: image ? [image] : [],
      imageFileIds: imageFileId ? [imageFileId] : [],
      audios: [],
      replyToMessage: msg.reply_to_message,
      quote: msg.quote?.text ?? null,
      forwardOrigin: Boolean(msg.forward_origin),
      detailLevel,
    });
  });

  bot.on("message:voice", async (ctx) => {
    const msg = ctx.message;
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;

    const captionRaw = msg.caption ?? "";
    const match = matchAsk(captionRaw, ctx.me.username);
    rt.debugLog("voice_received", {
      chat_id: chatId,
      message_id: msg.message_id,
      caption_len: captionRaw.length,
      ask_caption: match !== null,
      duration: msg.voice.duration,
    });
    if (!match) return;
    if (!(await rt.shouldAnswer(ctx, match, msg.reply_to_message))) return;

    const detailLevel = match.detailLevel;
    const userText = match.userText;

    let audio: Uint8Array;
    try {
      audio = await downloadTelegramFile(
        rt.deps.botToken,
        msg.voice.file_id,
        rt.telegramEnv,
      );
    } catch (err) {
      console.error("voice download failed:", err);
      await ctx.reply(ctx.t.bot_voice_cant_fetch);
      return;
    }

    // The OpenAI-compatible API accepts only wav/mp3 audio, so transcode the
    // ogg/opus voice note before sending. A transcode failure is surfaced like
    // a fetch failure rather than sending unusable ogg.
    const mp3 = await transcodeOggToMp3(audio);
    if (!mp3) {
      console.error("voice transcode failed");
      await ctx.reply(ctx.t.bot_voice_cant_fetch);
      return;
    }

    await dispatchAsk(rt, ctx, {
      userText,
      askMessageId: msg.message_id,
      images: [],
      imageFileIds: [],
      audios: [mp3],
      replyToMessage: msg.reply_to_message,
      quote: msg.quote?.text ?? null,
      forwardOrigin: Boolean(msg.forward_origin),
      detailLevel,
    });
  });

  // `/ask` on a clip. Videos and animations are the two clip attachments that
  // can carry a caption — a video note never has one, so it reaches the model
  // only as a reply target. The provider rejects `video/*` parts outright, so
  // every clip is decomposed into frames + soundtrack first (see `video.ts`).
  const handleVideoAsk = async (ctx: BotContext) => {
    const msg = ctx.message;
    const chatId = ctx.chat?.id;
    if (!msg || chatId === undefined) return;
    const video = pickVideo(msg);
    if (!video) return;

    const captionRaw = msg.caption ?? "";
    const match = matchAsk(captionRaw, ctx.me.username);
    rt.debugLog("video_received", {
      chat_id: chatId,
      message_id: msg.message_id,
      kind: video.kind,
      media_group_id: msg.media_group_id ?? null,
      caption_len: captionRaw.length,
      ask_caption: match !== null,
      duration: video.durationSec,
      file_size: video.fileSize,
    });

    if (msg.media_group_id !== undefined) {
      // Index the clip's thumbnail alongside the album's photos so a later
      // reply to the album still surfaces something for this item.
      if (video.thumbnailFileId) {
        void rt.scopedStorage.photos
          .appendAlbum(String(chatId), msg.media_group_id, {
            messageId: msg.message_id,
            fileId: video.thumbnailFileId,
          })
          .catch((err) => console.error("photos.appendAlbum failed:", err));
      }
      mediaGroup.push(chatId, msg.media_group_id, ctx, msg);
      return;
    }

    if (!match) return;
    if (!(await rt.shouldAnswer(ctx, match, msg.reply_to_message))) return;

    const parts = await rt.video.loadParts(
      String(chatId),
      video,
      MAX_VIDEO_FRAMES,
    );
    if (!parts.ok) {
      await ctx.reply(videoErrorText(ctx, parts.reason));
      return;
    }
    const media = rt.video.media(video, parts);
    rt.debugLog("video_resolved", {
      chat_id: chatId,
      message_id: msg.message_id,
      mode: parts.mode,
    });

    await dispatchAsk(rt, ctx, {
      userText: match.userText,
      askMessageId: msg.message_id,
      images: media.images,
      // Neither a whole clip nor a sampled frame has a Telegram file id of its
      // own; the clip's thumbnail does, so a follow-up turn in the chain keeps
      // a still of the video rather than losing the visual entirely.
      imageFileIds: video.thumbnailFileId ? [video.thumbnailFileId] : [],
      audios: media.audios,
      videos: media.videos,
      attachments: media.attachments,
      replyToMessage: msg.reply_to_message,
      quote: msg.quote?.text ?? null,
      forwardOrigin: Boolean(msg.forward_origin),
      detailLevel: match.detailLevel,
    });
  };

  // Registered before any `message:document` filter would be: an animation
  // message also carries a `document` for backward compatibility.
  bot.on("message:video", handleVideoAsk);
  bot.on("message:animation", handleVideoAsk);
}
