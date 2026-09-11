// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type {
  FeedbackEntry,
  FeedbackStatus,
} from "../../../shared/types/feedback";
import type { FeedbackSummary } from "../../routes/admin-feedback";
import { req } from "./http";

export type FeedbackListParams = {
  status?: FeedbackStatus;
  // `nextCursor` from the previous page; omitted asks for the first one.
  cursor?: number;
  limit?: number;
};

export type FeedbackListResponse = {
  // Newest first, without `systemPrompt` and the thread snapshots — those come
  // from `getFeedback`.
  entries: FeedbackSummary[];
  nextCursor: number | null;
};

function listPath(params: FeedbackListParams | undefined): string {
  const search = new URLSearchParams();
  if (params?.status !== undefined) search.set("status", params.status);
  if (params?.cursor !== undefined) search.set("cursor", String(params.cursor));
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  const query = search.toString();
  return query ? `/api/admin/feedback?${query}` : "/api/admin/feedback";
}

// `webapp/routes/admin-feedback.ts`
export const adminFeedbackApi = {
  listFeedback: (params?: FeedbackListParams) =>
    req<FeedbackListResponse>("GET", listPath(params)),
  getFeedback: (id: string) =>
    req<{ entry: FeedbackEntry }>("GET", `/api/admin/feedback/${id}`),
  // `status` is the only editable field on a record.
  setFeedbackStatus: (id: string, status: FeedbackStatus) =>
    req<{ entry: FeedbackEntry }>("PATCH", `/api/admin/feedback/${id}`, {
      status,
    }),
  deleteFeedback: (id: string) =>
    req<{ ok: true }>("DELETE", `/api/admin/feedback/${id}`),
};
