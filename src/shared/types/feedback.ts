// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ToolCallRecord, TurnRun } from "./conversations";
import type { ChatType } from "./chats";
import type { Lang } from "../i18n";

// One turn copied into a feedback record: what a stored turn carries — a
// `ConversationNode`, or a guest thread's turn — minus `parentBotMsgId`, which
// the snapshot's own order already expresses.
export type ThreadSnapshotTurn = {
  // The bot message this turn was stored under, and what `pointedAt.botMsgId`
  // refers to. A guest thread is keyed by chat alone, so its turns have none.
  botMsgId?: number;
  userQuestion: string;
  botAnswer: string;
  // Epoch ms. Per-turn on a chain; a guest thread timestamps the thread instead.
  ts?: number;
  // file_ids, not bytes: the same bot token resolves them, which is enough.
  userImageFileIds?: string[];
  // Verbatim — a misfiring tool is the bug class this is meant to surface, and
  // the transcripts are already capped where they are written.
  toolCalls?: ToolCallRecord[];
  run?: TurnRun;
};

// One of the reporter's recent threads, copied in at submission time. A copy
// rather than a reference: nodes expire after `CONVERSATION_TTL_SECONDS` and
// feedback outlives them, losing the run metadata exactly when it is read.
export type ThreadSnapshot = {
  // Which graph it came from: a chain keyed by `(chatId, botMsgId)`, or a guest
  // thread keyed by chat alone.
  kind: "chain" | "guest";
  chatId: string;
  // `null` is the main bot, as in `forBot`: a snapshot spans the bot family.
  botId: string | null;
  // Epoch ms of the thread's most recent turn.
  ts: number;
  // Oldest first, so a reader follows the conversation forwards.
  turns: ThreadSnapshotTurn[];
};

// `new` until someone has looked at the record, `closed` afterwards: what lets
// an analysing agent mark what it processed. A third (`triaged`) is additive.
export type FeedbackStatus = "new" | "closed";

// A `/feedback` submission: the text, and enough of the surrounding state to
// reproduce what the user was reporting.
export type FeedbackEntry = {
  id: string;
  userId: string;
  // Where the command was sent, which need not be where the threads happened.
  chatId: string;
  chatType: ChatType;
  // The bot that received the command; `null` is the main bot.
  botId: string | null;
  isGuest: boolean;
  lang: Lang;
  text: string;
  createdAt: number;
  // The bot message the command replied to, when it was a reply. The snapshot
  // is still "recent threads"; this only marks which one the user meant.
  pointedAt?: { chatId: string; botMsgId: number };
  // The reporter's recent threads, newest thread first.
  threads: ThreadSnapshot[];
  // The system prompt as rendered at submission time — once per record rather
  // than per turn, which would cost kilobytes on every node of every user. Its
  // `instructionHash`, against a turn's `run.instr`, says "changed since".
  systemPrompt: string;
  systemPromptHash: string;
  // The commit the bot was running (`getBuildInfo().commit`), null if unknown.
  build: string | null;
  status: FeedbackStatus;
};
