// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Lang } from "../shared/i18n";
import type { TurnAuthor } from "../shared/types";

// What the bot knows about the author of a turn: the timezone their `time`
// stamps are in, the language they picked, and the facts it remembered about
// them.
//
// None of it lives in the system prompt. The prompt is the prefix every turn
// in a chat shares, so anything in it that depends on the asker re-charges the
// whole history the moment someone else replies in the same chain. Instead the
// profile rides in the envelope of a user turn (`profile`), and only when the
// chain does not already say it: the first turn of an author in the chain, or
// one whose profile changed since. Once written, it stays in that turn for
// good, so the history keeps growing only at its end.
export type UserProfile = {
  timezone: string;
  lang: Lang;
  facts: Array<{ key: string; value: string }>;
};

// The envelope form. Fact values are user-controlled, so they travel as JSON
// strings — escaped, unable to forge a section of the prompt — and the prompt
// says they are data (`PROFILE_SECTION`, `ai/instruction.ts`).
export function profileField(profile: UserProfile): Record<string, unknown> {
  const field: Record<string, unknown> = {
    timezone: profile.timezone,
    language: profile.lang,
  };
  if (profile.facts.length > 0) {
    field.facts = Object.fromEntries(
      profile.facts.map((f) => [f.key, f.value]),
    );
  }
  return field;
}

// How much of the digest is kept: enough to tell two profiles apart.
const PROFILE_HASH_CHARS = 16;

// Fingerprint of the profile a turn carried, stored with the turn
// (`TurnAuthor.profile`) so the next one can tell whether the chain already
// says what it would say.
export function profileHash(profile: UserProfile): string {
  return Bun.SHA256.hash(JSON.stringify(profileField(profile)), "hex").slice(
    0,
    PROFILE_HASH_CHARS,
  );
}

// The profile the new turn has to carry, or null when the turns the model is
// about to see (oldest first) already end with the same one for this author.
// Only those turns count: a profile that scrolled out of the context window is
// one the model no longer has.
export function profileToCarry(
  turns: ReadonlyArray<{ author?: TurnAuthor | undefined }>,
  userId: string,
  profile: UserProfile,
): UserProfile | null {
  const last = turns.findLast(
    (t) => t.author?.userId === userId && t.author.profile !== undefined,
  );
  return last?.author?.profile === profileHash(profile) ? null : profile;
}

// The author record a new turn is stored with.
export function turnAuthor(
  userId: string,
  carried: UserProfile | null,
): TurnAuthor {
  return carried === null
    ? { userId }
    : { userId, profile: profileHash(carried) };
}
