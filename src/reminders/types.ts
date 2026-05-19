// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Lang } from "../shared/i18n";

export type DeliveryTarget =
  | { kind: "ask_reply"; chatId: string; replyToMessageId: number }
  | { kind: "guest_dm"; userId: string };

export type Reminder = {
  id: string;
  userId: string;
  chatId: string;
  lang: Lang;
  fireAtMs: number;
  text: string;
  target: DeliveryTarget;
  createdAtMs: number;
};

export const MIN_LEAD_MS = 60_000;
