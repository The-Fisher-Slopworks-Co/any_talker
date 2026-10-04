// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import { useDateFmt } from "../datetime-context";
import type { FeedbackSummary } from "../api-client";
import { ActionRow } from "./controls";
import { Card } from "./layout";
import { NavRow } from "./select-row";
import { EmptyState } from "./states";
import { SwipeToDelete } from "./swipe-row";
import { feedbackAuthor } from "../lib/labels";

// The listing sends each text whole — up to Telegram's 4096 — and a row shows
// one line of it; the rest is only weight in the page.
const TITLE_MAX_CHARS = 200;

export function FeedbackCard({
  entries,
  onOpen,
  onDelete,
  onLoadMore,
  loadingMore,
  emptyText,
}: {
  entries: FeedbackSummary[];
  // Opens the report: the full text, the thread snapshots, the status.
  onOpen: (id: string) => void;
  // Rejecting slides the row back; telling the user is up to the caller.
  onDelete: (id: string) => Promise<void>;
  // Only while there is another page.
  onLoadMore: (() => void) | undefined;
  loadingMore: boolean;
  emptyText: string;
}) {
  const { t: s } = useI18n();
  const { short } = useDateFmt();

  return (
    <Card>
      {entries.length === 0 ? (
        <EmptyState>{emptyText}</EmptyState>
      ) : (
        entries.map((e) => (
          <SwipeToDelete
            key={e.id}
            label={s.ui_feedback_delete}
            onDelete={() => onDelete(e.id)}
          >
            <NavRow
              title={e.text.slice(0, TITLE_MAX_CHARS)}
              subtitle={[
                feedbackAuthor(s, e),
                short(e.createdAt),
                // Either count can be zero: the threads a report copied expire
                // with the conversation graph.
                s.ui_feedback_thread_count(e.threadCount),
              ].join(" · ")}
              dotLabel={
                e.status === "new" ? s.ui_feedback_status_new : undefined
              }
              onClick={() => onOpen(e.id)}
            />
          </SwipeToDelete>
        ))
      )}
      {onLoadMore && (
        <ActionRow disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? s.ui_loading : s.ui_feedback_load_more}
        </ActionRow>
      )}
    </Card>
  );
}
