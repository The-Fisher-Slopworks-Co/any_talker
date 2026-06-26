// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { Bot, type Context } from "grammy";
import type {
  InlineQueryResult,
  InputMessageContent,
  Message,
  Update,
} from "grammy/types";
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
import { transcodeOggToMp3 } from "./transcode";
import { createMediaGroupBuffer } from "./media-group-buffer";
import { resolveReplyAuthor } from "./reply";
import { resolveReplyImages } from "./reply-images";
import { buildRichMarkdown, buildEffectsTopBlock } from "./format";
import { richApi } from "./rich";
import type { PersonaResolver } from "../managed-bots/persona";
import { readValidDisplayName } from "../shared/display-name";
import { DEFAULT_EXPANDABLE_BLOCKQUOTE_THRESHOLD } from "../shared/types";
import type { SentGuestMessage } from "../types/telegram-guest";
import type { InputRichMessageContent } from "../types/telegram-rich";
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
  // The user ids of the OTHER family bots this bot should consider for routing.
  // For a managed bot: the main bot + every other managed bot — used both for
  // the alone-check and to recognize a bare `/ask` replying to a sibling. For
  // the main bot: the managed (character) bots (`BotManager.managedBotIds()`) —
  // it never needs the alone-check, but uses these to recognize a bare `/ask`
  // replying to a *present* character's message and defer to that character.
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

export type AskDecision = "answer" | "check-alone" | "skip";

// Where the message a bare `/ask` is replying to was sent from, relative to this
// bot's family (see `classifyReplyTarget`): this bot's own message ("self"), a
// *present* sibling family bot's message ("sibling" — the reply is routed to
// that bot), or anything else ("other": a human, an unrelated bot, no reply, or
// a family bot that is NOT currently in this chat).
export type ReplyRouting = "self" | "sibling" | "other";

// Decide whether a parsed ask should be answered, from routing mode + chat type
// + who (if anyone) the ask replies to:
//   - an explicit `@self` mention is always answered;
//   - a bare `/ask` replying to a present family bot's message is routed to THAT
//     bot — the replied-to bot answers ("self"), every other bot defers
//     ("sibling" ⇒ "skip"); this stops the main bot from stealing a bare `/ask`
//     aimed at a character by replying to that character's message;
//   - otherwise the main bot (`requireMention === false`) answers a bare `/ask`;
//   - a managed bot answers a bare `/ask` in its DM (it is inherently alone),
//     and in a group only if it is the sole family bot there — which the caller
//     resolves via presence ("check-alone").
export function askGate(
  match: AskMatch,
  requireMention: boolean,
  chatType: string | undefined,
  reply: ReplyRouting,
): AskDecision {
  if (match.explicit) return "answer";
  if (reply === "self") return "answer";
  if (reply === "sibling") return "skip";
  if (!requireMention) return "answer";
  if (chatType === "private") return "answer";
  return "check-alone";
}

// Classify the sender of the message a bare `/ask` is replying to, so the ask
// can be routed to the bot the user addressed. `siblingBotIds` are the OTHER
// family bots (for the main bot: the managed bots; for a managed bot: the main
// bot + every other managed bot); this bot's own id is matched separately.
//
// A reply is only "sibling" when that family bot is *actually present in this
// chat* (`isSiblingPresent`) — a family bot that has left, was removed, or is
// down never receives the update, so deferring to it would leave the ask
// unanswered. Such an absent sibling (and any human / unrelated bot / no reply)
// is "other", which falls back to normal routing so the main bot still answers.
// `isSiblingPresent` is only consulted for ids in `siblingBotIds`; "self" is
// always present (this bot just received the update).
export function classifyReplyTarget(
  replyFromId: number | undefined,
  selfId: number,
  siblingBotIds: string[],
  isSiblingPresent: (botId: string) => boolean,
): ReplyRouting {
  if (replyFromId === undefined) return "other";
  const id = String(replyFromId);
  if (id === String(selfId)) return "self";
  if (siblingBotIds.includes(id) && isSiblingPresent(id)) return "sibling";
  return "other";
}

