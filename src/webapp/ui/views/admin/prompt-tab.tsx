// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import type { ProviderSort, Settings } from "../../../../shared/types";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../../components/layout";
import { SaveButton } from "../../components/controls";
import { ModelsCard } from "../../components/models-card";
import { ProviderSortField } from "../../components/provider-sort-field";
import { TimezoneSelect } from "../../components/timezone-select";

export function PromptTab({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
}) {
  const { t: s } = useI18n();
  const [models, setModels] = useState<string[]>(settings.models);
  const [prompt, setPrompt] = useState(settings.systemPrompt);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [providerSort, setProviderSort] = useState<ProviderSort | null>(
    settings.providerSort,
  );
  const [saving, setSaving] = useState(false);

  const trimmed = models.map((m) => m.trim()).filter((m) => m.length > 0);
  const modelsDirty =
    trimmed.length !== settings.models.length ||
    trimmed.some((m, i) => m !== settings.models[i]);
  const dirty =
    modelsDirty ||
    prompt !== settings.systemPrompt ||
    timezone !== settings.timezone ||
    providerSort !== settings.providerSort;
  const canSave = dirty && trimmed.length > 0;

  const save = async () => {
    setSaving(true);
    const next = await api.putSettings({
      models: trimmed,
      systemPrompt: prompt,
      timezone,
      providerSort,
    });
    onSaved(next);
    setModels(next.models);
    setTimezone(next.timezone);
    setProviderSort(next.providerSort);
    setSaving(false);
  };

  return (
    <Stack>
      <SectionHeader>{s.ui_prompt_models}</SectionHeader>
      <ModelsCard
        models={models}
        onChange={setModels}
        providerSort={providerSort}
      />
      <SectionFooter>{s.ui_prompt_models_footer}</SectionFooter>

      <SectionHeader>{s.ui_prompt_provider_routing}</SectionHeader>
      <ProviderSortField value={providerSort} onChange={setProviderSort} />
      <SectionFooter>{s.ui_prompt_provider_routing_footer}</SectionFooter>

      <SectionHeader>{s.ui_prompt_system_prompt}</SectionHeader>
      <Card>
        <textarea
          className="block w-full box-border bg-transparent border-0 px-4 py-3 text-base min-h-[180px]"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={s.ui_prompt_placeholder}
        />
      </Card>
      <SectionFooter>{s.ui_prompt_system_prompt_footer}</SectionFooter>

      <SectionHeader>{s.ui_prompt_timezone}</SectionHeader>
      <TimezoneSelect value={timezone} onChange={setTimezone} />
      <SectionFooter>{s.ui_prompt_timezone_footer}</SectionFooter>

      <SaveButton
        saving={saving}
        dirty={dirty}
        disabled={saving || !canSave}
        onClick={save}
      />
    </Stack>
  );
}
