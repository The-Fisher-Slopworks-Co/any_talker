// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Everything `replyEphemeral` needs from a `BotContext`, spelled structurally
// so a test can hand it a plain object — the same shape `SyncCommandsApi`
// takes for `setMyCommands`.
export type EphemeralReplyCtx = {
  chat?: { type: string } | undefined;
  reply(
    text: string,
    other?: {
      ephemeral_message_parameters?: { receiver_user_id: number };
    },
  ): Promise<{ message_id: number }>;
};

// What the conversation graph can hang off afterwards: an ephemeral notice is
// addressed to one viewer and carries no message id a reply chain could pass
// through (Telegram answers it with `message_id` 0 and a reusable
// `ephemeral_message_id`), so it reports `null` where a plain send reports its
// own id.
export type EphemeralReply = { botMsgId: number | null };

// A notice meant for whoever triggered it rather than for the chat — a failure,
// a rate limit, a usage hint. In a group it goes out ephemerally: only
// `receiverUserId` sees it, and the rest of the chat is not made to scroll past
// somebody else's error.
//
// Three cases get an ordinary reply instead. A DM has nobody to hide it from,
// and an ephemeral send there would only cost the reader their own copy. A
// sender with no user id — a message sent on behalf of a chat — has no receiver
// to name. And the ephemeral parameter is unverified on the test DCs, so a
// rejection falls back too: a notice that never arrives is worse than a public
// one.
export async function replyEphemeral(
  ctx: EphemeralReplyCtx,
  text: string,
  receiverUserId: number | undefined,
): Promise<EphemeralReply> {
  if (ctx.chat?.type === "private" || receiverUserId === undefined) {
    return replyPlain(ctx, text);
  }
  try {
    await ctx.reply(text, {
      ephemeral_message_parameters: { receiver_user_id: receiverUserId },
    });
    return { botMsgId: null };
  } catch (err) {
    console.error("ephemeral reply failed, sending plain:", err);
    return replyPlain(ctx, text);
  }
}

async function replyPlain(
  ctx: EphemeralReplyCtx,
  text: string,
): Promise<EphemeralReply> {
  const sent = await ctx.reply(text);
  return { botMsgId: sent.message_id };
}
