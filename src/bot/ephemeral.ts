// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Everything `replyEphemeral` needs from a `BotContext`, spelled structurally
// so a test can hand it a plain object — the shape `SyncCommandsApi` takes for
// `setMyCommands`.
export type EphemeralReplyCtx = {
  chat?: { type: string } | undefined;
  reply(
    text: string,
    other?: {
      ephemeral_message_parameters?: { receiver_user_id: number };
    },
  ): Promise<unknown>;
};

// The answer to a command the bot menu declares `is_ephemeral` (`bot/commands.ts`
// — `/feedback` and `/usage`). Such a command answers the person who typed it
// and nobody else, so every one of its answers is ephemeral: the recorded line,
// the usage hint, the daily cap, the limit report. There is no case in which it
// may put a message in front of the rest of the chat.
//
// Which is why a rejected ephemeral send is only logged. Falling back to a
// plain reply — what this used to do — breaks exactly the promise the menu
// made, and it breaks it on the error path, where the reporter is least likely
// to expect the chat to see anything. The parameter is unverified on the test
// DCs, so the fallback is not hypothetical.
//
// A DM is the one chat that gets an ordinary reply, and it is no exception to
// the rule: nobody is hidden from there, the menu lists the command without the
// flag (see `PRIVATE_COMMANDS_*`), and an ephemeral send would only cost the
// reader their own copy of the answer.
export async function replyEphemeral(
  ctx: EphemeralReplyCtx,
  text: string,
  receiverUserId: number,
): Promise<void> {
  if (ctx.chat?.type === "private") {
    await ctx.reply(text);
    return;
  }
  try {
    await ctx.reply(text, {
      ephemeral_message_parameters: { receiver_user_id: receiverUserId },
    });
  } catch (err) {
    console.error("ephemeral reply failed, dropping the answer:", err);
  }
}
