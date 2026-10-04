// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import type { Message } from "grammy/types";
import { newGuestToken, repliedText, splitGuestToken } from "./guest-token";
import { buildRichMarkdown } from "./format";

const message = (fields: Record<string, unknown>): Message =>
  ({ message_id: 1, date: 0, ...fields }) as unknown as Message;

describe("guest thread token", () => {
  test("a new token never looks like a chat id and differs every time", () => {
    const a = newGuestToken();
    expect(a).toMatch(/^g[0-9A-Za-z]{9}$/);
    expect(newGuestToken()).not.toBe(a);
  });

  test("bytes past the alphabet are drawn again instead of wrapping", () => {
    const draws = [
      [62, 63, 126, 127, 254, 255, 0, 1, 2],
      [61, 64, 65, 66, 67, 68, 69, 70, 71],
    ];
    const token = newGuestToken(() => new Uint8Array(draws.shift() ?? []));
    expect(token).toBe("g012z01234");
  });

  test("the token is read back off the last line of the rendered text", () => {
    const token = newGuestToken();
    expect(splitGuestToken(`Helper\n\nThe answer.\n\n${token}`)).toEqual({
      token,
      text: "Helper\n\nThe answer.",
    });
  });

  test("a message that is only the token has no text left", () => {
    expect(splitGuestToken("gAbCdEf123")).toEqual({
      token: "gAbCdEf123",
      text: "",
    });
  });

  test("no token: the text is untouched", () => {
    for (const text of [
      "The answer.",
      // Token-shaped, but not on a line of its own.
      "see gAbCdEf123",
      // On its own line, but not the last one.
      "gAbCdEf123\nmore",
      "",
    ]) {
      expect(splitGuestToken(text)).toEqual({ token: null, text });
    }
  });

  test("the footer sits outside the collapsed block and survives truncation", () => {
    const footer = "gAbCdEf123";
    const collapsed = buildRichMarkdown("x".repeat(50), "Helper", {
      collapseThreshold: 10,
      detailsSummary: "Details",
      footer,
    }).markdown;
    expect(collapsed.endsWith(`</details>\n\n${footer}`)).toBe(true);

    const truncated = buildRichMarkdown("x ".repeat(40_000), null, {
      detailsSummary: "Details",
      footer,
    }).markdown;
    expect(truncated.endsWith(`\n\n${footer}`)).toBe(true);
    expect(splitGuestToken(truncated).token).toBe("gAbCdEf123");
  });
});

describe("repliedText", () => {
  test("plain text and captions are returned as they are", () => {
    expect(repliedText(message({ text: "hi" }))).toBe("hi");
    expect(repliedText(message({ caption: "cap" }))).toBe("cap");
    expect(repliedText(message({}))).toBeNull();
  });

  test("a rich message is flattened, the token still on its last line", () => {
    const reply = message({
      rich_message: {
        blocks: [
          { type: "paragraph", text: { type: "bold", text: "Helper" } },
          {
            type: "details",
            summary: "Details",
            blocks: [
              { type: "heading", size: 2, text: "Plan" },
              {
                type: "list",
                items: [
                  {
                    label: "1.",
                    blocks: [
                      {
                        type: "paragraph",
                        text: ["boil ", { type: "italic", text: "water" }],
                      },
                    ],
                  },
                ],
              },
              {
                type: "table",
                cells: [
                  [
                    { text: "a", align: "left", valign: "top" },
                    { text: "b", align: "left", valign: "top" },
                  ],
                ],
              },
              { type: "divider" },
            ],
          },
          {
            type: "paragraph",
            text: "gAbCdEf123",
          },
        ],
      },
    });
    const text = repliedText(reply);
    expect(text).toBe("Helper\nDetails\nPlan\nboil water\na | b\ngAbCdEf123");
    expect(splitGuestToken(text ?? "")).toEqual({
      token: "gAbCdEf123",
      text: "Helper\nDetails\nPlan\nboil water\na | b",
    });
  });
});
