// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RecurringCheck } from "../../checks/types";

// Recurring checks (global, not affected by `forBot`).
export interface ChecksStore {
  save(check: RecurringCheck): Promise<void>;
  get(id: string): Promise<RecurringCheck | null>;
  list(): Promise<RecurringCheck[]>;
  delete(id: string): Promise<void>;
}
