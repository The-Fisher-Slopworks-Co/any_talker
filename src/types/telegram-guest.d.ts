// Bot API 10.0 guest mode additions, not yet present in @grammyjs/types@3.26.
// https://core.telegram.org/bots/api#may-8-2026
//
// ApiMethods is a type alias rather than an interface, so it cannot be
// augmented via declaration merging. The bot calls answerGuestQuery through
// a typed wrapper in bot/index.ts that casts ctx.api.raw.

import type { Chat, User } from "@grammyjs/types/manage";

declare module "@grammyjs/types/update" {
  interface Update {
    guest_message?: import("@grammyjs/types/message").Message;
  }
}

declare module "@grammyjs/types/message" {
  interface Message {
    guest_query_id?: string;
    guest_bot_caller_user?: User;
    guest_bot_caller_chat?: Chat;
  }
}

declare module "@grammyjs/types/manage" {
  interface UserFromGetMe {
    supports_guest_queries?: boolean;
  }
}

export interface SentGuestMessage {
  inline_message_id?: string;
}
