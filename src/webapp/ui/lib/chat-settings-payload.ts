// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type {
  ChatSettings,
  ProviderSort,
  ServiceTier,
} from "../../../shared/types";

// The chat-edit form's state, already trimmed and normalized by the view. Each
// `*Override` flag is the section's toggle: on ⇒ this chat sets its own value,
// off ⇒ it inherits the global one.
export type ChatSettingsDraft = {
  promptOverride: boolean;
  promptValue: string;
  modelsOverride: boolean;
  models: string[];
  botName: string;
  tzOverride: boolean;
  tzValue: string;
  psOverride: boolean;
  psValue: ProviderSort | null;
  provOverride: boolean;
  provValue: string | null;
  stOverride: boolean;
  stValue: ServiceTier | null;
  kfEnabled: boolean;
  keywords: string[];
};

// Builds the body for `PUT /api/admin/chats/:id`.
//
// That route **replaces** the record rather than patching it, so an omitted key
// is a deletion — which is exactly what an override toggled off should mean.
// Every section is rendered, so the draft is the whole truth about this chat
// and nothing has to be carried through from the stored record.
export function buildChatSettingsPayload(
  draft: ChatSettingsDraft,
): ChatSettings {
  const next: ChatSettings = {};
  if (draft.promptOverride) next.systemPrompt = draft.promptValue;
  if (draft.modelsOverride && draft.models.length > 0) next.models = draft.models;
  if (draft.botName.length > 0) next.botName = draft.botName;
  if (draft.tzOverride) next.timezone = draft.tzValue;

  // `null` is a real override — "ignore the global pin in this chat" — so it
  // is written like any other value.
  if (draft.psOverride) next.providerSort = draft.psValue;
  if (draft.provOverride) next.provider = draft.provValue;
  if (draft.stOverride) next.serviceTier = draft.stValue;

  if (draft.kfEnabled || draft.keywords.length > 0) {
    next.keywordFilter = { enabled: draft.kfEnabled, keywords: draft.keywords };
  }
  return next;
}
