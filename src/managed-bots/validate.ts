// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ManagedBot } from "./types";

// The owner-editable fields of a managed bot. Identity fields (botId, username,
// token) come from Telegram at creation and are never set through the admin API.
export type ManagedBotInput = Pick<ManagedBot, "displayName" | "systemPrompt">;

export type ManagedBotValidationError =
  | "display_name_required"
  | "display_name_too_long"
  | "system_prompt_too_long";

const MAX_DISPLAY_NAME = 64;
const MAX_SYSTEM_PROMPT = 8000;

// Validates + normalizes a managed-bot edit payload, mirroring the Checks
// `normalizeCheckInput` shape so the admin API and UI handle errors uniformly.
export function normalizeManagedBotInput(
  raw: unknown,
):
  | { ok: true; value: ManagedBotInput }
  | { ok: false; error: ManagedBotValidationError } {
  const o = (raw ?? {}) as Record<string, unknown>;

  const displayName =
    typeof o.displayName === "string" ? o.displayName.trim() : "";
  if (displayName.length === 0) {
    return { ok: false, error: "display_name_required" };
  }
  if (displayName.length > MAX_DISPLAY_NAME) {
    return { ok: false, error: "display_name_too_long" };
  }

  const systemPrompt =
    typeof o.systemPrompt === "string" ? o.systemPrompt : "";
  if (systemPrompt.length > MAX_SYSTEM_PROMPT) {
    return { ok: false, error: "system_prompt_too_long" };
  }

  return { ok: true, value: { displayName, systemPrompt } };
}
