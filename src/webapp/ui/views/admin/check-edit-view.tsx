// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState } from "react";
import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import type { RecurringCheck } from "../../../../checks/types";
import { Card, SectionFooter, Stack } from "../../components/layout";
import { LoadingState } from "../../components/states";
import { DeleteButton, SaveButton } from "../../components/controls";
import { useFormReducer } from "../../lib/use-form-reducer";
import { checkToDraft, DEFAULT_DRAFT } from "./check-edit-form";
import {
  ButtonsSection,
  CheckStatusCard,
  CounterModeSection,
  CounterSourceSection,
  CounterValueSection,
  EnabledSection,
  QuestionSection,
  RepliesSection,
  ScheduleSection,
  TargetSection,
  TimezoneSection,
  TitleSection,
} from "./check-edit-sections";

export function CheckEditView({
  checkId,
  onClose,
}: {
  checkId: string | null;
  onClose: () => void;
}) {
  const { t: s } = useI18n();
  const isNew = checkId === null;
  const [check, setCheck] = useState<RecurringCheck | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, set, resetDraft] = useFormReducer(DEFAULT_DRAFT);

  useEffect(() => {
    if (isNew) {
      setCheck(null);
      resetDraft(DEFAULT_DRAFT);
      return;
    }
    api
      .getCheck(checkId)
      .then((r) => {
        setCheck(r.check);
        resetDraft(checkToDraft(r.check));
      })
      .catch(() => setNotFound(true));
  }, [checkId, isNew, resetDraft]);

  if (notFound) return <LoadingState text={s.ui_check_not_found} />;
  if (!isNew && !check) return <LoadingState />;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        await api.createCheck(draft);
      } else if (check) {
        await api.updateCheck(check.id, draft);
      }
      onClose();
    } catch (err) {
      const code = (err as { code?: string | null }).code ?? null;
      setError(code ?? "save_failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!check) return;
    if (!confirm(s.ui_check_delete_confirm)) return;
    setDeleting(true);
    try {
      await api.deleteCheck(check.id);
      onClose();
    } catch {
      setDeleting(false);
    }
  };

  return (
    <Stack>
      <TitleSection draft={draft} set={set} />
      <TargetSection draft={draft} set={set} />
      <ScheduleSection draft={draft} set={set} />
      <TimezoneSection draft={draft} set={set} />
      <QuestionSection draft={draft} set={set} />
      <ButtonsSection draft={draft} set={set} />
      <RepliesSection draft={draft} set={set} />
      <CounterSourceSection draft={draft} set={set} />
      <CounterValueSection draft={draft} set={set} />
      <CounterModeSection draft={draft} set={set} />
      <EnabledSection draft={draft} set={set} />

      {check && <CheckStatusCard check={check} />}

      {error && (
        <SectionFooter>{s.ui_check_save_validation_error(error)}</SectionFooter>
      )}

      <SaveButton
        saving={saving}
        dirty={true}
        disabled={saving || deleting}
        onClick={submit}
      />

      {check && (
        <Card>
          <DeleteButton disabled={saving || deleting} onClick={remove}>
            {s.ui_check_delete}
          </DeleteButton>
        </Card>
      )}
    </Stack>
  );
}
