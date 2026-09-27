// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type {
  LimitClassEntry,
  LimitClassesStore,
} from "../types/limit-classes";
import type { LimitClass } from "../../shared/types";
import type { Backing } from "../memory";

export class MemoryLimitClassesStore implements LimitClassesStore {
  constructor(private readonly b: Backing) {}

  async get(userId: string): Promise<LimitClass | null> {
    return this.b.limitClasses.get(userId) ?? null;
  }

  async set(userId: string, limitClass: LimitClass): Promise<void> {
    this.b.limitClasses.set(userId, limitClass);
  }

  async remove(userId: string): Promise<void> {
    this.b.limitClasses.delete(userId);
  }

  async list(): Promise<LimitClassEntry[]> {
    return [...this.b.limitClasses].map(([userId, limitClass]) => ({
      userId,
      limitClass,
    }));
  }
}
