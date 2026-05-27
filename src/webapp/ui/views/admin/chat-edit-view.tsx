// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState } from "react";
import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import type {
  Chat,
  ChatSettings,
  ProviderSort,
  ServiceTier,
  RateLimitConfig,
  Settings,
} from "../../../../shared/types";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../../components/layout";
import { LoadingState } from "../../components/states";
import { SaveButton, Toggle } from "../../components/controls";
import { ModelsCard } from "../../components/models-card";
import { OverrideSection } from "../../components/override-section";
import { ProviderSortField } from "../../components/provider-sort-field";
import { ProviderSelectField } from "../../components/provider-select-field";
import { ServiceTierField } from "../../components/service-tier-field";
import { RateLimitFields } from "../../components/rate-limit-fields";
import { TimezoneSelect } from "../../components/timezone-select";
import { WhitelistToggleButton } from "../../components/whitelist-toggle-button";
import {
  INPUT_CLS,
  ROW_CLS,
  ROW_LABEL_CLS,
  ROW_VALUE_CLS,
} from "../../components/row";
import { chatTitle } from "../../lib/labels";

export function ChatEditView({ chatId }: { chatId: string }) {
  const { t: s } = useI18n();
  const [chat, setChat] = useState<Chat | null>(null);
  const [global, setGlobal] = useState<Settings | null>(null);
  const [original, setOriginal] = useState<ChatSettings | null>(null);

  const [promptOverride, setPromptOverride] = useState(false);
  const [promptValue, setPromptValue] = useState("");
  const [modelsOverride, setModelsOverride] = useState(false);
  const [modelsValue, setModelsValue] = useState<string[]>([]);
  const [rlOverride, setRlOverride] = useState(false);
  const [rlValue, setRlValue] = useState<RateLimitConfig | null>(null);
  const [botNameValue, setBotNameValue] = useState("");
  const [tzOverride, setTzOverride] = useState(false);
  const [tzValue, setTzValue] = useState("UTC");
  const [psOverride, setPsOverride] = useState(false);
  const [psValue, setPsValue] = useState<ProviderSort | null>(null);
  const [provOverride, setProvOverride] = useState(false);
  const [provValue, setProvValue] = useState<string | null>(null);
  const [stOverride, setStOverride] = useState(false);
  const [stValue, setStValue] = useState<ServiceTier | null>(null);
  const [kfEnabled, setKfEnabled] = useState(false);
  const [kfValue, setKfValue] = useState("");

  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [whitelisted, setWhitelisted] = useState(false);

  useEffect(() => {
    Promise.all([api.getSettings(), api.getAdminChat(chatId)])
      .then(([g, d]) => {
        setGlobal(g);
        setChat(d.chat);
        setOriginal(d.settings);
        setWhitelisted(d.whitelisted);
        setPromptOverride(d.settings.systemPrompt !== undefined);
        setPromptValue(d.settings.systemPrompt ?? g.systemPrompt);
        setModelsOverride(d.settings.models !== undefined);
        setModelsValue(d.settings.models ?? g.models);
        setRlOverride(d.settings.rateLimit !== undefined);
        setRlValue(d.settings.rateLimit ?? g.rateLimit);
        setBotNameValue(d.settings.botName ?? "");
        setTzOverride(d.settings.timezone !== undefined);
        setTzValue(d.settings.timezone ?? g.timezone);
        setPsOverride(d.settings.providerSort !== undefined);
        setPsValue(
          d.settings.providerSort !== undefined
            ? d.settings.providerSort
            : g.providerSort,
        );
        setProvOverride(d.settings.provider !== undefined);
        setProvValue(
          d.settings.provider !== undefined ? d.settings.provider : g.provider,
        );
        setStOverride(d.settings.serviceTier !== undefined);
        setStValue(
          d.settings.serviceTier !== undefined
            ? d.settings.serviceTier
            : g.serviceTier,
        );
        setKfEnabled(d.settings.keywordFilter?.enabled ?? false);
        setKfValue((d.settings.keywordFilter?.keywords ?? []).join(", "));
      })
      .catch(() => setNotFound(true));
  }, [chatId]);

  if (notFound) return <LoadingState text={s.ui_chat_not_found} />;
  if (!chat || !global || !original || !rlValue) return <LoadingState />;

  const trimmedModels = modelsValue
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
  const trimmedBotName = botNameValue.trim();
  const parsedKeywords = kfValue
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  const buildPayload = (): ChatSettings => {
    const next: ChatSettings = {};
    if (promptOverride) next.systemPrompt = promptValue;
    if (modelsOverride && trimmedModels.length > 0) next.models = trimmedModels;
    if (rlOverride) next.rateLimit = rlValue;
    if (trimmedBotName.length > 0) next.botName = trimmedBotName;
    if (tzOverride) next.timezone = tzValue;
    if (psOverride) next.providerSort = psValue;
    if (provOverride) next.provider = provValue;
    if (stOverride) next.serviceTier = stValue;
    if (kfEnabled || parsedKeywords.length > 0) {
      next.keywordFilter = {
        enabled: kfEnabled,
        keywords: parsedKeywords,
      };
    }
    return next;
  };

  const payload = buildPayload();
  const wasOverridden = (key: keyof ChatSettings) => original[key] !== undefined;
  const dirty =
    promptOverride !== wasOverridden("systemPrompt") ||
    modelsOverride !== wasOverridden("models") ||
    rlOverride !== wasOverridden("rateLimit") ||
    tzOverride !== wasOverridden("timezone") ||
    psOverride !== wasOverridden("providerSort") ||
    provOverride !== wasOverridden("provider") ||
    stOverride !== wasOverridden("serviceTier") ||
    (promptOverride && payload.systemPrompt !== original.systemPrompt) ||
    (modelsOverride &&
      JSON.stringify(payload.models) !== JSON.stringify(original.models)) ||
    (rlOverride &&
      JSON.stringify(payload.rateLimit) !== JSON.stringify(original.rateLimit)) ||
    (tzOverride && payload.timezone !== original.timezone) ||
    (psOverride && payload.providerSort !== original.providerSort) ||
    (provOverride && payload.provider !== original.provider) ||
    (stOverride && payload.serviceTier !== original.serviceTier) ||
    trimmedBotName !== (original.botName ?? "") ||
    JSON.stringify(payload.keywordFilter ?? null) !==
      JSON.stringify(original.keywordFilter ?? null);

  const canSave = dirty && (!modelsOverride || trimmedModels.length > 0);

  const save = async () => {
    setSaving(true);
    try {
      const result = await api.putAdminChat(chatId, buildPayload());
      setOriginal(result.settings);
      setPromptOverride(result.settings.systemPrompt !== undefined);
      setPromptValue(result.settings.systemPrompt ?? global.systemPrompt);
      setModelsOverride(result.settings.models !== undefined);
      setModelsValue(result.settings.models ?? global.models);
      setRlOverride(result.settings.rateLimit !== undefined);
      setRlValue(result.settings.rateLimit ?? global.rateLimit);
      setBotNameValue(result.settings.botName ?? "");
      setTzOverride(result.settings.timezone !== undefined);
      setTzValue(result.settings.timezone ?? global.timezone);
      setPsOverride(result.settings.providerSort !== undefined);
      setPsValue(
        result.settings.providerSort !== undefined
          ? result.settings.providerSort
          : global.providerSort,
      );
      setProvOverride(result.settings.provider !== undefined);
      setProvValue(
        result.settings.provider !== undefined
          ? result.settings.provider
          : global.provider,
      );
      setStOverride(result.settings.serviceTier !== undefined);
      setStValue(
        result.settings.serviceTier !== undefined
          ? result.settings.serviceTier
          : global.serviceTier,
      );
      setKfEnabled(result.settings.keywordFilter?.enabled ?? false);
      setKfValue((result.settings.keywordFilter?.keywords ?? []).join(", "));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <SectionHeader>{s.ui_chat_chat}</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_chat_title}</span>
          <span className={ROW_VALUE_CLS}>{chatTitle(s, chat)}</span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_chat_type}</span>
          <span className={ROW_VALUE_CLS}>{chat.type}</span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_chat_username}</span>
          <span className={ROW_VALUE_CLS}>
            {chat.username ? `@${chat.username}` : s.ui_dash}
          </span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_chat_id}</span>
          <span className={ROW_VALUE_CLS}>{chat.id}</span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_chat_last_seen}</span>
          <span className={ROW_VALUE_CLS}>
            {new Date(chat.lastSeenAt).toLocaleString()}
          </span>
        </div>
        <WhitelistToggleButton
          kind="chats"
          id={chat.id}
          label={chatTitle(s, chat)}
          initial={whitelisted}
        />
      </Card>

      <SectionHeader>{s.ui_chat_bot_name}</SectionHeader>
      <Card>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_user_name}</span>
          <input
            className={INPUT_CLS}
            placeholder={s.ui_chat_bot_name_placeholder}
            value={botNameValue}
            onChange={(e) => setBotNameValue(e.target.value)}
            maxLength={64}
          />
        </label>
      </Card>
      <SectionFooter>{s.ui_chat_bot_name_footer}</SectionFooter>

      <OverrideSection
        title={s.ui_chat_system_prompt}
        override={promptOverride}
        onToggle={setPromptOverride}
        footer={
          promptOverride
            ? s.ui_chat_system_prompt_on_footer
            : s.ui_chat_system_prompt_off_footer(global.systemPrompt.length)
        }
      >
        <Card>
          <textarea
            className="block w-full box-border bg-transparent border-0 px-4 py-3 text-base min-h-[180px]"
            value={promptValue}
            onChange={(e) => setPromptValue(e.target.value)}
            placeholder={s.ui_chat_prompt_placeholder}
          />
        </Card>
      </OverrideSection>

      <OverrideSection
        title={s.ui_chat_models}
        override={modelsOverride}
        onToggle={setModelsOverride}
        footer={
          modelsOverride
            ? s.ui_chat_models_on_footer
            : s.ui_chat_models_off_footer(global.models.join(", "))
        }
      >
        <ModelsCard
          models={modelsValue}
          onChange={setModelsValue}
          providerSort={psOverride ? psValue : global.providerSort}
        />
      </OverrideSection>

      <OverrideSection
        title={s.ui_chat_rate_limit}
        override={rlOverride}
        onToggle={setRlOverride}
        footer={
          rlOverride
            ? s.ui_chat_rate_limit_on_footer
            : s.ui_chat_rate_limit_off_footer
        }
      >
        <RateLimitFields value={rlValue} onChange={setRlValue} />
      </OverrideSection>

      <OverrideSection
        title={s.ui_chat_tz}
        override={tzOverride}
        onToggle={setTzOverride}
        footer={
          tzOverride
            ? s.ui_chat_tz_on_footer
            : s.ui_chat_tz_off_footer(global.timezone)
        }
      >
        <TimezoneSelect value={tzValue} onChange={setTzValue} />
      </OverrideSection>

      <OverrideSection
        title={s.ui_chat_provider_routing}
        override={psOverride}
        onToggle={setPsOverride}
        footer={
          psOverride
            ? s.ui_chat_provider_routing_on_footer
            : s.ui_chat_provider_routing_off_footer(
                global.providerSort ?? s.ui_sort_default,
              )
        }
      >
        <ProviderSortField value={psValue} onChange={setPsValue} />
      </OverrideSection>

      <OverrideSection
        title={s.ui_chat_provider}
        override={provOverride}
        onToggle={setProvOverride}
        footer={
          provOverride
            ? s.ui_chat_provider_on_footer
            : s.ui_chat_provider_off_footer(global.provider ?? s.ui_sort_default)
        }
      >
        <ProviderSelectField
          modelId={(modelsOverride ? trimmedModels[0] : global.models[0]) ?? ""}
          value={provValue}
          onChange={setProvValue}
        />
      </OverrideSection>

      <OverrideSection
        title={s.ui_chat_service_tier}
        override={stOverride}
        onToggle={setStOverride}
        footer={
          stOverride
            ? s.ui_chat_service_tier_on_footer
            : s.ui_chat_service_tier_off_footer(
                global.serviceTier ?? s.ui_tier_default,
              )
        }
      >
        <ServiceTierField value={stValue} onChange={setStValue} />
      </OverrideSection>

      <SectionHeader>{s.ui_chat_keyword_filter}</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_chat_keyword_filter_enabled}</span>
          <span className="flex-1" />
          <Toggle value={kfEnabled} onChange={setKfEnabled} />
        </div>
        <textarea
          className="block w-full box-border bg-transparent border-0 px-4 py-3 text-base min-h-[80px]"
          value={kfValue}
          onChange={(e) => setKfValue(e.target.value)}
          placeholder={s.ui_chat_keyword_filter_placeholder}
        />
      </Card>
      <SectionFooter>{s.ui_chat_keyword_filter_footer}</SectionFooter>

      <SaveButton
        saving={saving}
        dirty={dirty}
        disabled={saving || !canSave}
        onClick={save}
      />
    </Stack>
  );
}
