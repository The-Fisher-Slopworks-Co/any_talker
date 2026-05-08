import type { Storage } from "../../storage/types";
import type { RateLimiter } from "../../ratelimit/types";
import type { AIClient } from "../../ai/types";
import { isAllowed } from "../access";
import { buildContext, buildUserEnvelope, type ReplyTarget, type Sender } from "../context-builder";
import { getEffectiveSettings } from "../../settings";
import { getAllTools } from "../../ai/tools/registry";
import { buildInstruction } from "../../ai/instruction";

export type AskInput = {
  storage: Storage;
  rateLimiter: RateLimiter;
  ai: AIClient;
  ownerId: string;
  now: number;
  chatId: string;
  userId: string;
  sender: Sender;
  userText: string;
  quote: string | null;
  image: Uint8Array | null;
  replyTarget: ReplyTarget | null;
  onAIStart?: () => void;
};

export type AskOutcome =
  | { kind: "denied" }
  | { kind: "usage" }
  | { kind: "rateLimited"; minutesUntilNextRefill: number }
  | {
      kind: "answered";
      text: string;
      botName: string | null;
      persistConversation: (botMsgId: number) => Promise<void>;
    }
  | { kind: "error"; message: string };

export async function askHandler(input: AskInput): Promise<AskOutcome> {
  const allowed = await isAllowed({
    storage: input.storage,
    ownerId: input.ownerId,
    userId: input.userId,
    chatId: input.chatId,
  });
  if (!allowed) return { kind: "denied" };

  if (
    input.userText.trim() === "" &&
    input.replyTarget === null &&
    input.image === null
  ) {
    return { kind: "usage" };
  }

  const [settings, chatSettings] = await Promise.all([
    getEffectiveSettings(input.storage, input.chatId),
    input.storage.getChatSettings(input.chatId),
  ]);
  const botName = chatSettings?.botName?.trim() || null;

  const isOwner = input.userId === input.ownerId;
  const skipRateLimit = isOwner && settings.rateLimit.ownerExempt;
  if (!skipRateLimit) {
    const r = await input.rateLimiter.check(
      input.chatId,
      input.userId,
      settings.rateLimit,
      input.now,
    );
    if (!r.allowed) {
      return {
        kind: "rateLimited",
        minutesUntilNextRefill: Math.ceil(r.msUntilNextRefill / 60_000),
      };
    }
  }

  const messages = await buildContext({
    storage: input.storage,
    chatId: input.chatId,
    sender: input.sender,
    userText: input.userText,
    quote: input.quote,
    image: input.image,
    replyTarget: input.replyTarget,
  });

  input.onAIStart?.();

  let result;
  try {
    result = await input.ai.ask({
      models: settings.models,
      system: buildInstruction(settings.systemPrompt),
      messages,
      tools: getAllTools(),
    });
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }

  if (!skipRateLimit) {
    await input.rateLimiter.deduct(input.chatId, input.userId, result.totalTokens);
  }

  let parentBotMsgId: number | null = null;
  if (input.replyTarget) {
    const existing = await input.storage.getConversation(
      input.chatId,
      input.replyTarget.messageId,
    );
    if (existing) parentBotMsgId = input.replyTarget.messageId;
  }

  const envelope = buildUserEnvelope({
    sender: input.sender,
    quote: input.quote,
    text: input.userText,
  });

  return {
    kind: "answered",
    text: result.text,
    botName,
    persistConversation: async (botMsgId) => {
      await input.storage.saveConversation(input.chatId, botMsgId, {
        userQuestion: envelope,
        botAnswer: result.text,
        parentBotMsgId,
        ts: input.now,
      });
    },
  };
}
