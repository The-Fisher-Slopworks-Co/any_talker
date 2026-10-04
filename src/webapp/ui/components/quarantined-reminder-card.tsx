// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useCallback, useState } from "react";
import { useI18n } from "../i18n-context";
import { useDateFmt } from "../datetime-context";
import type { QuarantinedReminder } from "../../../storage/types/reminders";
import { ActionRow } from "./controls";
import { Card, Stack } from "./layout";
import { NavRow } from "./select-row";
import { ROW_CLS, ROW_LABEL_CLS, ROW_VALUE_CLS } from "./row";
import { Sheet, SheetButton, useSheet } from "./sheet";
import { EmptyState } from "./states";
import { QUARANTINE_REASON_KEY } from "../lib/labels";
import {
  peekQuarantinedPayload,
  quarantineExpiresAtMs,
  quarantineTimeLeftMs,
} from "../lib/quarantine";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className={ROW_CLS}>
      <span className={ROW_LABEL_CLS}>{label}</span>
      <span className={`${ROW_VALUE_CLS} min-w-0 break-all`}>{value}</span>
    </div>
  );
}

// The payload is why the record was kept, so it has to survive the trip out of
// the view: no wrapping tricks that reflow it, and a copy row, because
// selecting text inside a scrolling block on a phone is not a way to get a blob
// out of Telegram.
export function PayloadSheet({
  record,
  onClose,
}: {
  record: QuarantinedReminder;
  onClose: () => void;
}) {
  const { t: s } = useI18n();
  const { short } = useDateFmt();
  const [copied, setCopied] = useState(false);
  const { closing, cancel } = useSheet(onClose);
  const peek = peekQuarantinedPayload(record.raw);

  return (
    <Sheet
      title={s.ui_quarantine_payload}
      closing={closing}
      onCancel={cancel}
      trailing={
        <SheetButton bold onClick={cancel}>
          {s.ui_done}
        </SheetButton>
      }
    >
      <Stack>
        <Card>
          {peek.userId !== null && (
            <Field label={s.ui_quarantine_user} value={peek.userId} />
          )}
          <Field label={s.ui_quarantine_id} value={record.id} />
          <Field
            label={s.ui_quarantine_expires}
            value={short(quarantineExpiresAtMs(record.quarantinedAtMs))}
          />
        </Card>
        <div className="section-gap">
          <Card>
            <pre className="row relative max-h-64 overflow-auto px-4 py-[11px] text-[12px] leading-[1.4] whitespace-pre select-all">
              {peek.body}
            </pre>
            <ActionRow
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(peek.body)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
            >
              {copied ? s.ui_quarantine_copied : s.ui_quarantine_copy}
            </ActionRow>
          </Card>
        </div>
      </Stack>
    </Sheet>
  );
}

// One row per record: whatever survived of the reminder's text (or its id) so
// it can be matched to a person without opening it, why it failed and when,
// and how long it will be kept. Tapping opens the raw payload in a sheet.
function QuarantinedRow({
  record,
  nowMs,
  onOpen,
}: {
  record: QuarantinedReminder;
  nowMs: number;
  onOpen: () => void;
}) {
  const { t: s } = useI18n();
  const { short } = useDateFmt();
  const peek = peekQuarantinedPayload(record.raw);
  const leftMs = quarantineTimeLeftMs(record.quarantinedAtMs, nowMs);

  return (
    <NavRow
      title={peek.text ?? `${s.ui_quarantine_id} ${record.id}`}
      subtitle={`${s[QUARANTINE_REASON_KEY[record.reason]]} · ${short(record.quarantinedAtMs)}`}
      value={
        leftMs === 0
          ? s.ui_quarantine_expired
          : s.ui_quarantine_days_left(leftMs)
      }
      onClick={onOpen}
    />
  );
}

export function QuarantinedReminderCard({
  quarantined,
  nowMs,
  emptyText,
}: {
  quarantined: QuarantinedReminder[];
  nowMs: number;
  emptyText: string;
}) {
  // The id of the record whose payload is open.
  const [open, setOpen] = useState<string | null>(null);
  const openRecord = quarantined.find((r) => r.id === open);
  const close = useCallback(() => setOpen(null), []);

  return (
    <>
      <Card>
        {quarantined.length === 0 ? (
          <EmptyState>{emptyText}</EmptyState>
        ) : (
          quarantined.map((record) => (
            <QuarantinedRow
              key={record.id}
              record={record}
              nowMs={nowMs}
              onOpen={() => setOpen(record.id)}
            />
          ))
        )}
      </Card>
      {openRecord && <PayloadSheet record={openRecord} onClose={close} />}
    </>
  );
}
