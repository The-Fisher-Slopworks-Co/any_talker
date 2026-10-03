// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../../storage/types";
import type { RateLimiter } from "../../ratelimit/types";
import type { BudgetGuard } from "../../budget/types";
import type { AIClient } from "../../ai/types";
import { runGatedAiTurn } from "./turn";
import {
  buildReplyFallbackMessage,
  buildUserEnvelope,
  loadChainImages,
  toolCallMessages,
  withMedia,
  type ReplyTarget,
  type Sender,
} from "../context-builder";
import type { PersonaResolver } from "../../managed-bots/persona";
import { profileToCarry, turnAuthor } from "../profile";
import type { ToolEffect } from "../../ai/tools/registry";
import { append, emptyTranscript } from "../../ai/transcript";
import type {
  GuestThreadNode,
  WindowKind,
  BudgetDenyReason,
} from "../../shared/types";
import type { Lang } from "../../shared/i18n";
import type { VideoClip } from "../video";
import type { AccessDenyReason } from "../access";

// Guest mode's silent denials: the access-gate reasons plus "empty" (nothing
// to answer about — no text, no reply, no media). `reason` feeds the
// dispatcher's log line; the guest sees no message in any of these cases.
type GuestDenyReason = AccessDenyReason | "empty";

export type GuestAskInput = {
  storage: Storage;
  rateLimiter: RateLimiter;
  budgetGuard: BudgetGuard;
  ai: AIClient;
  resolver: PersonaResolver;
  // null/undefined = main bot, a managed bot's id otherwise.
  botId?: string | null;
  ownerId: string;
  now: number;
  chatId: string;
  userId: string;
  // Set only when the message was sent on behalf of a chat, and then equal to
  // `userId` — see `bot/identity.ts`. Only the access gate looks at it.
  senderChatId?: string | null | undefined;
  sender: Sender;
  userText: string;
  quote: string | null;
  images: Uint8Array[];
  audios?: Uint8Array[] | undefined;
  // Whole clips, sent when the answering model advertises video input. Empty in
  // frames mode, where the clip already arrived as `images` + `audios`.
  videos?: VideoClip[] | undefined;
  // Describes media the parts alone don't explain — video frames (see
  // `bot/video.ts`). Goes into the user envelope, so it is persisted too.
  attachments?: string | undefined;
  imageFileIds: string[];
  replyImageFileIds: string[];
  // The message the guest query replied to, its thread token already cut out
  // of `text`.
  replyTarget: ReplyTarget | null;
  // Whether that message is one of this bot's own answers. Without a stored
  // thread to speak for it, it is then quoted as the model's own earlier
  // answer rather than as someone else's message.
  replyIsOwnAnswer: boolean;
  // The thread stored under the token the replied-to answer carried, and that
  // token. Both null when the query is not a reply to a tokened answer, or the
  // thread has expired.
  priorThread: GuestThreadNode | null;
  priorToken: string | null;
  // The token this turn's answer will carry, and the key its thread is stored
  // under (`bot/guest-token.ts`).
  threadToken: string;
  lang: Lang;
  onAIStart?: (() => void) | undefined;
  fetchPhoto?: ((fileId: string) => Promise<Uint8Array | null>) | undefined;
};

export type GuestAskOutcome =
  | { kind: "denied"; reason: GuestDenyReason }
  | { kind: "budgetLimited"; reason: BudgetDenyReason }
  | { kind: "rateLimited"; limitedBy: WindowKind; msUntilReset: number }
  | {
      kind: "answered";
      text: string;
      botName: string | null;
      totalTokens: number;
      effects: ToolEffect[];
      expandableThreshold: number;
      persistThread: () => Promise<void>;
    }
  | { kind: "error"; message: string };

// Who the context header names when the replied-to message is this bot's own
// answer and no stored thread speaks for it. It stays a user-role context
// message — a prompt may not open on an assistant turn with every provider —
// but must not read as something another participant said.
const OWN_ANSWER_AUTHOR = "you, the assistant";

