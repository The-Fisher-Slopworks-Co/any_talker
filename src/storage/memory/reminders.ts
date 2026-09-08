// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Reminder } from "../../reminders/types";
import type { QuarantinedReminder, RemindersStore } from "../types/reminders";
import type { Backing, Scope } from "../memory";

export class MemoryRemindersStore implements RemindersStore {
  constructor(
    private readonly b: Backing,
    private readonly scope: Scope,
  ) {}

  async save(reminder: Reminder): Promise<void> {
    this.b.reminders.set(this.scope.sk(reminder.id), structuredClone(reminder));
  }

  async fetchDue(nowMs: number): Promise<Reminder[]> {
    const out: Reminder[] = [];
    for (const [key, r] of this.b.reminders.entries()) {
      if (this.scope.inScope(key) && r.fireAtMs <= nowMs)
        out.push(structuredClone(r));
    }
    return out.sort((a, b) => a.fireAtMs - b.fireAtMs);
  }

  async listForUser(userId: string): Promise<Reminder[]> {
    const out: Reminder[] = [];
    for (const [key, r] of this.b.reminders.entries()) {
      if (this.scope.inScope(key) && r.userId === userId)
        out.push(structuredClone(r));
    }
    return out.sort((a, b) => a.fireAtMs - b.fireAtMs);
  }

  async listAll(): Promise<Reminder[]> {
    const out: Reminder[] = [];
    for (const [key, r] of this.b.reminders.entries()) {
      if (this.scope.inScope(key)) out.push(structuredClone(r));
    }
    return out.sort((a, b) => a.fireAtMs - b.fireAtMs);
  }

  async get(id: string): Promise<Reminder | null> {
    const r = this.b.reminders.get(this.scope.sk(id));
    return r ? structuredClone(r) : null;
  }

  async saveIfUnderCap(
    reminder: Reminder,
    cap: number,
    countBotIds: readonly (string | null)[],
  ): Promise<{ ok: true } | { ok: false; reason: "limit_reached" }> {
    // No await between the count and the write, so this is as atomic as the
    // KeyDB Lua script it mirrors: concurrent callers cannot interleave here.
    const prefixes = [
      ...new Set(countBotIds.map((id) => this.scope.prefixFor(id))),
    ];
    let n = 0;
    for (const [key, r] of this.b.reminders.entries()) {
      if (r.userId !== reminder.userId) continue;
      if (prefixes.some((p) => key.startsWith(p))) n++;
    }
    if (n >= cap) return { ok: false, reason: "limit_reached" };
    this.b.reminders.set(this.scope.sk(reminder.id), structuredClone(reminder));
    return { ok: true };
  }

  async delete(id: string, _userId: string): Promise<void> {
    this.b.reminders.delete(this.scope.sk(id));
  }

  // Nothing to quarantine: this backend holds parsed `Reminder` objects, not
  // serialized blobs, so no read of it can fail validation.
  async listQuarantined(): Promise<QuarantinedReminder[]> {
    return [];
  }
}