// Whether a recorded presence timestamp is still fresh (a bot was seen within
// the TTL). `seenMs === undefined` — no record at all — is never fresh. Shared by
// the alone-check (`computeAlone`) and the reply-routing presence probe in
// `shouldAnswer` so both read "present in this chat" by exactly the same rule.
export function isPresenceFresh(
  seenMs: number | undefined,
  nowMs: number,
  ttlMs: number,
): boolean {
  return seenMs !== undefined && nowMs - seenMs <= ttlMs;
}

// A managed bot is "alone" in a chat when none of its sibling family bots (the
// main bot + other managed bots) have a fresh presence record there.
export function computeAlone(
  siblingIds: string[],
  presence: Record<string, number>,
  nowMs: number,
  ttlMs: number,
): boolean {
  return !siblingIds.some((id) => isPresenceFresh(presence[id], nowMs, ttlMs));
}

// Message fields that carry genuine user content. A Telegram *service* message
// (member joins/leaves, pins, migrations, …) has none of them. Missing an exotic
// content type only makes presence refresh slightly conservative; it can never
// reintroduce the bug below.
const MESSAGE_CONTENT_KEYS = [
  "text",
  "animation",
  "audio",
  "document",
  "photo",
  "sticker",
  "story",
  "video",
  "video_note",
  "voice",
  "contact",
  "dice",
  "game",
  "poll",
  "venue",
  "location",
  "invoice",
] as const;

function isContentMessage(message: Message | undefined): boolean {
  if (!message) return false;
  const fields = message as unknown as Record<string, unknown>;
  return MESSAGE_CONTENT_KEYS.some((key) => fields[key] !== undefined);
}

