// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import type { RecurringCheck, ValidationError } from "../../../../checks/types";
import { Card, Stack } from "../../components/layout";
import { LoadingState } from "../../components/states";
import { ActionRow } from "../../components/controls";
import { SaveStatus } from "../../components/save-status";
import { useAutosave } from "../../lib/use-autosave";
import { useFormReducer, type FormSetter } from "../../lib/use-form-reducer";
import {
  checkToDraft,
  DEFAULT_DRAFT,
  planSave,
  revertDraft,
  withServerCounter,
  type CheckDraft,
} from "./check-edit-form";
import {
  ButtonsSection,
  CheckStatusCard,
  CounterSection,
  EnabledSection,
  QuestionSection,
  RepliesSection,
  ScheduleSection,
  RecipientSection,
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
  const [deleting, setDeleting] = useState(false);
  // The form's first field the server would refuse.
  const [error, setError] = useState<ValidationError | null>(null);
  const [draft, , resetDraft] = useFormReducer(DEFAULT_DRAFT);

  // The form as the last edit left it, ahead of what has rendered, so edits
  // made in the same event (a time's hour and minute) build on each other.
  const latest = useRef(draft);
  const apply = useCallback(
    (next: CheckDraft) => {
      latest.current = next;
      resetDraft(next);
    },
    [resetDraft],
  );
  // The runner moves a check's counter on its own, so the counter the server
  // holds is what gets sent, until the admin edits it here and it is saved.
  const counterEdited = useRef(false);
  const queued = useRef(false);
  // The form last sent: changes are compared with it, not with the server's
  // reply, which can be behind (on, then off again before the first reply).
  const lastSent = useRef<CheckDraft | null>(null);

  // A saved check saves itself: each change sends the whole form, one request
  // at a time. A new one is created by its Create row, through the same queue.
  const { save, flush, status } = useAutosave<CheckDraft, RecurringCheck>({
    send: async (payload) =>
      (check
        ? await api.updateCheck(check.id, payload)
        : await api.createCheck(payload)
      ).check,
    onSaved: (saved) => {
      if (!check) return onClose();
      setCheck(saved);
      const form = latest.current;
      if (
        saved.counter === form.counter &&
        (saved.counterAnchorDate ?? null) === form.counterAnchorDate
      ) {
        counterEdited.current = false;
      }
      apply(withServerCounter(form, saved, counterEdited.current));
    },
    onFailed: (failed) => {
      lastSent.current = null;
      if (check)
        apply(revertDraft(latest.current, checkToDraft(check), failed));
    },
  });

  useEffect(() => {
    lastSent.current = null;
    counterEdited.current = false;
    if (isNew) {
      setCheck(null);
      apply(DEFAULT_DRAFT);
      return;
    }
    api
      .getCheck(checkId)
      .then((r) => {
        setCheck(r.check);
        apply(checkToDraft(r.check));
      })
      .catch(() => setNotFound(true));
  }, [checkId, isNew, apply]);

  if (notFound) return <LoadingState text={s.ui_check_not_found} />;
  if (!isNew && !check) return <LoadingState />;

  // Validates and sends the form, once after the edits of one event.
  const run = () => {
    queued.current = false;
    if (!check) {
      // Nothing is saved until Create; an error shown clears once fixed.
      if (error) setError(planSave(latest.current, null).error);
      return;
    }
    const edited = counterEdited.current;
    const plan = planSave(
      withServerCounter(latest.current, check, edited),
      lastSent.current
        ? withServerCounter(lastSent.current, check, edited)
        : checkToDraft(check),
    );
    apply(plan.draft);
    setError(plan.error);
    if (plan.payload) {
      lastSent.current = plan.payload;
      save(plan.payload);
    }
  };
  const commit = () => {
    if (queued.current) return;
    queued.current = true;
    queueMicrotask(run);
  };
  const set: FormSetter<CheckDraft> = (key, value) => {
    if (key === "counter" || key === "counterAnchorDate") {
      counterEdited.current = true;
    }
    apply({ ...latest.current, [key]: value });
  };
  const setNow: FormSetter<CheckDraft> = (key, value) => {
    set(key, value);
    commit();
  };

  const create = () => {
    const plan = planSave(latest.current, null);
    setError(plan.error);
    if (plan.payload) save(plan.payload);
  };

  const remove = async () => {
    if (!check) return;
    if (!confirm(s.ui_check_delete_confirm)) return;
    setDeleting(true);
    try {
      // A save still on its way must land first, or it could undo the delete.
      await flush();
      await api.deleteCheck(check.id);
      onClose();
    } catch {
      setDeleting(false);
    }
  };

  const sectionProps = { draft, set, setNow, commit, error };
  return (
    <Stack>
      <EnabledSection {...sectionProps} />
      <QuestionSection {...sectionProps} />
      <RecipientSection {...sectionProps} />
      <ScheduleSection {...sectionProps} />
      <ButtonsSection {...sectionProps} />
      <RepliesSection {...sectionProps} />
      <CounterSection {...sectionProps} />

      {check && <CheckStatusCard check={check} />}
      <SaveStatus status={status} />

      {!check && (
        <div className="section-gap">
          <Card>
            <ActionRow bold disabled={status === "saving"} onClick={create}>
              {s.ui_check_create}
            </ActionRow>
          </Card>
        </div>
      )}

      {check && (
        <div className="section-gap">
          <Card>
            <ActionRow destructive disabled={deleting} onClick={remove}>
              {s.ui_check_delete}
            </ActionRow>
          </Card>
        </div>
      )}
    </Stack>
  );
}
