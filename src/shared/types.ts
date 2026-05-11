// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

export type RateLimitConfig = {
  capacity: number;
  refillAmount: number;
  refillIntervalMs: number;
  ownerExempt: boolean;
};

export type ProviderSort = "price" | "throughput" | "latency";

export const PROVIDER_SORT_VALUES: readonly ProviderSort[] = [
  "price",
  "throughput",
  "latency",
];

export type Gender = "male" | "female";

export type Settings = {
  systemPrompt: string;
  models: string[];
  rateLimit: RateLimitConfig;
  timezone: string;
  providerSort: ProviderSort | null;
};

export type WhitelistKind = "users" | "chats";

export type WhitelistEntry = {
  id: string;
  label?: string;
};

export type Whitelist = {
  users: WhitelistEntry[];
  chats: WhitelistEntry[];
};

export type BucketState = {
  tokens: number;
  lastRefillTs: number;
};

export type User = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  lastSeenAt: number;
};

export type ChatType = "private" | "group" | "supergroup" | "channel";

export type Chat = {
  id: string;
  type: ChatType;
  title: string | null;
  username: string | null;
  lastSeenAt: number;
};

export type KeywordFilter = {
  enabled: boolean;
  keywords: string[];
};

export type ChatSettings = {
  systemPrompt?: string;
  models?: string[];
  rateLimit?: RateLimitConfig;
  botName?: string;
  timezone?: string;
  providerSort?: ProviderSort | null;
  keywordFilter?: KeywordFilter;
};

export type ConversationNode = {
  userQuestion: string;
  botAnswer: string;
  parentBotMsgId: number | null;
  ts: number;
};

export type GuestThreadTurn = {
  userQuestion: string;
  botAnswer: string;
};

export type GuestThreadNode = {
  chatId: string;
  turns: GuestThreadTurn[];
  ts: number;
};

export const DEFAULT_SETTINGS: Settings = {
  systemPrompt: "You are a helpful assistant in a Telegram chat. Be concise.",
  models: ["anthropic/claude-sonnet-4-5"],
  rateLimit: {
    capacity: 30000,
    refillAmount: 3000,
    refillIntervalMs: 40 * 60 * 1000,
    ownerExempt: true,
  },
  timezone: "UTC",
  providerSort: null,
};

export const MAX_REPLY_CHAIN_DEPTH = 20;
export const CONVERSATION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function composeFullName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  return [firstName, lastName]
    .map((s) => (s ?? "").trim())
    .filter((s) => s.length > 0)
    .join(" ");
}

export function isEmptyChatSettings(s: ChatSettings): boolean {
  return (
    s.systemPrompt === undefined &&
    s.models === undefined &&
    s.rateLimit === undefined &&
    s.botName === undefined &&
    s.timezone === undefined &&
    s.providerSort === undefined &&
    s.keywordFilter === undefined
  );
}

export function messageMatchesKeyword(
  text: string,
  keywords: string[],
): boolean {
  if (text.length === 0 || keywords.length === 0) return false;
  const haystack = text.toLowerCase();
  return keywords.some((kw) => {
    const needle = kw.toLowerCase();
    return needle.length > 0 && haystack.includes(needle);
  });
}

export function isValidProviderSort(v: unknown): v is ProviderSort {
  return v === "price" || v === "throughput" || v === "latency";
}

export function isValidGender(v: unknown): v is Gender {
  return v === "male" || v === "female";
}

export function isValidTimezone(tz: string): boolean {
  if (typeof tz !== "string" || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
