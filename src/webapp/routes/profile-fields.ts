// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../../storage/types";
import type { Gender } from "../../shared/types";
import { isValidTimezone, isValidGender } from "../../shared/types";
import { isValidLang, type Lang } from "../../shared/i18n";
import { isValidDateFormat, type DateFormat } from "../../shared/date-format";
import {
  validateDisplayName,
  type DisplayNameError,
} from "../../shared/display-name";
import type { ApiResponse } from "./types";
import { BAD_TIMEZONE } from "./responses";

function badDisplayName(reason: DisplayNameError): ApiResponse {
  return {
    status: 400,
    body: { error: "invalid display name", reason },
  };
}

const BAD_GENDER: ApiResponse = {
  status: 400,
  body: { error: "invalid gender" },
};

const BAD_LANG: ApiResponse = {
  status: 400,
  body: { error: "invalid language" },
};

const BAD_DATE_FORMAT: ApiResponse = {
  status: 400,
  body: { error: "invalid date format" },
};

function normalizeTimezoneOrNull(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed.length === 0 || !isValidTimezone(trimmed)) return null;
  return trimmed;
}

function normalizeEnumInput<T extends string>(
  input: unknown,
  isValid: (v: string) => v is T,
): T | null | "invalid" {
  if (input === null || input === undefined) return null;
  if (typeof input !== "string") return "invalid";
  const trimmed = input.trim();
  if (trimmed === "") return null;
  return isValid(trimmed) ? trimmed : "invalid";
}

// The profile fields both `PUT /api/me` and the admin `PUT /api/admin/users/:id`
// patch. `dateFormat` is absent on the admin side (see `includeDateFormat`), so
// it is optional here and the key never appears in that route's response.
export type UserProfileFields = {
  displayName: string | null;
  timezone: string | null;
  gender: Gender | null;
  language: Lang | null;
  dateFormat?: DateFormat | null;
};

type UserFieldUpdates =
  { ok: true; fields: UserProfileFields } | { ok: false; error: ApiResponse };

// Validates the patch field by field (in the order the API has always reported
// errors in), starting each accepted write as it goes and awaiting them only
// once the whole body has passed. `includeDateFormat` is the single asymmetry
// between the two callers: only the self-service route exposes dateFormat, so
// the admin route must leave it untouched even if the body carries one.
export async function applyUserFieldUpdates(
  storage: Storage,
  userId: string,
  body: Record<string, unknown>,
  current: UserProfileFields,
  options: { includeDateFormat: boolean },
): Promise<UserFieldUpdates> {
  const fields: UserProfileFields = { ...current };
  const writes: Promise<void>[] = [];

  if ("displayName" in body) {
    const r = validateDisplayName(body.displayName);
    if (!r.ok) return { ok: false, error: badDisplayName(r.reason) };
    fields.displayName = r.value;
    writes.push(storage.profile.setName(userId, r.value));
  }
  if ("timezone" in body) {
    if (typeof body.timezone === "string" && body.timezone.trim() !== "") {
      const next = normalizeTimezoneOrNull(body.timezone);
      if (next === null) return { ok: false, error: BAD_TIMEZONE };
      fields.timezone = next;
    } else {
      fields.timezone = null;
    }
    writes.push(storage.profile.setTimezone(userId, fields.timezone));
  }
  if ("gender" in body) {
    const nextGender = normalizeEnumInput(body.gender, isValidGender);
    if (nextGender === "invalid") return { ok: false, error: BAD_GENDER };
    fields.gender = nextGender;
    writes.push(storage.profile.setGender(userId, nextGender));
  }
  if ("language" in body) {
    const nextLang = normalizeEnumInput(body.language, isValidLang);
    if (nextLang === "invalid") return { ok: false, error: BAD_LANG };
    fields.language = nextLang;
    writes.push(storage.profile.setLang(userId, nextLang));
  }
  if (options.includeDateFormat && "dateFormat" in body) {
    const nextDf = normalizeEnumInput(body.dateFormat, isValidDateFormat);
    if (nextDf === "invalid") return { ok: false, error: BAD_DATE_FORMAT };
    fields.dateFormat = nextDf;
    writes.push(storage.profile.setDateFormat(userId, nextDf));
  }

  await Promise.all(writes);
  return { ok: true, fields };
}
