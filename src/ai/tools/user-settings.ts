// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import type { Tool } from "./registry";
import type { Storage } from "../../storage/types";
import type { Gender, UserSettingChange } from "../../shared/types";
import { canonicalizeTimezone, composeFullName } from "../../shared/types";
import type { Lang } from "../../shared/i18n";
import {
  readValidDisplayName,
  validateDisplayName,
} from "../../shared/display-name";
import { getEffectiveSettings } from "../../settings";

// Shared doc fragment: these four attributes are user-global (one value across
// the main bot and every character bot) and a change applies to this turn.
const SETTINGS_SCOPE_DOC =
  "Settings are per user and shared by this bot and all its character bots. " +
  "A change applies immediately, including to later tool calls in the same reply.";

type GetUserSettingsOutput = {
  name: { value: string; isDefault: boolean };
  timezone: { value: string; isDefault: boolean };
  gender: { value: Gender | null };
  language: { value: Lang; isDefault: boolean };
};

const GetSchema = z.object({});
type GetInput = z.infer<typeof GetSchema>;

function createGetUserSettingsTool(deps: {
  storage: Storage;
}): Tool<GetInput, GetUserSettingsOutput> {
  return {
    name: "get_user_settings",
    description:
      "Read the user's display name, timezone (IANA), gender (male/female/null) and language (en/ru, fallback only: replies follow the user's language). " +
      "isDefault:true means an inherited default rather than the user's own choice. " +
      SETTINGS_SCOPE_DOC,
    parameters: GetSchema,
    execute: async (_input, ctx) => {
      const [nameOverride, tzOverride, gender, langOverride, user] =
        await Promise.all([
          readValidDisplayName(deps.storage, ctx.userId),
          deps.storage.profile.getTimezone(ctx.userId),
          deps.storage.profile.getGender(ctx.userId),
          deps.storage.profile.getLang(ctx.userId),
          deps.storage.users.get(ctx.userId),
        ]);
      const telegramName = composeFullName(user?.firstName, user?.lastName);
      // ctx.timezone / ctx.lang are already the resolved effective values for
      // this turn (user → chat → global, and user → Telegram → default); the
      // overrides only decide the isDefault flag.
      return {
        name: {
          value: nameOverride ?? telegramName,
          isDefault: nameOverride === null,
        },
        timezone: { value: ctx.timezone, isDefault: tzOverride === null },
        gender: { value: gender },
        language: { value: ctx.lang, isDefault: langOverride === null },
      };
    },
  };
}

const FieldSchema = z.enum(["name", "timezone", "gender", "language"]);

const UpdateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    timezone: z.string().min(1).max(100).optional(),
    gender: z.enum(["male", "female"]).optional(),
    language: z.enum(["en", "ru"]).optional(),
    // Fields to reset to their default (clears the user's override). Use this
    // instead of passing an empty value.
    clear: z.array(FieldSchema).min(1).optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.timezone !== undefined ||
      v.gender !== undefined ||
      v.language !== undefined ||
      (v.clear?.length ?? 0) > 0,
    {
      message: "provide at least one field to set, or a non-empty `clear` list",
    },
  )
  .refine(
    // A field is "being set" iff its property is present; deriving the check
    // from `f` (the FieldSchema enum) keeps it from drifting from the field list.
    (v) => !v.clear || v.clear.every((f) => v[f] === undefined),
    { message: "a field cannot be both set and cleared in the same call" },
  );

type UpdateInput = z.infer<typeof UpdateSchema>;

type UpdateUserSettingsOutput =
  { ok: true; applied: UserSettingChange[] } | { ok: false; reason: string };

function applyChange(
  storage: Storage,
  userId: string,
  c: UserSettingChange,
): Promise<void> {
  switch (c.field) {
    case "name":
      return storage.profile.setName(userId, c.value);
    case "timezone":
      return storage.profile.setTimezone(userId, c.value);
    case "gender":
      return storage.profile.setGender(userId, c.value as Gender | null);
    case "language":
      return storage.profile.setLang(userId, c.value as Lang | null);
  }
}

