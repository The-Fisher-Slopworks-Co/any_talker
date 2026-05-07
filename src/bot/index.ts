import { Bot, type Context } from "grammy";
import type { Storage } from "../storage/types";
import type { RateLimiter } from "../ratelimit/types";
import type { AIClient } from "../ai/types";
import { askHandler } from "./handlers/ask";
import { makeStartHandler } from "./handlers/start";
import type { ReplyTarget } from "./context-builder";

export type BotDeps = {
  botToken: string;
  ownerId: string;
  webappUrl: string;
  storage: Storage;
  rateLimiter: RateLimiter;
  ai: AIClient;
};

export function createBot(deps: BotDeps): Bot {
  const bot = new Bot(deps.botToken);

  bot.command("start", makeStartHandler({ ownerId: deps.ownerId, webappUrl: deps.webappUrl }));

  bot.command("ask", async (ctx) => {
    const userId = String(ctx.from?.id ?? "");
    const chatId = ctx.chat?.id;
    if (!userId || chatId === undefined) return;
    const userText = (ctx.match ?? "").toString().trim();
    const replyTarget = extractReplyTarget(ctx);
    const sender = {
      firstName: ctx.from?.first_name ?? null,
      lastName: ctx.from?.last_name ?? null,
    };
    const quote = ctx.message?.quote?.text ?? null;

    const outcome = await askHandler({
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
      replyTarget,
    });

    switch (outcome.kind) {
      case "denied":
        return; // silent
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
    authorFirstName: reply.from?.first_name ?? null,
  };
}
