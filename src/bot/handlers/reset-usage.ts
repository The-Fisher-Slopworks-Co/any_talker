// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../../storage/types";

// `/resetusage` — the owner wiping everyone's 5-hour and weekly usage at once
// (the Web App resets one user at a time). Deliberately absent from the command
// menus: it is an admin lever, not something to advertise.
const COMMAND_RE = /^\/resetusage(?:@(\w+))?\s*$/i;

// Same addressing rule as `/usage`: bare, or `@`-suffixed with this bot's own
// username. The usage windows are family-wide, so a bare command in a group
// with several family bots goes through the shared-command gate and is
// answered once.
export function matchResetUsageCommand(
  text: string,
  selfUsername: string | undefined,
): { explicit: boolean } | null {
  const m = COMMAND_RE.exec(text.trim());
  if (!m) return null;
  const addressed = m[1];
  if (
    addressed !== undefined &&
    addressed.toLowerCase() !== selfUsername?.toLowerCase()
  ) {
    return null;
  }
  return { explicit: addressed !== undefined };
}

export type ResetUsageCommandInput = {
  storage: Storage;
  ownerId: string;
  fromUserId: string;
};

export type ResetUsageCommandOutcome =
  { kind: "ignored" } | { kind: "reset"; users: number };

export async function resetUsageCommandHandler(
  input: ResetUsageCommandInput,
): Promise<ResetUsageCommandOutcome> {
  // Silent for everyone else, like `/digest`: an unprivileged user learns
  // nothing about which commands exist.
  if (input.fromUserId !== input.ownerId) return { kind: "ignored" };
  const users = await input.storage.usage.resetAll();
  return { kind: "reset", users };
}
