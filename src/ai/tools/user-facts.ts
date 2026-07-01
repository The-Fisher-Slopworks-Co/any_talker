// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import type { Tool } from "./registry";
import { USER_FACTS_MAX_PER_USER, type Storage } from "../../storage/types";
import {
  FACT_KEY_MAX_LEN,
  FACT_KEY_REGEX,
  FACT_VALUE_MAX_LEN,
} from "../../shared/user-facts";

const KeySchema = z
  .string()
  .min(1)
  .max(FACT_KEY_MAX_LEN)
  .regex(FACT_KEY_REGEX);
const ValueSchema = z.string().min(1).max(FACT_VALUE_MAX_LEN);

const RememberSchema = z.object({
  key: KeySchema,
  value: ValueSchema,
});
type RememberInput = z.infer<typeof RememberSchema>;
type RememberOutput =
  | { ok: true }
  | { ok: false; reason: "limit_reached" };

const ListSchema = z.object({});
type ListInput = z.infer<typeof ListSchema>;
type ListOutput = Array<{ key: string; value: string }>;

const ForgetSchema = z.object({
  key: KeySchema,
});
type ForgetInput = z.infer<typeof ForgetSchema>;
type ForgetOutput = { existed: boolean };

const FACTS_PURPOSE_DOC =
  "Short, persistent, per-user notes that YOU (the assistant) maintain across conversations to " +
  "personalise future replies — favourite topics, preferences, ongoing situations, hobbies, recurring " +
  "context the user keeps mentioning. Lowercase snake_case keys (e.g. 'favourite_team', 'pets', " +
  "'job_role'). Do NOT store secrets, passwords, contact details, or anything sensitive. Limit: " +
  `${USER_FACTS_MAX_PER_USER} facts per user; once full, remembering a new fact evicts the oldest one.`;

function createRememberFactTool(deps: {
  storage: Storage;
}): Tool<RememberInput, RememberOutput> {
  return {
    name: "remember_fact",
    description:
      `Upsert one short fact about the current user. ${FACTS_PURPOSE_DOC} ` +
      "Use this whenever the user shares a stable preference or detail worth remembering for next time. " +
      `Keys are case-insensitive (stored lowercased) and must match ${FACT_KEY_REGEX} (1–${FACT_KEY_MAX_LEN} chars). ` +
      `Values are 1–${FACT_VALUE_MAX_LEN} chars. Always returns {ok:true}: updating an existing key overwrites its ` +
      `value, and adding a new key past the ${USER_FACTS_MAX_PER_USER}-fact cap evicts the oldest fact to make room.`,
    parameters: RememberSchema,
    execute: async ({ key, value }, ctx) => {
      return deps.storage.forBot(ctx.botId ?? null).rememberUserFact(ctx.userId, key, value);
    },
  };
}

function createListFactsTool(deps: {
  storage: Storage;
}): Tool<ListInput, ListOutput> {
  return {
    name: "list_facts",
    description:
      `Return every fact you've previously stored about the current user. ${FACTS_PURPOSE_DOC} ` +
      "Takes no parameters. Returns an array of {key, value} objects (may be empty). " +
      "Call this when you want to recall what you already know about the user before answering.",
    parameters: ListSchema,
    execute: async (_input, ctx) => {
      return deps.storage.forBot(ctx.botId ?? null).listUserFacts(ctx.userId);
    },
  };
}

function createForgetFactTool(deps: {
  storage: Storage;
}): Tool<ForgetInput, ForgetOutput> {
  return {
    name: "forget_fact",
    description:
      `Delete one previously remembered fact about the current user by key. ${FACTS_PURPOSE_DOC} ` +
      "Keys are case-insensitive. Returns {existed:true} if a fact with that key was removed, " +
      "{existed:false} if no fact existed under that key (not an error).",
    parameters: ForgetSchema,
    execute: async ({ key }, ctx) => {
      return deps.storage.forBot(ctx.botId ?? null).forgetUserFact(ctx.userId, key);
    },
  };
}

export function createUserFactsTools(deps: { storage: Storage }): Tool[] {
  return [
    createRememberFactTool(deps) as Tool,
    createListFactsTool(deps) as Tool,
    createForgetFactTool(deps) as Tool,
  ];
}
