// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RedisClient } from "bun";
import type { RemindersStore } from "../types/reminders";
import type { Reminder } from "../../reminders/types";
import { parseStoredReminder, ReminderParseError } from "../../reminders/parse";
import { remindersParseFailuresTotal } from "../../metrics";
import type { ScopedKey, ScopedKeyFor } from "./shared";

const FETCH_DUE_LIMIT = 100;

// Atomic create-under-cap: sum the per-user index of every scope in the bot
// family (KEYS[4..]) and only write when the total is below the cap. Runs
// server-side, so the tool calls of one model round — which the agent runtime
// executes in parallel — cannot all read the same pre-write count and each
// conclude there is room. Writes in the same order as `save`: ZSET first, so a
// crash leaves an orphan `fetchDue` can GC. Returns '1' when saved, '0' when
// the cap was already reached.
const SAVE_REMINDER_LUA = `
local total = 0
for i = 4, #KEYS do
  total = total + redis.call('SCARD', KEYS[i])
end
if total >= tonumber(ARGV[1]) then return '0' end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
redis.call('SET', KEYS[2], ARGV[4])
redis.call('SADD', KEYS[3], ARGV[3])
return '1'
`;

// Any reply shape other than the two the script returns must throw rather than
// silently masquerading as "saved" or "at the cap".
export function parseSaveReminderReply(
  reply: unknown,
): { ok: true } | { ok: false; reason: "limit_reached" } {
  if (reply === "1" || reply === 1) return { ok: true };
  if (reply === "0" || reply === 0) {
    return { ok: false, reason: "limit_reached" };
  }
  throw new Error(
    `Unexpected EVAL reply for reminders.saveIfUnderCap: ${JSON.stringify(reply)}`,
  );
}

export class KeyDBRemindersStore implements RemindersStore {
  constructor(
    private readonly client: RedisClient,
    private readonly sk: ScopedKey,
    private readonly skFor: ScopedKeyFor,
  ) {}

  async save(reminder: Reminder): Promise<void> {
    // ZSET first so a crash leaves an orphan fetchDue can GC;
    // payload-first would leak blobs no scheduler tick ever discovers.
    await this.client.zadd(
      this.sk("reminders:due"),
      reminder.fireAtMs,
      reminder.id,
    );
    await this.client.set(
      this.sk(`reminder:${reminder.id}`),
      JSON.stringify(reminder),
    );
    await this.client.sadd(
      this.sk(`user_reminders:${reminder.userId}`),
      reminder.id,
    );
  }

