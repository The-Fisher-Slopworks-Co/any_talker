// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import type { Reminder } from "./types";
import type { SerializedAIMessage } from "../ai/types";
import { DEFAULT_LANG, isValidLang, type Lang } from "../shared/i18n";

// Strict schema for the per-message envelope replayed to the LLM. A bad
// element here is exactly the silent-corruption hole the validation closes:
// without runtime checks, malformed entries flow through type-erased into
// ai.ask() and either crash the tick or bill garbage to the model.
const SerializedAIUserContentPartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("image"),
    image_base64: z.string(),
    mediaType: z.string(),
  }),
  z.object({
    type: z.literal("audio"),
    audio_base64: z.string(),
    mediaType: z.string(),
  }),
]);

const SerializedAIMessageSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("user"),
    content: z.union([z.string(), z.array(SerializedAIUserContentPartSchema)]),
  }),
  z.object({
    role: z.literal("assistant"),
    content: z.string(),
  }),
  // A replayed tool call, stored as the four plain strings of
  // `ToolCallRecord`. Snapshots taken after the model had already called a
  // tool carry these; before this variant existed they failed the
  // discriminator and the whole reminder was quarantined.
  z.object({
    role: z.literal("tool"),
    callId: z.string(),
    name: z.string(),
    arguments: z.string(),
    output: z.string(),
  }),
]);

// The schema is handwritten, so nothing but this assertion keeps it in step
// with the type it guards — which is exactly how the "tool" variant went
// missing. Both directions are checked: a variant added to the type without a
// schema branch (records rejected) and a branch the type does not have
// (records accepted that `deserializeMessages` cannot handle) are both errors.
type SchemaMatchesType = [z.infer<typeof SerializedAIMessageSchema>] extends [
  SerializedAIMessage,
]
  ? [SerializedAIMessage] extends [z.infer<typeof SerializedAIMessageSchema>]
    ? true
    : never
  : never;
const _schemaMatchesType: SchemaMatchesType = true;
void _schemaMatchesType;

const DeliveryTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ask_reply"),
    chatId: z.string(),
    replyToMessageId: z.number(),
  }),
  z.object({ kind: z.literal("guest_dm"), userId: z.string() }),
]);

// chatId, lang, contextMessages are .optional() so legacy records that
// predate those fields still load. Backfill happens after validation.
// Anything else — id, userId, fireAtMs, target, text, createdAtMs — is
// strict: a missing/wrong shape means the record is corrupt and gets
// quarantined.
const StoredReminderSchema = z.object({
  id: z.string(),
  userId: z.string(),
  chatId: z.string().optional(),
  lang: z.string().optional(),
  fireAtMs: z.number(),
  text: z.string(),
  target: DeliveryTargetSchema,
  createdAtMs: z.number(),
  contextMessages: z.array(SerializedAIMessageSchema).optional(),
});

export type ReminderParseFailureReason = "invalid_json" | "schema_violation";

export class ReminderParseError extends Error {
  constructor(
    public readonly reason: ReminderParseFailureReason,
    public override readonly cause: unknown,
  ) {
    super(`reminder parse failed: ${reason}`);
    this.name = "ReminderParseError";
  }
}

export function parseStoredReminder(raw: string): Reminder {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ReminderParseError("invalid_json", err);
  }
  const result = StoredReminderSchema.safeParse(parsed);
  if (!result.success) {
    throw new ReminderParseError("schema_violation", result.error);
  }
  const stored = result.data;
  const chatId =
    stored.chatId ??
    (stored.target.kind === "ask_reply"
      ? stored.target.chatId
      : stored.target.userId);
  const lang: Lang = isValidLang(stored.lang) ? stored.lang : DEFAULT_LANG;
  return {
    id: stored.id,
    userId: stored.userId,
    chatId,
    lang,
    fireAtMs: stored.fireAtMs,
    text: stored.text,
    target: stored.target,
    createdAtMs: stored.createdAtMs,
    contextMessages: stored.contextMessages ?? [],
  };
}

// What the failure notice for a quarantined record needs, read best-effort
// from the raw payload. The schema as a whole was rejected, but the fields
// that identify the recipient are usually intact — a malformed context
// snapshot or a missing `createdAtMs` says nothing about `userId`.
export type SalvagedRecipient = {
  chatId: string;
  lang: Lang;
  text: string | null;
};

// Returns null when there is no one to tell: the payload is not JSON, or no
// string field names a chat. Each field is read on its own, so one bad field
// does not cost the others.
export function salvageQuarantinedRecipient(
  raw: string,
): SalvagedRecipient | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const rec = parsed as Record<string, unknown>;
  const target =
    typeof rec.target === "object" && rec.target !== null
      ? (rec.target as Record<string, unknown>)
      : {};
  // Same precedence as delivery: the chat the reminder was meant for, then
  // the record's chat, then the user's DM.
  const chatId = [
    target.kind === "ask_reply" ? target.chatId : undefined,
    target.kind === "guest_dm" ? target.userId : undefined,
    rec.chatId,
    rec.userId,
  ].find((v): v is string => typeof v === "string" && v.length > 0);
  if (chatId === undefined) return null;
  return {
    chatId,
    lang: isValidLang(rec.lang) ? rec.lang : DEFAULT_LANG,
    text: typeof rec.text === "string" ? rec.text : null,
  };
}
