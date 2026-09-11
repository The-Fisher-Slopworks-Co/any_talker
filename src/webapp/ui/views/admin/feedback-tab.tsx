// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { useI18n } from "../../i18n-context";
import { api, type FeedbackStatus } from "../../api-client";
import { Card, SectionFooter, Stack } from "../../components/layout";
import { LoadingState } from "../../components/states";
import { RowButton } from "../../components/controls";
import { SegmentedField } from "../../components/segmented-field";
import { FeedbackCard } from "../../components/feedback-card";
import { useLoadable } from "../../lib/use-loadable";

type Filter = FeedbackStatus | "all";

export function FeedbackTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { t: s } = useI18n();
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const statusParam = filter === "all" ? {} : { status: filter };
  // A `nextCursor` and no total, so this pages by "load more" rather than by
  // numbered pages: a page is appended to what is already listed.
  const { data, setData } = useLoadable(
    () => api.listFeedback(statusParam),
    [filter],
  );

  const loadMore = async () => {
    if (data === null || data.nextCursor === null) return;
    setBusy(true);
    try {
      const page = await api.listFeedback({
        ...statusParam,
        cursor: data.nextCursor,
      });
      setData((prev) => ({
        entries: [...(prev?.entries ?? []), ...page.entries],
        nextCursor: page.nextCursor,
      }));
    } finally {
      setBusy(false);
    }
  };

  // A report holds the only copy of its thread snapshot, so a confirmation
  // stands in front of the delete, as it does in the check and bot editors.
  const remove = async (id: string) => {
    if (!confirm(s.ui_feedback_delete_confirm)) return;
    setBusy(true);
    try {
      await api.deleteFeedback(id);
      setData(
        (prev) =>
          prev && { ...prev, entries: prev.entries.filter((e) => e.id !== id) },
      );
    } catch {
      // Nothing to undo — the row stays, one tap from a retry.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack>
      <SegmentedField
        value={filter}
        options={[
          { value: "all", label: s.ui_feedback_filter_all },
          { value: "new", label: s.ui_feedback_filter_new },
          { value: "closed", label: s.ui_feedback_filter_closed },
        ]}
        onChange={setFilter}
      />
      {data === null ? (
        <LoadingState />
      ) : (
        <>
          <FeedbackCard
            entries={data.entries}
            busy={busy}
            onOpen={onOpen}
            onDelete={remove}
            emptyText={s.ui_feedback_empty}
          />
          {data.nextCursor !== null && (
            <Card>
              <RowButton disabled={busy} onClick={() => void loadMore()}>
                {busy ? s.ui_loading : s.ui_feedback_load_more}
              </RowButton>
            </Card>
          )}
        </>
      )}
      <SectionFooter>{s.ui_feedback_footer}</SectionFooter>
    </Stack>
  );
}
