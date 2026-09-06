// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../../i18n-context";
import { useDateFmt } from "../../datetime-context";
import { TimeNote } from "../../components/time-note";
import type { Chat, Settings } from "../../../../shared/types";
import { Card, SectionFooter, SectionHeader } from "../../components/layout";
import { Toggle } from "../../components/controls";
import { ModelsCard } from "../../components/models-card";
import { OverrideSection } from "../../components/override-section";
import { ProviderSortField } from "../../components/provider-sort-field";
import { ProviderSelectField } from "../../components/provider-select-field";
import { ServiceTierField } from "../../components/service-tier-field";
import { TimezoneSelect } from "../../components/timezone-select";
import { WhitelistToggleButton } from "../../components/whitelist-toggle-button";
import { BlacklistToggleButton } from "../../components/blacklist-toggle-button";
import {
  INPUT_CLS,
  ROW_CLS,
  ROW_LABEL_CLS,
  ROW_VALUE_CLS,
} from "../../components/row";
import { chatTitle } from "../../lib/labels";
import type { FormSetter } from "../../lib/use-form-reducer";
import { trimmedModels, type ChatForm } from "./chat-edit-form";

const PROMPT_TEXTAREA_CLS =
  "block w-full box-border bg-transparent border-0 px-4 py-3 text-base min-h-[180px]";
const KEYWORDS_TEXTAREA_CLS =
  "block w-full box-border bg-transparent border-0 px-4 py-3 text-base min-h-[80px]";

// Every editable section reads the one form state and writes back through the
// one setter; `global` is what the section falls back to while its override is
// off, and what its footer names.
type SectionProps = {
  form: ChatForm;
  set: FormSetter<ChatForm>;
  global: Settings;
};

export function ChatInfoCard({
  chat,
  whitelisted,
  blacklisted,
}: {
  chat: Chat;
  whitelisted: boolean;
  blacklisted: boolean;
}) {
  const { t: s } = useI18n();
  const { format } = useDateFmt();
  return (
    <>
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
          <span className={ROW_VALUE_CLS}>{format(chat.lastSeenAt)}</span>
        </div>
        <WhitelistToggleButton
          kind="chats"
          id={chat.id}
          label={chatTitle(s, chat)}
          initial={whitelisted}
        />
        <BlacklistToggleButton
          kind="chats"
          id={chat.id}
          label={chatTitle(s, chat)}
          initial={blacklisted}
        />
      </Card>
      <SectionFooter>
        <TimeNote />
      </SectionFooter>
    </>
  );
}

export function BotNameSection({ form, set }: Omit<SectionProps, "global">) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{s.ui_chat_bot_name}</SectionHeader>
      <Card>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_user_name}</span>
          <input
            className={INPUT_CLS}
            placeholder={s.ui_chat_bot_name_placeholder}
            value={form.botName}
            onChange={(e) => set("botName", e.target.value)}
            maxLength={64}
          />
        </label>
      </Card>
      <SectionFooter>{s.ui_chat_bot_name_footer}</SectionFooter>
    </>
  );
}

export function SystemPromptSection({ form, set, global }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <OverrideSection
      title={s.ui_chat_system_prompt}
      override={form.promptOverride}
      onToggle={(v) => set("promptOverride", v)}
      footer={
        form.promptOverride
          ? s.ui_chat_system_prompt_on_footer
          : s.ui_chat_system_prompt_off_footer(global.systemPrompt.length)
      }
    >
      <Card>
        <textarea
          className={PROMPT_TEXTAREA_CLS}
          value={form.promptValue}
          onChange={(e) => set("promptValue", e.target.value)}
          placeholder={s.ui_chat_prompt_placeholder}
        />
      </Card>
    </OverrideSection>
  );
}

export function ModelsSection({ form, set, global }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <OverrideSection
      title={s.ui_chat_models}
      override={form.modelsOverride}
      onToggle={(v) => set("modelsOverride", v)}
      footer={
        form.modelsOverride
          ? s.ui_chat_models_fallback_footer
          : s.ui_chat_models_off_footer(global.models.join(", "))
      }
    >
      <ModelsCard
        models={form.models}
        onChange={(next) => set("models", next)}
        onValidityChange={(valid) => set("modelsValid", valid)}
        fallback={true}
        providerSort={form.psOverride ? form.psValue : global.providerSort}
      />
    </OverrideSection>
  );
}

export function TimezoneOverrideSection({ form, set, global }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <OverrideSection
      title={s.ui_chat_tz}
      override={form.tzOverride}
      onToggle={(v) => set("tzOverride", v)}
      footer={
        form.tzOverride
          ? s.ui_chat_tz_on_footer
          : s.ui_chat_tz_off_footer(global.timezone)
      }
    >
      <TimezoneSelect
        value={form.tzValue}
        onChange={(tz) => set("tzValue", tz)}
      />
    </OverrideSection>
  );
}

export function ProviderRoutingSection({ form, set, global }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <OverrideSection
      title={s.ui_chat_provider_routing}
      override={form.psOverride}
      onToggle={(v) => set("psOverride", v)}
      footer={
        form.psOverride
          ? s.ui_chat_provider_routing_on_footer
          : s.ui_chat_provider_routing_off_footer(
              global.providerSort ?? s.ui_sort_default,
            )
      }
    >
      <ProviderSortField
        value={form.psValue}
        onChange={(v) => set("psValue", v)}
      />
    </OverrideSection>
  );
}

export function ProviderSection({ form, set, global }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <OverrideSection
      title={s.ui_chat_provider}
      override={form.provOverride}
      onToggle={(v) => set("provOverride", v)}
      footer={
        form.provOverride
          ? s.ui_chat_provider_on_footer
          : s.ui_chat_provider_off_footer(global.provider ?? s.ui_provider_auto)
      }
    >
      <ProviderSelectField
        modelId={
          (form.modelsOverride ? trimmedModels(form)[0] : global.models[0]) ??
          ""
        }
        value={form.provValue}
        onChange={(v) => set("provValue", v)}
      />
    </OverrideSection>
  );
}

export function ServiceTierSection({ form, set, global }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <OverrideSection
      title={s.ui_chat_service_tier}
      override={form.stOverride}
      onToggle={(v) => set("stOverride", v)}
      footer={
        form.stOverride
          ? s.ui_chat_service_tier_on_footer
          : s.ui_chat_service_tier_off_footer(
              global.serviceTier ?? s.ui_tier_default,
            )
      }
    >
      <ServiceTierField
        value={form.stValue}
        onChange={(v) => set("stValue", v)}
      />
    </OverrideSection>
  );
}

export function KeywordFilterSection({
  form,
  set,
}: Omit<SectionProps, "global">) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{s.ui_chat_keyword_filter}</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>
            {s.ui_chat_keyword_filter_enabled}
          </span>
          <span className="flex-1" />
          <Toggle
            value={form.kfEnabled}
            onChange={(v) => set("kfEnabled", v)}
          />
        </div>
        <textarea
          className={KEYWORDS_TEXTAREA_CLS}
          value={form.keywordsText}
          onChange={(e) => set("keywordsText", e.target.value)}
          placeholder={s.ui_chat_keyword_filter_placeholder}
        />
      </Card>
      <SectionFooter>{s.ui_chat_keyword_filter_footer}</SectionFooter>
    </>
  );
}
