// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { describe, expect, test } from "bun:test";
import { t } from "../../shared/i18n";
import type { BotContext } from "../middleware/lang";
import {
  dispatchHelpCallback,
  dispatchHelpCommand,
} from "../dispatch/commands";
import {
  HELP_CALLBACK_RE,
  HELP_SECTIONS,
  helpPage,
  matchHelpCommand,
  type HelpPageId,
} from "./help";

const PAGES: HelpPageId[] = ["home", ...HELP_SECTIONS];

describe("matchHelpCommand", () => {
  test("matches /help and /start, bare or addressed to this bot", () => {
    expect(matchHelpCommand("/help", "any_bot")).toEqual({ explicit: false });
    expect(matchHelpCommand("/start", "any_bot")).toEqual({ explicit: false });
    expect(matchHelpCommand("/HELP@Any_Bot", "any_bot")).toEqual({
      explicit: true,
    });
  });

  // `/start` from a deep link carries a payload.
  test("tolerates a trailing argument", () => {
    expect(matchHelpCommand("/start ref123", "any_bot")).toEqual({
      explicit: false,
    });
  });

  test("ignores other bots and other commands", () => {
    expect(matchHelpCommand("/help@other_bot", "any_bot")).toBeNull();
    expect(matchHelpCommand("/helpme", "any_bot")).toBeNull();
    expect(matchHelpCommand("/ask help", "any_bot")).toBeNull();
  });
});

describe("helpPage", () => {
  test("the home page links every section, two to a row", () => {
    const page = helpPage("en", "home");
    expect(page.text).toBe(t("en").bot_help_home);
    const rows = page.replyMarkup.inline_keyboard;
    expect(rows.map((r) => r.length)).toEqual([2, 2]);
    const targets = rows
      .flat()
      .map((b) => ("callback_data" in b ? b.callback_data : null));
    expect(targets).toEqual(HELP_SECTIONS.map((id) => `help:${id}`));
  });

  test("a section links back home", () => {
    for (const id of HELP_SECTIONS) {
      const buttons = helpPage("ru", id).replyMarkup.inline_keyboard.flat();
      expect(buttons).toEqual([
        { text: t("ru").bot_help_btn_back, callback_data: "help:home" },
      ]);
    }
  });

  // A button whose data the listener does not match would spin forever.
  test("every button's data is routed back to the guide", () => {
    for (const lang of ["en", "ru"] as const) {
      for (const id of PAGES) {
        for (const b of helpPage(lang, id).replyMarkup.inline_keyboard.flat()) {
          const data = "callback_data" in b ? b.callback_data : "";
          expect(HELP_CALLBACK_RE.test(data)).toBe(true);
        }
      }
    }
  });

  // Pages go out with `parse_mode: "HTML"`: an unknown tag or a bare `<`/`&`
  // makes Telegram reject the whole message.
  test("every page is HTML Telegram accepts", () => {
    for (const lang of ["en", "ru"] as const) {
      for (const id of PAGES) {
        const text = helpPage(lang, id).text;
        expect(text.length).toBeGreaterThan(0);
        expect(text.length).toBeLessThanOrEqual(4096);
        const stripped = text.replace(/<\/?(b|code)>/g, "");
        expect(stripped).not.toMatch(/[<>&]/);
        for (const tag of ["b", "code"]) {
          const open = text.split(`<${tag}>`).length;
          expect(text.split(`</${tag}>`).length).toBe(open);
        }
      }
    }
  });
});

type Call = { method: string; args: unknown[] };

function fakeCtx(args: { chatType: string; ephemeralMessageId?: number }): {
  ctx: BotContext;
  calls: Call[];
} {
  const calls: Call[] = [];
  const record =
    (method: string) =>
    async (...a: unknown[]) => {
      calls.push({ method, args: a });
      return true;
    };
  const ctx = {
    lang: "en",
    t: t("en"),
    chat: { type: args.chatType },
    from: { id: 777 },
    callbackQuery: {
      message: { ephemeral_message_id: args.ephemeralMessageId },
    },
    reply: record("reply"),
    editMessageText: record("editMessageText"),
    editEphemeralMessageText: record("editEphemeralMessageText"),
    answerCallbackQuery: record("answerCallbackQuery"),
  };
  return { ctx: ctx as unknown as BotContext, calls };
}

describe("help dispatch", () => {
  test("/help in a group answers ephemerally with the home page", async () => {
    const { ctx, calls } = fakeCtx({ chatType: "supergroup" });
    await dispatchHelpCommand(ctx);
    const home = helpPage("en", "home");
    expect(calls).toEqual([
      {
        method: "reply",
        args: [
          home.text,
          {
            parse_mode: "HTML",
            reply_markup: home.replyMarkup,
            ephemeral_message_parameters: { receiver_user_id: 777 },
          },
        ],
      },
    ]);
  });

  test("a button on an ephemeral page edits it as ephemeral", async () => {
    const { ctx, calls } = fakeCtx({
      chatType: "group",
      ephemeralMessageId: 5,
    });
    await dispatchHelpCallback(ctx, "reminders");
    expect(calls.map((c) => c.method)).toEqual([
      "editEphemeralMessageText",
      "answerCallbackQuery",
    ]);
    expect(calls[0]!.args[0]).toBe(t("en").bot_help_reminders);
  });

  test("a button in a DM edits the plain message", async () => {
    const { ctx, calls } = fakeCtx({ chatType: "private" });
    await dispatchHelpCallback(ctx, "home");
    expect(calls.map((c) => c.method)).toEqual([
      "editMessageText",
      "answerCallbackQuery",
    ]);
  });
});
