import { test, expect, describe } from "bun:test";
import { formatTemplate } from "./format";

describe("formatTemplate", () => {
  test("substitutes {name} and {count}", () => {
    expect(
      formatTemplate("{name}. Day without sport {count}", {
        name: "Nikita",
        count: 723,
      }),
    ).toBe("Nikita. Day without sport 723");
  });

  test("substitutes all occurrences of {name}", () => {
    expect(
      formatTemplate("{name}, {name}, hello {name}", {
        name: "Bob",
        count: 1,
      }),
    ).toBe("Bob, Bob, hello Bob");
  });

  test("substitutes all occurrences of {count}", () => {
    expect(
      formatTemplate("{count} + {count} = {count}", {
        name: "x",
        count: 42,
      }),
    ).toBe("42 + 42 = 42");
  });

  test("leaves text without placeholders alone", () => {
    expect(formatTemplate("hello world", { name: "x", count: 1 })).toBe(
      "hello world",
    );
  });

  test("count=0 renders as 0", () => {
    expect(formatTemplate("{count}", { name: "x", count: 0 })).toBe("0");
  });
});
