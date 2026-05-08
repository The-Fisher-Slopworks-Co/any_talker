import { Bot, type Context } from "grammy";
import type { Storage } from "../storage/types";
import type { RateLimiter } from "../ratelimit/types";
import type { AIClient } from "../ai/types";
import { askHandler } from "./handlers/ask";
import { makeStartHandler } from "./handlers/start";
import type { ReplyTarget } from "./context-builder";
import { pickPhotoSize, downloadTelegramFile } from "./photo";
import { resolveReplyAuthor } from "./reply";

export type BotDeps = {
  botToken: string;
  ownerId: string;
  webappUrl: string;
  storage: Storage;
  rateLimiter: RateLimiter;
  ai: AIClient;
};

const ASK_CAPTION_RE = /^\/ask(?:@\w+)?(?:\s+([\s\S]*))?$/i;

export function createBot(deps: BotDeps): Bot {
  const bot = new Bot(deps.botToken);

  bot.use(async (ctx, next) => {
    const now = Date.now();
    const from = ctx.from;
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
    const chat = ctx.chat;
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
    await next();
  });

  bot.command("start", makeStartHandler({ ownerId: deps.ownerId, webappUrl: deps.webappUrl }));

  const dispatchAsk = async (ctx: Context, userText: string) => {
    if (ctx.message?.forward_origin) return;

    const userId = String(ctx.from?.id ?? "");
    const chatId = ctx.chat?.id;
    if (!userId || chatId === undefined) return;

    const replyTarget = extractReplyTarget(ctx);
    const nameOverride = await deps.storage.getUserName(userId);
    const sender = {
      firstName: ctx.from?.first_name ?? null,
      lastName: ctx.from?.last_name ?? null,
      nameOverride,
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
          await ctx.reply("⚠️ Couldn't fetch the attached photo.");
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
        sender,
        userText,
        quote,
        image,
        replyTarget,
        onAIStart: startTyping,
      });
    } finally {
      stopTyping();
    }

    switch (outcome.kind) {
      case "denied":
        return;
      case "usage":
        await ctx.reply("Usage: /ask <text> or reply to a message with /ask");
        return;
      case "rateLimited":
        await ctx.reply(
          `Rate limit exceeded. Refilled in ~${outcome.minutesUntilNextRefill} min.`,
        );
        return;
      case "error":
        console.error("ask error:", outcome.message);
        await ctx.reply("⚠️ AI error. Try again later.");
        return;
      case "answered": {
        const sent = await ctx.reply(outcome.text, {
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
