// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { replyEphemeral, type EphemeralReplyCtx } from "./ephemeral";

type ReplyCall = {
  text: string;
  other?:
    { ephemeral_message_parameters?: { receiver_user_id: number } } | undefined;
};

function makeCtx(args: {
  chatType: string;
  // Throws on the ephemeral send, the way an unsupported parameter would.
  rejectEphemeral?: boolean;
  messageId?: number;
}): EphemeralReplyCtx & { calls: ReplyCall[] } {
  const calls: ReplyCall[] = [];
  return {
    calls,
    chat: { type: args.chatType },
    async reply(text, other) {
      calls.push({ text, other });
      if (args.rejectEphemeral && other?.ephemeral_message_parameters) {
        throw new Error("Bad Request: ephemeral messages are not supported");
      }
      return { message_id: args.messageId ?? 42 };
    },
  };
}

describe("replyEphemeral", () => {
  test("addresses the receiver in a group and reports no message id", async () => {
    const ctx = makeCtx({ chatType: "supergroup" });

    const reply = await replyEphemeral(ctx, "rate limited", 777);

    expect(ctx.calls).toEqual([
      {
        text: "rate limited",
        other: { ephemeral_message_parameters: { receiver_user_id: 777 } },
      },
    ]);
    // Nothing the chat can reply to, so nothing the conversation graph can
    // hang off — the caller falls back to the ask message.
    expect(reply.botMsgId).toBeNull();
  });

  // A DM has nobody to hide the notice from, and an ephemeral send there would
  // only cost the reader their own copy.
  test("sends a plain reply in a private chat", async () => {
    const ctx = makeCtx({ chatType: "private", messageId: 11 });

    const reply = await replyEphemeral(ctx, "ai error", 777);

    expect(ctx.calls).toEqual([{ text: "ai error", other: undefined }]);
    expect(reply.botMsgId).toBe(11);
  });

  // A message sent on behalf of a chat has no user id to name as the receiver.
  test("sends a plain reply when there is no receiver", async () => {
    const ctx = makeCtx({ chatType: "supergroup", messageId: 12 });

    const reply = await replyEphemeral(ctx, "ai error", undefined);

    expect(ctx.calls).toEqual([{ text: "ai error", other: undefined }]);
    expect(reply.botMsgId).toBe(12);
  });

  // A notice that never arrives is worse than a public one.
  test("falls back to a plain reply when the ephemeral send is rejected", async () => {
    const ctx = makeCtx({
      chatType: "group",
      rejectEphemeral: true,
      messageId: 13,
    });

    const reply = await replyEphemeral(ctx, "ai error", 777);

    expect(ctx.calls).toHaveLength(2);
    expect(ctx.calls[0]!.other).toEqual({
      ephemeral_message_parameters: { receiver_user_id: 777 },
    });
    expect(ctx.calls[1]).toEqual({ text: "ai error", other: undefined });
    // The fallback is an ordinary message, so it carries an id again.
    expect(reply.botMsgId).toBe(13);
  });

  test("propagates a failure of the plain send", async () => {
    const ctx: EphemeralReplyCtx = {
      chat: { type: "private" },
      async reply() {
        throw new Error("chat not found");
      },
    };

    await expect(replyEphemeral(ctx, "ai error", 777)).rejects.toThrow(
      "chat not found",
    );
  });
});
