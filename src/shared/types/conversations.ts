// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// One tool call and its result, kept with the turn they happened in and
// replayed on later turns as the provider's own `function_call` /
// `function_call_output` items — not as prose about them.
//
// The pair is one record on purpose: a replayed `function_call` with no
// matching `function_call_output` is a malformed request, so there is no way to
// store one without the other.
export type ToolCallRecord = {
  // The provider's id for this call, replayed verbatim. Only has to be
  // consistent within one request — it is what pairs the call to its output.
  callId: string;
  name: string;
  // The raw JSON argument string the model emitted, byte for byte. Not capped:
  // it is model output, already bounded by the turn's output-token ceiling, and
  // truncating it would leave the replayed call unparseable.
  arguments: string;
  // The exact string the tool's result was serialized to for the model. Capped
  // (`ai/tool-calls.ts`) — this one comes from the outside world.
  output: string;
};

export type ConversationNode = {
  userQuestion: string;
  botAnswer: string;
  parentBotMsgId: number | null;
  ts: number;
  userImageFileIds?: string[];
  // Tools this turn ran, in execution order. Absent on turns that ran none —
  // and on every node written before tool transcripts existed, which is why it
  // is optional rather than an empty array.
  toolCalls?: ToolCallRecord[];
};

type GuestThreadTurn = {
  userQuestion: string;
  botAnswer: string;
  // Telegram file_ids of the images that accompanied the question (own photo +
  // replied-to photos), re-fetched on follow-up turns — as in ConversationNode.
  userImageFileIds?: string[];
  // As in ConversationNode: the tools this turn ran, replayed on follow-ups.
  toolCalls?: ToolCallRecord[];
};

export type GuestThreadNode = {
  chatId: string;
  turns: GuestThreadTurn[];
  ts: number;
};

// Cap on how far back the conversation graph is walked when building LLM
// context. Longer chains burn tokens disproportionately and yield diminishing
// returns; 20 turns is enough to cover virtually all real reply threads.
export const MAX_REPLY_CHAIN_DEPTH = 20;
// Stored conversation nodes expire after this many seconds of inactivity.
// 30 days lets a user resume a long-running thread weeks later, while
// bounding the storage footprint of abandoned threads.
export const CONVERSATION_TTL_SECONDS = 30 * 24 * 60 * 60;
