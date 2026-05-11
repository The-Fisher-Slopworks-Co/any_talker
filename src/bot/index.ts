import { Bot, type Context } from "grammy";
import type { InlineQueryResult } from "grammy/types";
import type { Storage } from "../storage/types";
import type { RateLimiter } from "../ratelimit/types";
import type { AIClient } from "../ai/types";
import type { LogFormat } from "../log";
import { askHandler } from "./handlers/ask";
import { contactHandler } from "./handlers/contact";
import { guestAskHandler } from "./handlers/guest";
import { makeStartHandler } from "./handlers/start";
import { handleCheckCallback } from "./handlers/check-callback";
import { CHECK_CALLBACK_RE } from "../checks/callback-data";
import type { ReplyTarget } from "./context-builder";
import { pickPhotoSize, downloadTelegramFile } from "./photo";
import { resolveReplyAuthor } from "./reply";
import { applyBotNamePrefix } from "./format";
import type { SentGuestMessage } from "../types/telegram-guest";
import { makeIncomingUpdateLogger } from "./log-update";
import { makeLangMiddleware, type BotContext } from "./middleware/lang";
import { makeKeywordFilterMiddleware } from "./middleware/keyword-filter";

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
};

const ASK_CAPTION_RE = /^\/ask(?:@\w+)?(?:\s+([\s\S]*))?$/i;

export function createBot(deps: BotDeps): Bot<BotContext> {
  const bot = new Bot<BotContext>(deps.botToken);

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

    const answerGuestQuery = (
      ctx.api.raw as unknown as { answerGuestQuery: AnswerGuestQuery }
    ).answerGuestQuery;
    const answer = (text: string, botName: string | null) => {
      const decorated = applyBotNamePrefix(text, botName);
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
          await answer(outcome.text, outcome.botName);
          await outcome.persistThread();
        } catch (err) {
          console.error("answerGuestQuery failed:", err);
        }
        return;
      }
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

  const dispatchAsk = async (ctx: BotContext, userText: string) => {
    if (ctx.message?.forward_origin) return;

    const userId = String(ctx.from?.id ?? "");
    const chatId = ctx.chat?.id;
    const askMessageId = ctx.message?.message_id;
    if (!userId || chatId === undefined || askMessageId === undefined) return;

    const replyTarget = extractReplyTarget(ctx);
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
    const quote = ctx.message?.quote?.text ?? null;

    let image: Uint8Array | null = null;
    const photo = ctx.message?.photo;
    if (photo && photo.length > 0) {
      const picked = pickPhotoSize(photo);
      if (picked) {
        try {
          image = await downloadTelegramFile(deps.botToken, picked.file_id);
        } catch (err) {
          console.error("photo download failed:", err);
          await ctx.reply(ctx.t.bot_photo_cant_fetch);
          return;
        }
      }
    }

    if (replyTarget) {
      const replyPhoto = ctx.message?.reply_to_message?.photo;
      if (replyPhoto && replyPhoto.length > 0) {
        const picked = pickPhotoSize(replyPhoto);
        if (picked) {
          try {
            replyTarget.image = await downloadTelegramFile(deps.botToken, picked.file_id);
          } catch (err) {
            console.error("reply photo download failed:", err);
          }
        }
      }
    }

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
        askMessageId,
        sender,
        userText,
        quote,
        image,
        replyTarget,
        lang: ctx.lang,
        onAIStart: startTyping,
      });
    } finally {
      stopTyping();
    }

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
        const decorated = applyBotNamePrefix(outcome.text, outcome.botName);
        const sent = await ctx.reply(decorated.text, {
          parse_mode: decorated.parseMode,
          reply_parameters: ctx.message ? { message_id: ctx.message.message_id } : undefined,
        });
        await outcome.persistConversation(sent.message_id);
        return;
      }
    }
  };

  bot.command("ask", async (ctx) => {
    await dispatchAsk(ctx, (ctx.match ?? "").toString().trim());
  });

  bot.on("message:photo", async (ctx) => {
    const caption = ctx.message.caption ?? "";
    const m = caption.match(ASK_CAPTION_RE);
    if (!m) return;
    await dispatchAsk(ctx, (m[1] ?? "").trim());
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
    await ctx.answerCallbackQuery().catch(() => {});
  });

  bot.catch((err) => {
    console.error("Unhandled bot error:", err);
  });

  return bot;
}

function extractReplyTarget(ctx: Context): ReplyTarget | null {
  const reply = ctx.message?.reply_to_message;
  if (!reply) return null;
  const text = reply.text ?? reply.caption ?? null;
  return {
    messageId: reply.message_id,
    text,
    authorFirstName: resolveReplyAuthor(reply),
    image: null,
  };
}
