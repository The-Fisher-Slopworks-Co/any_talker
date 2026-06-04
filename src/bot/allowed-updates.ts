// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { API_CONSTANTS } from "grammy";

// The update types every bot (main and managed) long-polls. Extends grammY's
// defaults with the Bot API 10.0 custom `guest_message` update. `managed_bot`
// is already part of DEFAULT_UPDATE_TYPES, so the main bot receives bot-creation
// updates without any extra entry here.
export const ALLOWED_UPDATES = [
  ...API_CONSTANTS.DEFAULT_UPDATE_TYPES,
  "guest_message",
] as const;
