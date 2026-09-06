// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Message } from "grammy/types";
import type { ReplyTarget } from "./context-builder";

export function resolveReplyAuthor(reply: Message): string | null {
  const fo = reply.forward_origin;
  if (fo) {
    switch (fo.type) {
      case "user":
        return fo.sender_user.first_name ?? null;
      case "hidden_user":
        return fo.sender_user_name;
      case "chat":
        return (
          fo.author_signature ??
          ("title" in fo.sender_chat ? fo.sender_chat.title : null) ??
          null
        );
      case "channel":
        return fo.author_signature ?? fo.chat.title ?? null;
    }
  }
  return reply.from?.first_name ?? null;
}

export function extractReplyTarget(reply: Message): ReplyTarget {
  const text = reply.text ?? reply.caption ?? null;
  return {
    messageId: reply.message_id,
    text,
    authorFirstName: resolveReplyAuthor(reply),
    images: [],
    audios: [],
  };
}
