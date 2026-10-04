// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Avatar, avatarInitials, peerColorIndex } from "./avatar";

describe("avatarInitials", () => {
  test("takes the first letters of up to two words", () => {
    expect(avatarInitials("Alex")).toBe("A");
    expect(avatarInitials("taylor kim")).toBe("TK");
    expect(avatarInitials("Weekend Hikers Club")).toBe("WH");
  });

  test("skips punctuation and emoji at the start of a word", () => {
    expect(avatarInitials("@alex_morgan")).toBe("A");
    expect(avatarInitials("🔥 Book Club")).toBe("BC");
  });

  test("falls back to a question mark", () => {
    expect(avatarInitials("")).toBe("?");
    expect(avatarInitials("  🔥 ")).toBe("?");
  });
});

describe("peerColorIndex", () => {
  test("is the id modulo 7", () => {
    expect(peerColorIndex("1000002")).toBe(1000002 % 7);
    expect(peerColorIndex("7")).toBe(0);
  });

  test("uses the bare id Telegram does for group chats", () => {
    expect(peerColorIndex("-12345")).toBe(12345 % 7);
    // A supergroup's Bot API id is "-100" plus its real one.
    expect(peerColorIndex("-1001000000001")).toBe(1000000001 % 7);
  });

  test("is stable for ids that are not integers", () => {
    expect(peerColorIndex("demo")).toBe(peerColorIndex("demo"));
  });
});

describe("Avatar markup", () => {
  test("draws the initials on the peer gradient at the row size", () => {
    const html = renderToStaticMarkup(<Avatar id="3" name="Sam Rivera" />);
    expect(html).toContain(">SR<");
    expect(html).toContain("#a0de7e");
    expect(html).toContain("h-9 w-9");
  });

  test("grows to the hero size", () => {
    const html = renderToStaticMarkup(<Avatar id="3" name="Sam" size="hero" />);
    expect(html).toContain("h-[84px]");
  });
});
