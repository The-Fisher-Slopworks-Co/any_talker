// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { AskOutcomeLabel } from "../metrics";

export type AskOutcomeKind =
  "answered" | "denied" | "usage" | "budgetLimited" | "rateLimited" | "error";

const ASK_OUTCOME_LABEL: Record<AskOutcomeKind, AskOutcomeLabel> = {
  answered: "answered",
  denied: "denied",
  usage: "usage",
  budgetLimited: "budget_limited",
  rateLimited: "rate_limited",
  error: "error",
};

export function askOutcomeLabel(kind: AskOutcomeKind): AskOutcomeLabel {
  return ASK_OUTCOME_LABEL[kind];
}
