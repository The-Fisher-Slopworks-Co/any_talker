// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { useI18n } from "../../i18n-context";
import { api, type FeedbackStatus } from "../../api-client";
import { Stack } from "../../components/layout";
import { LoadingState } from "../../components/states";
import { SaveStatus } from "../../components/save-status";
import { SegmentedField } from "../../components/segmented-field";
import { FeedbackCard } from "../../components/feedback-card";
import { useFailureToast } from "../../lib/use-failure-toast";
import { useLoadable } from "../../lib/use-loadable";
import { readSession, useSessionState } from "../../lib/session-state";

type Filter = FeedbackStatus | "all";

function parseFilter(raw: unknown): Filter | null {
  return raw === "all" || raw === "new" || raw === "closed" ? raw : null;
}

const FILTER_KEY = "feedback-filter";
const statusOf = (f: Filter) => (f === "all" ? {} : { status: f });

// A `nextCursor` and no total, so this pages by "load more" rather than by
// numbered pages: a page is appended to what is already listed. The list
// carries its filter, as the previous filter's list stays up while a newly
// picked one loads.
export function feedbackListLoad(
  filter = readSession(FILTER_KEY, parseFilter) ?? "all",
) {
  return {
    key: `feedback:${filter}`,
    load: () =>
      api.listFeedback(statusOf(filter)).then((r) => ({ ...r, filter })),
  };
}

export function FeedbackTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { t: s } = useI18n();
  const [filter, setFilter] = useSessionState<Filter>(
    FILTER_KEY,
    "all",
    parseFilter,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const { status, fail } = useFailureToast();
  const { data, setData } = useLoadable(feedbackListLoad(filter));

  const loadMore = async () => {
    if (data === null || data.nextCursor === null) return;
    setLoadingMore(true);
    try {
      const page = await api.listFeedback({
        ...statusOf(data.filter),
        cursor: data.nextCursor,
      });
      setData(
        (prev) =>
          prev && {
            ...prev,
            entries: [...prev.entries, ...page.entries],
            nextCursor: page.nextCursor,
          },
      );
    } catch {
      // Nothing was added; Load More stays, one tap from a retry.
    } finally {
      setLoadingMore(false);
    }
  };

  // Rethrows, so the swiped row still slides back.
  const remove = async (id: string) => {
    try {
      await api.deleteFeedback(id);
    } catch (e) {
      fail();
      throw e;
    }
    setData(
      (prev) =>
        prev && { ...prev, entries: prev.entries.filter((e) => e.id !== id) },
    );
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
        <div className="mt-4">
          <FeedbackCard
            entries={data.entries}
            loadingMore={loadingMore}
            onOpen={onOpen}
            onDelete={remove}
            onLoadMore={
              data.nextCursor === null ? undefined : () => void loadMore()
            }
            emptyText={s.ui_feedback_empty}
          />
        </div>
      )}
      <SaveStatus status={status} />
    </Stack>
  );
}
