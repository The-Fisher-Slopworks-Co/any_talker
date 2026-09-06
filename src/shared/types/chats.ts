// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ProviderSort, ServiceTier } from "./models";

export type ChatType = "private" | "group" | "supergroup" | "channel";

export type Chat = {
  id: string;
  type: ChatType;
  title: string | null;
  username: string | null;
  // Epoch ms the chat was first seen (see `User.firstSeenAt`). A genuinely new
  // non-private chat is, by construction, a group the bot was just added to.
  firstSeenAt: number;
  lastSeenAt: number;
};

type KeywordFilter = {
  enabled: boolean;
  keywords: string[];
};

// Per-chat overrides. `undefined` means "inherit the global value"; an explicit
// `null` on a nullable field is itself an override — "ignore the global setting
// in this chat" — so these are never merged with `??`.
export type ChatSettings = {
  systemPrompt?: string;
  models?: string[];
  botName?: string;
  timezone?: string;
  providerSort?: ProviderSort | null;
  provider?: string | null;
  serviceTier?: ServiceTier | null;
  keywordFilter?: KeywordFilter;
};

export function isEmptyChatSettings(s: ChatSettings): boolean {
  return (
    s.systemPrompt === undefined &&
    s.models === undefined &&
    s.botName === undefined &&
    s.timezone === undefined &&
    s.providerSort === undefined &&
    s.provider === undefined &&
    s.serviceTier === undefined &&
    s.keywordFilter === undefined
  );
}

export function messageMatchesKeyword(
  text: string,
  keywords: string[],
): boolean {
  if (text.length === 0 || keywords.length === 0) return false;
  // Normalize to NFC so that visually identical strings written with
  // different Unicode decompositions (e.g. "café" NFC vs NFD) compare equal.
  const haystack = text.normalize("NFC").toLowerCase();
  return keywords.some((kw) => {
    const needle = kw.normalize("NFC").toLowerCase();
    return needle.length > 0 && haystack.includes(needle);
  });
}