function createUpdateUserSettingsTool(deps: {
  storage: Storage;
}): Tool<UpdateInput, UpdateUserSettingsOutput> {
  return {
    name: "update_user_settings",
    description:
      "Change the user's settings; pass only the fields to change. " +
      "'name': 1–32 visible characters (letters, digits, spaces, . ' -). " +
      "'timezone': IANA name; map shorthand yourself ('екб' → 'Asia/Yekaterinburg', 'мск' → 'Europe/Moscow'). " +
      "Set the timezone ONLY when the user explicitly names their place or zone ('по екб', \"I'm in Berlin now\"), even in passing alongside another request. " +
      "Otherwise never touch it: a bare time ('remind me at 15:00') or a lookup ('what time is it in Tokyo?') is not a signal, and never guess, confirm or re-apply it. " +
      "When the user names a zone while asking for a reminder, set the timezone FIRST, then schedule: the reminder time is then read in the new zone. " +
      "'language': en/ru, fallback only. " +
      "'clear': fields to reset to their default (name → Telegram name, timezone → chat zone, language → auto-detect); a field cannot be both set and cleared. " +
      "If any value is invalid, nothing is saved and { ok:false, reason } comes back. " +
      SETTINGS_SCOPE_DOC,
    parameters: UpdateSchema,
    execute: async (input, ctx) => {
      const changes: UserSettingChange[] = [];

      // Validate every field BEFORE writing anything, so one bad value rejects
      // the whole call with no partial write (mirrors PUT /api/me).
      if (input.name !== undefined) {
        const r = validateDisplayName(input.name);
        if (!r.ok) return { ok: false, reason: `invalid_name: ${r.reason}` };
        changes.push({ field: "name", value: r.value });
      }
      if (input.timezone !== undefined) {
        // profile.setTimezone does NO validation of its own — an invalid zone here
        // would later throw when the system prompt formats the date. Canonicalise
        // ('europe/moscow' → 'Europe/Moscow') and reject anything unrecognised.
        const canonical = canonicalizeTimezone(input.timezone);
        if (canonical === null) {
          return {
            ok: false,
            reason: `invalid_timezone: "${input.timezone}" is not a valid IANA timezone name (e.g. "Europe/Moscow")`,
          };
        }
        changes.push({ field: "timezone", value: canonical });
      }
      if (input.gender !== undefined) {
        changes.push({ field: "gender", value: input.gender });
      }
      if (input.language !== undefined) {
        changes.push({ field: "language", value: input.language });
      }
      for (const field of new Set(input.clear ?? [])) {
        changes.push({ field, value: null });
      }

      // User attributes are global (not bot-scoped): use the base storage
      // directly, never forBot(...).
      await Promise.all(
        changes.map((c) => applyChange(deps.storage, ctx.userId, c)),
      );

      // Propagate timezone/language into THIS turn's shared context so a later
      // tool call in the same reply (e.g. scheduling a reminder for the new
      // zone) uses the new value instead of the stale snapshot resolved at the
      // start of the turn. ctx is the same object handed to every tool this turn.
      for (const c of changes) {
        if (c.field === "timezone") {
          // On a clear, fall back to the chat→global effective zone (the user
          // override is now gone), mirroring how askHandler resolves it.
          ctx.timezone =
            c.value ??
            (await getEffectiveSettings(deps.storage, ctx.chatId)).timezone;
        } else if (c.field === "language" && c.value !== null) {
          ctx.lang = c.value as Lang;
        }
      }

      ctx.effects?.push({ type: "settings_updated", changes });
      return { ok: true, applied: changes };
    },
  };
}

export function createUserSettingsTools(deps: { storage: Storage }): Tool[] {
  return [
    createGetUserSettingsTool(deps) as Tool,
    createUpdateUserSettingsTool(deps) as Tool,
  ];
}
