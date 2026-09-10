// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import { useDateFmt } from "../datetime-context";
import type { FeedbackSummary } from "../api-client";
import { Card } from "./layout";
import { EmptyState } from "./states";
import { FEEDBACK_STATUS_KEY } from "../lib/labels";

// The listing sends each text whole — up to Telegram's 4096 — and one long
// report would push every other row off the screen.
const PREVIEW_MAX_CHARS = 400;

export function FeedbackCard({
  entries,
  busy,
  onOpen,
  onDelete,
  emptyText,
}: {
  entries: FeedbackSummary[];
  // A request is in flight, so the deletes stay out of reach until it settles.
  busy: boolean;
  // Opens the detail view: the full text, the thread snapshots, the status.
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  emptyText: string;
}) {
  const { t: s } = useI18n();
  const { format } = useDateFmt();

  return (
    <Card>
      {entries.length === 0 ? (
        <EmptyState>{emptyText}</EmptyState>
      ) : (
        entries.map((e) => (
          <div
            key={e.id}
            className="row relative flex flex-col gap-1 px-4 py-[11px]"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 text-base font-medium">
                {format(e.createdAt)}
              </span>
              <span className="text-[13px] text-tg-hint truncate">
                {s[FEEDBACK_STATUS_KEY[e.status]]}
              </span>
            </div>
            <div className="text-[15px] whitespace-pre-wrap break-words">
              {e.text.length > PREVIEW_MAX_CHARS
                ? `${e.text.slice(0, PREVIEW_MAX_CHARS)}…`
                : e.text}
            </div>
            {/* Counts rather than the snapshot, and either can be zero: the
                threads a report copied expire with the conversation graph. */}
            <div className="text-[13px] text-tg-hint break-all">
              {`id ${e.userId} · ${s.ui_feedback_counts(e.threadCount, e.turnCount)}`}
            </div>
            {/* Two taps side by side rather than a clickable row: the row
                already carries the delete, and a button inside a button is not
                a thing. */}
            <div className="flex gap-4">
              <button
                type="button"
                className="bg-transparent border-0 p-0 text-left text-[13px] text-tg-link cursor-pointer"
                onClick={() => onOpen(e.id)}
              >
                {s.ui_feedback_open}
              </button>
              <button
                type="button"
                className="bg-transparent border-0 p-0 text-left text-[13px] text-tg-destructive cursor-pointer disabled:opacity-50"
                disabled={busy}
                onClick={() => onDelete(e.id)}
              >
                {s.ui_remove}
              </button>
            </div>
          </div>
        ))
      )}
    </Card>
  );
}
