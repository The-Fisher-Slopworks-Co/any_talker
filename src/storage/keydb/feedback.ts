// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RedisClient } from "bun";
import type {
  FeedbackEntry,
  FeedbackStatus,
} from "../../shared/types/feedback";
import {
  clampFeedbackLimit,
  type FeedbackListQuery,
  type FeedbackPage,
  type FeedbackStore,
} from "../types/feedback";
import { PREFIX } from "./shared";

// Listed, not derived from the record, so `save` and `delete` can settle every
// status index without first reading what the old status was.
const STATUSES: readonly FeedbackStatus[] = ["new", "closed"];

// The unfiltered listing, scored by `createdAt` — what makes the cursor a score
// rather than an offset: a page is a score range, so a record written or
// deleted mid-paging cannot shift the rows behind it.
const ALL_INDEX = `${PREFIX}feedback:z`;

// One index per status, so a `status` filter is still a score range: filtering
// a page of the unfiltered index would page badly — in a mostly `closed` corpus
// "the newest 25" can hold no `new` record and still not be the last page.
function statusIndex(status: FeedbackStatus): string {
  return `${PREFIX}feedback:z:${status}`;
}

function entryKey(id: string): string {
  return `${PREFIX}feedback:${id}`;
}

// Our own JSON, but one unreadable payload must not take the listing down.
function parseEntry(id: string, raw?: string | null): FeedbackEntry | null {
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(raw) as FeedbackEntry;
  } catch (err) {
    console.error(`[feedback] skipping unreadable record id=${id}:`, err);
    return null;
  }
}

export class KeyDBFeedbackStore implements FeedbackStore {
  constructor(private readonly client: RedisClient) {}

  // Also the update path: the record joins the index of its current status and
  // leaves every other, so re-saving it under a new one cannot list it twice.
  async save(entry: FeedbackEntry): Promise<void> {
    // Payload first: a crash before the indexes leaves a report stored but
    // unlisted, still recoverable by id; index-first would advertise an id
    // whose text was never written.
    await this.client.set(entryKey(entry.id), JSON.stringify(entry));
    await this.client.zadd(ALL_INDEX, entry.createdAt, entry.id);
    for (const status of STATUSES) {
      if (status === entry.status) {
        await this.client.zadd(statusIndex(status), entry.createdAt, entry.id);
      } else {
        await this.client.zrem(statusIndex(status), entry.id);
      }
    }
  }

  async get(id: string): Promise<FeedbackEntry | null> {
    return parseEntry(id, await this.client.get(entryKey(id)));
  }

  async list(query: FeedbackListQuery = {}): Promise<FeedbackPage> {
    const limit = clampFeedbackLimit(query.limit);
    const key = query.status ? statusIndex(query.status) : ALL_INDEX;
    // Newest first, so the cursor walks scores downwards. `(` makes the bound
    // exclusive: the previous page's last record must not open the next one.
    const max = query.cursor === undefined ? "+inf" : `(${query.cursor}`;
    // One row past the page says whether another page exists, uncounted.
    const ids = await this.client.zrevrangebyscore(
      key,
      max,
      "-inf",
      "LIMIT",
      0,
      limit + 1,
    );
    const pageIds = ids.slice(0, limit);
    if (pageIds.length === 0) return { entries: [], nextCursor: null };

    const raws = await this.client.mget(...pageIds.map(entryKey));
    const entries: FeedbackEntry[] = [];
    for (let i = 0; i < pageIds.length; i++) {
      const entry = parseEntry(pageIds[i]!, raws[i]);
      if (entry) entries.push(entry);
    }
    // The boundary score comes from the index, not from the last parsed
    // record: a payload that went missing or would not parse must not move the
    // cursor onto an older record and replay the rows in between.
    const last = pageIds[pageIds.length - 1]!;
    const nextCursor =
      ids.length > limit ? await this.client.zscore(key, last) : null;
    return { entries, nextCursor };
  }

  async delete(id: string): Promise<void> {
    // Indexes first — that is what makes the record gone to any reader. A crash
    // before the payload leaves an unreferenced blob rather than an id every
    // listing has to skip.
    for (const key of [ALL_INDEX, ...STATUSES.map(statusIndex)]) {
      await this.client.zrem(key, id);
    }
    await this.client.del(entryKey(id));
  }
}
