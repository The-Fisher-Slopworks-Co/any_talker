// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ApiResponse } from "./types";

// The canned responses more than one route module answers with. Route-specific
// errors live next to the route that raises them.

export const FORBIDDEN: ApiResponse = {
  status: 403,
  body: { error: "forbidden" },
};

export const NOT_FOUND: ApiResponse = {
  status: 404,
  body: { error: "not found" },
};

export const BAD_TIMEZONE: ApiResponse = {
  status: 400,
  body: { error: "invalid timezone" },
};
