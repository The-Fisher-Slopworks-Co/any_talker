// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { Bot, type Context } from "grammy";
import type { InlineQueryResult, Message } from "grammy/types";
import type { Storage } from "../storage/types";
import type { RateLimiter } from "../ratelimit/types";
import type { AIClient } from "../ai/types";
import { formatLog, type LogFields, type LogFormat } from "../log";
import { proxiedFetch } from "../proxy";
import { askHandler } from "./handlers/ask";
import { contactHandler } from "./handlers/contact";
import { guestAskHandler } from "./handlers/guest";
import { makeStartHandler } from "./handlers/start";
import { handleCheckCallback } from "./handlers/check-callback";
import { CHECK_CALLBACK_RE } from "../checks/callback-data";
import type { ReplyTarget } from "./context-builder";
import { pickPhotoSize, fetchTelegramPhoto } from "./photo";
import { createMediaGroupBuffer } from "./media-group-buffer";
import { resolveReplyAuthor } from "./reply";
import { resolveReplyImages } from "./reply-images";
import { applyBotNamePrefix, buildEffectsTopBlock } from "./format";
import type { SentGuestMessage } from "../types/telegram-guest";
import { makeIncomingUpdateLogger } from "./log-update";
import { makeLangMiddleware, type BotContext } from "./middleware/lang";
import { makeKeywordFilterMiddleware } from "./middleware/keyword-filter";
import {
  askDurationSeconds,
  askTokensTotal,
  askTotal,
  checksProcessedTotal,
  type AskOutcomeLabel,
} from "../metrics";

type AnswerGuestQuery = (args: {
  guest_query_id: string;
  result: InlineQueryResult;
}) => Promise<SentGuestMessage>;

export type BotDeps = {
  botToken: string;
  ownerId: string;
  webappUrl: string;
  storage: Storage;
  rateLimiter: RateLimiter;
  ai: AIClient;
  logFormat: LogFormat;
  logIncomingUpdates: boolean;
  logDebug: boolean;
};

const ASK_CAPTION_RE = /^\/ask(?:@\w+)?(?:\s+([\s\S]*))?$/i;

