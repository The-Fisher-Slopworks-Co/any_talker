// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type {
  FeedbackEntry,
  FeedbackStatus,
} from "../../shared/types/feedback";
import type { FeedbackListQuery } from "../../storage/types/feedback";
import type { ApiResponse, Route } from "./types";

const FEEDBACK_NOT_FOUND: ApiResponse = {
  status: 404,
  body: { error: "feedback not found" },
};

const BAD_STATUS: ApiResponse = {
  status: 400,
  body: { error: "status must be new or closed" },
};

const BAD_CURSOR: ApiResponse = {
  status: 400,
  body: { error: "cursor must be a number" },
};

function isStatus(value: unknown): value is FeedbackStatus {
  return value === "new" || value === "closed";
}

// One row of the listing: the record minus the two fields that make it big.
// `systemPrompt` is kilobytes on every record, and the thread snapshots are the
// bulk of it — a page of 25 with both would be megabytes to render a list of
// texts. Both are on the detail route, which is what a reader opens next; the
// counts are what a row shows in their place.
export type FeedbackSummary = Omit<
  FeedbackEntry,
  "systemPrompt" | "threads"
> & {
  threadCount: number;
  turnCount: number;
};

function toSummary(entry: FeedbackEntry): FeedbackSummary {
  const { systemPrompt: _prompt, threads, ...rest } = entry;
  return {
    ...rest,
    threadCount: threads.length,
    turnCount: threads.reduce((n, thread) => n + thread.turns.length, 0),
  };
}

// The `status` / `limit` / `cursor` query into a store query, or the response
// that says why it isn't one. `limit` is deliberately not rejected: the store
// clamps it (default 25, ceiling 100) and treats anything non-finite as absent,
// so a junk value pages at the default rather than failing the request.
function parseListQuery(
  query: Record<string, string> | undefined,
): { ok: true; value: FeedbackListQuery } | { ok: false; error: ApiResponse } {
  const value: FeedbackListQuery = {};

  const status = query?.status;
  if (status !== undefined && status !== "") {
    if (!isStatus(status)) return { ok: false, error: BAD_STATUS };
    value.status = status;
  }

  const cursor = query?.cursor;
  if (cursor !== undefined && cursor !== "") {
    const parsed = Number(cursor);
    // A junk cursor silently answering with page one would loop a paging UI
    // forever, so unlike `limit` it is an error.
    if (!Number.isFinite(parsed)) return { ok: false, error: BAD_CURSOR };
    value.cursor = parsed;
  }

  const limit = query?.limit;
  if (limit !== undefined && limit !== "") value.limit = Number(limit);

  return { ok: true, value };
}

// ORDER-SENSITIVE, as in `admin-checks`: the collection route is a literal
// string and the item routes a greedy `(.+)`, so the collection comes first.
export const adminFeedbackRoutes: Route[] = [
  {
    method: "GET",
    path: "/api/admin/feedback",
    handle: async ({ req, deps }) => {
      const query = parseListQuery(req.query);
      if (!query.ok) return query.error;
      const page = await deps.storage.feedback.list(query.value);
      return {
        status: 200,
        body: {
          entries: page.entries.map(toSummary),
          nextCursor: page.nextCursor,
        },
      };
    },
  },
  {
    method: "GET",
    path: /^\/api\/admin\/feedback\/(.+)$/,
    handle: async ({ deps, params }) => {
      const entry = await deps.storage.feedback.get(params[0]!);
      if (!entry) return FEEDBACK_NOT_FOUND;
      return { status: 200, body: { entry } };
    },
  },
  // `status` only — everything else on a record is what the submission
  // captured, and editing that would be editing the report.
  {
    method: "PATCH",
    path: /^\/api\/admin\/feedback\/(.+)$/,
    handle: async ({ req, deps, params }) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (!isStatus(body.status)) return BAD_STATUS;
      const existing = await deps.storage.feedback.get(params[0]!);
      if (!existing) return FEEDBACK_NOT_FOUND;
      // No `setStatus` on the store: an update is `get` then `save`, as
      // everywhere else.
      const next: FeedbackEntry = { ...existing, status: body.status };
      await deps.storage.feedback.save(next);
      return { status: 200, body: { entry: next } };
    },
  },
  {
    method: "DELETE",
    path: /^\/api\/admin\/feedback\/(.+)$/,
    handle: async ({ deps, params }) => {
      await deps.storage.feedback.delete(params[0]!);
      return { status: 200, body: { ok: true } };
    },
  },
];
