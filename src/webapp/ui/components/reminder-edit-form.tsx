// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { useI18n } from "../i18n-context";
import { useDateFmt } from "../datetime-context";
import { api } from "../api-client";
import { REMINDER_TEXT_MAX_LEN, type Reminder } from "../../../reminders/types";
import {
  localDateTimeString,
  parseAbsoluteDateTimeMs,
} from "../../../shared/tz";
import { INPUT_CLS, ROW_CLS, ROW_LABEL_CLS } from "./row";

const TEXTAREA_CLS =
  "block w-full box-border bg-transparent border-0 px-4 py-3 text-base min-h-[80px]";
const EDIT_BTN_CLS =
  "bg-transparent border-0 p-0 text-base font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

// The `datetime-local` value for an instant, read in the timezone the rest of
// the Web App shows timestamps in.
function toDateTimeInput(ms: number, tz: string): string {
  return localDateTimeString(ms, tz).replace(" ", "T");
}

// Inline admin editor for one reminder's note and fire time. Renders as rows
// inside the parent Card; only the fields that changed are sent.
export function ReminderEditForm({
  reminder,
  onSaved,
  onCancel,
}: {
  reminder: Reminder;
  onSaved: (next: Reminder) => void;
  onCancel: () => void;
}) {
  const { t: s } = useI18n();
  const { timezone } = useDateFmt();
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const initialWhen = toDateTimeInput(reminder.fireAtMs, tz);
  const [text, setText] = useState(reminder.text);
  const [when, setWhen] = useState(initialWhen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const patch: { text?: string; fireAtMs?: number } = {};
    if (text.trim() !== reminder.text) patch.text = text;
    if (when !== initialWhen) {
      const parsed = parseAbsoluteDateTimeMs(when, tz);
      if (!parsed.ok) {
        setError("invalid_fire_at");
        return;
      }
      patch.fireAtMs = parsed.ms;
    }
    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSaved((await api.updateAdminReminder(reminder.id, patch)).reminder);
    } catch (err) {
      setError((err as { code?: string | null }).code ?? "save_failed");
      setBusy(false);
    }
  };

  return (
    <div>
      <label className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_reminders_fire_at_label}</span>
        <input
          type="datetime-local"
          className={INPUT_CLS}
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
      </label>
      <textarea
        className={TEXTAREA_CLS}
        value={text}
        maxLength={REMINDER_TEXT_MAX_LEN}
        onChange={(e) => setText(e.target.value)}
      />
      {error ? (
        <div className="px-4 pb-2 text-[13px] text-tg-destructive">
          {error === "fire_at_too_soon"
            ? s.ui_reminders_fire_at_too_soon
            : s.ui_reminders_save_error(error)}
        </div>
      ) : null}
      <div className={ROW_CLS}>
        <button
          type="button"
          className={`${EDIT_BTN_CLS} text-tg-link`}
          disabled={busy || text.trim() === "" || when === ""}
          onClick={() => void save()}
        >
          {busy ? s.ui_saving : s.ui_save}
        </button>
        <button
          type="button"
          className={`${EDIT_BTN_CLS} text-tg-hint`}
          disabled={busy}
          onClick={onCancel}
        >
          {s.ui_reminders_cancel}
        </button>
      </div>
    </div>
  );
}
