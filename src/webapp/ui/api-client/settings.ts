// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Settings } from "../../../shared/types";
import { req } from "./http";

// `webapp/routes/settings.ts`
export const settingsApi = {
  getSettings: () => req<Settings>("GET", "/api/settings"),
  putSettings: (patch: Partial<Settings>) =>
    req<Settings>("PUT", "/api/settings", patch),
};
