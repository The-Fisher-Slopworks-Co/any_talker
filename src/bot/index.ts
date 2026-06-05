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
import type { DetailLevel } from "../ai/instruction";
import { contactHandler } from "./handlers/contact";
import { guestAskHandler } from "./handlers/guest";
import { handleCheckCallback } from "./handlers/check-callback";
import { CHECK_CALLBACK_RE } from "../checks/callback-data";
import type { ReplyTarget } from "./context-builder";
import { pickPhotoSize, fetchTelegramPhoto, downloadTelegramFile } from "./photo";
import { createMediaGroupBuffer } from "./media-group-buffer";
import { resolveReplyAuthor } from "./reply";
import { resolveReplyImages } from "./reply-images";
import { applyBotNamePrefix, buildEffectsTopBlock } from "./format";
import type { PersonaResolver } from "../managed-bots/persona";
import { readValidDisplayName } from "../shared/display-name";
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

// Identifies a managed (non-main) bot. Its presence switches `createBot` into
// managed mode: `/ask` is matched ONLY when explicitly addressed as `@self`,
// and the bot's id scopes per-character storage + the tool call context.
export type BotPersona = {
  botId: string;
};

export type BotDeps = {
  botToken: string;
  ownerId: string;
  storage: Storage;
  rateLimiter: RateLimiter;
  ai: AIClient;
  // Resolves the character to answer as for a given chat (settings + name).
  resolver: PersonaResolver;
  // Present for managed bots only; absent ⇒ the main bot.
  persona?: BotPersona;
  // The user ids of the OTHER family bots (the main bot + every other managed
  // bot) this bot should consider when deciding whether it is alone in a group.
  // Supplied by `BotManager` for managed bots; absent for the main bot (which
  // never needs an alone-check — it always answers a bare `/ask`).
  siblingBotIds?: () => string[];
  logFormat: LogFormat;
  logIncomingUpdates: boolean;
  logDebug: boolean;
};

// `/ask`/`/askwise`, an optional `@username` (group 2, without the @), and the
// optional text (group 3). The `g` flag is intentionally absent so `.match`
// stays stateless and the instance is reusable.
const ASK_RE = /^\/(ask|askwise)(?:@(\w+))?(?:\s+([\s\S]*))?$/i;

const COMMAND_TO_DETAIL: Record<string, DetailLevel> = {
  ask: "short",
  askwise: "wise",
};

export type AskMatch = {
  detailLevel: DetailLevel;
  userText: string;
  // True when the command explicitly mentioned this bot (`/ask@self`); false for
  // a bare `/ask`. The caller decides whether a bare ask is answered (see
  // `askGate`) — parsing stays pure and stateless.
  explicit: boolean;
};

// Parse an `/ask(wise)` command or media caption and decide whether it is even
// addressed to THIS bot. Matching is done against the bot's LIVE `ctx.me.username`
// so it can't go stale: a `@mention` to a *different* bot returns null (this is
// what stops the main bot from stealing a `/ask@CharacterBot` photo caption). A
// bare `/ask` or an explicit `@self` both return a match; the `explicit` flag
// distinguishes them so the caller can gate bare asks.
export function matchAsk(
  raw: string,
  selfUsername: string | undefined,
): AskMatch | null {
  const m = raw.match(ASK_RE);
  if (!m) return null;
  const mention = m[2];
  if (
    mention &&
    (!selfUsername || mention.toLowerCase() !== selfUsername.toLowerCase())
  ) {
    return null;
  }
  return {
    detailLevel: COMMAND_TO_DETAIL[m[1]!.toLowerCase()] ?? "short",
    userText: (m[3] ?? "").trim(),
    explicit: mention !== undefined,
  };
}

// How long a recorded presence entry is trusted without a refresh. Presence is
// refreshed on every group update a bot processes and on membership changes, so
// this TTL only bounds staleness when a bot leaves a chat while the app is
// offline (its `my_chat_member` is missed) — past it, the entry reads as absent.
export const BOT_PRESENCE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AskDecision = "answer" | "check-alone";

