// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../../storage/types";
import type { RateLimiter } from "../../ratelimit/types";
import type { ToolCallRecord, TurnRun } from "../../shared/types";
import type { BudgetGuard } from "../../budget/types";
import type { AIClient } from "../../ai/types";
import { runGatedAiTurn } from "./turn";
import { checkAccess, type AccessDenyReason } from "../access";
import {
  buildContext,
  buildUserEnvelope,
  conversationBotId,
  conversationStorage,
  type ReplyTarget,
  type Sender,
} from "../context-builder";
import type { PersonaResolver } from "../../managed-bots/persona";
import type { ToolEffect } from "../../ai/tools/registry";
import type { DetailLevel } from "../../ai/instruction";
import type { Lang } from "../../shared/i18n";
import type { VideoClip } from "../video";
import type { WindowKind, BudgetDenyReason } from "../../shared/types";

export type AskInput = {
  storage: Storage;
  rateLimiter: RateLimiter;
  budgetGuard: BudgetGuard;
  ai: AIClient;
  // Resolves the character to answer as (settings + display name) for this chat.
  resolver: PersonaResolver;
  // Scope of the bot handling this turn: null/undefined = main bot, a managed
  // bot's id otherwise. Scopes per-character storage and the tool call context.
  botId?: string | null;
  ownerId: string;
  now: number;
  chatId: string;
  userId: string;
  // Set only when the message was sent on behalf of a chat, and then equal to
  // `userId` — see `bot/identity.ts`. Only the access gate looks at it.
  senderChatId?: string | null | undefined;
  askMessageId: number;
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
  replyTarget: ReplyTarget | null;
  lang: Lang;
  detailLevel: DetailLevel;
  onAIStart?: (() => void) | undefined;
  fetchPhoto?: ((fileId: string) => Promise<Uint8Array | null>) | undefined;
};

export type AskOutcome =
  // `reason` is for the dispatcher's log line only; the chat-side deny stays
  // silent either way.
  | { kind: "denied"; reason: AccessDenyReason }
  | { kind: "usage" }
  | {
      // Denied by a hard USD budget cap. `reason` is for metrics/alerting only;
      // the user sees a generic "try later" (never the financial detail).
      kind: "budgetLimited";
      reason: BudgetDenyReason;
      persistConversation: PersistFailedTurn;
    }
  | {
      kind: "rateLimited";
      limitedBy: WindowKind;
      msUntilReset: number;
      persistConversation: PersistFailedTurn;
    }
  | {
      kind: "answered";
      text: string;
      botName: string | null;
      totalTokens: number;
      effects: ToolEffect[];
      expandableThreshold: number;
      persistConversation: (botMsgId: number) => Promise<void>;
    }
  | { kind: "error"; message: string; persistConversation: PersistFailedTurn };

// Persists a turn the AI never answered (rate limit, provider error). The
// dispatcher passes the notice it actually sent so the stored transcript stays
// truthful — and so a later reply to either message still carries the chain.
type PersistFailedTurn = (botMsgId: number, botAnswer: string) => Promise<void>;

