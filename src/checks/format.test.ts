import { test, expect, describe } from "bun:test";
import { formatTemplate } from "./format";

describe("formatTemplate", () => {
  test("substitutes {name} as an HTML mention link to tg://user", () => {
    expect(
      formatTemplate("{name}, hi", {
        targetUserId: "42",
        name: "Nikita",
        count: 0,
      }),
    ).toBe(`<a href="tg://user?id=42">Nikita</a>, hi`);
  });

  test("substitutes {count} with the numeric value", () => {
    expect(
      formatTemplate("Day {count}", {
        targetUserId: "42",
        name: "x",
        count: 723,
      }),
    ).toBe("Day 723");
  });

  test("substitutes both {name} and {count} in the example sentence", () => {
    expect(
      formatTemplate("{name}. Day without sport {count}", {
        targetUserId: "42",
        name: "Nikita",
        count: 723,
      }),
    ).toBe(
      `<a href="tg://user?id=42">Nikita</a>. Day without sport 723`,
    );
  });

  test("HTML-escapes literal characters in the template", () => {
    expect(
      formatTemplate("<b>{name}</b> & co", {
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
      formatTemplate("{name}", {
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
      formatTemplate("{name}", {
        targetUserId: `4"2`,
        name: "x",
        count: 0,
      }),
    ).toBe(`<a href="tg://user?id=4&quot;2">x</a>`);
  });

  test("emits the mention for every {name} occurrence", () => {
    expect(
      formatTemplate("{name}, {name}!", {
        targetUserId: "42",
        name: "Bob",
        count: 0,
      }),
    ).toBe(
      `<a href="tg://user?id=42">Bob</a>, <a href="tg://user?id=42">Bob</a>!`,
    );
  });

  test("renders count=0 as 0", () => {
    expect(
      formatTemplate("{count}", {
        targetUserId: "1",
        name: "x",
        count: 0,
      }),
    ).toBe("0");
  });

  test("leaves text without placeholders alone (only HTML-escaping)", () => {
    expect(
      formatTemplate("hello world", {
        targetUserId: "1",
        name: "x",
        count: 0,
      }),
    ).toBe("hello world");
  });
});
