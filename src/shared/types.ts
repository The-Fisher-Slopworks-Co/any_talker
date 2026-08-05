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

// Hard USD budget caps, enforced by the budget guard alongside (and independent
// of) the token rate limit — money vs. fairness. Checked most-severe-first, so
// when several caps are breached at once the guard reports the top one.
export type BudgetDenyReason =
  | "globalMonthly"
  | "globalDaily"
  | "chatDaily"
  | "newUser";

// USD spend caps. The primary protector of a fixed monthly budget is
// `globalMonthlyCapUsd`; the daily/chat/new-user caps bound how fast that budget
// can be drained by any single day, chat, or freshly-seen (untrusted) user. All
// are admin-editable at runtime; window *lengths* (day/month) are fixed in the
// spend-bucket math. The owner is never denied when `ownerExempt` (default true),
// but owner spend still counts toward the global totals — the money is real.
export type BudgetConfig = {
  enabled: boolean;
  ownerExempt: boolean;
  globalMonthlyCapUsd: number;
  globalDailyCapUsd: number;
  perChatDailyCapUsd: number;
  newUserDailyCapUsd: number;
  // How long (days from first-seen) a user is treated as "new" and held to the
  // tighter `newUserDailyCapUsd`.
  newUserWindowDays: number;
};

// Anomaly-detection thresholds for the observability layer (alert-only — these
// never deny a request, unlike `BudgetConfig`). A spend "spike" fires when a
// user's/chat's spend today crosses EITHER the absolute floor OR a multiple of
// its own trailing baseline (velocity), so a sudden jump is caught even below
// the absolute bar. The velocity signal is floored by `spikeMinBaselineUsd` so
// trivial amounts (a few cents) can't trip it.
export type AnomalyConfig = {
  digestIntervalHours: number;
  spikeUserAbsoluteUsd: number;
  spikeChatAbsoluteUsd: number;
  spikeVelocityMultiplier: number;
  spikeMinBaselineUsd: number;
};

// Reasoning effort passed through to the model per request, mapped to the
// standard `reasoning_effort` chat-completions field (honored by reasoning
// models, ignored by others).
export type ReasoningEffort = "low" | "high";

// How a multi-provider gateway should pick among the upstreams serving one
// model. Only meaningful when the configured endpoint advertises the
// `providerRouting` capability (see `src/ai/provider-profile.ts`).
export type ProviderSort = "price" | "throughput" | "latency";

export const PROVIDER_SORT_VALUES: readonly ProviderSort[] = [
  "price",
  "throughput",
  "latency",
];

// Service tiers trade cost against latency/availability. Omitting the field
// (null) uses the standard tier; "flex" is cheaper but slower, and "priority" is
// faster at a higher price.
export type ServiceTier = "flex" | "priority";

export const SERVICE_TIER_VALUES: readonly ServiceTier[] = ["flex", "priority"];

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
  // Model ids to try, most-preferred first. The trailing ids form a server-side
  // fallback chain on a gateway that supports one; against a plain OpenAI-
  // compatible endpoint only `models[0]` is sent (see `ProviderCapabilities`).
  models: string[];
  // Provider routing, honoured only by a gateway that advertises it. `null`
  // leaves the choice to the gateway.
  providerSort: ProviderSort | null;
  // Provider slug to pin routing to (e.g. "deepinfra/fp4"). When set it takes
  // precedence over `providerSort`: the request goes only to this provider with
  // no fallback.
  provider: string | null;
  serviceTier: ServiceTier | null;
  // Whether the user/chat whitelist is enforced as an access gate. When false,
  // anyone may invoke the bot and the USD budget guard + rate limit are the only
  // protection (the whitelist entries are preserved, just not consulted). The
  // owner is always allowed either way. Defaults to true (whitelist enforced).
  whitelistEnabled: boolean;
  rateLimit: RateLimitConfig;
  // Hard USD spend caps (the budget-protection safety net) and the alert-only
  // anomaly thresholds. Global policy like `rateLimit` — no per-chat override.
  budget: BudgetConfig;
  anomaly: AnomalyConfig;
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
  // Epoch ms the user was first seen. Set once on the first-ever upsert and
  // preserved thereafter; legacy rows written before this field existed are
  // backfilled to 0 on read, so an existing user never looks "brand new" (which
  // would wrongly subject them to the new-user soft-start budget). Drives both
  // the new-user cap and the "new users" digest.
  firstSeenAt: number;
  lastSeenAt: number;
};

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

export type KeywordFilter = {
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
  // Telegram file_ids of the images that accompanied the question (own photo +
  // replied-to photos), re-fetched on follow-up turns — as in ConversationNode.
  userImageFileIds?: string[];
};

export type GuestThreadNode = {
  chatId: string;
  turns: GuestThreadTurn[];
  ts: number;
};

export const DEFAULT_SETTINGS: Settings = {
  systemPrompt: "You are a helpful assistant in a Telegram chat. Be concise.",
  models: ["anthropic/claude-sonnet-4-5"],
  providerSort: null,
  provider: null,
  serviceTier: null,
  whitelistEnabled: true,
  rateLimit: {
    fiveHourTokens: 30000,
    weeklyTokens: 300000,
    ownerExempt: true,
    wiseMultiplier: 1.8,
  },
  // Defaults sized for a small (~$20/month) budget: the monthly cap is the real
  // ceiling (with a little headroom), the daily cap stops one day from eating
  // the month, and per-chat/new-user caps keep any single chat or unknown
  // newcomer to a small slice. All tunable at runtime from the admin Mini App.
  budget: {
    enabled: true,
    ownerExempt: true,
    globalMonthlyCapUsd: 18,
    globalDailyCapUsd: 2,
    perChatDailyCapUsd: 1,
    newUserDailyCapUsd: 0.1,
    newUserWindowDays: 3,
  },
  anomaly: {
    digestIntervalHours: 24,
    spikeUserAbsoluteUsd: 0.5,
    spikeChatAbsoluteUsd: 1,
    spikeVelocityMultiplier: 5,
    spikeMinBaselineUsd: 0.02,
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

export function isValidServiceTier(v: unknown): v is ServiceTier {
  return v === "flex" || v === "priority";
}

// Provider slugs are lowercase identifiers, optionally with variant/region
// segments after a slash (e.g. "deepinfra", "deepinfra/fp4",
// "google-vertex/us-east5"). Validate the shape rather than an allow-list so we
// don't have to track a gateway's evolving provider catalogue; the value is only
// ever placed in a JSON body field, so there's no injection surface.
const PROVIDER_SLUG_RE =
  /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?(\/[a-z0-9]([a-z0-9._-]*[a-z0-9])?)*$/i;

export function isValidProviderSlug(v: unknown): v is string {
  return typeof v === "string" && v.length <= 100 && PROVIDER_SLUG_RE.test(v);
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
