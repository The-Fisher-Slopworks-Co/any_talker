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
import { ActionRow } from "./controls";
import { Card, SectionFooter, Stack } from "./layout";
import { ROW_CLS, ROW_LABEL_CLS, ROW_VALUE_CLS } from "./row";
import { NavRow } from "./select-row";
import { Sheet, SheetButton, useSheet } from "./sheet";
import { TimeNote } from "./time-note";
import { useDelayedFlag } from "../lib/use-delayed-flag";

const TEXTAREA_CLS =
  "block w-full box-border bg-transparent border-0 px-4 py-3 text-base min-h-[110px] resize-none";
// The picked time, in a grey pill as iOS shows a date in a form row.
const WHEN_CLS =
  "relative ml-auto min-w-0 truncate rounded-lg bg-tg-secondary px-3 py-1 text-base text-tg-text";

// The `datetime-local` value for an instant, read in the timezone the rest of
// the Web App shows timestamps in.
function toDateTimeInput(ms: number, tz: string): string {
  return localDateTimeString(ms, tz).replace(" ", "T");
}

// The admin's editor for one reminder, as a sheet: time and note in one card,
// where and whose below, the delete apart at the bottom. A saved or deleted
// reminder is handed back once the sheet has slid away; only changes are sent.
export function ReminderEditForm({
  reminder,
  where,
  author,
  onUserClick,
  onSaved,
  onDeleted,
  onClose,
}: {
  reminder: Reminder;
  // Where it fires and who set it, as the list names them.
  where: string;
  author: string;
  onUserClick?: ((userId: string) => void) | undefined;
  onSaved: (next: Reminder) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const { t: s } = useI18n();
  const { timezone, short } = useDateFmt();
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const initialWhen = toDateTimeInput(reminder.fireAtMs, tz);
  const [text, setText] = useState(reminder.text);
  const [when, setWhen] = useState(initialWhen);
  // Which request is in flight: only a save turns Save into "Saving…".
  const [action, setAction] = useState<"save" | "delete" | null>(null);
  const busy = action !== null;
  const showSaving = useDelayedFlag(action === "save");
  const [error, setError] = useState<string | null>(null);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const { closing, dismiss, cancel } = useSheet(onClose);

  // The pill shows the app's format; the too-wide native input lies over it.
  const picked = parseAbsoluteDateTimeMs(when, tz);
  const run = async (fn: () => Promise<void>, deleting = false) => {
    setAction(deleting ? "delete" : "save");
    setError(null);
    setDeleteFailed(false);
    try {
      await fn();
    } catch (err) {
      if (deleting) setDeleteFailed(true);
      else setError((err as { code?: string | null }).code ?? "save_failed");
      setAction(null);
    }
  };

  const save = () => {
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
      cancel();
      return;
    }
    void run(async () => {
      const { reminder: next } = await api.updateAdminReminder(
        reminder.id,
        patch,
      );
      dismiss(() => onSaved(next));
    });
  };

  const remove = () => {
    if (!confirm(s.ui_reminders_delete_confirm)) return;
    void run(async () => {
      await api.deleteAdminReminder(reminder.id);
      dismiss(() => onDeleted(reminder.id));
    }, true);
  };

  return (
    <Sheet
      title={s.ui_reminders_sheet_title}
      closing={closing}
      busy={busy}
      onCancel={cancel}
      leading={
        <SheetButton disabled={busy} onClick={cancel}>
          {s.ui_reminders_cancel}
        </SheetButton>
      }
      trailing={
        <SheetButton
          bold
          disabled={busy || text.trim() === "" || when === ""}
          onClick={save}
        >
          {showSaving ? s.ui_saving : s.ui_save}
        </SheetButton>
      }
    >
      <Stack>
        <Card>
          <label className={ROW_CLS}>
            <span className={ROW_LABEL_CLS}>
              {s.ui_reminders_fire_at_label}
            </span>
            <span className={WHEN_CLS}>
              {picked.ok ? short(picked.ms) : "—"}
              <input
                type="datetime-local"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
              />
            </span>
          </label>
          {/* The hairline above is drawn by `.row::before`, which a textarea
              cannot render, so the row wraps it. */}
          <div className="row relative">
            <textarea
              className={TEXTAREA_CLS}
              value={text}
              maxLength={REMINDER_TEXT_MAX_LEN}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
        </Card>
        <SectionFooter>
          {error ? (
            <span className="text-tg-destructive">
              {error === "fire_at_too_soon"
                ? s.ui_reminders_fire_at_too_soon
                : s.ui_reminders_save_error(error)}
            </span>
          ) : (
            <TimeNote />
          )}
        </SectionFooter>
        <div className="section-gap">
          <Card>
            <div className={ROW_CLS}>
              <span className={ROW_LABEL_CLS}>{s.ui_chat_chat}</span>
              <span className={`${ROW_VALUE_CLS} min-w-0 truncate`}>
                {where}
              </span>
            </div>
            {onUserClick && (
              <NavRow
                title={s.ui_reminders_open_user}
                subtitle={author}
                onClick={() => onUserClick(reminder.userId)}
              />
            )}
          </Card>
        </div>
        <div className="section-gap">
          <Card>
            <ActionRow centered destructive disabled={busy} onClick={remove}>
              {s.ui_reminders_delete_button}
            </ActionRow>
          </Card>
        </div>
        {deleteFailed && (
          <SectionFooter>
            <span className="text-tg-destructive">
              {s.ui_reminders_delete_error}
            </span>
          </SectionFooter>
        )}
      </Stack>
    </Sheet>
  );
}
