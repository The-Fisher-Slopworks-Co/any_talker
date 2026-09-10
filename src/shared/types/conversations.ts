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

// What the model run behind a turn actually did, kept with the turn so a bug
// report can point at that run instead of at a timestamp and a guess.
//
// Deliberately small: everything else a generation carries — provider, resolved
// model version, per-call usage, cost, latency, finish reason — is retrievable
// from OpenRouter by id (`GET /api/v1/generation?id=`), and copying all of it
// into every node of every user would be paying storage for a second copy.
export type TurnRun = {
  // The OpenRouter response id of every model call the turn made, in call order
  // (see `AskResult.generations`): one per tool-loop round plus the final
  // answer. Empty when the client reported none — which is also what a turn run
  // by a client that records nothing looks like.
  gen: string[];
  // The slug of the model that served the last call, as the provider named it.
  // NOT necessarily the head of the requested chain — OpenRouter falls back
  // down it — and not the exact version either, which only the generation id
  // gives back. Absent when no call reported one.
  model?: string;
  // The detail level the turn ran at. Ours, not OpenRouter's, so no generation
  // can give it back. Absent on turns that have none (guest mode, reminder
  // delivery). Mirrors `DetailLevel` (`ai/instruction.ts`), which `shared/` must
  // not import; widening it there surfaces here as a type error at the write
  // site.
  detail?: "short" | "wise";
  // `instructionHash` of the system prompt this turn was actually sent. The
  // prompt is rebuilt from settings on every turn (`ai/instruction.ts`) and may
  // have changed by the time anyone reads the report, so the hash is what says
  // "not that prompt anymore". Keeping the prompt itself on every node would
  // cost kilobytes a turn; a report stores it once instead.
  instr?: string;
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
  // What the model run behind this turn did. Absent on a turn that never
  // reached the model — a rate-limited or budget-denied turn still writes a node
  // so the chain survives — and on every node written before the field existed.
  run?: TurnRun;
};

type GuestThreadTurn = {
  userQuestion: string;
  botAnswer: string;
  // Telegram file_ids of the images that accompanied the question (own photo +
  // replied-to photos), re-fetched on follow-up turns — as in ConversationNode.
  userImageFileIds?: string[];
  // As in ConversationNode: the tools this turn ran, replayed on follow-ups.
  toolCalls?: ToolCallRecord[];
  // As in ConversationNode: what the model run behind this turn did.
  run?: TurnRun;
};

export type GuestThreadNode = {
  chatId: string;
  turns: GuestThreadTurn[];
  ts: number;
};

// One thread a user recently took part in, as the per-user index records it: a
// pointer back into the conversation graph, never a copy of anything in it.
//
// Tagged because the two graphs are keyed differently — a reply chain by
// `(chatId, botMsgId)`, a guest thread by chat alone — so a reader knows which
// lookup to make without probing both.
export type UserThreadRef =
  | {
      kind: "chain";
      chatId: string;
      // The storage scope the thread's nodes live in, as `forBot` takes it —
      // NOT necessarily the bot that answered. A group chat's graph is shared
      // family-wide under the main bot's scope (`bot/context-builder.ts`), so
      // an entry written for a managed bot's answer in a group says `null`.
      // Resolving the thread is `storage.forBot(botId).conversations`.
      botId: string | null;
      // The thread's head: the bot message id of its most recent indexed turn.
      // A follow-up advances it, which is what keeps one thread one entry.
      botMsgId: number;
      // Epoch ms of the head turn.
      ts: number;
    }
  | {
      kind: "guest";
      chatId: string;
      // As above, but a guest thread is always stored in the answering bot's
      // own scope — guest chats are business DMs, never group chats.
      botId: string | null;
      ts: number;
    };

// How many threads the per-user index keeps. Small on purpose: it exists to
// answer "what was this user just doing", and a feedback snapshot copies every
// entry in full, so the cap is also the snapshot's own thread budget.
export const USER_THREAD_INDEX_MAX = 5;

// Cap on how far back the conversation graph is walked when building LLM
// context. Longer chains burn tokens disproportionately and yield diminishing
// returns; 20 turns is enough to cover virtually all real reply threads.
export const MAX_REPLY_CHAIN_DEPTH = 20;
// Stored conversation nodes expire after this many seconds of inactivity.
// 30 days lets a user resume a long-running thread weeks later, while
// bounding the storage footprint of abandoned threads.
export const CONVERSATION_TTL_SECONDS = 30 * 24 * 60 * 60;
