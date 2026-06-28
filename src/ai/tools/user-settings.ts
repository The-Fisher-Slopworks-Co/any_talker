// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import type { Tool } from "./registry";
import type { Storage } from "../../storage/types";
import type { Gender, UserSettingChange } from "../../shared/types";
import { canonicalizeTimezone, composeFullName } from "../../shared/types";
import type { Lang } from "../../shared/i18n";
import { readValidDisplayName, validateDisplayName } from "../../shared/display-name";
import { getEffectiveSettings } from "../../settings";

// Shared doc fragment so both tools describe the same scope/semantics to the
// model: these four attributes are user-global (one value across the main bot
// and every character bot) and a change is applied immediately to this turn.
const SETTINGS_SCOPE_DOC =
  "These settings belong to the user, not the chat, and are SHARED across this bot and all its character bots. " +
  "A change is saved immediately, and any further tool calls you make in the SAME reply (e.g. scheduling a reminder) already use the new value.";

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
      "Read the current user's personal settings that the assistant honours: display name, timezone, gender, and language. " +
      "Takes no parameters. Returns each field's EFFECTIVE value plus whether it is the user's own explicit choice " +
      "(isDefault:false) or an inherited default (isDefault:true). " +
      "'name' is the name you see for the user (their override, or their Telegram name if unset). " +
      "'timezone' is the IANA zone used for dates/times (their override, else the chat or global default). " +
      "'gender' is 'male'/'female', or null when unset. 'language' is 'en' or 'ru' (the bot UI + reply language). " +
      `${SETTINGS_SCOPE_DOC} ` +
      "Call this before answering questions like 'what's my timezone?' or before editing a setting, so you know the current state.",
    parameters: GetSchema,
    execute: async (_input, ctx) => {
      const [nameOverride, tzOverride, gender, langOverride, user] =
        await Promise.all([
          readValidDisplayName(deps.storage, ctx.userId),
          deps.storage.getUserTimezone(ctx.userId),
          deps.storage.getUserGender(ctx.userId),
          deps.storage.getUserLang(ctx.userId),
          deps.storage.getUser(ctx.userId),
        ]);
      const telegramName = composeFullName(user?.firstName, user?.lastName);
      // ctx.timezone / ctx.lang are already the resolved effective values for
      // this turn (user → chat → global, and user → Telegram → default); the
      // overrides only decide the isDefault flag.
      return {
        name: { value: nameOverride ?? telegramName, isDefault: nameOverride === null },
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
    { message: "provide at least one field to set, or a non-empty `clear` list" },
  )
  .refine(
    // A field is "being set" iff its property is present; deriving the check
    // from `f` (the FieldSchema enum) keeps it from drifting from the field list.
    (v) => !v.clear || v.clear.every((f) => v[f] === undefined),
    { message: "a field cannot be both set and cleared in the same call" },
  );

type UpdateInput = z.infer<typeof UpdateSchema>;

export type UpdateUserSettingsOutput =
  | { ok: true; applied: UserSettingChange[] }
  | { ok: false; reason: string };

function applyChange(
  storage: Storage,
  userId: string,
  c: UserSettingChange,
): Promise<void> {
  switch (c.field) {
    case "name":
      return storage.setUserName(userId, c.value);
    case "timezone":
      return storage.setUserTimezone(userId, c.value);
    case "gender":
      return storage.setUserGender(userId, c.value as Gender | null);
    case "language":
      return storage.setUserLang(userId, c.value as Lang | null);
  }
}

function createUpdateUserSettingsTool(deps: {
  storage: Storage;
}): Tool<UpdateInput, UpdateUserSettingsOutput> {
  return {
    name: "update_user_settings",
    description:
      "Change one or more of the current user's personal settings. " +
      "'name': display name shown to you (1–32 visible characters; letters, digits, spaces and . ' - only). " +
      "'timezone': an IANA name like 'Europe/Moscow' or 'America/New_York'. " +
      "CHANGE the timezone ONLY when the user, in their own words, explicitly NAMES a place or zone — e.g. 'по екб' / 'in Yekaterinburg time', \"I'm in Berlin now\", 'use Moscow time'. " +
      "Map any shorthand or city name to its IANA zone yourself (Russian 'екб'/'екат' → 'Asia/Yekaterinburg', 'мск' → 'Europe/Moscow'). When the user names their zone like this, persist it here even if they didn't say the words 'change my timezone' and even if it's mentioned alongside another request such as a reminder. " +
      "CRITICAL: do NOT touch the timezone in any other case. If the user does not name a place or zone, do NOT call this tool for 'timezone' at all — never guess, default, 'confirm', re-apply, or reset it. " +
      "A bare time with no place (e.g. 'remind me at 15:00') is NOT a timezone signal: leave the timezone unchanged and schedule in the user's existing zone. A pure lookup about somewhere the user isn't claiming ('what time is it in Tokyo?') is also not a change. " +
      "When the user DOES name a zone and you are also scheduling/rescheduling a reminder for it, set the timezone here FIRST, then schedule afterwards — once saved, the new zone applies to your reminder tool calls in this same reply, so a wall-clock time like '15:00' is interpreted in the new zone. " +
      "'gender': 'male' or 'female'. 'language': 'en' or 'ru' (the bot UI and reply language). " +
      "Pass only the fields you want to change. To reset a field to its default instead of setting it, list its name in 'clear' " +
      "(e.g. clear:['gender'] removes the stored gender; clear:['timezone'] reverts to the chat/global zone; " +
      "clear:['name'] reverts to the Telegram name; clear:['language'] reverts to auto-detect). " +
      "A field cannot be both set and cleared in one call. Validation is all-or-nothing: if any value is invalid, nothing is saved. " +
      `${SETTINGS_SCOPE_DOC} ` +
      "Returns { ok:true, applied:[{field,value}] } (value is null for a cleared field), or { ok:false, reason } on invalid input.",
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
        // setUserTimezone does NO validation of its own — an invalid zone here
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
