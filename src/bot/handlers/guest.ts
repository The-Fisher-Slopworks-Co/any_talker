import type { Storage } from "../../storage/types";
import type { RateLimiter } from "../../ratelimit/types";
import type { AIClient } from "../../ai/types";
import { buildUserEnvelope, type Sender } from "../context-builder";
import { getEffectiveSettings } from "../../settings";
import { getAllTools } from "../../ai/tools/registry";
import { buildInstruction } from "../../ai/instruction";
import { sanitizeHtml } from "../html";
import type { AIMessage } from "../../ai/types";

export type GuestAskInput = {
  storage: Storage;
  rateLimiter: RateLimiter;
  ai: AIClient;
  ownerId: string;
  now: number;
  chatId: string;
  userId: string;
  sender: Sender;
  userText: string;
  onAIStart?: () => void;
};

export type GuestAskOutcome =
  | { kind: "denied" }
  | { kind: "rateLimited"; minutesUntilNextRefill: number }
  | {
      kind: "answered";
      text: string;
      botName: string | null;
      persistConversation: (inlineMessageId: string) => Promise<void>;
    }
  | { kind: "error"; message: string };

export async function guestAskHandler(
  input: GuestAskInput,
): Promise<GuestAskOutcome> {
  const isOwner = input.userId === input.ownerId;
  const isWhitelisted =
    isOwner || (await input.storage.isWhitelisted("users", input.userId));
  if (!isWhitelisted) return { kind: "denied" };

  if (input.userText.trim() === "") return { kind: "denied" };

  const [settings, chatSettings, userTimezone] = await Promise.all([
    getEffectiveSettings(input.storage, input.chatId),
    input.storage.getChatSettings(input.chatId),
    input.storage.getUserTimezone(input.userId),
  ]);
  const botName = chatSettings?.botName?.trim() || null;
  const timezone = userTimezone ?? settings.timezone;

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

  const envelope = buildUserEnvelope({
    sender: input.sender,
    quote: null,
    text: input.userText,
  });
  const messages: AIMessage[] = [{ role: "user", content: envelope }];

  input.onAIStart?.();

  let result;
  try {
    result = await input.ai.ask({
      models: settings.models,
      system: buildInstruction(settings.systemPrompt, { timezone }),
      messages,
      tools: getAllTools(),
      providerSort: settings.providerSort,
    });
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  if (!skipRateLimit) {
    await input.rateLimiter.deduct(
      input.chatId,
      input.userId,
      result.totalTokens,
    );
  }

  const sanitized = sanitizeHtml(result.text);

  return {
    kind: "answered",
    text: sanitized,
    botName,
    persistConversation: async (inlineMessageId) => {
      await input.storage.saveGuestConversation(inlineMessageId, {
        userQuestion: envelope,
        botAnswer: sanitized,
        chatId: input.chatId,
        userId: input.userId,
        ts: input.now,
      });
    },
  };
}
