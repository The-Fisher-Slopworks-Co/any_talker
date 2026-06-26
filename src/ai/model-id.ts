// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Resolves a model id against a map: exact match first (some suffixed ids like
// ":free" are real catalogue entries), then strip a trailing ":variant" suffix
// and retry. Shared by the server-side pricing lookup and the Mini App picker so
// the rule lives in one place. Pure — safe to bundle into the browser.
export function resolveModelId<T>(map: Map<string, T>, id: string): T | null {
  const exact = map.get(id);
  if (exact !== undefined) return exact;
  const colon = id.lastIndexOf(":");
  if (colon <= 0) return null;
  return map.get(id.slice(0, colon)) ?? null;
}
