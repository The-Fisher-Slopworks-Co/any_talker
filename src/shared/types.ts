// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Dual fixed-window token budget, per user (global across all chats and family
// bots). A request is allowed only while BOTH windows have budget left; tokens
// spent are accrued to both. Window *lengths* are fixed in code (5 hours and 1
// week); only these budgets and the multiplier/exemption are admin-configurable.
export type RateLimitConfig = {
  fiveHourTokens: number;
  weeklyTokens: number;
  ownerExempt: boolean;
  wiseMultiplier: number;
};

// Which of the two windows is being referred to (denial reason, UI labels).
export type WindowKind = "fiveHour" | "weekly";

export type ProviderSort = "price" | "throughput" | "latency";

// Reasoning effort passed through to the model per request.
// https://openrouter.ai/docs/use-cases/reasoning-tokens
export type ReasoningEffort = "low" | "high";

export const PROVIDER_SORT_VALUES: readonly ProviderSort[] = [
  "price",
  "throughput",
  "latency",
];

// OpenRouter service tiers trade cost against latency/availability. Omitting
// the field (null) uses the standard tier; "flex" is cheaper but slower, and
// "priority" is faster at a higher price.
// https://openrouter.ai/docs/guides/features/service-tiers
export type ServiceTier = "flex" | "priority";

export const SERVICE_TIER_VALUES: readonly ServiceTier[] = ["flex", "priority"];

export type Gender = "male" | "female";

export type Settings = {
  systemPrompt: string;
  models: string[];
  rateLimit: RateLimitConfig;
  timezone: string;
  providerSort: ProviderSort | null;
  // OpenRouter provider slug to pin routing to (e.g. "deepinfra/fp4"). When set
  // it takes precedence over providerSort: the request goes only to this
  // provider with no fallback. null lets providerSort (or OpenRouter) decide.
  provider: string | null;
  serviceTier: ServiceTier | null;
  expandableBlockquoteThreshold: number;
};

export const DEFAULT_EXPANDABLE_BLOCKQUOTE_THRESHOLD = 500;

export type WhitelistKind = "users" | "chats";

export type WhitelistEntry = {
  id: string;
  label?: string;
};

export type Whitelist = {
  users: WhitelistEntry[];
  chats: WhitelistEntry[];
};

// One fixed window's accounting: the start (epoch ms) it was accrued against
// and the tokens used within it. A stored window whose start no longer matches
// the current (deterministically phase-shifted) window is treated as empty.
export type UsageWindow = {
  windowStart: number;
  used: number;
};

// Per-user dual-window usage record (see `RateLimitConfig`).
export type UserUsage = {
  fiveHour: UsageWindow;
  weekly: UsageWindow;
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
  botName?: string;
  timezone?: string;
  providerSort?: ProviderSort | null;
  provider?: string | null;
  serviceTier?: ServiceTier | null;
  keywordFilter?: KeywordFilter;
};

export type ConversationNode = {
  userQuestion: string;
  botAnswer: string;
  parentBotMsgId: number | null;
  ts: number;
  userImageFileIds?: string[];
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
    fiveHourTokens: 30000,
    weeklyTokens: 300000,
    ownerExempt: true,
    wiseMultiplier: 1.8,
  },
  timezone: "UTC",
  providerSort: null,
  provider: null,
  serviceTier: null,
  expandableBlockquoteThreshold: DEFAULT_EXPANDABLE_BLOCKQUOTE_THRESHOLD,
};

// Cap on how far back the conversation graph is walked when building LLM
// context. Longer chains burn tokens disproportionately and yield diminishing
// returns; 20 turns is enough to cover virtually all real reply threads.
export const MAX_REPLY_CHAIN_DEPTH = 20;
// Stored conversation nodes expire after this many seconds of inactivity.
// 30 days lets a user resume a long-running thread weeks later, while
// bounding the storage footprint of abandoned threads.
export const CONVERSATION_TTL_SECONDS = 30 * 24 * 60 * 60;
// Telegram file_id payloads decoded into bytes are cached for this many
// seconds. 7 days covers typical conversation reuse without keeping
// every photo the bot has ever seen pinned in storage indefinitely.
export const PHOTO_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

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

export function isValidProviderSort(v: unknown): v is ProviderSort {
  return v === "price" || v === "throughput" || v === "latency";
}

// OpenRouter provider slugs are lowercase identifiers, optionally with a
// variant segment after a slash (e.g. "deepinfra", "deepinfra/fp4",
// "google-vertex/us-east5"). Validate the shape rather than an allow-list so we
// don't have to track OpenRouter's evolving provider catalogue; the value is
// only ever placed in a JSON body field, so there's no injection surface.
const PROVIDER_SLUG_RE = /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?(\/[a-z0-9]([a-z0-9._-]*[a-z0-9])?)*$/i;

export function isValidProviderSlug(v: unknown): v is string {
  return typeof v === "string" && v.length <= 100 && PROVIDER_SLUG_RE.test(v);
}

export function isValidServiceTier(v: unknown): v is ServiceTier {
  return v === "flex" || v === "priority";
}

export function isValidGender(v: unknown): v is Gender {
  return v === "male" || v === "female";
}

// Cache results so hot paths don't pay for an Intl.DateTimeFormat allocation
// per call. The IANA tz database is closed under runtime updates we care
// about, and an unbounded set keyed by tz string is still tiny.
const TZ_VALID = new Set<string>();
const TZ_INVALID = new Set<string>();

export function isValidTimezone(tz: string): boolean {
  if (typeof tz !== "string" || tz.length === 0) return false;
  if (TZ_VALID.has(tz)) return true;
  if (TZ_INVALID.has(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    TZ_VALID.add(tz);
    return true;
  } catch {
    TZ_INVALID.add(tz);
    return false;
  }
}

// Returns the canonical IANA tz name (e.g. "Europe/Moscow") for an input that
// may differ in case ("europe/moscow") or be a deprecated alias. Returns null
// if the input is not a valid timezone.
export function canonicalizeTimezone(tz: string): string | null {
  if (!isValidTimezone(tz)) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions()
    .timeZone;
}
