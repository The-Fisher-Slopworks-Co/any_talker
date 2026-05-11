import { test, expect, describe } from "bun:test";
import { formatQuestion, formatReply } from "./format";

describe("formatQuestion", () => {
  test("substitutes {name} as an HTML mention link to tg://user", () => {
    expect(
      formatQuestion("{name}, hi", {
        targetUserId: "42",
        name: "Nikita",
        count: 0,
      }),
    ).toBe(`<a href="tg://user?id=42">Nikita</a>, hi`);
  });

  test("substitutes {count} with the numeric value", () => {
    expect(
      formatQuestion("Day {count}", {
        targetUserId: "42",
        name: "x",
        count: 723,
      }),
    ).toBe("Day 723");
  });

  test("HTML-escapes literal characters in the template", () => {
    expect(
      formatQuestion("<b>{name}</b> & co", {
        targetUserId: "42",
        name: "Nikita",
        count: 0,
      }),
    ).toBe(
      `&lt;b&gt;<a href="tg://user?id=42">Nikita</a>&lt;/b&gt; &amp; co`,
    );
  });

  test("HTML-escapes special characters inside the name", () => {
    expect(
      formatQuestion("{name}", {
        targetUserId: "42",
        name: `Bob <hax> & "y"`,
        count: 0,
      }),
    ).toBe(
      `<a href="tg://user?id=42">Bob &lt;hax&gt; &amp; "y"</a>`,
    );
  });

  test("HTML-escapes special characters in the userId attribute", () => {
    expect(
      formatQuestion("{name}", {
        targetUserId: `4"2`,
        name: "x",
        count: 0,
      }),
    ).toBe(`<a href="tg://user?id=4&quot;2">x</a>`);
  });

  test("emits the mention for every {name} occurrence", () => {
    expect(
      formatQuestion("{name}, {name}!", {
        targetUserId: "42",
        name: "Bob",
        count: 0,
      }),
    ).toBe(
      `<a href="tg://user?id=42">Bob</a>, <a href="tg://user?id=42">Bob</a>!`,
    );
  });
});

describe("formatReply", () => {
  test("substitutes {name} as plain text without an HTML link", () => {
    expect(
      formatReply("{name}. Day without sport {count}", {
        name: "Nikita",
        count: 723,
      }),
    ).toBe("Nikita. Day without sport 723");
  });

  test("does NOT HTML-escape special characters", () => {
    expect(
      formatReply("<b>{name}</b> & co", {
        name: "Nikita",
        count: 0,
      }),
    ).toBe("<b>Nikita</b> & co");
  });

  test("substitutes all occurrences of {name} and {count}", () => {
    expect(
      formatReply("{name}, {name}! {count}+{count}", {
        name: "Bob",
        count: 7,
      }),
    ).toBe("Bob, Bob! 7+7");
  });

  test("count=0 renders as 0", () => {
    expect(formatReply("{count}", { name: "x", count: 0 })).toBe("0");
  });

  test("leaves text without placeholders alone", () => {
    expect(formatReply("hello world", { name: "x", count: 1 })).toBe(
      "hello world",
    );
  });
});
