// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n-context";
import type { Settings } from "../../../../shared/types";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../../components/layout";
import { ModelsCard } from "../../components/models-card";
import { NumberRow } from "../../components/number-row";
import {
  OptimizePromptFooter,
  OptimizePromptRow,
  useOptimizePrompt,
} from "../../components/optimize-prompt-button";
import { ProviderSelectField } from "../../components/provider-select-field";
import { ProviderSortField } from "../../components/provider-sort-field";
import { ReasoningEffortField } from "../../components/reasoning-effort-field";
import { SaveStatus } from "../../components/save-status";
import { ServiceTierField } from "../../components/service-tier-field";
import { TimezonePickerRow } from "../../components/timezone-picker-row";
import { useSettingsAutosave } from "../../lib/use-settings-autosave";

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((m, i) => m === b[i]);

export function PromptTab({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
}) {
  const { t: s } = useI18n();
  const { draft, save, status } = useSettingsAutosave({ settings, onSaved });

  // Text being typed lives here until it is committed; a change to the saved
  // value (a revert after a failed save) replaces it.
  const [prompt, setPrompt] = useState(draft.systemPrompt);
  const [seenPrompt, setSeenPrompt] = useState(draft.systemPrompt);
  if (draft.systemPrompt !== seenPrompt) {
    setSeenPrompt(draft.systemPrompt);
    setPrompt(draft.systemPrompt);
  }
  const commitPrompt = () => {
    if (prompt !== draft.systemPrompt) save({ systemPrompt: prompt });
  };
  // Leaving the screen (Telegram's back button) blurs nothing, so what is
  // still pending is committed on unmount.
  const latest = useRef({ prompt, draft, save });
  useEffect(() => {
    latest.current = { prompt, draft, save };
  });
  useEffect(
    () => () => {
      const l = latest.current;
      if (l.prompt !== l.draft.systemPrompt) l.save({ systemPrompt: l.prompt });
    },
    [],
  );

  // The model rows as edited: a blank fallback or an id the catalogue rejects
  // stays on screen without being saved.
  const [models, setModels] = useState(draft.models);
  const [seenModels, setSeenModels] = useState(draft.models);
  if (!sameList(draft.models, seenModels)) {
    setSeenModels(draft.models);
    const shown = models.map((m) => m.trim()).filter((m) => m.length > 0);
    if (!sameList(draft.models, shown)) setModels(draft.models);
  }

  const optimize = useOptimizePrompt(prompt);

  return (
    <Stack>
      <SectionHeader>{s.ui_prompt_models}</SectionHeader>
      <ModelsCard
        models={models}
        onChange={setModels}
        onCommit={(ids) => {
          if (!sameList(ids, draft.models)) save({ models: ids });
        }}
        fallback={true}
        providerSort={draft.providerSort}
      />

      <SectionHeader>{s.ui_prompt_provider_routing}</SectionHeader>
      <Card>
        <ProviderSortField
          value={draft.providerSort}
          onChange={(providerSort) => save({ providerSort })}
        />
        <ProviderSelectField
          // The first *non-empty* id, not the first row: with a chain, an emptied
          // primary row would otherwise disable the picker even though a real
          // model is configured below it.
          modelId={models.find((m) => m.trim() !== "") ?? ""}
          value={draft.provider}
          onChange={(provider) => save({ provider })}
        />
        <ServiceTierField
          value={draft.serviceTier}
          onChange={(serviceTier) => save({ serviceTier })}
        />
        <ReasoningEffortField
          value={draft.reasoningEffort.short}
          onChange={(short) => save({ reasoningEffort: { short } })}
        />
      </Card>
      <SectionFooter>{s.ui_prompt_provider_routing_footer}</SectionFooter>

      <SectionHeader>{s.ui_prompt_system_prompt}</SectionHeader>
      <Card>
        <textarea
          className="field-block block w-full box-border bg-transparent border-0 px-4 py-3 text-base min-h-[180px] resize-none"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onBlur={commitPrompt}
          placeholder={s.ui_prompt_placeholder}
        />
        <OptimizePromptRow optimize={optimize} />
      </Card>
      <OptimizePromptFooter optimize={optimize} autosaves />

      <div className="section-gap">
        <Card>
          <TimezonePickerRow
            value={draft.timezone}
            emptyLabel={null}
            onChange={(timezone) => {
              if (timezone !== null) save({ timezone });
            }}
          />
          <NumberRow
            label={s.ui_prompt_expandable_threshold}
            suffix={s.ui_prompt_chars_suffix}
            min={0}
            step={1}
            integer
            value={draft.expandableBlockquoteThreshold}
            onCommit={(expandableBlockquoteThreshold) =>
              save({ expandableBlockquoteThreshold })
            }
          />
        </Card>
      </div>
      <SectionFooter>{s.ui_prompt_timezone_footer}</SectionFooter>

      <SaveStatus status={status} />
    </Stack>
  );
}
