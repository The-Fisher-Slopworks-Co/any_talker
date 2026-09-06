// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Message } from "grammy/types";
import type { DetailLevel } from "../../ai/instruction";
import { askHandler } from "../handlers/ask";
import { downloadTelegramFile } from "../photo";
import { transcodeOggToMp3 } from "../transcode";
import { pickVideo, type VideoClip } from "../video";
import { resolveSenderIdentity } from "../identity";
import { resolveReplyImages } from "../reply-images";
import { extractReplyTarget } from "../reply";
import { buildRichMarkdown, buildEffectsTopBlock } from "../format";
import { askOutcomeLabel } from "../ask-outcome";
import { readValidDisplayName } from "../../shared/display-name";
import {
  askDurationSeconds,
  askTokensTotal,
  askTotal,
  type AskOutcomeLabel,
} from "../../metrics";
import type { BotRuntime } from "../runtime";
import type { BotContext } from "../middleware/lang";

export type AskDispatch = {
  userText: string;
  askMessageId: number;
  images: Uint8Array[];
  imageFileIds: string[];
  audios: Uint8Array[];
  // Whole clips, when the answering model takes video natively.
  videos?: VideoClip[] | undefined;
  // Set when the media needs explaining — video frames aren't loose photos.
  attachments?: string | undefined;
  replyToMessage: Message | undefined;
  quote: string | null;
  forwardOrigin: boolean;
  detailLevel: DetailLevel;
};

