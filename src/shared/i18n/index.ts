// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { botMessages } from "./bot";
import { checksMessages } from "./checks";
import { managedBotsMessages } from "./managed-bots";
import { factsMessages } from "./facts";
import { remindersMessages } from "./reminders";
import { chatsMessages } from "./chats";
import { usersMessages } from "./users";
import { budgetMessages } from "./budget";
import { rateLimitMessages } from "./ratelimit";
import { accessMessages } from "./access";
import { promptMessages } from "./prompt";
import { adminMessages } from "./admin";
import { profileMessages } from "./profile";
import { commonMessages } from "./common";

export type Lang = "en" | "ru";

export const SUPPORTED_LANGS: readonly Lang[] = ["en", "ru"];
export const DEFAULT_LANG: Lang = "en";

export function isValidLang(v: unknown): v is Lang {
  return v === "en" || v === "ru";
}

export function normalizeLang(code: string | null | undefined): Lang | null {
  if (typeof code !== "string" || code.length === 0) return null;
  const prefix = code.toLowerCase().split("-")[0]!;
  return isValidLang(prefix) ? prefix : null;
}

export function resolveLang(
  storedPref: Lang | null,
  telegramCode: string | null | undefined,
): Lang {
  return storedPref ?? normalizeLang(telegramCode) ?? DEFAULT_LANG;
}

// One flat catalogue; the domain modules only decide which file a message
// lives in. Exported as a record as well, so the tests can hold the key sets
// disjoint — a key defined twice would silently lose one of its translations.
export const DOMAIN_MESSAGES = {
  bot: botMessages,
  checks: checksMessages,
  managedBots: managedBotsMessages,
  facts: factsMessages,
  reminders: remindersMessages,
  chats: chatsMessages,
  users: usersMessages,
  budget: budgetMessages,
  ratelimit: rateLimitMessages,
  access: accessMessages,
  prompt: promptMessages,
  admin: adminMessages,
  profile: profileMessages,
  common: commonMessages,
};

const catalog = {
  ...DOMAIN_MESSAGES.bot,
  ...DOMAIN_MESSAGES.checks,
  ...DOMAIN_MESSAGES.managedBots,
  ...DOMAIN_MESSAGES.facts,
  ...DOMAIN_MESSAGES.reminders,
  ...DOMAIN_MESSAGES.chats,
  ...DOMAIN_MESSAGES.users,
  ...DOMAIN_MESSAGES.budget,
  ...DOMAIN_MESSAGES.ratelimit,
  ...DOMAIN_MESSAGES.access,
  ...DOMAIN_MESSAGES.prompt,
  ...DOMAIN_MESSAGES.admin,
  ...DOMAIN_MESSAGES.profile,
  ...DOMAIN_MESSAGES.common,
};

type Strings = { [K in keyof typeof catalog]: (typeof catalog)[K]["en"] };

const build = (lang: Lang): Strings =>
  Object.fromEntries(
    Object.entries(catalog).map(([key, pair]) => [key, pair[lang]]),
  ) as Strings;

export const MESSAGES: Record<Lang, Strings> = {
  en: build("en"),
  ru: build("ru"),
};

export function t(lang: Lang): Strings {
  return MESSAGES[lang];
}

export function languageSection(lang: Lang): string {
  if (lang === "ru") {
    return "# Язык ответа\n\nОтвечай на русском языке, если пользователь явно не пишет на другом.";
  }
  return "# Response language\n\nReply in English unless the user explicitly writes in another language.";
}
