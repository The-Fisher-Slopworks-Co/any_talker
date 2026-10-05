// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../../i18n-context";
import type { Settings } from "../../../../shared/types";
import { Card, SectionFooter, SectionHeader } from "../../components/layout";
import { Toggle } from "../../components/controls";
import { ModelsCard } from "../../components/models-card";
import { OverrideSection } from "../../components/override-section";
import { OptimizePromptButton } from "../../components/optimize-prompt-button";
import { ProviderSortField } from "../../components/provider-sort-field";
import { ProviderSelectField } from "../../components/provider-select-field";
import { ServiceTierField } from "../../components/service-tier-field";
import { TimezoneSelect } from "../../components/timezone-select";
import { ROW_CLS, ROW_LABEL_CLS } from "../../components/row";
import type { FormSetter } from "../../lib/use-form-reducer";
import { trimmedModels, type ChatForm } from "./chat-edit-form";

const PROMPT_TEXTAREA_CLS =
  "block w-full box-border bg-transparent border-0 px-4 py-3 text-base min-h-[180px]";
const KEYWORDS_TEXTAREA_CLS =
  "block w-full box-border bg-transparent border-0 px-4 py-3 text-base min-h-[80px]";

// Every editable section reads the one form state and writes back through the
// one setter; `global` is what the section falls back to while its override is
// off, and what its footer names.
// `set` follows typing; `commit` applies a change and saves it, and with an
// empty patch saves what the form holds (a text field being left).
type SectionProps = {
  form: ChatForm;
  set: FormSetter<ChatForm>;
  commit: (patch: Partial<ChatForm>) => void;
  global: Settings;
};

export function SystemPromptSection({
  form,
  set,
  commit,
  global,
}: SectionProps) {
  const { t: s } = useI18n();
  return (
    <OverrideSection
      title={s.ui_chat_system_prompt}
      override={form.promptOverride}
      onToggle={(v) => commit({ promptOverride: v })}
      footer={
        form.promptOverride
          ? undefined
          : s.ui_chat_system_prompt_off_footer(global.systemPrompt.length)
      }
    >
      <>
        <Card>
          <textarea
            className={PROMPT_TEXTAREA_CLS}
            value={form.promptValue}
            onChange={(e) => set("promptValue", e.target.value)}
            onBlur={() => commit({})}
            placeholder={s.ui_chat_prompt_placeholder}
          />
        </Card>
        <OptimizePromptButton prompt={form.promptValue} />
      </>
    </OverrideSection>
  );
}

export function ModelsSection({ form, set, commit, global }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <OverrideSection
      title={s.ui_chat_models}
      override={form.modelsOverride}
      onToggle={(v) => commit({ modelsOverride: v })}
      footer={
        form.modelsOverride
          ? undefined
          : s.ui_chat_models_off_footer(global.models.join(", "))
      }
    >
      <ModelsCard
        models={form.models}
        onChange={(next) => set("models", next)}
        onCommit={(ids) => commit({ models: ids })}
        onValidityChange={(valid) => set("modelsValid", valid)}
        fallback={true}
        providerSort={form.psOverride ? form.psValue : global.providerSort}
      />
    </OverrideSection>
  );
}

export function TimezoneOverrideSection({
  form,
  commit,
  global,
}: SectionProps) {
  const { t: s } = useI18n();
  return (
    <OverrideSection
      title={s.ui_chat_tz}
      override={form.tzOverride}
      onToggle={(v) => commit({ tzOverride: v })}
      footer={
        form.tzOverride
          ? s.ui_chat_tz_on_footer
          : s.ui_chat_tz_off_footer(global.timezone)
      }
    >
      <TimezoneSelect
        value={form.tzValue}
        onChange={(tz) => commit({ tzValue: tz })}
      />
    </OverrideSection>
  );
}

export function ProviderRoutingSection({ form, commit, global }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <OverrideSection
      title={s.ui_chat_provider_routing}
      override={form.psOverride}
      onToggle={(v) => commit({ psOverride: v })}
      footer={
        form.psOverride
          ? undefined
          : s.ui_chat_provider_routing_off_footer(
              global.providerSort ?? s.ui_sort_default,
            )
      }
    >
      <Card>
        <ProviderSortField
          value={form.psValue}
          onChange={(v) => commit({ psValue: v })}
        />
      </Card>
    </OverrideSection>
  );
}

export function ProviderSection({ form, commit, global }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <OverrideSection
      title={s.ui_chat_provider}
      override={form.provOverride}
      onToggle={(v) => commit({ provOverride: v })}
      footer={
        form.provOverride
          ? s.ui_chat_provider_on_footer
          : s.ui_chat_provider_off_footer(global.provider ?? s.ui_provider_auto)
      }
    >
      <Card>
        <ProviderSelectField
          modelId={
            (form.modelsOverride ? trimmedModels(form)[0] : global.models[0]) ??
            ""
          }
          value={form.provValue}
          onChange={(v) => commit({ provValue: v })}
        />
      </Card>
    </OverrideSection>
  );
}

export function ServiceTierSection({ form, commit, global }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <OverrideSection
      title={s.ui_chat_service_tier}
      override={form.stOverride}
      onToggle={(v) => commit({ stOverride: v })}
      footer={
        form.stOverride
          ? undefined
          : s.ui_chat_service_tier_off_footer(
              global.serviceTier ?? s.ui_tier_default,
            )
      }
    >
      <Card>
        <ServiceTierField
          value={form.stValue}
          onChange={(v) => commit({ stValue: v })}
        />
      </Card>
    </OverrideSection>
  );
}

export function KeywordFilterSection({
  form,
  set,
  commit,
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
            onChange={(v) => commit({ kfEnabled: v })}
          />
        </div>
        <textarea
          className={KEYWORDS_TEXTAREA_CLS}
          value={form.keywordsText}
          onChange={(e) => set("keywordsText", e.target.value)}
          onBlur={() => commit({})}
          placeholder={s.ui_chat_keyword_filter_placeholder}
        />
      </Card>
      <SectionFooter>{s.ui_chat_keyword_filter_footer}</SectionFooter>
    </>
  );
}
