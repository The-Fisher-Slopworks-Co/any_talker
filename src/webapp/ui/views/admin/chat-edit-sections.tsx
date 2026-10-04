// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../../i18n-context";
import type {
  ProviderSort,
  ServiceTier,
  Settings,
} from "../../../../shared/types";
import { Card, SectionFooter, SectionHeader } from "../../components/layout";
import { Toggle } from "../../components/controls";
import { ModelsCard } from "../../components/models-card";
import { OverrideSection } from "../../components/override-section";
import { OptimizePromptButton } from "../../components/optimize-prompt-button";
import {
  OverrideSelectRow,
  type Override,
} from "../../components/override-select-row";
import { useProviderOptions } from "../../components/provider-select-field";
import { TimezonePickerRow } from "../../components/timezone-picker-row";
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

const PROVIDER_SORTS: readonly ProviderSort[] = [
  "price",
  "throughput",
  "latency",
];
const SERVICE_TIERS: readonly ServiceTier[] = ["flex", "priority"];

// The override as the form stores it: a flag and, when on, the value.
const own = <T,>(on: boolean, value: T): Override<T> =>
  on ? { own: true, value } : { own: false };

// The form change for picking `next` in the override kept in `flag`/`value`.
const pick = <T,>(
  next: Override<T>,
  flag: keyof ChatForm,
  value: keyof ChatForm,
): Partial<ChatForm> =>
  next.own ? { [flag]: true, [value]: next.value } : { [flag]: false };

// `null` ("none of these") first, then each value with its label.
const choices = <T,>(values: readonly T[], label: (v: T | null) => string) =>
  [null, ...values].map((value) => ({ value, label: label(value) }));

// The four settings a chat can override, one pop-up row each: "Global (…)"
// first, then the chat's own choices.
export function AiSettingsSection({ form, commit, global }: SectionProps) {
  const { t: s } = useI18n();
  const providers =
    useProviderOptions(
      (form.modelsOverride ? trimmedModels(form)[0] : global.models[0]) ?? "",
    ) ?? [];
  const sortLabels: Record<ProviderSort, string> = {
    price: s.ui_sort_price,
    throughput: s.ui_sort_throughput,
    latency: s.ui_sort_latency,
  };
  const tierLabels: Record<ServiceTier, string> = {
    flex: s.ui_tier_flex,
    priority: s.ui_tier_priority,
  };
  const sortLabel = (sort: ProviderSort | null) =>
    sort === null ? s.ui_sort_default : sortLabels[sort];
  const tierLabel = (tier: ServiceTier | null) =>
    tier === null ? s.ui_tier_default : tierLabels[tier];
  // A pinned slug the lookup does not list still has to be selectable.
  const pinned = form.provOverride ? form.provValue : null;
  const providerOptions = [
    { value: null, label: s.ui_provider_auto },
    ...(pinned !== null && !providers.some((p) => p.slug === pinned)
      ? [{ value: pinned, label: pinned }]
      : []),
    ...providers.map((p) => ({ value: p.slug, label: p.name })),
  ];

  return (
    <>
      <SectionHeader>{s.ui_chat_ai_header}</SectionHeader>
      <Card>
        <TimezonePickerRow
          value={form.tzOverride ? form.tzValue : null}
          emptyLabel={s.ui_chat_global_option(global.timezone)}
          onChange={(tz) =>
            commit(
              tz === null
                ? { tzOverride: false }
                : { tzOverride: true, tzValue: tz },
            )
          }
        />
        <OverrideSelectRow<ProviderSort>
          label={s.ui_sort_label}
          globalLabel={sortLabel(global.providerSort)}
          options={choices(PROVIDER_SORTS, sortLabel)}
          override={own(form.psOverride, form.psValue)}
          onChange={(next) => commit(pick(next, "psOverride", "psValue"))}
        />
        <OverrideSelectRow<string>
          label={s.ui_provider_label}
          globalLabel={global.provider ?? s.ui_provider_auto}
          options={providerOptions}
          override={own(form.provOverride, form.provValue)}
          onChange={(next) => commit(pick(next, "provOverride", "provValue"))}
        />
        <OverrideSelectRow<ServiceTier>
          label={s.ui_prompt_service_tier}
          globalLabel={tierLabel(global.serviceTier)}
          options={choices(SERVICE_TIERS, tierLabel)}
          override={own(form.stOverride, form.stValue)}
          onChange={(next) => commit(pick(next, "stOverride", "stValue"))}
        />
      </Card>
      <SectionFooter>{s.ui_chat_ai_footer}</SectionFooter>
    </>
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