export async function askHandler(input: AskInput): Promise<AskOutcome> {
  // Per-character storage view: scoped methods (user facts, this bot's own
  // reminders) hit this bot's namespace; every other method is shared.
  // forBot(null) is the main bot and yields the original unprefixed keys.
  const storage = input.storage.forBot(input.botId ?? null);
  // The conversation graph is family-shared in group chats so a reply across
  // bots carries context, and per-character in DMs (see `conversationStorage`).
  const convBotId = conversationBotId(input.botId ?? null, input.chatId);
  const convStorage = conversationStorage(
    input.storage,
    input.botId ?? null,
    input.chatId,
  );

  const [{ settings, botName }, userTimezone] = await Promise.all([
    input.resolver(input.chatId),
    storage.profile.getTimezone(input.userId),
  ]);
  const timezone = userTimezone ?? settings.timezone;
  // The one clock reading this turn uses. Both envelope builds below — the one
  // sent to the model and the one persisted for later turns — take this exact
  // value: a stored turn that disagreed with what the model saw would change
  // the prompt prefix on the next turn and cost the cache the whole history.
  const sentAt = { ms: input.now, timezone };

  // Access gate: owner always passes; a blacklisted user or chat is denied;
  // otherwise the whitelist is consulted only while `whitelistEnabled` (the
  // budget guard is the safety net when it's off).
  const access = await checkAccess({
    storage,
    ownerId: input.ownerId,
    userId: input.userId,
    chatId: input.chatId,
    senderChatId: input.senderChatId,
    whitelistEnabled: settings.whitelistEnabled,
  });
  if (!access.allowed) return { kind: "denied", reason: access.reason };

  const audios = input.audios ?? [];
  const videos = input.videos ?? [];
  const hasQuote = input.quote !== null && input.quote.trim() !== "";
  if (
    input.userText.trim() === "" &&
    !hasQuote &&
    input.images.length === 0 &&
    audios.length === 0 &&
    videos.length === 0
  ) {
    if (input.replyTarget === null) return { kind: "usage" };
    // A reply keeps a bare /ask meaningful only when the replied-to message
    // itself is new content ("what about this?"). Replying into the bot's own
    // conversation chain adds nothing the model doesn't already have — the
    // chain IS the context — so it gets the usage hint too, instead of an AI
    // turn with an empty question. Media on the replied-to message is the
    // exception: a chain node can be the user's own /ask-captioned photo, and
    // a bare /ask replying to it means "look at this" — the same gesture that
    // already works on a photo outside the chain (issue #81).
    const replyHasMedia =
      input.replyTarget.images.length > 0 ||
      (input.replyTarget.audios?.length ?? 0) > 0 ||
      (input.replyTarget.videos?.length ?? 0) > 0;
    if (!replyHasMedia) {
      const node = await convStorage.conversations.get(
        input.chatId,
        input.replyTarget.messageId,
      );
      if (node) return { kind: "usage" };
    }
  }

  // Tools this turn ran, filled once the model call returns and read by
  // `persistTurn`, which the dispatcher invokes after the reply is sent. Same
  // mutable-handle shape as the tool `effects` array in `ai/turn.ts`, and for
  // the same reason: `persistTurn` is built before the ask so the error and
  // rate-limit paths can persist a turn too.
  let turnToolCalls: ToolCallRecord[] = [];
  // What the model run did, filled on the same two paths and for the same
  // reason. Stays null on the gated outcomes (rate limit, budget denial), whose
  // turns never reach the model and so have no run to record.
  let turnRun: TurnRun | null = null;

  // Persist this turn into the conversation graph under BOTH the bot's reply
  // message id and the user's ask message id (unique within a chat, so no
  // collision): a Telegram reply chain can pass through either side's message,
  // and both must resolve the chain. Runs for every outcome that sent a reply —
  // including rate-limited/error turns, where `botAnswer` is the failure notice
  // — so a failed turn never severs the chain.
  const persistTurn = async (botMsgId: number, botAnswer: string) => {
    let parentBotMsgId: number | null = null;
    if (input.replyTarget) {
      const existing = await convStorage.conversations.get(
        input.chatId,
        input.replyTarget.messageId,
      );
      if (existing) parentBotMsgId = input.replyTarget.messageId;
    }
    const allImageFileIds = [...input.imageFileIds, ...input.replyImageFileIds];
    const node = {
      userQuestion: buildUserEnvelope({
        sender: input.sender,
        quote: input.quote,
        text: input.userText,
        attachments: input.attachments,
        sentAt,
      }),
      botAnswer,
      parentBotMsgId,
      ts: input.now,
      // Spread rather than assigned: a stored node distinguishes "no images"
      // from "written before the field existed" by the key being absent, so
      // neither may be persisted as an explicit undefined.
      ...(allImageFileIds.length > 0 && { userImageFileIds: allImageFileIds }),
      ...(turnToolCalls.length > 0 && { toolCalls: turnToolCalls }),
      ...(turnRun !== null && { run: turnRun }),
    };
    await Promise.all([
      convStorage.conversations.save(input.chatId, botMsgId, node),
      convStorage.conversations.save(input.chatId, input.askMessageId, node),
    ]);
    // Indexed only once the nodes it points at exist: an entry whose head
    // cannot be read back is worse than no entry. The head is `botMsgId`, not
    // `askMessageId` — both keys hold this turn, but only one of them can be
    // the entry a follow-up advances, and replying to the bot's own message is
    // how a thread ordinarily continues.
    //
    // `convBotId` rather than the answering bot: what the entry has to name is
    // the scope these nodes were written in, which in a group is the
    // family-shared one whichever bot replied.
    await convStorage.conversations.indexUserThread(input.userId, {
      kind: "chain",
      chatId: input.chatId,
      botId: convBotId,
      botMsgId,
      parentBotMsgId,
      ts: input.now,
    });
  };

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
    source: "ask",
    replyToMessageId: input.askMessageId,
    detailLevel: input.detailLevel,
    timezone,
    lang: input.lang,
    now: input.now,
    buildMessages: () =>
      buildContext({
        storage: convStorage,
        chatId: input.chatId,
        sender: input.sender,
        userText: input.userText,
        quote: input.quote,
        images: input.images,
        audios,
        videos,
        attachments: input.attachments,
        replyTarget: input.replyTarget,
        sentAt,
        fetchPhoto: input.fetchPhoto,
      }),
    onAIStart: input.onAIStart,
  });

  switch (turn.kind) {
    case "budgetLimited":
      return {
        kind: "budgetLimited",
        reason: turn.reason,
        persistConversation: persistTurn,
      };
    case "rateLimited":
      return {
        kind: "rateLimited",
        limitedBy: turn.limitedBy,
        msUntilReset: turn.msUntilReset,
        persistConversation: persistTurn,
      };
    case "error":
      // A turn whose tools ran but whose final output came back blank still
      // persists what they returned: the failure notice becomes `botAnswer`,
      // and the next turn picks up from the material instead of re-fetching
      // it. A turn that threw inside the model call has nothing to record.
      turnToolCalls = turn.toolCalls;
      turnRun = turn.run;
      return {
        kind: "error",
        message: turn.message,
        persistConversation: persistTurn,
      };
    case "answered": {
      turnToolCalls = turn.toolCalls;
      turnRun = turn.run;
      // The AI now emits Rich Markdown sent verbatim via sendRichMessage;
      // Telegram parses it server-side (only supported tags/schemes are
      // honored), so there is no HTML sanitization step. The same text is
      // persisted as conversation context for later turns.
      const body = turn.text;
      return {
        kind: "answered",
        text: body,
        botName,
        totalTokens: turn.totalTokens,
        effects: turn.effects,
        expandableThreshold: settings.expandableBlockquoteThreshold,
        persistConversation: (botMsgId) => persistTurn(botMsgId, body),
      };
    }
  }
}
