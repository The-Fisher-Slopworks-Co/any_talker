// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ReactNode } from "react";
import { useI18n } from "../../i18n-context";
import { useDateFmt } from "../../datetime-context";
import {
  isValidCounterMode,
  type RecurringCheck,
  type ValidationError,
} from "../../../../checks/types";
import { Card, SectionFooter, SectionHeader } from "../../components/layout";
import { NumberRow } from "../../components/number-row";
import { SwitchRow } from "../../components/switch-row";
import { AreaRow, TextRow } from "../../components/text-row";
import { TimezonePickerRow } from "../../components/timezone-picker-row";
import { ValueSelectRow } from "../../components/value-select-row";
import { ROW_CLS, ROW_LABEL_CLS, ROW_VALUE_CLS } from "../../components/row";
import type { FormSetter } from "../../lib/use-form-reducer";
import {
  anchorForSource,
  errorGroup,
  formatAnchorDate,
  formatClock,
  parseClock,
  type CheckDraft,
  type CheckGroup,
} from "./check-edit-form";

// Every section edits the one draft. `set` changes the form (a field being
// typed in), `commit` is what such a field does when it is left, and `setNow`
// is `set` plus `commit` for a switch or picker that is done once chosen.
// `error` is the form's first refused field.
type SectionProps = {
  draft: CheckDraft;
  set: FormSetter<CheckDraft>;
  setNow: FormSetter<CheckDraft>;
  commit: () => void;
  error: ValidationError | null;
};

// The group's footer: its hint, or in red the error of a field in the group.
function GroupFooter({
  group,
  error,
  children,
}: {
  group: CheckGroup;
  error: ValidationError | null;
  children?: ReactNode;
}) {
  const { t: s } = useI18n();
  if (error !== null && errorGroup(error) === group) {
    return (
      <SectionFooter>
        <span className="text-tg-destructive">{s.ui_check_error(error)}</span>
      </SectionFooter>
    );
  }
  return children ? <SectionFooter>{children}</SectionFooter> : null;
}

export function EnabledSection({ draft, setNow }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <div className="section-gap">
      <Card>
        <SwitchRow
          label={s.ui_check_enabled_label}
          value={draft.enabled}
          onChange={(v) => setNow("enabled", v)}
        />
      </Card>
    </div>
  );
}

export function QuestionSection({ draft, set, commit, error }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{s.ui_check_question}</SectionHeader>
      <Card>
        <TextRow
          label={s.ui_check_title}
          placeholder={s.ui_check_title_placeholder}
          value={draft.title}
          onChange={(v) => set("title", v)}
          onCommit={commit}
          maxLength={120}
        />
        <AreaRow
          label={s.ui_check_question}
          placeholder={s.ui_check_question_placeholder}
          value={draft.question}
          onChange={(v) => set("question", v)}
          onCommit={commit}
          minHeight="min-h-[76px]"
        />
      </Card>
      <GroupFooter group="question" error={error}>
        {s.ui_check_question_footer}
      </GroupFooter>
    </>
  );
}

export function RecipientSection({ draft, set, commit, error }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{s.ui_check_recipient}</SectionHeader>
      <Card>
        <TextRow
          label={s.ui_check_chat_id}
          placeholder={s.ui_check_chat_id_placeholder}
          value={draft.chatId}
          onChange={(v) => set("chatId", v)}
          onCommit={commit}
        />
        <TextRow
          label={s.ui_check_target_user_id}
          placeholder={s.ui_check_target_user_id_placeholder}
          value={draft.targetUserId}
          onChange={(v) => set("targetUserId", v)}
          onCommit={commit}
        />
        <TextRow
          label={s.ui_check_target_name}
          placeholder={s.ui_check_target_name_placeholder}
          value={draft.targetName}
          onChange={(v) => set("targetName", v)}
          onCommit={commit}
          maxLength={64}
        />
      </Card>
      <GroupFooter group="recipient" error={error}>
        {s.ui_check_target_name_footer}
      </GroupFooter>
    </>
  );
}

// A time or date as a row. The value is shown in the app's own format and the
// platform's picker lies invisibly over it: a native time/date input has an
// intrinsic width and its own format, and overflows a narrow card.
function PickerRow({
  label,
  type,
  shown,
  value,
  onChange,
}: {
  label: string;
  type: "time" | "date";
  shown?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className={ROW_CLS}>
      <span className={ROW_LABEL_CLS}>{label}</span>
      <span className="relative flex flex-1 min-w-0 justify-end">
        <span>{shown ?? value}</span>
        <input
          type={type}
          required
          className="absolute inset-0 h-full w-full min-w-0 opacity-0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onClick={(e) => e.currentTarget.showPicker?.()}
        />
      </span>
    </label>
  );
}

