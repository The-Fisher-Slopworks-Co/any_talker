// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { useI18n } from "../i18n-context";
import { useDateFmt } from "../datetime-context";
import type { QuarantinedReminder } from "../../../storage/types/reminders";
import { Card } from "./layout";
import { EmptyState } from "./states";
import { QUARANTINE_REASON_KEY } from "../lib/labels";
import {
  peekQuarantinedPayload,
  quarantineTimeLeftMs,
} from "../lib/quarantine";

// The payload is why the record was kept, so it has to survive the trip out of
// the view: no wrapping tricks that reflow it, and a copy button, because
// selecting text inside a scrolling block on a phone is not a way to get a blob
// out of Telegram.
function Payload({ body }: { body: string }) {
  const { t: s } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-tg-secondary p-2 text-[12px] leading-[1.4] whitespace-pre select-all">
        {body}
      </pre>
      <button
        type="button"
        className="absolute right-1.5 top-2.5 rounded-md bg-tg-section px-2 py-0.5 text-[12px] text-tg-link border-0 cursor-pointer"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(body)
            .then(() => setCopied(true))
            .catch(() => setCopied(false));
        }}
      >
        {copied ? s.ui_quarantine_copied : s.ui_quarantine_copy}
      </button>
    </div>
  );
}

function QuarantinedRow({
  record,
  nowMs,
}: {
  record: QuarantinedReminder;
  nowMs: number;
}) {
  const { t: s } = useI18n();
  const { format } = useDateFmt();
  const [open, setOpen] = useState(false);
  const peek = peekQuarantinedPayload(record.raw);
  const leftMs = quarantineTimeLeftMs(record.quarantinedAtMs, nowMs);

  return (
    <div className="row relative flex flex-col gap-1 px-4 py-[11px]">
      <div className="flex items-center justify-between gap-3">
        <span className="shrink-0 text-base font-medium">
          {format(record.quarantinedAtMs)}
        </span>
        <span className="text-[13px] text-tg-hint truncate">
          {s[QUARANTINE_REASON_KEY[record.reason]]}
        </span>
      </div>
      {/* Whatever survived in the blob, so the record can be matched to a
          person without opening it. Either half may be missing. */}
      {peek.text !== null && (
        <div className="text-[15px] whitespace-pre-wrap break-words">
          {peek.text}
        </div>
      )}
      <div className="text-[13px] text-tg-hint break-all">
        {peek.userId !== null && `${s.ui_quarantine_user(peek.userId)} · `}
        {`id ${record.id}`}
        {` · `}
        {leftMs === 0
          ? s.ui_quarantine_expired
          : s.ui_quarantine_expires_in(leftMs)}
      </div>
      <button
        type="button"
        className="self-start bg-transparent border-0 p-0 text-left text-[13px] text-tg-link cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? s.ui_quarantine_hide_payload : s.ui_quarantine_show_payload}
      </button>
      {open && <Payload body={peek.body} />}
    </div>
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
  return (
    <Card>
      {quarantined.length === 0 ? (
        <EmptyState>{emptyText}</EmptyState>
      ) : (
        quarantined.map((record) => (
          <QuarantinedRow key={record.id} record={record} nowMs={nowMs} />
        ))
      )}
    </Card>
  );
}