export async function dispatchAsk(
  rt: BotRuntime,
  ctx: BotContext,
  args: AskDispatch,
): Promise<void> {
  rt.debugLog("ask_dispatch", {
    chat_id: ctx.chat?.id,
    ask_message_id: args.askMessageId,
    images: args.images.length,
    image_file_ids: args.imageFileIds.length,
    audios: args.audios.length,
    user_text_len: args.userText.length,
    has_quote: args.quote !== null,
    has_reply_target: args.replyToMessage !== undefined,
    forward_origin: args.forwardOrigin,
    detail_level: args.detailLevel,
  });

  if (args.forwardOrigin) return;

  // Never `ctx.from.id` directly: a message sent as a chat carries a
  // Telegram-wide pseudo-account there, and keying the rate limit, budget or
  // memory on it would pool every anonymous sender everywhere into one
  // identity. See `bot/identity.ts`.
  const identity = resolveSenderIdentity({
    from: ctx.from,
    sender_chat: ctx.senderChat,
  });
  const chatId = ctx.chat?.id;
  if (!identity || chatId === undefined) return;
  const userId = identity.userId;

  const replyTarget = args.replyToMessage
    ? extractReplyTarget(args.replyToMessage)
    : null;

  let replyImageFileIds: string[] = [];
  if (replyTarget && args.replyToMessage) {
    const reply = await resolveReplyImages({
      chatId: String(chatId),
      replyToMessage: args.replyToMessage,
      storage: rt.scopedStorage,
      fetchPhoto: rt.fetchPhoto,
    });
    replyTarget.images = reply.images;
    replyImageFileIds = reply.fileIds;
    rt.debugLog("reply_images_resolved", {
      chat_id: chatId,
      reply_message_id: args.replyToMessage.message_id,
      reply_media_group_id: args.replyToMessage.media_group_id ?? null,
      source: reply.source,
      album_index_size: reply.albumIndexSize,
      images: reply.images.length,
    });
  }

  const replyVoice = args.replyToMessage?.voice;
  if (replyTarget && replyVoice) {
    try {
      const raw = await downloadTelegramFile(
        rt.deps.botToken,
        replyVoice.file_id,
      );
      // Transcode ogg → mp3; on failure drop the reply audio (it's only
      // supplementary context, and raw ogg would crash the request).
      const mp3 = await transcodeOggToMp3(raw);
      if (mp3) {
        replyTarget.audios = [mp3];
        rt.debugLog("reply_voice_resolved", {
          chat_id: chatId,
          reply_message_id: args.replyToMessage?.message_id,
        });
      } else {
        console.error("reply voice transcode failed, dropping audio");
      }
    } catch (err) {
      console.error("reply voice download failed:", err);
    }
  }

  const replyVideo = args.replyToMessage
    ? pickVideo(args.replyToMessage)
    : null;
  if (replyTarget && replyVideo) {
    const merged = await rt.video.mergeReply(
      String(chatId),
      replyVideo,
      replyTarget,
      replyImageFileIds,
    );
    if (merged) {
      replyImageFileIds = merged.replyImageFileIds;
      rt.debugLog("reply_video_resolved", {
        chat_id: chatId,
        reply_message_id: args.replyToMessage?.message_id,
        kind: replyVideo.kind,
        mode: merged.mode,
      });
    }
  }

  const [nameOverride, gender] = await Promise.all([
    readValidDisplayName(rt.deps.storage, userId),
    rt.deps.storage.profile.getGender(userId),
  ]);
  const sender = {
    firstName: identity.firstName,
    lastName: identity.lastName,
    nameOverride,
    gender,
  };

  let typingTimer: ReturnType<typeof setInterval> | null = null;
  const stopTyping = () => {
    if (typingTimer !== null) {
      clearInterval(typingTimer);
      typingTimer = null;
    }
  };
  const startTyping = () => {
    ctx.replyWithChatAction("typing").catch(() => {});
    typingTimer = setInterval(() => {
      ctx.replyWithChatAction("typing").catch(() => {});
    }, 4000);
  };

  const startedAt = performance.now();
  let outcomeLabel: AskOutcomeLabel = "error";
  try {
    let outcome;
    try {
      outcome = await askHandler({
        storage: rt.deps.storage,
        rateLimiter: rt.deps.rateLimiter,
        budgetGuard: rt.deps.budgetGuard,
        ai: rt.deps.ai,
        resolver: rt.deps.resolver,
        botId: rt.botId,
        ownerId: rt.deps.ownerId,
        now: Date.now(),
        chatId: String(chatId),
        userId,
        senderChatId: identity.senderChatId,
        askMessageId: args.askMessageId,
        sender,
        userText: args.userText,
        quote: args.quote,
        images: args.images,
        audios: args.audios,
        videos: args.videos,
        attachments: args.attachments,
        imageFileIds: args.imageFileIds,
        replyImageFileIds,
        replyTarget,
        lang: ctx.lang,
        detailLevel: args.detailLevel,
        onAIStart: startTyping,
        fetchPhoto: rt.fetchPhoto,
      });
    } finally {
      stopTyping();
    }
    outcomeLabel = askOutcomeLabel(outcome.kind);

    switch (outcome.kind) {
      case "denied":
        rt.logAccessDenied({
          source: "ask",
          chat_id: chatId,
          user_id: userId,
          reason: outcome.reason,
        });
        return;
      case "usage":
        await ctx.reply(ctx.t.bot_ask_usage);
        return;
      // Failure notices are still part of the conversation: persist the turn
      // (question + the notice actually sent) so a later reply to either the
      // notice or the user's own ask message carries the full chain.
      case "budgetLimited": {
        void rt.alerts.globalCapBreach(ctx.api, outcome.reason);
        const text = ctx.t.bot_budget_limited;
        const sent = await ctx.reply(text);
        await outcome.persistConversation(sent.message_id, text);
        return;
      }
      case "rateLimited": {
        const text = ctx.t.bot_rate_limited(
          outcome.limitedBy,
          outcome.msUntilReset,
        );
        const sent = await ctx.reply(text);
        await outcome.persistConversation(sent.message_id, text);
        return;
      }
      case "error": {
        console.error("ask error:", outcome.message);
        const sent = await ctx.reply(ctx.t.bot_ai_error);
        await outcome.persistConversation(sent.message_id, ctx.t.bot_ai_error);
        return;
      }
      case "answered": {
        const topBlock = buildEffectsTopBlock(outcome.effects, ctx.lang);
        const content = buildRichMarkdown(outcome.text, outcome.botName, {
          topBlock,
          collapseThreshold: outcome.expandableThreshold,
          detailsSummary: ctx.t.bot_details_summary,
        });
        const replyParameters = { message_id: args.askMessageId };
        let sent: Message;
        try {
          // `skip_entity_detection` is deliberately left unset: Telegram
          // auto-links plain URLs and mentions in the AI reply, matching the
          // behavior of the `parse_mode: "HTML"` send path this replaced.
          sent = await ctx.api.sendRichMessage(
            chatId,
            { markdown: content.markdown },
            { reply_parameters: replyParameters },
          );
        } catch (err) {
          // Rich send failed (markdown Telegram rejected, or the method is
          // unavailable on this server) — fall back to a plain message so the
          // user still gets the answer.
          console.error("sendRichMessage failed, sending plain:", err);
          sent = await ctx.api.sendMessage(chatId, content.markdown, {
            reply_parameters: replyParameters,
          });
        }
        await outcome.persistConversation(sent.message_id);
        if (outcome.totalTokens > 0) {
          askTokensTotal.inc({ source: "ask" }, outcome.totalTokens);
        }
        return;
      }
    }
  } finally {
    const seconds = (performance.now() - startedAt) / 1000;
    askTotal.inc({ source: "ask", outcome: outcomeLabel });
    askDurationSeconds.observe(
      { source: "ask", outcome: outcomeLabel },
      seconds,
    );
  }
}