  // MGET + parse a batch of reminder ids. Corrupted payloads are counted and
  // logged either way; `onCorrupt` only picks the wording and tells the caller
  // whether it is expected to evict them (the returned `corrupted`/`missing`
  // ids are what the due path needs to GC).
  private async loadReminders(
    ids: string[],
    onCorrupt: "quarantine" | "skip",
  ): Promise<{
    reminders: Reminder[];
    missing: string[];
    corrupted: string[];
  }> {
    const keys = ids.map((id) => this.sk(`reminder:${id}`));
    const raws = await this.client.mget(...keys);
    const reminders: Reminder[] = [];
    const missing: string[] = [];
    const corrupted: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]!;
      const raw = raws[i];
      if (raw === null || raw === undefined) {
        missing.push(id);
        continue;
      }
      try {
        reminders.push(parseStoredReminder(raw));
      } catch (err) {
        if (!(err instanceof ReminderParseError)) throw err;
        remindersParseFailuresTotal.inc({ reason: err.reason });
        const verb = onCorrupt === "quarantine" ? "quarantining" : "skipping";
        console.error(
          `[reminders] ${verb} corrupted reminder id=${id} reason=${err.reason}:`,
          err.cause,
        );
        corrupted.push(id);
      }
    }
    return { reminders, missing, corrupted };
  }

  async fetchDue(nowMs: number): Promise<Reminder[]> {
    // Cap per-tick batch so a backlog after an outage drains over multiple
    // ticks instead of fanning out into one thundering Telegram-API herd.
    const ids = await this.client.zrangebyscore(
      this.sk("reminders:due"),
      0,
      nowMs,
      "LIMIT",
      0,
      FETCH_DUE_LIMIT,
    );
    if (ids.length === 0) return [];
    const { reminders, missing, corrupted } = await this.loadReminders(
      ids,
      "quarantine",
    );
    // Quarantine corrupted records on the due path: deleting the payload +
    // zrem from the due set prevents the next tick from picking them up and
    // looping forever. user_reminders may briefly hold a dangling id;
    // listForUser tolerates that (MGET nulls are skipped).
    const orphans = [...missing];
    for (const id of corrupted) {
      await this.client
        .del(this.sk(`reminder:${id}`))
        .catch((err) => console.error("quarantine del payload failed:", err));
      orphans.push(id);
    }
    if (orphans.length > 0) {
      await this.client
        .zrem(this.sk("reminders:due"), orphans[0]!, ...orphans.slice(1))
        .catch((err) => console.error("zrem orphan reminders failed:", err));
    }
    return reminders;
  }

  async listForUser(userId: string): Promise<Reminder[]> {
    const ids = await this.client.smembers(this.sk(`user_reminders:${userId}`));
    if (ids.length === 0) return [];
    const { reminders } = await this.loadReminders(ids, "skip");
    return reminders.sort((a, b) => a.fireAtMs - b.fireAtMs);
  }

  async listAll(): Promise<Reminder[]> {
    const ids = await this.client.zrange(this.sk("reminders:due"), 0, -1);
    if (ids.length === 0) return [];
    const { reminders } = await this.loadReminders(ids, "skip");
    return reminders.sort((a, b) => a.fireAtMs - b.fireAtMs);
  }

  async get(id: string): Promise<Reminder | null> {
    const raw = await this.client.get(this.sk(`reminder:${id}`));
    if (raw === null || raw === undefined) return null;
    try {
      return parseStoredReminder(raw);
    } catch (err) {
      if (err instanceof ReminderParseError) {
        remindersParseFailuresTotal.inc({ reason: err.reason });
        console.error(
          `[reminders] skipping corrupted reminder id=${id} reason=${err.reason}:`,
          err.cause,
        );
        return null;
      }
      throw err;
    }
  }

  async saveIfUnderCap(
    reminder: Reminder,
    cap: number,
    countBotIds: readonly (string | null)[],
  ): Promise<{ ok: true } | { ok: false; reason: "limit_reached" }> {
    // Deduped so a scope named twice (the caller's own bot is normally also in
    // the managed-bot list) is not counted twice. This view's own index is
    // passed separately as KEYS[3] for the SADD; the count only walks KEYS[4..].
    const countKeys = [
      ...new Set(
        countBotIds.map((id) =>
          this.skFor(id, `user_reminders:${reminder.userId}`),
        ),
      ),
    ];
    const reply = await this.client.send("EVAL", [
      SAVE_REMINDER_LUA,
      String(3 + countKeys.length),
      this.sk("reminders:due"),
      this.sk(`reminder:${reminder.id}`),
      this.sk(`user_reminders:${reminder.userId}`),
      ...countKeys,
      String(cap),
      String(reminder.fireAtMs),
      reminder.id,
      JSON.stringify(reminder),
    ]);
    return parseSaveReminderReply(reply);
  }

  async delete(id: string, userId: string): Promise<void> {
    // Payload first so a crash leaves a ZSET orphan fetchDue can GC;
    // index-first would leak a payload key (no TTL). user_reminders may
    // briefly reference a deleted id; listForUser skips MGET nulls.
    await this.client.del(this.sk(`reminder:${id}`));
    await this.client.zrem(this.sk("reminders:due"), id);
    await this.client.srem(this.sk(`user_reminders:${userId}`), id);
  }
}
