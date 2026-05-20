// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState } from "react";
import { useI18n } from "../i18n-context";
import {
  api,
  type OpenrouterKeyResponse,
  type OpenrouterModelsResponse,
} from "../api-client";
import { Card, SectionFooter, SectionHeader, Stack } from "../components/layout";
import { PrimaryButton, RowButton, Toggle } from "../components/controls";
import { ModelsCard } from "../components/models-card";
import { LoadingState } from "../components/states";
import { INPUT_CLS, ROW_CLS, ROW_LABEL_CLS } from "../components/row";

export function ByokView() {
  const [keyState, setKeyState] = useState<OpenrouterKeyResponse | null>(null);
  const [modelsState, setModelsState] =
    useState<OpenrouterModelsResponse | null>(null);

  useEffect(() => {
    api.getMyOpenrouterKey().then(setKeyState).catch(() => setKeyState(null));
    api
      .getMyOpenrouterModels()
      .then(setModelsState)
      .catch(() => setModelsState({ models: null }));
  }, []);

  if (keyState === null || modelsState === null) return <LoadingState />;

  return (
    <Stack>
      <KeySection state={keyState} onChange={setKeyState} />
      <ModelsSection
        hasKey={keyState.hasKey}
        state={modelsState}
        onChange={setModelsState}
      />
    </Stack>
  );
}

function KeySection({
  state,
  onChange,
}: {
  state: OpenrouterKeyResponse;
  onChange: (next: OpenrouterKeyResponse) => void;
}) {
  const { t: s } = useI18n();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const trimmed = input.trim();
    if (trimmed.length === 0) return;
    setBusy(true);
    try {
      const next = await api.putMyOpenrouterKey(trimmed);
      onChange(next);
      setInput("");
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      const next = await api.putMyOpenrouterKey(null);
      onChange(next);
      setInput("");
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const showInput = !state.hasKey || editing;

  return (
    <>
      <SectionHeader>{s.ui_byok_key_section}</SectionHeader>
      {state.hasKey && !editing ? (
        <Card>
          <div className={ROW_CLS}>
            <span className="text-base tracking-widest">
              ••••&nbsp;{state.last4}
            </span>
          </div>
        </Card>
      ) : null}
      {showInput ? (
        <Card>
          <label className={ROW_CLS}>
            <span className={ROW_LABEL_CLS}>{s.ui_main_byok_key_label}</span>
            <input
              className={INPUT_CLS}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={s.ui_main_byok_placeholder}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </label>
        </Card>
      ) : null}
      {state.hasKey && !editing ? (
        <Card>
          <RowButton onClick={() => setEditing(true)} disabled={busy}>
            {s.ui_main_byok_replace}
          </RowButton>
          <RowButton onClick={clear} disabled={busy}>
            {s.ui_main_byok_clear}
          </RowButton>
        </Card>
      ) : (
        <>
          <PrimaryButton
            disabled={busy || input.trim().length === 0}
            onClick={save}
          >
            {busy ? s.ui_saving : s.ui_main_byok_save}
          </PrimaryButton>
          {state.hasKey ? (
            <Card>
              <RowButton
                onClick={() => {
                  setEditing(false);
                  setInput("");
                }}
                disabled={busy}
              >
                {s.ui_main_byok_cancel}
              </RowButton>
            </Card>
          ) : null}
        </>
      )}
      <SectionFooter>{s.ui_byok_key_footer}</SectionFooter>
    </>
  );
}

function ModelsSection({
  hasKey,
  state,
  onChange,
}: {
  hasKey: boolean;
  state: OpenrouterModelsResponse;
  onChange: (next: OpenrouterModelsResponse) => void;
}) {
  const { t: s } = useI18n();
  const [override, setOverride] = useState(state.models !== null);
  const [models, setModels] = useState<string[]>(
    state.models && state.models.length > 0 ? state.models : [""],
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOverride(state.models !== null);
    setModels(state.models && state.models.length > 0 ? state.models : [""]);
  }, [state]);

  if (!hasKey) {
    return (
      <>
        <SectionHeader>{s.ui_byok_models_section}</SectionHeader>
        <SectionFooter>{s.ui_byok_models_footer_inactive}</SectionFooter>
      </>
    );
  }

  const trimmed = models.map((m) => m.trim()).filter((m) => m.length > 0);
  const desired = override && trimmed.length > 0 ? trimmed : null;
  const current = state.models ?? null;
  const sameAsCurrent =
    (desired === null && current === null) ||
    (desired !== null &&
      current !== null &&
      desired.length === current.length &&
      desired.every((m, i) => m === current[i]));
  const dirty = !sameAsCurrent;
  const canSave = dirty && (!override || trimmed.length > 0);

  const save = async () => {
    setSaving(true);
    try {
      const next = await api.putMyOpenrouterModels(desired);
      onChange(next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SectionHeader>{s.ui_byok_models_section}</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_byok_models_override}</span>
          <span className="flex-1" />
          <Toggle value={override} onChange={setOverride} />
        </div>
      </Card>
      {override ? (
        <ModelsCard
          models={models}
          onChange={setModels}
          providerSort={null}
        />
      ) : null}
      <SectionFooter>
        {override ? s.ui_byok_models_on_footer : s.ui_byok_models_off_footer}
      </SectionFooter>
      <PrimaryButton disabled={saving || !canSave} onClick={save}>
        {saving ? s.ui_saving : dirty ? s.ui_save : s.ui_saved}
      </PrimaryButton>
    </>
  );
}
