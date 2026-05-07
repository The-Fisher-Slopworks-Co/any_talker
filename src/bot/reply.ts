import type { Message } from "grammy/types";

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