// A replied-to answer as Telegram rendered it, minus the bot-name line the
// dispatcher put on top — the model never wrote that part.
function ownAnswerText(text: string, botName: string | null): string {
  const name = botName?.trim();
  return name && text.startsWith(name)
    ? text.slice(name.length).trimStart()
    : text;
}

export async function guestAskHandler(
  input: GuestAskInput,
): Promise<GuestAskOutcome> {
  // Per-character storage view (scoped facts, guest threads, private-chat flag);
  // forBot(null) is the main bot.
  const storage = input.storage.forBot(input.botId ?? null);

  const isOwner = input.userId === input.ownerId;

  // Nothing to answer about — no text, no replied-to message, no media. The
  // same emptiness check as /ask's "usage" outcome; guest queries have no
  // usage hint to send, so it stays a silent deny.
  const audios = input.audios ?? [];
  const videos = input.videos ?? [];
  if (
    input.userText.trim() === "" &&
    input.replyTarget === null &&
    input.images.length === 0 &&
    audios.length === 0 &&
    videos.length === 0
  ) {
    return { kind: "denied", reason: "empty" };
  }

  const [{ settings, botName }, userTimezone] = await Promise.all([
    input.resolver(input.chatId),
    storage.profile.getTimezone(input.userId),
  ]);
  const timezone = userTimezone ?? settings.timezone;

  // Access gate: owner always passes; a blacklisted user — or any guest in a
  // blacklisted chat — is always denied (regardless of `whitelistEnabled` or a
  // whitelist entry); otherwise the user whitelist is consulted only while
  // `whitelistEnabled` (guest queries have no chat membership, so only the user
  // list *grants* access — a blocked chat still blocks everyone in it). The
  // budget guard is the safety net when off.
  // A guest speaking as a chat is identified by that chat (`bot/identity.ts`),
  // so the chat lists stand in for the user list on both sides of the gate.
  const senderChatId = input.senderChatId ?? null;
  if (!isOwner) {
    if (
      (await storage.access.isBlacklisted("users", input.userId)) ||
      (await storage.access.isBlacklisted("chats", input.chatId)) ||
      (senderChatId !== null &&
        (await storage.access.isBlacklisted("chats", senderChatId)))
    ) {
      return { kind: "denied", reason: "blacklisted" };
    }
    if (settings.whitelistEnabled) {
      const isWhitelisted =
        (await storage.access.isWhitelisted("users", input.userId)) ||
        (senderChatId !== null &&
          (await storage.access.isWhitelisted("chats", senderChatId)));
      if (!isWhitelisted) return { kind: "denied", reason: "not_whitelisted" };
    }
  }

  // The whole thread: nothing is ever dropped from its front, so every request
  // starts the way the previous one did (see `collectChain`).
  const priorTurns = input.priorThread?.turns ?? [];
  // What the bot knows about the guest, carried only when the thread does not
  // already say it (`bot/profile.ts`).
  const profile = profileToCarry(priorTurns, input.userId, {
    timezone,
    lang: input.lang,
    facts: await storage.facts.list(input.userId),
  });

  // One envelope, used both for the request and for the persisted thread turn,
  // so the stored text is byte-identical to what the model saw — a prefix that
  // still matches on the next turn is what keeps the prompt cache warm.
  const envelope = buildUserEnvelope({
    sender: input.sender,
    quote: input.quote,
    text: input.userText,
    attachments: input.attachments,
    sentAt: { ms: input.now, timezone },
    profile,
  });

  // Guest queries are always single-turn asks with no detail level passed, so
  // the system prompt carries no detail-level section.
  const turn = await runGatedAiTurn({
    ai: input.ai,
    rateLimiter: input.rateLimiter,
    budgetGuard: input.budgetGuard,
    storage,
    settings,
    userId: input.userId,
    ownerId: input.ownerId,
    chatId: input.chatId,
    botId: input.botId ?? null,
    source: "guest",
    replyToMessageId: null,
    timezone,
    lang: input.lang,
    now: input.now,
    buildMessages: async () => {
      let messages = emptyTranscript;
      for (const priorTurn of priorTurns) {
        const chainImages = await loadChainImages(
          priorTurn.userImageFileIds,
          input.fetchPhoto,
        );
        if (chainImages.length > 0) {
          messages = append(messages, {
            role: "user",
            content: withMedia(priorTurn.userQuestion, chainImages, []),
          });
        } else {
          messages = append(messages, {
            role: "user",
            content: priorTurn.userQuestion,
          });
        }
        // Between question and answer, where the calls happened — as in
        // `buildContext`'s reply-chain replay.
        if (priorTurn.toolCalls) {
          messages = append(messages, ...toolCallMessages(priorTurn.toolCalls));
        }
        messages = append(messages, {
          role: "assistant",
          content: priorTurn.botAnswer,
        });
      }
      // A stored thread already contains the replied-to bot answer; the raw
      // replied-to message only fills in when there is no thread to speak for
      // it.
      const replyTarget = priorTurns.length === 0 ? input.replyTarget : null;
      if (replyTarget) {
        messages = append(
          messages,
          buildReplyFallbackMessage(
            input.replyIsOwnAnswer
              ? {
                  ...replyTarget,
                  authorFirstName: OWN_ANSWER_AUTHOR,
                  text:
                    replyTarget.text === null
                      ? null
                      : ownAnswerText(replyTarget.text, botName),
                }
              : replyTarget,
          ),
        );
      }
      if (input.images.length > 0 || audios.length > 0 || videos.length > 0) {
        messages = append(messages, {
          role: "user",
          content: withMedia(envelope, input.images, audios, videos),
        });
      } else {
        messages = append(messages, { role: "user", content: envelope });
      }
      return messages;
    },
    onAIStart: input.onAIStart,
  });

  switch (turn.kind) {
    case "budgetLimited":
      return { kind: "budgetLimited", reason: turn.reason };
    case "rateLimited":
      return {
        kind: "rateLimited",
        limitedBy: turn.limitedBy,
        msUntilReset: turn.msUntilReset,
      };
    case "error":
      return { kind: "error", message: turn.message };
    case "answered": {
      // Sent verbatim as Rich Markdown (parsed server-side by Telegram) — no
      // HTML sanitization. The same text is persisted as the guest-thread
      // context.
      const body = turn.text;
      return {
        kind: "answered",
        text: body,
        botName,
        totalTokens: turn.totalTokens,
        effects: turn.effects,
        expandableThreshold: settings.expandableBlockquoteThreshold,
        persistThread: async () => {
          const allImageFileIds = [
            ...input.imageFileIds,
            ...input.replyImageFileIds,
          ];
          const turns = [
            ...priorTurns,
            {
              userQuestion: envelope,
              botAnswer: body,
              // As in ask.ts: absent, never explicitly undefined — the stored
              // turn uses key presence to tell "none" from "predates the
              // field".
              ...(allImageFileIds.length > 0 && {
                userImageFileIds: allImageFileIds,
              }),
              ...(turn.toolCalls.length > 0 && { toolCalls: turn.toolCalls }),
              // Unconditional, unlike the two above: this path only exists for
              // a turn that reached the model, so there is always a run behind
              // it to record.
              run: turn.run,
              author: turnAuthor(input.userId, profile),
            },
          ];
          await storage.conversations.saveGuest(input.threadToken, {
            chatId: input.chatId,
            turns,
            ts: input.now,
          });
          // A reply advances the entry of the thread it continues; anything
          // else starts a new one. `botId` is this bot's own — a guest thread
          // never lives in the family-shared group namespace.
          await storage.conversations.indexUserThread(input.userId, {
            kind: "guest",
            chatId: input.chatId,
            botId: input.botId ?? null,
            token: input.threadToken,
            parentToken: input.priorThread ? input.priorToken : null,
            ts: input.now,
          });
        },
      };
    }
  }
}
