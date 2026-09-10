// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";
import type {
  ThreadSnapshot,
  ThreadSnapshotTurn,
  UserThreadRef,
} from "../shared/types";
import { USER_THREAD_INDEX_MAX } from "../shared/types";

// How deep one thread is copied, counted back from its head. Deliberately
// shorter than `MAX_REPLY_CHAIN_DEPTH`'s 20, which sizes an LLM context rather
// than a stored record: with `TOOL_OUTPUT_MAX` 4096 and `TOOL_CALLS_MAX_PER_TURN`
// 8, a single turn can carry ~32 KB of tool transcript, and those are kept
// verbatim because a misfiring tool is the bug class this exists to surface.
export const SNAPSHOT_MAX_TURNS = 8;

// What the whole snapshot may weigh, serialized. Reached only by threads whose
// turns sit near the tool-transcript caps — a talking turn is a couple of KB, so
// five full threads of ordinary conversation are nowhere near it. A guard on the
// record's size, not an exact budget: the JSON array framing around the threads
// is a handful of bytes nobody needs counted.
export const SNAPSHOT_MAX_BYTES = 256 * 1024;

// Copies the reporting user's recent threads out of the conversation graph, as
// a `/feedback` record stores them.
//
// A copy rather than the index entries themselves: nodes expire after
// `CONVERSATION_TTL_SECONDS` while a report does not, so references would go
// blank exactly when someone finally reads the report.
//
// Caps, applied in that order: at most `USER_THREAD_INDEX_MAX` threads, at most
// `SNAPSHOT_MAX_TURNS` turns per thread, then whole threads dropped oldest-first
// until the rest fits `maxBytes`. Threads are dropped whole rather than trimmed
// because half a chain reproduces nothing.
export async function buildThreadSnapshots(
  storage: Storage,
  userId: string,
  maxBytes: number = SNAPSHOT_MAX_BYTES,
): Promise<ThreadSnapshot[]> {
  const refs = await storage.conversations.listUserThreads(userId);
  const snapshots: ThreadSnapshot[] = [];
  // Newest first, as the index lists them and as the record stores them. The
  // slice is belt and braces — the index caps itself on write.
  for (const ref of refs.slice(0, USER_THREAD_INDEX_MAX)) {
    const snapshot = await resolveThread(storage, ref);
    if (snapshot) snapshots.push(snapshot);
  }
  return fitToByteCeiling(snapshots, maxBytes);
}

// One index entry read back through the scope it names. `ref.botId` is where
// the thread's nodes live (`forBot`), not the bot that answered — a group chat's
// graph is shared family-wide. `null` when the thread is gone: its head expired,
// or a guest thread was emptied.
async function resolveThread(
  storage: Storage,
  ref: UserThreadRef,
): Promise<ThreadSnapshot | null> {
  const { conversations } = storage.forBot(ref.botId);
  const turns =
    ref.kind === "guest"
      ? await guestTurns(conversations, ref.chatId)
      : await chainTurns(conversations, ref.chatId, ref.botMsgId);
  if (turns.length === 0) return null;
  return {
    kind: ref.kind,
    chatId: ref.chatId,
    botId: ref.botId,
    // The index stamps every entry with its head turn, so no turn has to be
    // read back to date the thread.
    ts: ref.ts,
    turns,
  };
}

// A reply chain, walked upwards through `parentBotMsgId` from its head as
// `bot/context-builder.ts` walks it, then reversed: the record reads forwards.
// A missing node ends the walk — that is where the TTL has already eaten the
// thread — and a missing head leaves nothing, dropping the thread.
async function chainTurns(
  conversations: Storage["conversations"],
  chatId: string,
  headBotMsgId: number,
): Promise<ThreadSnapshotTurn[]> {
  const turns: ThreadSnapshotTurn[] = [];
  let cursor: number | null = headBotMsgId;
  while (cursor !== null && turns.length < SNAPSHOT_MAX_TURNS) {
    const node = await conversations.get(chatId, cursor);
    if (!node) break;
    turns.unshift({
      botMsgId: cursor,
      userQuestion: node.userQuestion,
      botAnswer: node.botAnswer,
      ts: node.ts,
      ...(node.userImageFileIds && {
        userImageFileIds: node.userImageFileIds,
      }),
      ...(node.toolCalls && { toolCalls: node.toolCalls }),
      ...(node.run && { run: node.run }),
    });
    cursor = node.parentBotMsgId;
  }
  return turns;
}

// A guest thread is one record keyed by chat, its turns already in order, so
// the depth cap is a tail slice. Its turns carry neither a message id nor their
// own timestamp — the thread is stamped as a whole.
async function guestTurns(
  conversations: Storage["conversations"],
  chatId: string,
): Promise<ThreadSnapshotTurn[]> {
  const thread = await conversations.getGuest(chatId);
  if (!thread) return [];
  return thread.turns.slice(-SNAPSHOT_MAX_TURNS).map((turn) => ({
    userQuestion: turn.userQuestion,
    botAnswer: turn.botAnswer,
    ...(turn.userImageFileIds && { userImageFileIds: turn.userImageFileIds }),
    ...(turn.toolCalls && { toolCalls: turn.toolCalls }),
    ...(turn.run && { run: turn.run }),
  }));
}

// Keeps the newest threads that fit, dropping the rest whole. The first thread
// survives whatever it weighs: a report with no context at all is worth nothing,
// and the depth cap already bounds how large one thread can get.
function fitToByteCeiling(
  threads: ThreadSnapshot[],
  maxBytes: number,
): ThreadSnapshot[] {
  const kept: ThreadSnapshot[] = [];
  let total = 0;
  for (const thread of threads) {
    const size = Buffer.byteLength(JSON.stringify(thread));
    if (kept.length > 0 && total + size > maxBytes) break;
    kept.push(thread);
    total += size;
  }
  return kept;
}
