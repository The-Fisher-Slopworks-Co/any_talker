// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ConversationNode, GuestThreadNode } from "../../shared/types";

// Per-character conversation graph and guest threads. Scoped by `forBot`: a
// managed bot keeps its own conversation history.
export interface ConversationsStore {
  get(chatId: string, botMsgId: number): Promise<ConversationNode | null>;
  save(chatId: string, botMsgId: number, node: ConversationNode): Promise<void>;

  getGuest(chatId: string): Promise<GuestThreadNode | null>;
  saveGuest(chatId: string, thread: GuestThreadNode): Promise<void>;
}