// Whether an incoming update is ordinary activity that should refresh this bot's
// group presence (TTL renewal + pre-feature backfill). It deliberately ignores:
//   - `my_chat_member` — membership is owned authoritatively by its handler
//     (which records on join), so refreshing here is redundant and racy;
//   - service messages (no content) — including the `left_chat_member` broadcast
//     of THIS bot's own removal.
// Without this, a bot draining the burst of updates around its own removal would
// re-`recordBotPresence` the presence its `my_chat_member` handler just cleared,
// so a managed sibling would keep seeing it as "present" and stay silent on a
// bare `/ask` until the 7-day TTL lapsed.
export function shouldRefreshPresence(update: Update): boolean {
  if (update.my_chat_member) return false;
  if (update.callback_query) return true;
  return isContentMessage(update.message ?? update.edited_message);
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

  // Whether to act on a matched ask. The chat's family-bot presence map is
  // fetched once and reused for both the reply routing and the alone-check:
  //   - a bare `/ask` replying to a *present* family bot's message is routed to
  //     that bot (the replied-to bot answers, the others defer) — a reply to an
  //     absent family bot falls back to normal routing so it is never left
  //     unanswered;
  //   - otherwise a managed bot's bare ask in a group is gated on being the only
  //     family bot present, and everything else answers outright.
  //
  // Two deliberately *opposite* biases on a storage error / no presence data,
  // because the failure modes they guard differ: reply routing fails OPEN (an
  // unknown sibling reads as absent ⇒ "other" ⇒ the main bot still answers, so a
  // reply can't go silent), while the alone-check fails CLOSED (treat as NOT
  // alone ⇒ a managed bot stays quiet, so it can't double-answer the main bot).
  const shouldAnswer = async (
    ctx: BotContext,
    match: AskMatch,
    replyToMessage: Message | undefined,
  ): Promise<boolean> => {
    const chatId = ctx.chat?.id;
    const siblings = deps.siblingBotIds?.() ?? [];

    // Fetch presence once; null distinguishes "couldn't read" (fail-closed for
    // the alone-check) from a successfully-read empty map.
    let presence: Record<string, number> | null = null;
    if (chatId !== undefined) {
      try {
        presence = await deps.storage.getBotPresence(String(chatId));
      } catch (err) {
        console.error("getBotPresence failed:", err);
      }
    }
    const now = Date.now();
    const isSiblingPresent = (id: string): boolean =>
      isPresenceFresh(presence?.[id], now, BOT_PRESENCE_TTL_MS);

    const reply = classifyReplyTarget(
      replyToMessage?.from?.id,
      ctx.me.id,
      siblings,
      isSiblingPresent,
    );
    const decision = askGate(match, requireMention, ctx.chat?.type, reply);
    if (decision === "answer") return true;
    if (decision === "skip") return false;

    // check-alone: a managed bot answers only when no sibling is present.
    if (chatId === undefined) return false;
    if (siblings.length === 0) return true;
    if (presence === null) return false; // fail-closed: couldn't read presence
    return computeAlone(siblings, presence, now, BOT_PRESENCE_TTL_MS);
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
    // backfills membership that predates the feature and renews the TTL — but
    // only on genuine activity (see `shouldRefreshPresence`), never on the
    // service/membership burst a bot drains around its own removal, which would
    // otherwise resurrect the presence its removal just cleared.
    if (
      ctx.chat &&
      ctx.chat.type !== "private" &&
      shouldRefreshPresence(ctx.update)
    ) {
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
        const content = buildRichMarkdown(text, botName, {
          topBlock,
          collapseThreshold:
            expandableThreshold ?? DEFAULT_EXPANDABLE_BLOCKQUOTE_THRESHOLD,
          detailsSummary: ctx.t.bot_details_summary,
        });
        const richContent: InputRichMessageContent = {
          rich_message: { markdown: content.markdown },
        };
        return answerGuestQuery({
          guest_query_id: guestQueryId,
          result: {
            type: "article",
            id: "1",
            title: "Reply",
            input_message_content:
              richContent as unknown as InputMessageContent,
          },
        });
      };

      switch (outcome.kind) {
        case "denied":
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
        const raw = await downloadTelegramFile(deps.botToken, replyVoice.file_id);
        // Transcode ogg → mp3; on failure drop the reply audio (it's only
        // supplementary context, and raw ogg would crash the request).
        const mp3 = await transcodeOggToMp3(raw);
        if (mp3) {
          replyTarget.audios = [mp3];
          debugLog("reply_voice_resolved", {
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
        // Failure notices are still part of the conversation: persist the turn
        // (question + the notice actually sent) so a later reply to either the
        // notice or the user's own ask message carries the full chain.
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
            sent = await richApi(ctx.api).sendRichMessage({
              chat_id: chatId,
              rich_message: { markdown: content.markdown },
              reply_parameters: replyParameters,
            });
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
      if (!(await shouldAnswer(ctx, captionMatch, askItem.reply_to_message))) {
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
    // Every bot extracts the text via `matchAsk` and passes it in, so this never
    // relies on grammY's `ctx.match` (the command filter is unused for asks).
    userText: string,
  ) => {
    const msg = ctx.message;
    if (!msg) return;
    await dispatchAsk(ctx, {
      userText,
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

  // Both the main and managed bots parse `/ask(wise)` from the raw text with
  // `matchAsk` (not grammY's command filter) so the same reply-aware routing in
  // `shouldAnswer` applies to every bot: an explicit `@self` is always answered,
  // a bare `/ask` replying to a present family bot's message is answered by THAT
  // bot, and a managed bot otherwise answers only in a DM or when alone in a
  // group. Dropping the main bot's `bot.command` loses no behavior: `bot.command`
  // also fires on channel/business posts, but those populate `ctx.channelPost`/
  // `ctx.businessMessage` (not `ctx.message`), and the whole ask flow keys off
  // `ctx.message` — like the `message:photo`/`message:voice` handlers — so a
  // `/ask` there already no-op'd before this change.
  bot.on("message:text", async (ctx) => {
    const match = matchAsk(ctx.message.text, ctx.me.username);
    if (!match) return;
    if (!(await shouldAnswer(ctx, match, ctx.message.reply_to_message))) return;
    await dispatchTextCommand(ctx, match.detailLevel, match.userText);
  });

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
    if (!(await shouldAnswer(ctx, match, msg.reply_to_message))) return;
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
    if (!(await shouldAnswer(ctx, match, msg.reply_to_message))) return;

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

    // The OpenAI-compatible API accepts only wav/mp3 audio, so transcode the
    // ogg/opus voice note before sending. A transcode failure is surfaced like
    // a fetch failure rather than sending unusable ogg.
    const mp3 = await transcodeOggToMp3(audio);
    if (!mp3) {
      console.error("voice transcode failed");
      await ctx.reply(ctx.t.bot_voice_cant_fetch);
      return;
    }

    await dispatchAsk(ctx, {
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
