// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { FeedbackEntry } from "../../shared/types/feedback";
import {
  clampFeedbackLimit,
  type FeedbackListQuery,
  type FeedbackPage,
  type FeedbackStore,
} from "../types/feedback";
import type { Backing } from "../memory";

export class MemoryFeedbackStore implements FeedbackStore {
  constructor(private readonly b: Backing) {}

  async save(entry: FeedbackEntry): Promise<void> {
    this.b.feedback.set(entry.id, structuredClone(entry));
  }

  async get(id: string): Promise<FeedbackEntry | null> {
    const entry = this.b.feedback.get(id);
    return entry ? structuredClone(entry) : null;
  }

  async list(query: FeedbackListQuery = {}): Promise<FeedbackPage> {
    const limit = clampFeedbackLimit(query.limit);
    const matching = [...this.b.feedback.values()]
      .filter((e) => query.status === undefined || e.status === query.status)
      .filter((e) => query.cursor === undefined || e.createdAt < query.cursor)
      // Ties broken by id descending, as ZREVRANGEBYSCORE does: same paging.
      .sort(
        (a, b) =>
          b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
      );
    const page = matching.slice(0, limit);
    const more = matching.length > limit;
    return {
      entries: page.map((e) => structuredClone(e)),
      nextCursor: more ? (page[page.length - 1]?.createdAt ?? null) : null,
    };
  }

  async delete(id: string): Promise<void> {
    this.b.feedback.delete(id);
  }
}