// Decide whether a parsed ask should be answered, from routing mode + chat type:
//   - an explicit `@self` mention is always answered;
//   - the main bot (`requireMention === false`) answers a bare `/ask` too;
//   - a managed bot answers a bare `/ask` in its DM (it is inherently alone),
//     and in a group only if it is the sole family bot there — which the caller
//     resolves via presence ("check-alone").
export function askGate(
  match: AskMatch,
  requireMention: boolean,
  chatType: string | undefined,
): AskDecision {
  if (match.explicit) return "answer";
  if (!requireMention) return "answer";
  if (chatType === "private") return "answer";
  return "check-alone";
}

// A managed bot is "alone" in a chat when none of its sibling family bots (the
// main bot + other managed bots) have a fresh presence record there.
export function computeAlone(
  siblingIds: string[],
  presence: Record<string, number>,
  nowMs: number,
  ttlMs: number,
): boolean {
  return !siblingIds.some((id) => {
    const seen = presence[id];
    return seen !== undefined && nowMs - seen <= ttlMs;
  });
}

export function createBot(deps: BotDeps): Bot<BotContext> {
  const bot = new Bot<BotContext>(deps.botToken, {
    client: { fetch: proxiedFetch as unknown as typeof fetch },
  });

  const debugLog = (msg: string, fields: LogFields = {}) => {
    if (!deps.logDebug) return;
    console.log(formatLog({ level: "debug", msg, fields }, deps.logFormat));
  };

  // Scope + routing mode for this bot. Managed bots respond only to `/ask@self`
  // (require an explicit mention); the main bot also answers a bare `/ask`.
  const botId = deps.persona?.botId ?? null;
  const requireMention = deps.persona !== undefined;
  // Storage scoped to this bot for the per-character calls made directly in this
  // file (private-chat flag, album buffer, guest thread, reply-image album
  // lookup). The pure handlers receive base storage + botId and scope
  // themselves; everything else (user/chat directory, etc.) stays on base.
  const scopedStorage = deps.storage.forBot(botId);

  // A managed bot is alone in a group when none of its sibling family bots have
  // a fresh presence record there. Fail-closed on a storage error (treat as NOT
  // alone) so a transient hiccup can't make a managed bot double-answer a bare
  // `/ask` alongside the main bot — at worst the user retries or `@`-mentions.
  const isAloneInChat = async (chatId: string): Promise<boolean> => {
    const siblings = deps.siblingBotIds?.() ?? [];
    if (siblings.length === 0) return true;
    try {
      const presence = await deps.storage.getBotPresence(chatId);
      return computeAlone(siblings, presence, Date.now(), BOT_PRESENCE_TTL_MS);
    } catch (err) {
      console.error("getBotPresence failed:", err);
      return false;
    }
  };

  // Whether to act on a matched ask. Bare asks for a managed bot in a group are
  // gated on being the only family bot present; everything else answers outright.
  const shouldAnswer = async (
    ctx: BotContext,
    match: AskMatch,
  ): Promise<boolean> => {
    if (askGate(match, requireMention, ctx.chat?.type) === "answer") return true;
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return false;
    return await isAloneInChat(String(chatId));
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
      void scopedStorage
        .recordPrivateChat(String(from.id))
        .catch((err) => console.error("recordPrivateChat failed:", err));
    }
    // Refresh this bot's presence in any group it is active in, so managed
    // siblings can tell who shares a chat (drives the bare-`/ask` alone-check).
    // `my_chat_member` is the authoritative add/remove; this activity refresh
    // also backfills membership that predates the feature and renews the TTL.
    if (ctx.chat && ctx.chat.type !== "private") {
      void deps.storage
        .recordBotPresence(String(ctx.chat.id), String(ctx.me.id), now)
        .catch((err) => console.error("recordBotPresence failed:", err));
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
      readValidDisplayName(deps.storage, userId),
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
      ? await scopedStorage.getGuestThread(chatId)
      : null;

    const startedAt = performance.now();
    let outcomeLabel: AskOutcomeLabel = "error";
    try {
      const outcome = await guestAskHandler({
        storage: deps.storage,
        rateLimiter: deps.rateLimiter,
        ai: deps.ai,
        resolver: deps.resolver,
        botId,
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
        expandableThreshold?: number,
      ) => {
        const decorated = applyBotNamePrefix(
          text,
          botName,
          topBlock,
          expandableThreshold,
        );
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

  type AskDispatch = {
    userText: string;
    askMessageId: number;
    images: Uint8Array[];
    imageFileIds: string[];
    audios: Uint8Array[];
    replyToMessage: Message | undefined;
    quote: string | null;
    forwardOrigin: boolean;
    detailLevel: DetailLevel;
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
      audios: args.audios.length,
      user_text_len: args.userText.length,
      has_quote: args.quote !== null,
      has_reply_target: args.replyToMessage !== undefined,
      forward_origin: args.forwardOrigin,
      detail_level: args.detailLevel,
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
        storage: scopedStorage,
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

    const replyVoice = args.replyToMessage?.voice;
    if (replyTarget && replyVoice) {
      try {
        replyTarget.audios = [
          await downloadTelegramFile(deps.botToken, replyVoice.file_id),
        ];
        debugLog("reply_voice_resolved", {
          chat_id: chatId,
          reply_message_id: args.replyToMessage?.message_id,
        });
      } catch (err) {
        console.error("reply voice download failed:", err);
      }
    }

    const [nameOverride, gender] = await Promise.all([
      readValidDisplayName(deps.storage, userId),
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
          resolver: deps.resolver,
          botId,
          ownerId: deps.ownerId,
          now: Date.now(),
          chatId: String(chatId),
          userId,
          askMessageId: args.askMessageId,
          sender,
          userText: args.userText,
          quote: args.quote,
          images: args.images,
          audios: args.audios,
          imageFileIds: args.imageFileIds,
          replyImageFileIds,
          replyTarget,
          lang: ctx.lang,
          detailLevel: args.detailLevel,
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
            outcome.expandableThreshold,
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

      const matchOf = (it: Message) =>
        matchAsk(it.caption ?? "", ctx.me.username);
      const askItem = items.find((it) => matchOf(it) !== null);
      if (!askItem) {
        debugLog("media_group_dropped", { key, reason: "no_ask_caption" });
        return;
      }
      if (askItem.forward_origin) {
        debugLog("media_group_dropped", { key, reason: "forward_origin" });
        return;
      }

      const captionMatch = matchOf(askItem)!;
      if (!(await shouldAnswer(ctx, captionMatch))) {
        debugLog("media_group_dropped", { key, reason: "not_addressed" });
        return;
      }
      const detailLevel = captionMatch.detailLevel;
      const userText = captionMatch.userText;
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
        audios: [],
        replyToMessage: askItem.reply_to_message,
        quote: askItem.quote?.text ?? null,
        forwardOrigin: false,
        detailLevel,
      });
    },
  });

  const dispatchTextCommand = async (
    ctx: BotContext,
    detailLevel: DetailLevel,
    // Managed bots match `/ask@self` by hand (not via grammY's command filter),
    // so they pass the already-extracted text rather than relying on ctx.match.
    userText?: string,
  ) => {
    const msg = ctx.message;
    if (!msg) return;
    await dispatchAsk(ctx, {
      userText: userText ?? (ctx.match ?? "").toString().trim(),
      askMessageId: msg.message_id,
      images: [],
      imageFileIds: [],
      audios: [],
      replyToMessage: msg.reply_to_message,
      quote: msg.quote?.text ?? null,
      forwardOrigin: Boolean(msg.forward_origin),
      detailLevel,
    });
  };

  if (requireMention) {
    // Managed bot: grammY's `bot.command` would also fire on a bare `/ask`
    // (which usually belongs to the main bot), so we parse the raw text with
    // `matchAsk` and let `shouldAnswer` decide — `@self` always, a bare `/ask`
    // only in a DM or when alone in a group.
    bot.on("message:text", async (ctx) => {
      const match = matchAsk(ctx.message.text, ctx.me.username);
      if (!match) return;
      if (!(await shouldAnswer(ctx, match))) return;
      await dispatchTextCommand(ctx, match.detailLevel, match.userText);
    });
  } else {
    bot.command("ask", (ctx) => dispatchTextCommand(ctx, "short"));
    bot.command("askwise", (ctx) => dispatchTextCommand(ctx, "wise"));
  }

  bot.on("message:photo", async (ctx) => {
    const msg = ctx.message;
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;

    const captionRaw = msg.caption ?? "";
    const match = matchAsk(captionRaw, ctx.me.username);
    debugLog("photo_received", {
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
        void scopedStorage
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

    if (!match) return;
    if (!(await shouldAnswer(ctx, match))) return;
    const detailLevel = match.detailLevel;
    const userText = match.userText;

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
    debugLog("voice_received", {
      chat_id: chatId,
      message_id: msg.message_id,
      caption_len: captionRaw.length,
      ask_caption: match !== null,
      duration: msg.voice.duration,
    });
    if (!match) return;
    if (!(await shouldAnswer(ctx, match))) return;

    const detailLevel = match.detailLevel;
    const userText = match.userText;

    let audio: Uint8Array;
    try {
      audio = await downloadTelegramFile(deps.botToken, msg.voice.file_id);
    } catch (err) {
      console.error("voice download failed:", err);
      await ctx.reply(ctx.t.bot_voice_cant_fetch);
      return;
    }

    await dispatchAsk(ctx, {
      userText,
      askMessageId: msg.message_id,
      images: [],
      imageFileIds: [],
      audios: [audio],
      replyToMessage: msg.reply_to_message,
      quote: msg.quote?.text ?? null,
      forwardOrigin: Boolean(msg.forward_origin),
      detailLevel,
    });
  });

  // Authoritative presence tracking: when THIS bot is added to / removed from a
  // group, record or clear its presence so managed siblings can resolve the
  // bare-`/ask` alone-check. Private chats are never tracked.
  bot.on("my_chat_member", async (ctx) => {
    const upd = ctx.myChatMember;
    if (upd.chat.type === "private") return;
    // Narrow on the member object directly so the `restricted` discriminant
    // exposes `is_member`. A left/kicked bot (or a restricted non-member) is
    // absent; everything else counts as present.
    const member = upd.new_chat_member;
    const present =
      member.status === "member" ||
      member.status === "administrator" ||
      member.status === "creator" ||
      (member.status === "restricted" && member.is_member);
    const chatId = String(upd.chat.id);
    const selfId = String(ctx.me.id);
    try {
      if (present) await deps.storage.recordBotPresence(chatId, selfId, Date.now());
      else await deps.storage.removeBotPresence(chatId, selfId);
    } catch (err) {
      console.error("my_chat_member presence update failed:", err);
    }
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
      checksProcessedTotal.inc({
        outcome: answer === "yes" ? "answered_yes" : "answered_no",
      });
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
    audios: [],
  };
}

type AskOutcomeKind =
  | "answered"
  | "denied"
  | "usage"
  | "rateLimited"
  | "error";

const ASK_OUTCOME_LABEL: Record<AskOutcomeKind, AskOutcomeLabel> = {
  answered: "answered",
  denied: "denied",
  usage: "usage",
  rateLimited: "rate_limited",
  error: "error",
};

function askOutcomeLabel(kind: AskOutcomeKind): AskOutcomeLabel {
  return ASK_OUTCOME_LABEL[kind];
}
