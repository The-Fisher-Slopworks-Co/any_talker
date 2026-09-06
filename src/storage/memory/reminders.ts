// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Reminder } from "../../reminders/types";
import type { RemindersStore } from "../types/reminders";
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

  async countForUser(userId: string): Promise<number> {
    let n = 0;
    for (const [key, r] of this.b.reminders.entries()) {
      if (this.scope.inScope(key) && r.userId === userId) n++;
    }
    return n;
  }

  async delete(id: string, _userId: string): Promise<void> {
    this.b.reminders.delete(this.scope.sk(id));
  }
}
