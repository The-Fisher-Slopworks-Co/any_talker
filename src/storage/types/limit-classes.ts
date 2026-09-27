// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { LimitClass } from "../../shared/types";

export type LimitClassEntry = { userId: string; limitClass: LimitClass };

// Which users the admin has put in a limit class (global, not affected by
// `forBot`). A user absent here has no class and the base limits.
export interface LimitClassesStore {
  get(userId: string): Promise<LimitClass | null>;
  // Replaces any class the user already had.
  set(userId: string, limitClass: LimitClass): Promise<void>;
  remove(userId: string): Promise<void>;
  list(): Promise<LimitClassEntry[]>;
}
