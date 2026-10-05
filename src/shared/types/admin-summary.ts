// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// What the admin home shows beside its rows, in one answer.
export type AdminSummary = {
  bots: number;
  budgetEnabled: boolean;
  whitelistEnabled: boolean;
  users: number;
  chats: number;
  reminders: number;
  quarantined: number;
  checks: number;
  // Feedback reports still in the `new` state.
  newFeedback: number;
  apiTokenCreated: boolean;
};
