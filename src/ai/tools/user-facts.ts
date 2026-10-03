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

const KeySchema = z.string().min(1).max(FACT_KEY_MAX_LEN).regex(FACT_KEY_REGEX);
const ValueSchema = z.string().min(1).max(FACT_VALUE_MAX_LEN);

const RememberSchema = z.object({
  key: KeySchema,
  value: ValueSchema,
});
type RememberInput = z.infer<typeof RememberSchema>;
type RememberOutput = { ok: true } | { ok: false; reason: "limit_reached" };

const ListSchema = z.object({});
type ListInput = z.infer<typeof ListSchema>;
type ListOutput = Array<{ key: string; value: string }>;

const ForgetSchema = z.object({
  key: KeySchema,
});
type ForgetInput = z.infer<typeof ForgetSchema>;
type ForgetOutput = { existed: boolean };

const FACTS_PURPOSE_DOC =
  "Facts are short notes you keep about the user across conversations to personalise replies: preferences, hobbies, ongoing situations. " +
  "Never store secrets, passwords, contact details or anything sensitive.";

function createRememberFactTool(deps: {
  storage: Storage;
}): Tool<RememberInput, RememberOutput> {
  return {
    name: "remember_fact",
    description:
      `Save or overwrite one fact about the user. ${FACTS_PURPOSE_DOC} ` +
      `Keys are lowercase snake_case ('favourite_team'). Past ${USER_FACTS_MAX_PER_USER} facts the oldest one is evicted.`,
    parameters: RememberSchema,
    execute: async ({ key, value }, ctx) => {
      return deps.storage
        .forBot(ctx.botId ?? null)
        .facts.remember(ctx.userId, key, value);
    },
  };
}

function createListFactsTool(deps: {
  storage: Storage;
}): Tool<ListInput, ListOutput> {
  return {
    name: "list_facts",
    description:
      "List every fact stored about the user. The system prompt already shows them, so call this only to re-check.",
    parameters: ListSchema,
    execute: async (_input, ctx) => {
      return deps.storage.forBot(ctx.botId ?? null).facts.list(ctx.userId);
    },
  };
}

function createForgetFactTool(deps: {
  storage: Storage;
}): Tool<ForgetInput, ForgetOutput> {
  return {
    name: "forget_fact",
    description:
      "Delete one fact about the user by key. { existed: false } means there was no such fact.",
    parameters: ForgetSchema,
    execute: async ({ key }, ctx) => {
      return deps.storage
        .forBot(ctx.botId ?? null)
        .facts.forget(ctx.userId, key);
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
