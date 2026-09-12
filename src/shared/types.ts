// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// The shared vocabulary, split by domain under `types/`. This module re-exports
// all of it so a consumer can keep importing `shared/types`; a module that only
// touches one concern may import the domain file directly instead — e.g.
// `shared/types/ratelimit` for the token-window shapes.

export type { RateLimitConfig, WindowKind, UserUsage } from "./types/ratelimit";
export type {
  BudgetDenyReason,
  BudgetConfig,
  AnomalyConfig,
} from "./types/budget";
export type {
  ReasoningEffort,
  ReasoningEffortConfig,
  ProviderSort,
  ServiceTier,
} from "./types/models";
export {
  isValidReasoningEffort,
  isValidProviderSort,
  isValidServiceTier,
  isValidProviderSlug,
} from "./types/models";
export type { WhitelistKind, WhitelistEntry } from "./types/access";
export type {
  Gender,
  UserSettingField,
  UserSettingChange,
  User,
} from "./types/users";
export { composeFullName, isValidGender } from "./types/users";
export type { ChatType, Chat, ChatSettings } from "./types/chats";
export { isEmptyChatSettings, messageMatchesKeyword } from "./types/chats";
export type { Settings } from "./types/settings";
export {
  DEFAULT_EXPANDABLE_BLOCKQUOTE_THRESHOLD,
  DEFAULT_SETTINGS,
} from "./types/settings";
export type {
  ToolCallRecord,
  TurnRun,
  ConversationNode,
  GuestThreadNode,
  UserThreadRef,
} from "./types/conversations";
export {
  MAX_REPLY_CHAIN_DEPTH,
  CONVERSATION_TTL_SECONDS,
  USER_THREAD_INDEX_MAX,
} from "./types/conversations";
export type { ThreadSnapshotTurn, ThreadSnapshot } from "./types/feedback";
export { PHOTO_CACHE_TTL_SECONDS } from "./types/photos";
export { isValidTimezone, canonicalizeTimezone } from "./types/timezone";
