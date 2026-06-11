// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Bot API 10.1 Rich Messages additions, not yet present in
// @grammyjs/types@3.27. https://core.telegram.org/bots/api#june-11-2026
//
// As with guest mode, ApiMethods is a type alias and cannot be augmented via
// declaration merging, so sendRichMessage is called through a typed `api.raw`
// cast — see bot/rich.ts (grammY's RawApi forwards any method name to
// Telegram, so methods newer than the installed grammY are still callable).

import type { Message } from "grammy/types";

// Reply target shape shared by the send methods; mirrors the subset of
// ReplyParameters the bot uses (kept inline like reminders/delivery.ts).
interface RichReplyParameters {
  message_id: number;
  allow_sending_without_reply?: boolean;
}

/**
 * Describes a rich message to be sent. Exactly one of `html` or `markdown`
 * must be set. https://core.telegram.org/bots/api#inputrichmessage
 */
export interface InputRichMessage {
  /** Content described using Rich HTML formatting. */
  html?: string;
  /** Content described using Rich Markdown formatting. */
  markdown?: string;
  /** Pass True if the rich message must be shown right-to-left. */
  is_rtl?: boolean;
  /**
   * Pass True to skip automatic entity detection (URLs, mentions, …). The bot
   * deliberately leaves this unset: Telegram auto-links plain URLs/mentions in
   * the AI reply, matching the behavior of the previous `parse_mode: "HTML"`
   * send path.
   */
  skip_entity_detection?: boolean;
}

/**
 * Content of a rich message to be sent as the result of an inline/guest/Web App
 * query. https://core.telegram.org/bots/api#inputrichmessagecontent
 */
export interface InputRichMessageContent {
  rich_message: InputRichMessage;
}

/** Parameters of sendRichMessage (only the fields the bot sets). */
export interface SendRichMessageParams {
  chat_id: number | string;
  message_thread_id?: number;
  rich_message: InputRichMessage;
  disable_notification?: boolean;
  reply_parameters?: RichReplyParameters;
}

/** Subset of the Bot API 10.1 raw methods the bot invokes via `api.raw`. */
export interface RichApiMethods {
  sendRichMessage(params: SendRichMessageParams): Promise<Message>;
}
