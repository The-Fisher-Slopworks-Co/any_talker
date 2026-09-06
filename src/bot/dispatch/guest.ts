// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Context } from "grammy";
import { guestAskHandler } from "../handlers/guest";
import { pickPhotoSize, downloadTelegramFile } from "../photo";
import { transcodeOggToMp3 } from "../transcode";
import { pickVideo, MAX_VIDEO_FRAMES, type VideoClip } from "../video";
import { resolveSenderIdentity } from "../identity";
import { resolveReplyImages } from "../reply-images";
import { extractReplyTarget } from "../reply";
import { buildRichMarkdown, buildEffectsTopBlock } from "../format";
import { readValidDisplayName } from "../../shared/display-name";
import { DEFAULT_EXPANDABLE_BLOCKQUOTE_THRESHOLD } from "../../shared/types";
import { askOutcomeLabel } from "../ask-outcome";
import { videoErrorText } from "../video-pipeline";
import type { BotRuntime } from "../runtime";
import type { BotContext } from "../middleware/lang";
import {
  askDurationSeconds,
  askTokensTotal,
  askTotal,
  type AskOutcomeLabel,
} from "../../metrics";

export async function dispatchGuest(
  rt: BotRuntime,
  ctx: BotContext,
  msg: NonNullable<Context["update"]["guest_message"]>,
): Promise<void> {
  const guestQueryId = msg.guest_query_id;
  if (!guestQueryId) return;
  // Same rule as `dispatchAsk`: a guest speaking as a chat is identified by
  // that chat, never by the shared pseudo-account (`bot/identity.ts`).
  const identity = resolveSenderIdentity(msg);
  if (!identity) return;
  const userId = identity.userId;
  const chatId = String(msg.chat.id);

  const userText = (msg.text ?? msg.caption ?? "").trim();

  const answer = (
    text: string,
    botName: string | null,
    topBlock?: string,
    expandableThreshold?: number,
  ) => {
    const content = buildRichMarkdown(text, botName, {
      topBlock,
      collapseThreshold:
        expandableThreshold ?? DEFAULT_EXPANDABLE_BLOCKQUOTE_THRESHOLD,
      detailsSummary: ctx.t.bot_details_summary,
    });
    return ctx.api.answerGuestQuery(guestQueryId, {
      type: "article",
      id: "1",
      title: "Reply",
      input_message_content: { rich_message: { markdown: content.markdown } },
    });
  };

  // Own media, mirroring the `message:photo` / `message:voice` ask flows.
  // A guest update delivers only the query message itself, so an album has
  // no sibling messages to buffer — the photo embedded here is the ceiling.
  let images: Uint8Array[] = [];
  let imageFileIds: string[] = [];
  if (msg.photo) {
    const picked = pickPhotoSize(msg.photo);
    if (picked) {
      try {
        images = [await rt.fetchPhoto(picked.file_id)];
        imageFileIds = [picked.file_id];
      } catch (err) {
        console.error("guest photo download failed:", err);
        await answer(ctx.t.bot_photo_cant_fetch, null).catch((e) =>
          console.error("answerGuestQuery failed:", e),
        );
        return;
      }
    }
  }

  let audios: Uint8Array[] = [];
  if (msg.voice) {
    try {
      const raw = await downloadTelegramFile(
        rt.deps.botToken,
        msg.voice.file_id,
      );
      // ogg → mp3, as in the voice ask flow; unusable audio is surfaced
      // like a fetch failure rather than sending raw ogg.
      const mp3 = await transcodeOggToMp3(raw);
      if (!mp3) throw new Error("voice transcode failed");
      audios = [mp3];
    } catch (err) {
      console.error("guest voice download failed:", err);
      await answer(ctx.t.bot_voice_cant_fetch, null).catch((e) =>
        console.error("answerGuestQuery failed:", e),
      );
      return;
    }
  }

  let videos: VideoClip[] = [];
  let attachments: string | undefined;
  const ownVideo = pickVideo(msg);
  if (ownVideo) {
    const parts = await rt.video.loadParts(chatId, ownVideo, MAX_VIDEO_FRAMES);
    if (!parts.ok) {
      await answer(videoErrorText(ctx, parts.reason), null).catch((e) =>
        console.error("answerGuestQuery failed:", e),
      );
      return;
    }
    const media = rt.video.media(ownVideo, parts);
    images = media.images;
    audios = media.audios;
    videos = media.videos;
    attachments = media.attachments;
    imageFileIds = ownVideo.thumbnailFileId ? [ownVideo.thumbnailFileId] : [];
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

  const replyMsg = msg.reply_to_message;
  const replyToOurBot = replyMsg?.from?.id === ctx.me.id;
  const priorThread = replyToOurBot
    ? await rt.scopedStorage.conversations.getGuest(chatId)
    : null;
  // Always extracted when the query is a reply; the handler prefers the
  // stored thread and falls back to the raw replied-to message (mirrors
  // /ask, where a reply outside the conversation graph is surfaced verbatim).
  const replyTarget = replyMsg ? extractReplyTarget(replyMsg) : null;
  let replyImageFileIds: string[] = [];
  if (replyTarget && replyMsg) {
    const reply = await resolveReplyImages({
      chatId,
      replyToMessage: replyMsg,
      storage: rt.scopedStorage,
      fetchPhoto: rt.fetchPhoto,
    });
    replyTarget.images = reply.images;
    replyImageFileIds = reply.fileIds;
  }
  const replyVoice = replyMsg?.voice;
  if (replyTarget && replyVoice) {
    try {
      const raw = await downloadTelegramFile(
        rt.deps.botToken,
        replyVoice.file_id,
      );
      // Transcode ogg → mp3; on failure drop the reply audio (it's only
      // supplementary context, and raw ogg would crash the request).
      const mp3 = await transcodeOggToMp3(raw);
      if (mp3) replyTarget.audios = [mp3];
      else console.error("reply voice transcode failed, dropping audio");
    } catch (err) {
      console.error("reply voice download failed:", err);
    }
  }

  // Same supplementary-context sample as /ask's reply video (see there).
  const replyVideo = replyMsg ? pickVideo(replyMsg) : null;
  if (replyTarget && replyVideo) {
    const merged = await rt.video.mergeReply(
      chatId,
      replyVideo,
      replyTarget,
      replyImageFileIds,
    );
    if (merged) replyImageFileIds = merged.replyImageFileIds;
  }

  rt.debugLog("guest_dispatch", {
    chat_id: msg.chat.id,
    message_id: msg.message_id,
    user_text_len: userText.length,
    images: images.length,
    audios: audios.length,
    has_quote: msg.quote !== undefined,
    has_reply_target: replyTarget !== null,
    reply_images: replyTarget?.images.length ?? 0,
    prior_thread_turns: priorThread?.turns.length ?? 0,
  });

  const startedAt = performance.now();
  let outcomeLabel: AskOutcomeLabel = "error";
  try {
    const outcome = await guestAskHandler({
      storage: rt.deps.storage,
      rateLimiter: rt.deps.rateLimiter,
      budgetGuard: rt.deps.budgetGuard,
      ai: rt.deps.ai,
      resolver: rt.deps.resolver,
      botId: rt.botId,
      ownerId: rt.deps.ownerId,
      now: Date.now(),
      chatId,
      userId,
      senderChatId: identity.senderChatId,
      sender,
      userText,
      quote: msg.quote?.text ?? null,
      images,
      audios,
      videos,
      attachments,
      imageFileIds,
      replyImageFileIds,
      replyTarget,
      priorThread,
      lang: ctx.lang,
      fetchPhoto: rt.fetchPhoto,
    });
    outcomeLabel = askOutcomeLabel(outcome.kind);

    switch (outcome.kind) {
      case "denied":
        // "empty" is a blank query, not an access decision — no log needed.
        if (outcome.reason !== "empty") {
          rt.logAccessDenied({
            source: "guest",
            chat_id: msg.chat.id,
            user_id: userId,
            reason: outcome.reason,
          });
        }
        return;
      case "budgetLimited":
        void rt.alerts.globalCapBreach(ctx.api, outcome.reason);
        await answer(ctx.t.bot_budget_limited, null).catch((err) =>
          console.error("answerGuestQuery failed:", err),
        );
        return;
      case "rateLimited":
        await answer(
          ctx.t.bot_rate_limited(outcome.limitedBy, outcome.msUntilReset),
          null,
        ).catch((err) => console.error("answerGuestQuery failed:", err));
        return;
      case "error":
        console.error("guest ask error:", outcome.message);
        await answer(ctx.t.bot_ai_error, null).catch((err) =>
          console.error("answerGuestQuery failed:", err),
        );
        return;
      case "answered": {
        try {
          const topBlock = buildEffectsTopBlock(outcome.effects, ctx.lang);
          await answer(
            outcome.text,
            outcome.botName,
            topBlock,
            outcome.expandableThreshold,
          );
        } catch (err) {
          console.error("answerGuestQuery failed:", err);
          return;
        }
        try {
          await outcome.persistThread();
          if (outcome.totalTokens > 0) {
            askTokensTotal.inc({ source: "guest" }, outcome.totalTokens);
          }
        } catch (err) {
          console.error("guest thread persistence failed:", err);
        }
        return;
      }
    }
  } finally {
    const seconds = (performance.now() - startedAt) / 1000;
    askTotal.inc({ source: "guest", outcome: outcomeLabel });
    askDurationSeconds.observe(
      { source: "guest", outcome: outcomeLabel },
      seconds,
    );
  }
}
