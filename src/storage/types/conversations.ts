// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type {
  ConversationNode,
  GuestThreadNode,
  UserThreadRef,
} from "../../shared/types";

// What a write site hands `indexUserThread` after storing a turn: the entry to
// record, plus — for a reply chain — the head that turn continues. Only the
// entry is kept; `parentBotMsgId` decides which entry it becomes.
export type UserThreadWrite =
  | {
      kind: "chain";
      chatId: string;
      botId: string | null;
      // The turn just stored, and the thread's new head.
      botMsgId: number;
      // `ConversationNode.parentBotMsgId` of that turn. An indexed thread whose
      // head is that message is advanced to `botMsgId` rather than indexed a
      // second time; `null` (a turn that starts a thread) never matches.
      parentBotMsgId: number | null;
      ts: number;
    }
  | {
      kind: "guest";
      chatId: string;
      botId: string | null;
      ts: number;
    };

// Whether `ref` is the thread `write` continues — the head-update rule, shared
// so both implementations decide it identically.
//
// A group chat can put another participant's turn between two of the same
// user's, and then the parent is that turn's node rather than the indexed head:
// no match, and the thread is indexed twice. Accepted deliberately — the cap is
// small and evicts, and the alternative is walking the chain upwards on every
// single save.
export function continuesThread(
  ref: UserThreadRef,
  write: UserThreadWrite,
): boolean {
  if (ref.kind !== write.kind) return false;
  if (ref.chatId !== write.chatId || ref.botId !== write.botId) return false;
  // A guest thread is keyed by chat alone (`saveGuest`), so there is only ever
  // one entry for it and every turn advances that one.
  if (ref.kind === "guest" || write.kind === "guest") return true;
  return ref.botMsgId === write.parentBotMsgId;
}

// The entry a write becomes: `parentBotMsgId` answered its question above and
// is not stored.
export function userThreadRef(write: UserThreadWrite): UserThreadRef {
  return write.kind === "guest"
    ? {
        kind: "guest",
        chatId: write.chatId,
        botId: write.botId,
        ts: write.ts,
      }
    : {
        kind: "chain",
        chatId: write.chatId,
        botId: write.botId,
        botMsgId: write.botMsgId,
        ts: write.ts,
      };
}

// Per-character conversation graph and guest threads. Scoped by `forBot`: a
// managed bot keeps its own conversation history.
//
// The exception is the per-user thread index, which is GLOBAL — the same rows
// on every view. A per-bot index would hide the threads a user had with a
// family bot in the same group, which is exactly the context a bug report
// needs; each entry names its own scope instead.
export interface ConversationsStore {
  get(chatId: string, botMsgId: number): Promise<ConversationNode | null>;
  save(chatId: string, botMsgId: number, node: ConversationNode): Promise<void>;

  getGuest(chatId: string): Promise<GuestThreadNode | null>;
  saveGuest(chatId: string, thread: GuestThreadNode): Promise<void>;

  // Records a thread the reporting user just took part in, evicting the oldest
  // past `USER_THREAD_INDEX_MAX`. Expires with the nodes it points at
  // (`CONVERSATION_TTL_SECONDS`), so it can never outlive them.
  indexUserThread(userId: string, write: UserThreadWrite): Promise<void>;
  // That user's recent threads, newest first, at most `USER_THREAD_INDEX_MAX`.
  listUserThreads(userId: string): Promise<UserThreadRef[]>;
}
