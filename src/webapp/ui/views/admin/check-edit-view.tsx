// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState } from "react";
import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import type {
  CheckCounterMode,
  RecurringCheck,
} from "../../../../checks/types";
import { localDateString } from "../../../../shared/tz";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../../components/layout";
import { LoadingState } from "../../components/states";
import { SaveButton, Toggle } from "../../components/controls";
import { SelectRow } from "../../components/select-row";
import { TimezoneSelect } from "../../components/timezone-select";
import {
  INPUT_CLS,
  ROW_CLS,
  ROW_LABEL_CLS,
  ROW_VALUE_CLS,
} from "../../components/row";

const TEXTAREA_CLS =
  "block w-full box-border bg-transparent border-0 px-4 py-3 text-base min-h-[100px]";

function clampInt(raw: string, min: number, max: number): number {
  const n = Math.floor(Number(raw) || min);
  return Math.max(min, Math.min(max, n));
}

const DEFAULT_DRAFT = {
  title: "",
  chatId: "",
  targetUserId: "",
  targetName: "",
  scheduleHour: 23,
  scheduleMinute: 30,
  timezone: "Europe/Moscow",
  question: "{name}, занялся ли ты сегодня спортом?",
  yesButton: "Да",
  noButton: "Нет",
  yesReply: "{name}, хотя бы себе не ври. День без спорта {count}",
  noReply: "{name}. День без спорта {count}",
  timeoutMinutes: 25,
  counter: 0,
  counterMode: "always_increment" as CheckCounterMode,
  counterAnchorDate: null as string | null,
  enabled: true,
};

type Draft = typeof DEFAULT_DRAFT;

function checkToDraft(c: RecurringCheck): Draft {
  return {
    title: c.title,
    chatId: c.chatId,
    targetUserId: c.targetUserId,
    targetName: c.targetName,
    scheduleHour: c.scheduleHour,
    scheduleMinute: c.scheduleMinute,
    timezone: c.timezone,
    question: c.question,
    yesButton: c.yesButton,
    noButton: c.noButton,
    yesReply: c.yesReply,
    noReply: c.noReply,
    timeoutMinutes: c.timeoutMinutes,
    counter: c.counter,
    counterMode: c.counterMode,
    counterAnchorDate: c.counterAnchorDate ?? null,
    enabled: c.enabled,
  };
}

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
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) {
      setCheck(null);
      setDraft(DEFAULT_DRAFT);
      return;
    }
    api
      .getCheck(checkId)
      .then((r) => {
        setCheck(r.check);
        setDraft(checkToDraft(r.check));
      })
      .catch(() => setNotFound(true));
  }, [checkId, isNew]);

  if (notFound) return <LoadingState text={s.ui_check_not_found} />;
  if (!isNew && !check) return <LoadingState />;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

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

  const lastFiredText = check?.lastFiredAtMs
    ? new Date(check.lastFiredAtMs).toLocaleString()
    : s.ui_check_last_fired_never;

  return (
    <Stack>
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

      <SectionHeader>{s.ui_check_schedule}</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_check_schedule}</span>
          <span className="flex-1" />
          <input
            type="number"
            className="w-12 bg-transparent border-0 p-0 text-base text-tg-text text-right"
            min={0}
            max={23}
            value={draft.scheduleHour}
            onChange={(e) =>
              set("scheduleHour", clampInt(e.target.value, 0, 23))
            }
          />
          <span className="text-tg-hint">:</span>
          <input
            type="number"
            className="w-12 bg-transparent border-0 p-0 text-base text-tg-text text-right"
            min={0}
            max={59}
            value={draft.scheduleMinute}
            onChange={(e) =>
              set("scheduleMinute", clampInt(e.target.value, 0, 59))
            }
          />
        </div>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_check_timeout}</span>
          <input
            type="number"
            className={INPUT_CLS}
            min={1}
            max={24 * 60}
            value={draft.timeoutMinutes}
            onChange={(e) =>
              set("timeoutMinutes", clampInt(e.target.value, 1, 24 * 60))
            }
          />
        </label>
      </Card>
      <SectionFooter>{s.ui_check_schedule_footer}</SectionFooter>

      <SectionHeader>{s.ui_check_timezone}</SectionHeader>
      <TimezoneSelect
        value={draft.timezone}
        onChange={(tz) => set("timezone", tz)}
      />
      <SectionFooter>{s.ui_check_timezone_footer}</SectionFooter>

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
              set("counterAnchorDate", localDateString(Date.now(), draft.timezone));
            }
          }}
        />
      </Card>
      <SectionFooter>{s.ui_check_counter_source_footer}</SectionFooter>

      {draft.counterAnchorDate === null ? (
        <>
          <SectionHeader>{s.ui_check_counter}</SectionHeader>
          <Card>
            <label className={ROW_CLS}>
              <span className={ROW_LABEL_CLS}>{s.ui_check_counter}</span>
              <input
                type="number"
                className={INPUT_CLS}
                min={0}
                value={draft.counter}
                onChange={(e) =>
                  set(
                    "counter",
                    clampInt(e.target.value, 0, Number.MAX_SAFE_INTEGER),
                  )
                }
              />
            </label>
          </Card>
          <SectionFooter>{s.ui_check_counter_footer}</SectionFooter>
        </>
      ) : (
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
                value={draft.counterAnchorDate ?? ""}
                onChange={(e) =>
                  set("counterAnchorDate", e.target.value || null)
                }
              />
            </label>
          </Card>
          <SectionFooter>{s.ui_check_counter_anchor_date_footer}</SectionFooter>
        </>
      )}

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

      <SectionHeader>{s.ui_check_enabled_label}</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_check_enabled_label}</span>
          <span className="flex-1" />
          <Toggle
            value={draft.enabled}
            onChange={(v) => set("enabled", v)}
          />
        </div>
      </Card>
      <SectionFooter>{s.ui_check_enabled_footer}</SectionFooter>

      {check && (
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
        </>
      )}

      {error && (
        <SectionFooter>
          {s.ui_check_save_validation_error(error)}
        </SectionFooter>
      )}

      <SaveButton
        saving={saving}
        dirty={true}
        disabled={saving || deleting}
        onClick={submit}
      />

      {check && (
        <Card>
          <button
            type="button"
            className="block w-full bg-tg-section text-tg-destructive border-0 text-center px-4 py-[13px] text-base font-medium cursor-pointer active:not-disabled:bg-[var(--tg-separator)] disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={saving || deleting}
            onClick={remove}
          >
            {s.ui_check_delete}
          </button>
        </Card>
      )}
    </Stack>
  );
}
