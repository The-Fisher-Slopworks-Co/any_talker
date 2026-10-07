// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { useI18n } from "../../i18n-context";
import { useDateFmt } from "../../datetime-context";
import {
  api,
  type FeedbackEntry,
  type FeedbackNames,
  type FeedbackStatus,
} from "../../api-client";
import { ActionRow } from "../../components/controls";
import { CodeBlock, FeedbackThreads } from "../../components/feedback-threads";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../../components/layout";
import { ROW_CLS, ROW_LABEL_CLS, ROW_VALUE_CLS } from "../../components/row";
import { SaveStatus } from "../../components/save-status";
import { NavRow } from "../../components/select-row";
import { LoadingState } from "../../components/states";
import { TimeNote } from "../../components/time-note";
import { ValueSelectRow } from "../../components/value-select-row";
import { feedbackAuthor } from "../../lib/labels";
import { useAutosave } from "../../lib/use-autosave";
import { useFailureToast } from "../../lib/use-failure-toast";
import { useLoadable } from "../../lib/use-loadable";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className={ROW_CLS}>
      <span className={ROW_LABEL_CLS}>{label}</span>
      <span className={`${ROW_VALUE_CLS} break-all`}>{value}</span>
    </div>
  );
}

// A loaded report: text, status picker, fields, threads, prompt and delete.
export function FeedbackReport({
  entry,
  names,
  status,
  deleting,
  onStatus,
  onOpenUser,
  onOpenChat,
  onDelete,
}: {
  entry: FeedbackEntry;
  names: FeedbackNames;
  // What the picker shows, which can be ahead of `entry.status` while saving.
  status: FeedbackStatus;
  deleting: boolean;
  onStatus: (next: FeedbackStatus) => void;
  onOpenUser: (id: string) => void;
  onOpenChat: (id: string) => void;
  onDelete: () => void;
}) {
  const { t: s } = useI18n();
  const { short } = useDateFmt();
  const author = feedbackAuthor(s, { ...names, ...entry });

  return (
    <Stack>
      <Card>
        <div className="px-4 py-[11px] text-[20px] leading-[26px] font-semibold whitespace-pre-wrap break-words">
          {entry.text}
        </div>
      </Card>

      <div className="section-gap">
        <Card>
          <ValueSelectRow
            label={s.ui_feedback_status_header}
            value={status}
            onChange={(next) => onStatus(next as FeedbackStatus)}
          >
            <option value="new">{s.ui_feedback_status_new}</option>
            <option value="closed">{s.ui_feedback_status_closed}</option>
          </ValueSelectRow>
        </Card>
      </div>

      <SectionHeader>{s.ui_feedback_record_header}</SectionHeader>
      <Card>
        <Field
          label={s.ui_feedback_field_sent}
          value={short(entry.createdAt)}
        />
        {entry.isGuest ? (
          <Field label={s.ui_feedback_field_user} value={author} />
        ) : (
          <NavRow
            title={s.ui_feedback_field_user}
            value={author}
            onClick={() => onOpenUser(entry.userId)}
          />
        )}
        <NavRow
          title={s.ui_feedback_field_chat}
          value={names.chatTitle ?? `${entry.chatId} · ${entry.chatType}`}
          onClick={() => onOpenChat(entry.chatId)}
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

      <SectionHeader>{s.ui_feedback_threads_header}</SectionHeader>
      <FeedbackThreads
        threads={entry.threads}
        pointedAt={entry.pointedAt ?? null}
        chatId={entry.chatId}
        chatTitle={names.chatTitle}
      />
      <SectionFooter>{s.ui_feedback_threads_footer}</SectionFooter>

      <SectionHeader>{s.ui_feedback_prompt_header}</SectionHeader>
      <Card>
        <div className="pt-[11px]">
          <CodeBlock wrap>{entry.systemPrompt}</CodeBlock>
        </div>
      </Card>
      <SectionFooter>{s.ui_feedback_prompt_footer}</SectionFooter>

      <div className="section-gap">
        <Card>
          <ActionRow destructive disabled={deleting} onClick={onDelete}>
            {s.ui_feedback_delete_report}
          </ActionRow>
        </Card>
      </div>
    </Stack>
  );
}

export function feedbackReportLoad(feedbackId: string) {
  return {
    key: `feedback-report:${feedbackId}`,
    load: () => api.getFeedback(feedbackId),
  };
}

// One report, opened from the list. The status saves on change, and the report
// can be deleted from here as well as by swiping it away in the list.
export function FeedbackView({
  feedbackId,
  onOpenUser,
  onOpenChat,
  onDeleted,
}: {
  feedbackId: string;
  onOpenUser: (id: string) => void;
  onOpenChat: (id: string) => void;
  // The report is gone, so there is nothing left to show.
  onDeleted: () => void;
}) {
  const { t: s } = useI18n();
  const {
    data: report,
    setData: setReport,
    error: notFound,
  } = useLoadable(feedbackReportLoad(feedbackId));
  // What the picker shows: the stored status until it is changed, then the
  // choice, put back to the stored one if the write is refused.
  const [picked, setPicked] = useState<FeedbackStatus | null>(null);
  const deleteToast = useFailureToast();
  const [deleting, setDeleting] = useState(false);

  const { save, status } = useAutosave<
    FeedbackStatus,
    { entry: FeedbackEntry }
  >({
    send: (next) => api.setFeedbackStatus(feedbackId, next),
    onSaved: (r) => setReport((prev) => prev && { ...prev, entry: r.entry }),
    onFailed: () => setPicked(null),
  });

  if (!report)
    return notFound ? (
      <LoadingState text={s.ui_feedback_not_found} />
    ) : (
      <LoadingState />
    );

  const remove = async () => {
    // A report holds the only copy of its thread snapshot.
    if (deleting || !confirm(s.ui_feedback_delete_confirm)) return;
    setDeleting(true);
    try {
      await api.deleteFeedback(feedbackId);
      onDeleted();
    } catch {
      deleteToast.fail();
      setDeleting(false);
    }
  };

  return (
    <>
      <FeedbackReport
        entry={report.entry}
        names={report.names}
        status={picked ?? report.entry.status}
        deleting={deleting}
        onStatus={(next) => {
          setPicked(next);
          save(next);
        }}
        onOpenUser={onOpenUser}
        onOpenChat={onOpenChat}
        onDelete={() => void remove()}
      />
      <SaveStatus
        status={deleteToast.status === "failed" ? "failed" : status}
      />
    </>
  );
}
