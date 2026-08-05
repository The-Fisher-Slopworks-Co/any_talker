// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type {
  ChatSettings,
  ProviderSort,
  ServiceTier,
} from "../../../shared/types";
import type { ProviderCapabilities } from "../../../ai/provider-profile";

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
// is a deletion. That makes the capability gate load-bearing in an unobvious
// way: a routing section the endpoint can't honour isn't rendered, so its state
// is meaningless — but dropping the field would delete a stored override the
// admin never saw, on a save meant for something else entirely. Unsupported
// routing is therefore carried through verbatim; the value costs nothing while
// inert and works again the moment the deployment points back at a gateway that
// supports it.
export function buildChatSettingsPayload(
  draft: ChatSettingsDraft,
  caps: ProviderCapabilities,
  original: ChatSettings,
): ChatSettings {
  const next: ChatSettings = {};
  if (draft.promptOverride) next.systemPrompt = draft.promptValue;
  if (draft.modelsOverride && draft.models.length > 0) next.models = draft.models;
  if (draft.botName.length > 0) next.botName = draft.botName;
  if (draft.tzOverride) next.timezone = draft.tzValue;

  if (caps.providerRouting) {
    // `null` is a real override — "ignore the global pin in this chat" — so it
    // is written like any other value.
    if (draft.psOverride) next.providerSort = draft.psValue;
    if (draft.provOverride) next.provider = draft.provValue;
  } else {
    if (original.providerSort !== undefined) {
      next.providerSort = original.providerSort;
    }
    if (original.provider !== undefined) next.provider = original.provider;
  }

  if (caps.serviceTier) {
    if (draft.stOverride) next.serviceTier = draft.stValue;
  } else if (original.serviceTier !== undefined) {
    next.serviceTier = original.serviceTier;
  }

  if (draft.kfEnabled || draft.keywords.length > 0) {
    next.keywordFilter = { enabled: draft.kfEnabled, keywords: draft.keywords };
  }
  return next;
}
