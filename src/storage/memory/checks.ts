// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RecurringCheck } from "../../checks/types";
import type { ChecksStore } from "../types/checks";
import type { Backing } from "../memory";

export class MemoryChecksStore implements ChecksStore {
  constructor(private readonly b: Backing) {}

  async save(check: RecurringCheck): Promise<void> {
    this.b.checks.set(check.id, structuredClone(check));
  }

  async get(id: string): Promise<RecurringCheck | null> {
    const c = this.b.checks.get(id);
    return c ? structuredClone(c) : null;
  }

  async list(): Promise<RecurringCheck[]> {
    return [...this.b.checks.values()]
      .map((c) => structuredClone(c))
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  }

  async delete(id: string): Promise<void> {
    this.b.checks.delete(id);
  }
}
