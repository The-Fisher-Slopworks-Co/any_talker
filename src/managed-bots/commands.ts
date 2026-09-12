// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import {
  ownsSharedCommands,
  syncBotCommands,
  type SyncCommandsApi,
} from "../bot/commands";
import type { ManagerRuntime } from "./runtime";

type FamilyMember = { botId: string; api: SyncCommandsApi };

// Every bot of the family — the main bot plus every managed bot whose polling
// loop is up — with the api its own command menu is uploaded through.
function familyMembers(runtime: ManagerRuntime): FamilyMember[] {
  return [
    { botId: runtime.deps.mainBotId, api: runtime.deps.mainApi },
    ...[...runtime.running.values()].map((entry) => ({
      botId: entry.record.botId,
      api: entry.bot.api,
    })),
  ];
}

// Best-effort per bot: one failing upload must not skip the rest.
async function syncMember(
  member: FamilyMember,
  familyBotIds: readonly string[],
  ownerId: string,
): Promise<void> {
  await syncBotCommands(member.api, {
    ownerId,
    selfBotId: member.botId,
    familyBotIds,
  }).catch((err) =>
    console.error(
      `[managed-bots] syncBotCommands failed for ${member.botId}:`,
      err,
    ),
  );
}

// Re-uploads the command menu of every family bot. Which of them lists the
// shared commands (`/feedback`) in groups depends on who else is running, so a
// change to that set is a change for the whole family, not just for the bot
// that came or went.
export async function syncFamilyCommands(
  runtime: ManagerRuntime,
): Promise<void> {
  const members = familyMembers(runtime);
  const familyBotIds = members.map((m) => m.botId);
  for (const member of members) {
    await syncMember(member, familyBotIds, runtime.deps.ownerId);
  }
}

// A bot has just joined the family. It always needs its own menu; the others
// only when the newcomer's id is the smallest one, because then it takes the
// shared commands over from whoever was listing them. Sparing the rest matters
// at boot: every menu is a dozen `setMyCommands` calls, and re-syncing the full
// family once per started bot would square that against Telegram's rate limit.
export async function syncCommandsAfterStart(
  runtime: ManagerRuntime,
  botId: string,
): Promise<void> {
  const members = familyMembers(runtime);
  const familyBotIds = members.map((m) => m.botId);
  if (ownsSharedCommands(botId, familyBotIds)) {
    for (const member of members) {
      await syncMember(member, familyBotIds, runtime.deps.ownerId);
    }
    return;
  }
  const self = members.find((m) => m.botId === botId);
  if (self) await syncMember(self, familyBotIds, runtime.deps.ownerId);
}