export function ScheduleSection({ draft, set, setNow, error }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{s.ui_check_schedule_header}</SectionHeader>
      <Card>
        <PickerRow
          label={s.ui_check_schedule}
          type="time"
          value={formatClock(draft.scheduleHour, draft.scheduleMinute)}
          onChange={(v) => {
            const clock = parseClock(v);
            if (!clock) return;
            set("scheduleHour", clock.hour);
            setNow("scheduleMinute", clock.minute);
          }}
        />
        <TimezonePickerRow
          value={draft.timezone}
          onChange={(tz) => {
            if (tz !== null) setNow("timezone", tz);
          }}
          emptyLabel={null}
        />
        <NumberRow
          label={s.ui_check_timeout}
          suffix={s.ui_check_timeout_unit}
          value={draft.timeoutMinutes}
          onCommit={(n) => setNow("timeoutMinutes", n)}
          integer
          min={1}
          max={24 * 60}
        />
      </Card>
      <GroupFooter group="schedule" error={error}>
        {s.ui_check_timeout_footer}
      </GroupFooter>
    </>
  );
}

export function ButtonsSection({ draft, set, commit, error }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{s.ui_check_buttons}</SectionHeader>
      <Card>
        <TextRow
          label={s.ui_check_yes_button}
          placeholder=""
          value={draft.yesButton}
          onChange={(v) => set("yesButton", v)}
          onCommit={commit}
          maxLength={32}
        />
        <TextRow
          label={s.ui_check_no_button}
          placeholder=""
          value={draft.noButton}
          onChange={(v) => set("noButton", v)}
          onCommit={commit}
          maxLength={32}
        />
      </Card>
      <GroupFooter group="buttons" error={error} />
    </>
  );
}

export function RepliesSection({ draft, set, commit, error }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{s.ui_check_replies}</SectionHeader>
      <Card>
        <AreaRow
          label={s.ui_check_yes_reply}
          showLabel
          placeholder={s.ui_check_yes_reply_placeholder}
          value={draft.yesReply}
          onChange={(v) => set("yesReply", v)}
          onCommit={commit}
          minHeight="min-h-[76px]"
        />
        <AreaRow
          label={s.ui_check_no_reply}
          showLabel
          placeholder={s.ui_check_no_reply_placeholder}
          value={draft.noReply}
          onChange={(v) => set("noReply", v)}
          onCommit={commit}
          minHeight="min-h-[76px]"
        />
      </Card>
      <GroupFooter group="replies" error={error}>
        {s.ui_check_replies_footer}
      </GroupFooter>
    </>
  );
}

// The counter is either kept by hand or derived from a start date.
export function CounterSection({ draft, setNow, error }: SectionProps) {
  const { t: s, lang } = useI18n();
  const byDate = draft.counterAnchorDate !== null;
  return (
    <>
      <SectionHeader>{s.ui_check_counter}</SectionHeader>
      <Card>
        <ValueSelectRow
          label={s.ui_check_counter_source}
          value={byDate ? "date" : "manual"}
          onChange={(v) =>
            setNow(
              "counterAnchorDate",
              anchorForSource(
                v === "date",
                draft.counterAnchorDate,
                draft.timezone,
              ),
            )
          }
        >
          <option value="manual">{s.ui_check_counter_source_manual}</option>
          <option value="date">{s.ui_check_counter_source_date}</option>
        </ValueSelectRow>
        {draft.counterAnchorDate === null ? (
          <NumberRow
            label={s.ui_check_counter_value}
            value={draft.counter}
            onCommit={(n) => setNow("counter", n)}
            integer
            min={0}
          />
        ) : (
          <PickerRow
            label={s.ui_check_counter_anchor_date}
            type="date"
            shown={formatAnchorDate(draft.counterAnchorDate, lang)}
            value={draft.counterAnchorDate}
            onChange={(v) => {
              // Clearing the native field must not switch the source back.
              if (v) setNow("counterAnchorDate", v);
            }}
          />
        )}
        <ValueSelectRow
          label={s.ui_check_counter_mode}
          value={draft.counterMode}
          onChange={(v) => {
            if (isValidCounterMode(v)) setNow("counterMode", v);
          }}
        >
          <option value="always_increment">
            {s.ui_check_counter_mode_always}
          </option>
          <option value="reset_on_yes">{s.ui_check_counter_mode_reset}</option>
        </ValueSelectRow>
      </Card>
      <GroupFooter group="counter" error={error}>
        {byDate
          ? s.ui_check_counter_anchor_date_footer
          : s.ui_check_counter_footer}
      </GroupFooter>
    </>
  );
}

// Runtime state of a saved check — nothing here is editable.
export function CheckStatusCard({ check }: { check: RecurringCheck }) {
  const { t: s } = useI18n();
  const { short } = useDateFmt();
  return (
    <>
      <SectionHeader>{s.ui_checks_status}</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_check_last_fired}</span>
          <span className={ROW_VALUE_CLS}>
            {check.lastFiredAtMs
              ? short(check.lastFiredAtMs)
              : s.ui_check_last_fired_never}
          </span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_check_pending}</span>
          <span className={ROW_VALUE_CLS}>
            {check.pendingMessageId !== null
              ? s.ui_check_pending_yes
              : s.ui_check_pending_no}
          </span>
        </div>
      </Card>
    </>
  );
}
