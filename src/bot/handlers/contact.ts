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

  const targetId = String(targetUserId);
  if (targetId === input.ownerId) return { kind: "isOwner" };

  const label = composeFullName(input.contact.first_name, input.contact.last_name);

  if (await input.storage.isWhitelisted("users", targetId)) {
    return { kind: "alreadyWhitelisted", label };
  }

  const existing = await input.storage.getUser(targetId);
  if (!existing) {
    await input.storage.upsertUser({
      id: targetId,
      firstName: input.contact.first_name ?? null,
      lastName: input.contact.last_name ?? null,
      username: null,
      lastSeenAt: input.now,
    });
  }

  await input.storage.addWhitelist("users", { id: targetId, label });
  return { kind: "added", label };
}
