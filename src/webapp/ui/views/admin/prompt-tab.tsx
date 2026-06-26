// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import type { Settings } from "../../../../shared/types";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../../components/layout";
import { SaveButton } from "../../components/controls";
import { ModelsCard } from "../../components/models-card";
import { TimezoneSelect } from "../../components/timezone-select";
import { INPUT_CLS, ROW_CLS, ROW_LABEL_CLS } from "../../components/row";

export function PromptTab({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
}) {
  const { t: s } = useI18n();
  const [models, setModels] = useState<string[]>(settings.models);
  const [modelsValid, setModelsValid] = useState(true);
  const [prompt, setPrompt] = useState(settings.systemPrompt);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [thresholdInput, setThresholdInput] = useState(
    String(settings.expandableBlockquoteThreshold),
  );
  const [saving, setSaving] = useState(false);

  const trimmed = models.map((m) => m.trim()).filter((m) => m.length > 0);
  const modelsDirty =
    trimmed.length !== settings.models.length ||
    trimmed.some((m, i) => m !== settings.models[i]);
  const parsedThreshold = Number(thresholdInput);
  const thresholdValid =
    thresholdInput.trim() !== "" &&
    Number.isInteger(parsedThreshold) &&
    parsedThreshold >= 0;
  const thresholdDirty =
    thresholdValid &&
    parsedThreshold !== settings.expandableBlockquoteThreshold;
  const dirty =
    modelsDirty ||
    prompt !== settings.systemPrompt ||
    timezone !== settings.timezone ||
    thresholdDirty;
  const canSave = dirty && trimmed.length > 0 && thresholdValid && modelsValid;

  const save = async () => {
    setSaving(true);
    try {
      const next = await api.putSettings({
        models: trimmed,
        systemPrompt: prompt,
        timezone,
        expandableBlockquoteThreshold: parsedThreshold,
      });
      onSaved(next);
      setModels(next.models);
      setTimezone(next.timezone);
      setThresholdInput(String(next.expandableBlockquoteThreshold));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <SectionHeader>{s.ui_prompt_models}</SectionHeader>
      <ModelsCard
        models={models}
        onChange={setModels}
        onValidityChange={setModelsValid}
      />
      <SectionFooter>{s.ui_prompt_models_footer}</SectionFooter>

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

      <SectionHeader>{s.ui_prompt_expandable_threshold}</SectionHeader>
      <Card>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>
            {s.ui_prompt_expandable_threshold}
          </span>
          <input
            type="number"
            min="0"
            step="1"
            className={INPUT_CLS}
            value={thresholdInput}
            onChange={(e) => setThresholdInput(e.target.value)}
          />
        </label>
      </Card>
      <SectionFooter>{s.ui_prompt_expandable_threshold_footer}</SectionFooter>

      <SaveButton
        saving={saving}
        dirty={dirty}
        disabled={saving || !canSave}
        onClick={save}
      />
    </Stack>
  );
}
