// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// The conversation id a gateway is told each request belongs to (`session_id`),
// used as its sticky-routing key: turns that share one land on the upstream
// provider that already holds a warm prompt cache for them, instead of drifting
// between providers and re-paying full price for the same prefix.
//
// The unit is **one character in one chat**, not one reply chain. What the cache
// actually covers is a prefix, and the prefix every turn in a chat shares is the
// system prompt (deliberately kept stable — see `instruction.ts`). Several reply
// chains running side by side in a group therefore *want* the same provider;
// keying per chain would scatter them and lose exactly that shared prefix.
//
// The bot id is part of the key because a chat alone does not identify the
// persona: family bots share a group's chat id (and its conversation graph)
// while answering with different system prompts, and a DM's chat id is the user
// id, which every character's DM with that user repeats. Different prompts mean
// different caches, so they get different sessions.
//
// Stable across restarts by construction — it is derived, not stored.
export function conversationSessionId(
  botId: string | null,
  chatId: string,
): string {
  // `null` is the main bot, whose storage keys are likewise unprefixed.
  return `tg:${botId ?? "main"}:${chatId}`;
}
