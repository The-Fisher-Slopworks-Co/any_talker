// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { FactsStore } from "../types/facts";
import { USER_FACTS_MAX_PER_USER } from "../types";
import type { Backing, Scope } from "../memory";

export class MemoryFactsStore implements FactsStore {
  constructor(
    private readonly b: Backing,
    private readonly scope: Scope,
  ) {}

  async remember(
    userId: string,
    key: string,
    value: string,
  ): Promise<{ ok: true } | { ok: false; reason: "limit_reached" }> {
    const normKey = key.toLowerCase();
    const factsKey = this.scope.sk(userId);
    let facts = this.b.userFacts.get(factsKey);
    if (!facts) {
      facts = new Map();
      this.b.userFacts.set(factsKey, facts);
    }
    // Updates to existing keys never evict. A NEW key at the cap evicts the
    // oldest-inserted fact to make room — Map iterates in insertion order, so
    // the first key is the oldest. (A bare update via Map.set keeps the key's
    // original position, so it doesn't reset a fact's age.)
    if (!facts.has(normKey) && facts.size >= USER_FACTS_MAX_PER_USER) {
      const oldest = facts.keys().next().value;
      if (oldest !== undefined) facts.delete(oldest);
    }
    facts.set(normKey, value);
    return { ok: true };
  }

  async list(userId: string): Promise<Array<{ key: string; value: string }>> {
    const facts = this.b.userFacts.get(this.scope.sk(userId));
    if (!facts) return [];
    return [...facts.entries()]
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }

  async forget(userId: string, key: string): Promise<{ existed: boolean }> {
    const normKey = key.toLowerCase();
    const facts = this.b.userFacts.get(this.scope.sk(userId));
    if (!facts) return { existed: false };
    const existed = facts.delete(normKey);
    return { existed };
  }
}
