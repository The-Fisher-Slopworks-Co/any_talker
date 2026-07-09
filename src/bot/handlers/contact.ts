// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../../storage/types";
import { composeFullName } from "../../shared/types";

export type ContactInput = {
  storage: Storage;
  ownerId: string;
  now: number;
  isPrivateChat: boolean;
  fromUserId: string;
  contact: {
    user_id?: number;
    first_name: string;
    last_name?: string;
  };
};

export type ContactOutcome =
  | { kind: "ignored" }
  | { kind: "noUserId" }
  | { kind: "isOwner" }
  | { kind: "alreadyWhitelisted"; label: string }
  | { kind: "added"; label: string };

export async function contactHandler(input: ContactInput): Promise<ContactOutcome> {
  if (!input.isPrivateChat) return { kind: "ignored" };
  if (input.fromUserId !== input.ownerId) return { kind: "ignored" };

  const targetUserId = input.contact.user_id;
  if (targetUserId === undefined) return { kind: "noUserId" };
  // Defend against malformed ingress: a non-finite / non-integer / negative
  // user_id would stringify to "NaN" / "Infinity" / etc. and poison the
  // whitelist with an entry that no real user can match.
  if (!Number.isSafeInteger(targetUserId) || targetUserId <= 0) {
    return { kind: "noUserId" };
  }

  const targetId = String(targetUserId);
  if (targetId === input.ownerId) return { kind: "isOwner" };

  const label = composeFullName(input.contact.first_name, input.contact.last_name);

  const [isWl, existing] = await Promise.all([
    input.storage.isWhitelisted("users", targetId),
    input.storage.getUser(targetId),
  ]);
  if (isWl) return { kind: "alreadyWhitelisted", label };

  if (!existing) {
    await input.storage.upsertUser({
      id: targetId,
      firstName: input.contact.first_name,
      lastName: input.contact.last_name ?? null,
      username: null,
      firstSeenAt: input.now,
      lastSeenAt: input.now,
    });
  }

  await input.storage.addWhitelist("users", { id: targetId, label });
  return { kind: "added", label };
}
