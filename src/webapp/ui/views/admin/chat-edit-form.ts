// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type {
  ChatSettings,
  ProviderSort,
  ServiceTier,
  Settings,
} from "../../../../shared/types";
import { buildChatSettingsPayload } from "../../lib/chat-settings-payload";

// The chat-edit form as the user sees it: raw text where the field is text
// (`keywordsText` is the comma-separated line, not the parsed list) plus the
// per-section override toggles. `modelsValid` is what ModelsCard reports back.
export type ChatForm = {
  promptOverride: boolean;
  promptValue: string;
  modelsOverride: boolean;
  models: string[];
  modelsValid: boolean;
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
  keywordsText: string;
};

// What the form holds until the chat and the global settings have loaded; the
// view renders a spinner over it, so these values are never shown.
export const EMPTY_CHAT_FORM: ChatForm = {
  promptOverride: false,
  promptValue: "",
  modelsOverride: false,
  models: [],
  modelsValid: true,
  botName: "",
  tzOverride: false,
  tzValue: "UTC",
  psOverride: false,
  psValue: null,
  provOverride: false,
  provValue: null,
  stOverride: false,
  stValue: null,
  kfEnabled: false,
  keywordsText: "",
};

export function chatFormFromSettings(
  settings: ChatSettings,
  global: Settings,
): ChatForm {
  return {
    promptOverride: settings.systemPrompt !== undefined,
    promptValue: settings.systemPrompt ?? global.systemPrompt,
    modelsOverride: settings.models !== undefined,
    models: settings.models ?? global.models,
    modelsValid: true,
    botName: settings.botName ?? "",
    tzOverride: settings.timezone !== undefined,
    tzValue: settings.timezone ?? global.timezone,
    // `??` won't do here: an override may legitimately *be* null, which is
    // a different state from having no override at all.
    psOverride: settings.providerSort !== undefined,
    psValue:
      settings.providerSort !== undefined
        ? settings.providerSort
        : global.providerSort,
    provOverride: settings.provider !== undefined,
    provValue:
      settings.provider !== undefined ? settings.provider : global.provider,
    stOverride: settings.serviceTier !== undefined,
    stValue:
      settings.serviceTier !== undefined
        ? settings.serviceTier
        : global.serviceTier,
    kfEnabled: settings.keywordFilter?.enabled ?? false,
    keywordsText: (settings.keywordFilter?.keywords ?? []).join(", "),
  };
}

// Only the ids the card actually shows — see the same note in prompt-tab.
export function trimmedModels(form: ChatForm): string[] {
  return form.models.map((m) => m.trim()).filter((m) => m.length > 0);
}

function parsedKeywords(form: ChatForm): string[] {
  return form.keywordsText
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

export function chatFormPayload(form: ChatForm): ChatSettings {
  return buildChatSettingsPayload({
    promptOverride: form.promptOverride,
    promptValue: form.promptValue,
    modelsOverride: form.modelsOverride,
    models: trimmedModels(form),
    botName: form.botName.trim(),
    tzOverride: form.tzOverride,
    tzValue: form.tzValue,
    psOverride: form.psOverride,
    psValue: form.psValue,
    provOverride: form.provOverride,
    provValue: form.provValue,
    stOverride: form.stOverride,
    stValue: form.stValue,
    kfEnabled: form.kfEnabled,
    keywords: parsedKeywords(form),
  });
}

// Dirty means "differs from the stored record" — either a toggle flipped, or an
// enabled override now carries a different value. A value edited under a
// toggled-off override is not a change: it is never sent.
export function isChatFormDirty(
  form: ChatForm,
  original: ChatSettings,
): boolean {
  const payload = chatFormPayload(form);
  const wasOverridden = (key: keyof ChatSettings) =>
    original[key] !== undefined;
  return (
    form.promptOverride !== wasOverridden("systemPrompt") ||
    form.modelsOverride !== wasOverridden("models") ||
    form.tzOverride !== wasOverridden("timezone") ||
    form.psOverride !== wasOverridden("providerSort") ||
    form.provOverride !== wasOverridden("provider") ||
    form.stOverride !== wasOverridden("serviceTier") ||
    (form.promptOverride && payload.systemPrompt !== original.systemPrompt) ||
    (form.modelsOverride &&
      JSON.stringify(payload.models) !== JSON.stringify(original.models)) ||
    (form.tzOverride && payload.timezone !== original.timezone) ||
    (form.psOverride && payload.providerSort !== original.providerSort) ||
    (form.provOverride && payload.provider !== original.provider) ||
    (form.stOverride && payload.serviceTier !== original.serviceTier) ||
    form.botName.trim() !== (original.botName ?? "") ||
    JSON.stringify(payload.keywordFilter ?? null) !==
      JSON.stringify(original.keywordFilter ?? null)
  );
}

// A models override with no usable id (or one ModelsCard rejects) would save an
// empty chain, so Save stays disabled until it is fixed.
export function isChatFormValid(form: ChatForm): boolean {
  return (
    !form.modelsOverride || (trimmedModels(form).length > 0 && form.modelsValid)
  );
}
