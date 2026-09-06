// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Gender } from "../../shared/types";
import type { Lang } from "../../shared/i18n";
import type { DateFormat } from "../../shared/date-format";

// Per-user attributes (global, not affected by `forBot`): one profile per user,
// shared across all chats and family bots.
export interface ProfileStore {
  getName(userId: string): Promise<string | null>;
  setName(userId: string, name: string | null): Promise<void>;

  getTimezone(userId: string): Promise<string | null>;
  setTimezone(userId: string, timezone: string | null): Promise<void>;

  getGender(userId: string): Promise<Gender | null>;
  setGender(userId: string, gender: Gender | null): Promise<void>;

  getLang(userId: string): Promise<Lang | null>;
  setLang(userId: string, lang: Lang | null): Promise<void>;

  // Web App date/time display format preference. `null` = auto (the viewer's
  // device locale). User-global like the other attributes above.
  getDateFormat(userId: string): Promise<DateFormat | null>;
  setDateFormat(userId: string, format: DateFormat | null): Promise<void>;
}
