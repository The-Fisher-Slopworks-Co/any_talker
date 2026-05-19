// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Update } from "@grammyjs/types/update";
import type { Message } from "@grammyjs/types/message";
import type { MiddlewareFn } from "grammy";
import { formatLog, type LogFormat, type LogFields } from "../log";
import {
  commandsTotal,
  normalizeCommandLabel,
  updatesTotal,
} from "../metrics";

const MESSAGE_LIKE_KEYS = [
  "message",
  "edited_message",
  "channel_post",
  "edited_channel_post",
  "business_message",
  "edited_business_message",
  "guest_message",
] as const satisfies readonly (keyof Update)[];

const PAYLOAD_KEYS = [
  ...MESSAGE_LIKE_KEYS,
  "callback_query",
  "inline_query",
  "chosen_inline_result",
  "shipping_query",
  "pre_checkout_query",
  "poll",
  "poll_answer",
  "my_chat_member",
  "chat_member",
  "chat_join_request",
  "message_reaction",
  "message_reaction_count",
  "chat_boost",
  "removed_chat_boost",
  "business_connection",
  "deleted_business_messages",
] as const satisfies readonly (keyof Update)[];

export type UpdateMeta = {
  update_id: number;
  type: string;
  chat?: { id: number; type: string };
  from?: { id: number; username?: string };
  flags: Record<string, string | number | boolean>;
};

export function extractUpdateMeta(update: Update): UpdateMeta {
  const type = PAYLOAD_KEYS.find((k) => update[k] !== undefined) ?? "unknown";

  const meta: UpdateMeta = {
    update_id: update.update_id,
    type,
    flags: {},
  };

  if (type === "unknown") return meta;

  const payload = update[type as keyof Update] as unknown as Record<
    string,
    unknown
  >;

  const from = payload.from as { id: number; username?: string } | undefined;
  if (from) {
    meta.from = { id: from.id };
    if (from.username) meta.from.username = from.username;
  }

  const chat = payload.chat as { id: number; type: string } | undefined;
  if (chat) meta.chat = { id: chat.id, type: chat.type };

  if ((MESSAGE_LIKE_KEYS as readonly string[]).includes(type)) {
    Object.assign(meta.flags, messageFlags(payload as unknown as Message));
    if (type === "guest_message") meta.flags.is_guest = true;
  }

  return meta;
}

function messageFlags(msg: Message): UpdateMeta["flags"] {
  const flags: UpdateMeta["flags"] = {};
  const text = msg.text;
  const photos = (msg as { photo?: unknown[] }).photo;
  const caption = msg.caption;
  const command = firstBotCommand(msg);

  if (typeof text === "string") flags.text_len = text.length;
  if (Array.isArray(photos) && photos.length > 0) flags.has_photo = true;
  if (typeof caption === "string" && caption.length > 0)
    flags.has_caption = true;
  const mediaGroupId = (msg as { media_group_id?: string }).media_group_id;
  if (typeof mediaGroupId === "string") flags.media_group_id = mediaGroupId;
  if (msg.reply_to_message !== undefined) flags.is_reply = true;
  if ((msg as { forward_origin?: unknown }).forward_origin !== undefined)
    flags.is_forward = true;
  if (command !== null) {
    flags.is_command = true;
    flags.command = command;
  }
  return flags;
}

function firstBotCommand(msg: Message): string | null {
  const source = msg.text ?? msg.caption ?? "";
  const entities =
    msg.entities ?? (msg as { caption_entities?: Message["entities"] }).caption_entities;
  if (!entities) return null;
  const cmd = entities.find((e) => e.type === "bot_command" && e.offset === 0);
  if (!cmd) return null;
  const raw = source.slice(cmd.offset + 1, cmd.offset + cmd.length);
  const at = raw.indexOf("@");
  return at >= 0 ? raw.slice(0, at) : raw;
}

export function prettyFields(meta: UpdateMeta): LogFields {
  const fields: LogFields = { update_id: meta.update_id, type: meta.type };
  if (meta.chat) fields.chat = `${meta.chat.id}:${meta.chat.type}`;
  if (meta.from) {
    fields.from = meta.from.username
      ? `${meta.from.id}:@${meta.from.username}`
      : String(meta.from.id);
  }
  const flagSummary = renderFlagSummary(meta.flags);
  if (flagSummary) fields.flags = flagSummary;
  return fields;
}

function renderFlagSummary(flags: UpdateMeta["flags"]): string | undefined {
  const parts: string[] = [];
  if (flags.command) parts.push(`cmd:${flags.command}`);
  if (typeof flags.text_len === "number" && flags.text_len > 0)
    parts.push(`text(${flags.text_len})`);
  if (flags.has_caption) parts.push("caption");
  if (flags.has_photo) parts.push("photo");
  if (typeof flags.media_group_id === "string")
    parts.push(`group:${flags.media_group_id}`);
  if (flags.is_reply) parts.push("reply");
  if (flags.is_forward) parts.push("fwd");
  if (flags.is_guest) parts.push("guest");
  return parts.length > 0 ? parts.join(",") : undefined;
}

export type IncomingUpdateLoggerOptions = {
  format: LogFormat;
  enabled: boolean;
};

export function makeIncomingUpdateLogger(
  opts: IncomingUpdateLoggerOptions,
): MiddlewareFn {
  return async (ctx, next) => {
    const meta = extractUpdateMeta(ctx.update);
    updatesTotal.inc({ type: meta.type });
    if (typeof meta.flags.command === "string") {
      commandsTotal.inc({
        command: normalizeCommandLabel(meta.flags.command),
      });
    }
    if (opts.enabled) {
      const fields =
        opts.format === "pretty" ? prettyFields(meta) : (meta as LogFields);
      console.log(
        formatLog(
          { level: "info", msg: "incoming_update", fields },
          opts.format,
        ),
      );
    }
    await next();
  };
}
