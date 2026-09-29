// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../../i18n-context";
import { useDateFmt } from "../../datetime-context";
import { TimeNote } from "../../components/time-note";
import type { RecurringCheck } from "../../../../checks/types";
import { localDateString } from "../../../../shared/tz";
import { Card, SectionFooter, SectionHeader } from "../../components/layout";
import { NumberInput, Toggle } from "../../components/controls";
import { SelectRow } from "../../components/select-row";
import { TimezoneSelect } from "../../components/timezone-select";
import {
  INPUT_CLS,
  ROW_CLS,
  ROW_LABEL_CLS,
  ROW_VALUE_CLS,
} from "../../components/row";
import type { FormSetter } from "../../lib/use-form-reducer";
import type { CheckDraft } from "./check-edit-form";

const TEXTAREA_CLS =
  "block w-full box-border bg-transparent border-0 px-4 py-3 text-base min-h-[100px]";
const CLOCK_INPUT_CLS =
  "w-12 bg-transparent border-0 p-0 text-base text-tg-text text-right";

// Every section edits the one draft through the one setter.
type SectionProps = { draft: CheckDraft; set: FormSetter<CheckDraft> };

export function TitleSection({ draft, set }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{s.ui_check_title}</SectionHeader>
      <Card>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_check_title}</span>
          <input
            className={INPUT_CLS}
            placeholder={s.ui_check_title_placeholder}
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            maxLength={120}
          />
        </label>
      </Card>
    </>
  );
}

export function TargetSection({ draft, set }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{s.ui_check_chat_id}</SectionHeader>
      <Card>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_check_chat_id}</span>
          <input
            className={INPUT_CLS}
            placeholder={s.ui_check_chat_id_placeholder}
            value={draft.chatId}
            onChange={(e) => set("chatId", e.target.value)}
          />
        </label>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_check_target_user_id}</span>
          <input
            className={INPUT_CLS}
            placeholder={s.ui_check_target_user_id_placeholder}
            value={draft.targetUserId}
            onChange={(e) => set("targetUserId", e.target.value)}
          />
        </label>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_check_target_name}</span>
          <input
            className={INPUT_CLS}
            placeholder={s.ui_check_target_name_placeholder}
            value={draft.targetName}
            onChange={(e) => set("targetName", e.target.value)}
            maxLength={64}
          />
        </label>
      </Card>
      <SectionFooter>{s.ui_check_target_name_footer}</SectionFooter>
    </>
  );
}

export function ScheduleSection({ draft, set }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{s.ui_check_schedule}</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_check_schedule}</span>
          <span className="flex-1" />
          <NumberInput
            className={CLOCK_INPUT_CLS}
            integer
            min={0}
            max={23}
            value={draft.scheduleHour}
            onChange={(n) => set("scheduleHour", n)}
          />
          <span className="text-tg-hint">:</span>
          <NumberInput
            className={CLOCK_INPUT_CLS}
            integer
            min={0}
            max={59}
            value={draft.scheduleMinute}
            onChange={(n) => set("scheduleMinute", n)}
          />
        </div>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_check_timeout}</span>
          <NumberInput
            className={INPUT_CLS}
            integer
            min={1}
            max={24 * 60}
            value={draft.timeoutMinutes}
            onChange={(n) => set("timeoutMinutes", n)}
          />
        </label>
      </Card>
      <SectionFooter>{s.ui_check_schedule_footer}</SectionFooter>
    </>
  );
}

export function TimezoneSection({ draft, set }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{s.ui_check_timezone}</SectionHeader>
      <TimezoneSelect
        value={draft.timezone}
        onChange={(tz) => set("timezone", tz)}
      />
      <SectionFooter>{s.ui_check_timezone_footer}</SectionFooter>
    </>
  );
}

export function QuestionSection({ draft, set }: SectionProps) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{s.ui_check_question}</SectionHeader>
      <Card>
        <textarea
          className={TEXTAREA_CLS}
          placeholder={s.ui_check_question_placeholder}
          value={draft.question}
          onChange={(e) => set("question", e.target.value)}
        />
      </Card>
      <SectionFooter>{s.ui_check_question_footer}</SectionFooter>
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
      <SectionFooter>{s.ui_check_counter_source_footer}</SectionFooter>
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
      <SectionFooter>{s.ui_check_counter_mode_footer}</SectionFooter>
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
      <SectionFooter>{s.ui_check_enabled_footer}</SectionFooter>
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
