// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

export type Gender = "male" | "female";

// The four self-service user attributes the AI can read/edit via the
// user-settings tools. Kept here (a low-level shared module) so both the tool
// layer (`ToolEffect`) and the i18n catalogue can reference them without a
// layering inversion.
export type UserSettingField = "name" | "timezone" | "gender" | "language";

// One applied change, surfaced as a `settings_updated` ToolEffect and rendered
// into the reply's blockquote. `value` is the new canonical value (a display
// name, an IANA timezone, `"male"`/`"female"`, or `"en"`/`"ru"`), or `null` when
// the field was cleared back to its default.
export type UserSettingChange = {
  field: UserSettingField;
  value: string | null;
};

export type User = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  // Epoch ms the user was first seen. Set once on the first-ever upsert and
  // preserved thereafter; legacy rows written before this field existed are
  // backfilled to 0 on read, so an existing user never looks "brand new" (which
  // would wrongly subject them to the new-user soft-start budget). Drives both
  // the new-user cap and the "new users" digest.
  firstSeenAt: number;
  lastSeenAt: number;
};

export function composeFullName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  return [firstName, lastName]
    .map((s) => (s ?? "").trim())
    .filter((s) => s.length > 0)
    .join(" ");
}

export function isValidGender(v: unknown): v is Gender {
  return v === "male" || v === "female";
}
