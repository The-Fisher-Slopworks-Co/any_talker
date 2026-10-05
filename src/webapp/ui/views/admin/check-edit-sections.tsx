// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../../i18n-context";
import { useDateFmt } from "../../datetime-context";
import { TimeNote } from "../../components/time-note";
import type { RecurringCheck } from "../../../../checks/types";
import { localDateString } from "../../../../shared/tz";
import { Card, SectionFooter, SectionHeader } from "../../components/layout";
import { NumberInput, Toggle } from "../../components/controls";
import { NumberRow } from "../../components/number-row";
import { SelectRow } from "../../components/select-row";
import { AreaRow, TextRow } from "../../components/text-row";
import { TimezonePickerRow } from "../../components/timezone-picker-row";
import {
  INPUT_CLS,
  ROW_CLS,
  ROW_LABEL_CLS,
  ROW_VALUE_CLS,
} from "../../components/row";
import type { FormSetter } from "../../lib/use-form-reducer";
import { formatClock, parseClock, type CheckDraft } from "./check-edit-form";

const TEXTAREA_CLS =
  "block w-full box-border bg-transparent border-0 px-4 py-3 text-base min-h-[100px]";
// Every section edits the one draft. `set` changes the form (a field being
// typed in), `commit` is what such a field does when it is left, and `setNow`
// is `set` plus `commit` for a switch or picker that is done once chosen.
type SectionProps = {
  draft: CheckDraft;
  set: FormSetter<CheckDraft>;
  setNow: FormSetter<CheckDraft>;
  commit: () => void;
};

export function QuestionSection({ draft, set, commit }: SectionProps) {
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
      <SectionFooter>{s.ui_check_question_footer}</SectionFooter>
    </>
  );
}

export function RecipientSection({ draft, set, commit }: SectionProps) {
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
      <SectionFooter>{s.ui_check_target_name_footer}</SectionFooter>
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

export function ScheduleSection({ draft, set, setNow }: SectionProps) {
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
      <SectionFooter>{s.ui_check_timeout_footer}</SectionFooter>
    </>
  );
}

export function ButtonsSection({ draft, set }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{s.ui_check_yes_button}</SectionHeader>
      <Card>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_check_yes_button}</span>
          <input
            className={INPUT_CLS}
            value={draft.yesButton}
            onChange={(e) => set("yesButton", e.target.value)}
            maxLength={32}
          />
        </label>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_check_no_button}</span>
          <input
            className={INPUT_CLS}
            value={draft.noButton}
            onChange={(e) => set("noButton", e.target.value)}
            maxLength={32}
          />
        </label>
      </Card>
    </>
  );
}

export function RepliesSection({ draft, set }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{s.ui_check_yes_reply}</SectionHeader>
      <Card>
        <textarea
          className={TEXTAREA_CLS}
          placeholder={s.ui_check_yes_reply_placeholder}
          value={draft.yesReply}
          onChange={(e) => set("yesReply", e.target.value)}
        />
      </Card>

      <SectionHeader>{s.ui_check_no_reply}</SectionHeader>
      <Card>
        <textarea
          className={TEXTAREA_CLS}
          placeholder={s.ui_check_no_reply_placeholder}
          value={draft.noReply}
          onChange={(e) => set("noReply", e.target.value)}
        />
      </Card>
      <SectionFooter>{s.ui_check_replies_footer}</SectionFooter>
    </>
  );
}

// The counter is either kept by hand or derived from a start date; picking the
// date source seeds it with today so the second choice is never empty.
export function CounterSourceSection({ draft, set }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{s.ui_check_counter_source}</SectionHeader>
      <Card>
        <SelectRow
          label={s.ui_check_counter_source_manual}
          selected={draft.counterAnchorDate === null}
          onSelect={() => set("counterAnchorDate", null)}
        />
        <SelectRow
          label={s.ui_check_counter_source_date}
          selected={draft.counterAnchorDate !== null}
          onSelect={() => {
            if (draft.counterAnchorDate === null) {
              set(
                "counterAnchorDate",
                localDateString(Date.now(), draft.timezone),
              );
            }
          }}
        />
      </Card>
    </>
  );
}

export function CounterValueSection({ draft, set }: SectionProps) {
  const { t: s } = useI18n();
  if (draft.counterAnchorDate === null) {
    return (
      <>
        <SectionHeader>{s.ui_check_counter}</SectionHeader>
        <Card>
          <label className={ROW_CLS}>
            <span className={ROW_LABEL_CLS}>{s.ui_check_counter}</span>
            <NumberInput
              className={INPUT_CLS}
              integer
              min={0}
              value={draft.counter}
              onChange={(n) => set("counter", n)}
            />
          </label>
        </Card>
        <SectionFooter>{s.ui_check_counter_footer}</SectionFooter>
      </>
    );
  }
  return (
    <>
      <SectionHeader>{s.ui_check_counter_anchor_date}</SectionHeader>
      <Card>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>
            {s.ui_check_counter_anchor_date}
          </span>
          <input
            type="date"
            className={INPUT_CLS}
            value={draft.counterAnchorDate}
            onChange={(e) => set("counterAnchorDate", e.target.value || null)}
          />
        </label>
      </Card>
      <SectionFooter>{s.ui_check_counter_anchor_date_footer}</SectionFooter>
    </>
  );
}

export function CounterModeSection({ draft, set }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{s.ui_check_counter_mode}</SectionHeader>
      <Card>
        <SelectRow
          label={s.ui_check_counter_mode_always}
          selected={draft.counterMode === "always_increment"}
          onSelect={() => set("counterMode", "always_increment")}
        />
        <SelectRow
          label={s.ui_check_counter_mode_reset}
          selected={draft.counterMode === "reset_on_yes"}
          onSelect={() => set("counterMode", "reset_on_yes")}
        />
      </Card>
    </>
  );
}

export function EnabledSection({ draft, set }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{s.ui_check_enabled_label}</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_check_enabled_label}</span>
          <span className="flex-1" />
          <Toggle value={draft.enabled} onChange={(v) => set("enabled", v)} />
        </div>
      </Card>
    </>
  );
}

// Runtime state of a saved check — nothing here is editable.
export function CheckStatusCard({ check }: { check: RecurringCheck }) {
  const { t: s } = useI18n();
  const { format } = useDateFmt();
  const lastFiredText = check.lastFiredAtMs
    ? format(check.lastFiredAtMs)
    : s.ui_check_last_fired_never;
  return (
    <>
      <SectionHeader>{s.ui_check_last_fired}</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_check_last_fired}</span>
          <span className={ROW_VALUE_CLS}>{lastFiredText}</span>
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
      <SectionFooter>
        <TimeNote />
      </SectionFooter>
    </>
  );
}
