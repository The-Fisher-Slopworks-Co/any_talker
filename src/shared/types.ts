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

// Reasoning effort passed through to the model per request, mapped to the
// standard `reasoning_effort` chat-completions field (honored by reasoning
// models, ignored by others).
export type ReasoningEffort = "low" | "high";

export type Gender = "male" | "female";

// The four self-service user attributes the AI can read/edit via the
// user-settings tools. Kept here (a low-level shared module) so both the tool
// layer (`ToolEffect`) and the i18n catalogue can reference them without a
// layering inversion.
export type UserSettingField = "name" | "timezone" | "gender" | "language";

// One applied change, surfaced as a `settings_updated` ToolEffect and rendered
// into the reply's blockquote. `value` is the new canonical value (a display
// name, an IANA timezone, `"male"`/`"female"`, or `"en"`/`"ru"`), or `null` when
// the field was cleared back to its default.
export type UserSettingChange = { field: UserSettingField; value: string | null };

export type Settings = {
  systemPrompt: string;
  // Model ids to try, most-preferred first. A generic OpenAI-compatible endpoint
  // has no server-side fallback chain, so only `models[0]` is sent per request;
  // the rest are retained for the admin UI / future client-side fallback.
  models: string[];
  rateLimit: RateLimitConfig;
  timezone: string;
  expandableBlockquoteThreshold: number;
  // Cap on how many reminders one user may hold at once (per character bot).
  // Creation past this is rejected (not evicted — a reminder is a user-visible
  // commitment). Bounds list/cancel cost and the KeyDB keyspace, since reminders
  // carry no TTL. Configurable via PUT /api/settings; defaults to 50.
  maxRemindersPerUser: number;
};

export const DEFAULT_EXPANDABLE_BLOCKQUOTE_THRESHOLD = 500;

// Default per-user reminder cap (see `Settings.maxRemindersPerUser`). Mirrors
// the `USER_FACTS_MAX_PER_USER` precedent, but enforced as rejection rather than
// oldest-eviction.
export const DEFAULT_MAX_REMINDERS_PER_USER = 50;

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
  expandableBlockquoteThreshold: DEFAULT_EXPANDABLE_BLOCKQUOTE_THRESHOLD,
  maxRemindersPerUser: DEFAULT_MAX_REMINDERS_PER_USER,
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
