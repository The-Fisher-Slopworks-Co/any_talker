// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState } from "react";
import { useI18n } from "../../i18n-context";
import { useDateFmt } from "../../datetime-context";
import { api, type FeedbackEntry, type FeedbackStatus } from "../../api-client";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../../components/layout";
import { LoadingState } from "../../components/states";
import { SegmentedField } from "../../components/segmented-field";
import { FeedbackThreads } from "../../components/feedback-threads";
import { TimeNote } from "../../components/time-note";
import { ROW_CLS, ROW_LABEL_CLS, ROW_VALUE_CLS } from "../../components/row";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className={ROW_CLS}>
      <span className={ROW_LABEL_CLS}>{label}</span>
      <span className={`${ROW_VALUE_CLS} break-all`}>{value}</span>
    </div>
  );
}

// One report, opened from the list. The fields, the text in full — the row cuts
// it to a preview — and the thread snapshots as the JSON they are stored as,
// each carrying the generation ids the turn ran on. Plus `status`, which the
// list deliberately leaves here: closing a report is what reading it concludes.
export function FeedbackView({ feedbackId }: { feedbackId: string }) {
  const { t: s } = useI18n();
  const { format } = useDateFmt();
  const [entry, setEntry] = useState<FeedbackEntry | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getFeedback(feedbackId)
      .then((r) => setEntry(r.entry))
      .catch(() => setNotFound(true));
  }, [feedbackId]);

  if (notFound) return <LoadingState text={s.ui_feedback_not_found} />;
  if (!entry) return <LoadingState />;

  // The control reads from the stored record, so a rejected write simply leaves
  // it where it was — there is nothing half-applied to undo.
  const setStatus = async (status: FeedbackStatus) => {
    if (busy || status === entry.status) return;
    setBusy(true);
    try {
      const r = await api.setFeedbackStatus(feedbackId, status);
      setEntry(r.entry);
    } catch {
      // Nothing was written; the segmented control stays on the stored value.
    } finally {
      setBusy(false);
    }
  };

  const user = entry.isGuest
    ? `${entry.userId} · ${s.ui_feedback_guest_marker}`
    : entry.userId;

  return (
    <Stack>
      <SectionHeader>{s.ui_feedback_record_header}</SectionHeader>
      <Card>
        <Field
          label={s.ui_feedback_field_sent}
          value={format(entry.createdAt)}
        />
        <Field label={s.ui_feedback_field_user} value={user} />
        <Field
          label={s.ui_feedback_field_chat}
          value={`${entry.chatId} · ${entry.chatType}`}
        />
        {/* `null` is the main bot, as everywhere `forBot` is scoped. */}
        <Field
          label={s.ui_feedback_field_bot}
          value={entry.botId ?? s.ui_facts_main_bot}
        />
        <Field label={s.ui_feedback_field_lang} value={entry.lang} />
        <Field
          label={s.ui_feedback_field_build}
          value={entry.build ?? s.ui_dash}
        />
        <Field
          label={s.ui_feedback_field_prompt_hash}
          value={entry.systemPromptHash}
        />
        <Field
          label={s.ui_feedback_field_pointed_at}
          value={
            entry.pointedAt
              ? s.ui_feedback_pointed_value(
                  entry.pointedAt.chatId,
                  entry.pointedAt.botMsgId,
                )
              : s.ui_dash
          }
        />
      </Card>
      <SectionFooter>
        <TimeNote />
      </SectionFooter>

      <SectionHeader>{s.ui_feedback_status_header}</SectionHeader>
      <SegmentedField
        value={entry.status}
        options={[
          { value: "new" as const, label: s.ui_feedback_status_new },
          { value: "closed" as const, label: s.ui_feedback_status_closed },
        ]}
        onChange={(next) => void setStatus(next)}
      />
      <SectionFooter>{s.ui_feedback_status_footer}</SectionFooter>

      <SectionHeader>{s.ui_feedback_text_header}</SectionHeader>
      <Card>
        <div className="px-4 py-[11px] text-[15px] whitespace-pre-wrap break-words">
          {entry.text}
        </div>
      </Card>

      <SectionHeader>{s.ui_feedback_threads_header}</SectionHeader>
      <FeedbackThreads
        threads={entry.threads}
        pointedAt={entry.pointedAt ?? null}
      />
      <SectionFooter>{s.ui_feedback_threads_footer}</SectionFooter>

      <SectionHeader>{s.ui_feedback_prompt_header}</SectionHeader>
      <Card>
        <pre className="max-h-80 overflow-auto p-4 text-[12px] leading-[1.4] whitespace-pre-wrap break-words select-all">
          {entry.systemPrompt}
        </pre>
      </Card>
      <SectionFooter>{s.ui_feedback_prompt_footer}</SectionFooter>
    </Stack>
  );
}
