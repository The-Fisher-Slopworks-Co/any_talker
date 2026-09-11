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
  // Rejects the ephemeral send, the way an unsupported parameter would.
  rejectEphemeral?: boolean;
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
      return { message_id: 42 };
    },
  };
}

describe("replyEphemeral", () => {
  test("addresses the reporter in a group", async () => {
    const ctx = makeCtx({ chatType: "supergroup" });

    await replyEphemeral(ctx, "Your report is saved.", 777);

    expect(ctx.calls).toEqual([
      {
        text: "Your report is saved.",
        other: { ephemeral_message_parameters: { receiver_user_id: 777 } },
      },
    ]);
  });

  // The regression this module exists for: the fallback used to put the answer
  // in front of the whole chat, which is the one thing an ephemeral command may
  // never do.
  test("drops the answer when the ephemeral send is rejected", async () => {
    const ctx = makeCtx({ chatType: "group", rejectEphemeral: true });

    await replyEphemeral(ctx, "Too many reports.", 777);

    expect(ctx.calls).toHaveLength(1);
    expect(ctx.calls[0]!.other).toEqual({
      ephemeral_message_parameters: { receiver_user_id: 777 },
    });
  });

  // A DM has nobody to hide the answer from, and an ephemeral send there would
  // only cost the reader their own copy.
  test("sends a plain reply in a private chat", async () => {
    const ctx = makeCtx({ chatType: "private" });

    await replyEphemeral(ctx, "Your report is saved.", 777);

    expect(ctx.calls).toEqual([
      { text: "Your report is saved.", other: undefined },
    ]);
  });

  // Only the ephemeral attempt is swallowed; a DM that cannot be written to is
  // a real failure and belongs in `bot.catch`.
  test("propagates a failure of the private-chat reply", async () => {
    const ctx: EphemeralReplyCtx = {
      chat: { type: "private" },
      async reply() {
        throw new Error("chat not found");
      },
    };

    await expect(
      replyEphemeral(ctx, "Your report is saved.", 777),
    ).rejects.toThrow("chat not found");
  });
});