export function createBot(deps: BotDeps): Bot<BotContext> {
  const bot = new Bot<BotContext>(deps.botToken, {
    client: { fetch: proxiedFetch as unknown as typeof fetch },
  });

  const debugLog = (msg: string, fields: LogFields = {}) => {
    if (!deps.logDebug) return;
    console.log(formatLog({ level: "debug", msg, fields }, deps.logFormat));
  };

  bot.use(
    makeIncomingUpdateLogger({
      format: deps.logFormat,
      enabled: deps.logIncomingUpdates,
    }),
  );

  bot.use(makeLangMiddleware(deps.storage));

  bot.use(async (ctx, next) => {
    const now = Date.now();
    const guestMsg = ctx.update.guest_message;
    const from = ctx.from ?? guestMsg?.from;
    if (from && !from.is_bot) {
      void deps.storage
        .upsertUser({
          id: String(from.id),
          firstName: from.first_name ?? null,
          lastName: from.last_name ?? null,
          username: from.username ?? null,
          lastSeenAt: now,
        })
        .catch((err) => console.error("upsertUser failed:", err));
    }
    const chat = ctx.chat ?? guestMsg?.chat;
    if (chat) {
      void deps.storage
        .upsertChat({
          id: String(chat.id),
          type: chat.type,
          title: "title" in chat ? chat.title ?? null : null,
          username: "username" in chat ? chat.username ?? null : null,
          lastSeenAt: now,
        })
        .catch((err) => console.error("upsertChat failed:", err));
    }
    if (ctx.chat?.type === "private" && from && !from.is_bot) {
      void deps.storage
        .recordPrivateChat(String(from.id))
        .catch((err) => console.error("recordPrivateChat failed:", err));
    }
    await next();
  });

  const dispatchGuest = async (
    ctx: BotContext,
    msg: NonNullable<Context["update"]["guest_message"]>,
  ) => {
    const guestQueryId = msg.guest_query_id;
    if (!guestQueryId) return;
    const userId = String(msg.from?.id ?? "");
    if (!userId) return;
    const chatId = String(msg.chat.id);

    const userText = (msg.text ?? msg.caption ?? "").trim();

    const [nameOverride, gender] = await Promise.all([
      deps.storage.getUserName(userId),
      deps.storage.getUserGender(userId),
    ]);
    const sender = {
      firstName: msg.from?.first_name ?? null,
      lastName: msg.from?.last_name ?? null,
      nameOverride,
      gender,
    };

    const replyToOurBot =
      msg.reply_to_message?.from?.id === ctx.me.id;
    const priorThread = replyToOurBot
      ? await deps.storage.getGuestThread(chatId)
      : null;

    const startedAt = performance.now();
    let outcomeLabel: AskOutcomeLabel = "error";
    try {
      const outcome = await guestAskHandler({
        storage: deps.storage,
        rateLimiter: deps.rateLimiter,
        ai: deps.ai,
        ownerId: deps.ownerId,
        now: Date.now(),
        chatId,
        userId,
        sender,
        userText,
        priorThread,
        lang: ctx.lang,
      });
      outcomeLabel = askOutcomeLabel(outcome.kind);

      const answerGuestQuery = (
        ctx.api.raw as unknown as { answerGuestQuery: AnswerGuestQuery }
      ).answerGuestQuery;
      const answer = (
        text: string,
        botName: string | null,
        topBlock?: string,
      ) => {
        const decorated = applyBotNamePrefix(text, botName, topBlock);
        return answerGuestQuery({
          guest_query_id: guestQueryId,
          result: {
            type: "article",
            id: "1",
            title: "Reply",
            input_message_content: {
              message_text: decorated.text,
              parse_mode: decorated.parseMode,
              link_preview_options: { is_disabled: true },
            },
          },
        });
      };

      switch (outcome.kind) {
        case "denied":
          return;
        case "rateLimited":
          await answer(
            ctx.t.bot_rate_limited(outcome.minutesUntilNextRefill),
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
            await answer(outcome.text, outcome.botName, topBlock);
            await outcome.persistThread();
            if (outcome.totalTokens > 0) {
              askTokensTotal.inc({ source: "guest" }, outcome.totalTokens);
            }
          } catch (err) {
            console.error("answerGuestQuery failed:", err);
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
  };

  bot.use(async (ctx, next) => {
    const guestMsg = ctx.update.guest_message;
    if (guestMsg) {
      await dispatchGuest(ctx, guestMsg);
      return;
    }
    await next();
  });

  bot.use(makeKeywordFilterMiddleware(deps.storage));

  bot.command("start", makeStartHandler({ ownerId: deps.ownerId, webappUrl: deps.webappUrl }));

  type AskDispatch = {
    userText: string;
    askMessageId: number;
    images: Uint8Array[];
    imageFileIds: string[];
    replyToMessage: Message | undefined;
    quote: string | null;
    forwardOrigin: boolean;
  };

  const fetchPhoto = (fileId: string) =>
    fetchTelegramPhoto({
      storage: deps.storage,
      botToken: deps.botToken,
      fileId,
    });

  const dispatchAsk = async (ctx: BotContext, args: AskDispatch) => {
    debugLog("ask_dispatch", {
      chat_id: ctx.chat?.id,
      ask_message_id: args.askMessageId,
      images: args.images.length,
      image_file_ids: args.imageFileIds.length,
      user_text_len: args.userText.length,
      has_quote: args.quote !== null,
      has_reply_target: args.replyToMessage !== undefined,
      forward_origin: args.forwardOrigin,
    });

    if (args.forwardOrigin) return;

    const userId = String(ctx.from?.id ?? "");
    const chatId = ctx.chat?.id;
    if (!userId || chatId === undefined) return;

    const replyTarget = args.replyToMessage
      ? extractReplyTarget(args.replyToMessage)
      : null;

    let replyImageFileIds: string[] = [];
    if (replyTarget && args.replyToMessage) {
      const reply = await resolveReplyImages({
        chatId: String(chatId),
        replyToMessage: args.replyToMessage,
        storage: deps.storage,
        fetchPhoto,
      });
      replyTarget.images = reply.images;
      replyImageFileIds = reply.fileIds;
      debugLog("reply_images_resolved", {
        chat_id: chatId,
        reply_message_id: args.replyToMessage.message_id,
        reply_media_group_id: args.replyToMessage.media_group_id ?? null,
        source: reply.source,
        album_index_size: reply.albumIndexSize,
        images: reply.images.length,
      });
    }

    const [nameOverride, gender] = await Promise.all([
      deps.storage.getUserName(userId),
      deps.storage.getUserGender(userId),
    ]);
    const sender = {
      firstName: ctx.from?.first_name ?? null,
      lastName: ctx.from?.last_name ?? null,
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
          storage: deps.storage,
          rateLimiter: deps.rateLimiter,
          ai: deps.ai,
          ownerId: deps.ownerId,
          now: Date.now(),
          chatId: String(chatId),
          userId,
          askMessageId: args.askMessageId,
          sender,
          userText: args.userText,
          quote: args.quote,
          images: args.images,
          imageFileIds: args.imageFileIds,
          replyImageFileIds,
          replyTarget,
          lang: ctx.lang,
          onAIStart: startTyping,
          fetchPhoto,
        });
      } finally {
        stopTyping();
      }
      outcomeLabel = askOutcomeLabel(outcome.kind);

      switch (outcome.kind) {
        case "denied":
          return;
        case "usage":
          await ctx.reply(ctx.t.bot_ask_usage);
          return;
        case "rateLimited":
          await ctx.reply(
            ctx.t.bot_rate_limited(outcome.minutesUntilNextRefill),
          );
          return;
        case "error":
          console.error("ask error:", outcome.message);
          await ctx.reply(ctx.t.bot_ai_error);
          return;
        case "answered": {
          const topBlock = buildEffectsTopBlock(outcome.effects, ctx.lang);
          const decorated = applyBotNamePrefix(
            outcome.text,
            outcome.botName,
            topBlock,
          );
          const sent = await ctx.api.sendMessage(chatId, decorated.text, {
            parse_mode: decorated.parseMode,
            reply_parameters: { message_id: args.askMessageId },
          });
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
  };

  const mediaGroupBuffer = createMediaGroupBuffer<Message, BotContext>({
    onFlush: async ({ key, context: ctx, items }) => {
      debugLog("media_group_flush", {
        key,
        items: items.length,
        message_ids: items.map((it) => it.message_id),
        captions: items.filter((it) => (it.caption ?? "").length > 0).length,
      });

      const askItem = items.find((it) => {
        const caption = it.caption ?? "";
        return ASK_CAPTION_RE.test(caption);
      });
      if (!askItem) {
        debugLog("media_group_dropped", { key, reason: "no_ask_caption" });
        return;
      }
      if (askItem.forward_origin) {
        debugLog("media_group_dropped", { key, reason: "forward_origin" });
        return;
      }

      const captionMatch = ASK_CAPTION_RE.exec(askItem.caption ?? "");
      const userText = (captionMatch?.[1] ?? "").trim();
      const askMessageId = items[0]!.message_id;

      const fileIds: string[] = [];
      let images: Uint8Array[];
      try {
        images = await Promise.all(
          items.map((it) => {
            const picked = it.photo ? pickPhotoSize(it.photo) : null;
            if (!picked) throw new Error("no usable photo size in media group");
            fileIds.push(picked.file_id);
            return fetchPhoto(picked.file_id);
          }),
        );
      } catch (err) {
        console.error("media group photo download failed:", err);
        await ctx.reply(ctx.t.bot_photo_cant_fetch).catch(() => {});
        return;
      }

      await dispatchAsk(ctx, {
        userText,
        askMessageId,
        images,
        imageFileIds: fileIds,
        replyToMessage: askItem.reply_to_message,
        quote: askItem.quote?.text ?? null,
        forwardOrigin: false,
      });
    },
  });

  bot.command("ask", async (ctx) => {
    const msg = ctx.message;
    if (!msg) return;
    await dispatchAsk(ctx, {
      userText: (ctx.match ?? "").toString().trim(),
      askMessageId: msg.message_id,
      images: [],
      imageFileIds: [],
      replyToMessage: msg.reply_to_message,
      quote: msg.quote?.text ?? null,
      forwardOrigin: Boolean(msg.forward_origin),
    });
  });

  bot.on("message:photo", async (ctx) => {
    const msg = ctx.message;
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;

    const captionRaw = msg.caption ?? "";
    debugLog("photo_received", {
      chat_id: chatId,
      message_id: msg.message_id,
      media_group_id: msg.media_group_id ?? null,
      caption_len: captionRaw.length,
      ask_caption: ASK_CAPTION_RE.test(captionRaw),
      photo_sizes: msg.photo.length,
    });

    if (msg.media_group_id !== undefined) {
      const picked = pickPhotoSize(msg.photo);
      if (picked) {
        void deps.storage
          .appendAlbumPhoto(String(chatId), msg.media_group_id, {
            messageId: msg.message_id,
            fileId: picked.file_id,
          })
          .catch((err) =>
            console.error("appendAlbumPhoto failed:", err),
          );
      }
      const key = `${chatId}:${msg.media_group_id}`;
      mediaGroupBuffer.push({
        key,
        context: ctx,
        item: msg,
      });
      debugLog("media_group_push", {
        key,
        message_id: msg.message_id,
        pending_groups: mediaGroupBuffer.pendingCount(),
      });
      return;
    }

    const m = captionRaw.match(ASK_CAPTION_RE);
    if (!m) return;
    const userText = (m[1] ?? "").trim();

    let image: Uint8Array | null = null;
    let imageFileId: string | null = null;
    const picked = pickPhotoSize(msg.photo);
    if (picked) {
      try {
        image = await fetchPhoto(picked.file_id);
        imageFileId = picked.file_id;
      } catch (err) {
        console.error("photo download failed:", err);
        await ctx.reply(ctx.t.bot_photo_cant_fetch);
        return;
      }
    }

    await dispatchAsk(ctx, {
      userText,
      askMessageId: msg.message_id,
      images: image ? [image] : [],
      imageFileIds: imageFileId ? [imageFileId] : [],
      replyToMessage: msg.reply_to_message,
      quote: msg.quote?.text ?? null,
      forwardOrigin: Boolean(msg.forward_origin),
    });
  });

  bot.on("message:contact", async (ctx) => {
    if (ctx.message.forward_origin) return;
    if (!ctx.from) return;
    const c = ctx.message.contact;

    const outcome = await contactHandler({
      storage: deps.storage,
      ownerId: deps.ownerId,
      now: Date.now(),
      isPrivateChat: ctx.chat?.type === "private",
      fromUserId: String(ctx.from.id),
      contact: {
        user_id: c.user_id,
        first_name: c.first_name,
        last_name: c.last_name,
      },
    });

    switch (outcome.kind) {
      case "ignored":
        return;
      case "noUserId":
        await ctx.reply(ctx.t.bot_contact_no_user_id);
        return;
      case "isOwner":
        await ctx.reply(ctx.t.bot_contact_is_owner);
        return;
      case "alreadyWhitelisted":
        await ctx.reply(ctx.t.bot_contact_already_whitelisted(outcome.label));
        return;
      case "added":
        await ctx.reply(ctx.t.bot_contact_added(outcome.label));
        return;
    }
  });

  bot.callbackQuery(CHECK_CALLBACK_RE, async (ctx) => {
    const checkId = ctx.match[1]!;
    const answer = ctx.match[2] as "yes" | "no";
    const fromUserId = String(ctx.from.id);
    const callbackMessageId = ctx.callbackQuery.message?.message_id;
    if (callbackMessageId === undefined) {
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }
    const outcome = await handleCheckCallback({
      storage: deps.storage,
      api: ctx.api,
      checkId,
      answer,
      fromUserId,
      callbackMessageId,
    });
    if (outcome.kind === "wrong_user") {
      await ctx
        .answerCallbackQuery({ text: ctx.t.bot_check_wrong_user })
        .catch(() => {});
      return;
    }
    if (outcome.kind === "resolved") {
      checksProcessedTotal.inc({ outcome: `answered_${answer}` });
    }
    await ctx.answerCallbackQuery().catch(() => {});
  });

  bot.catch((err) => {
    console.error("Unhandled bot error:", err);
  });

  return bot;
}

function extractReplyTarget(reply: Message): ReplyTarget {
  const text = reply.text ?? reply.caption ?? null;
  return {
    messageId: reply.message_id,
    text,
    authorFirstName: resolveReplyAuthor(reply),
    images: [],
  };
}

function askOutcomeLabel(kind: string): AskOutcomeLabel {
  switch (kind) {
    case "answered":
      return "answered";
    case "denied":
      return "denied";
    case "usage":
      return "usage";
    case "rateLimited":
      return "rate_limited";
    default:
      return "error";
  }
}
