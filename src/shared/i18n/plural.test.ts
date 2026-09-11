// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { pluralEn, pluralRu } from "./plural";

const en = (n: number) => pluralEn(n, "thread", "threads");
const ru = (n: number) => pluralRu(n, "диалог", "диалога", "диалогов");

describe("pluralEn", () => {
  test("only 1 is singular", () => {
    expect(en(1)).toBe("1 thread");
    expect(en(0)).toBe("0 threads");
    expect(en(2)).toBe("2 threads");
    expect(en(21)).toBe("21 threads");
    expect(en(111)).toBe("111 threads");
  });
});

describe("pluralRu", () => {
  test("the last digit picks the form", () => {
    expect(ru(1)).toBe("1 диалог");
    expect(ru(2)).toBe("2 диалога");
    expect(ru(4)).toBe("4 диалога");
    expect(ru(5)).toBe("5 диалогов");
    expect(ru(0)).toBe("0 диалогов");
  });

  test("the teens override it", () => {
    expect(ru(11)).toBe("11 диалогов");
    expect(ru(12)).toBe("12 диалогов");
    expect(ru(14)).toBe("14 диалогов");
    expect(ru(15)).toBe("15 диалогов");
  });

  test("the rule repeats past every hundred", () => {
    expect(ru(21)).toBe("21 диалог");
    expect(ru(22)).toBe("22 диалога");
    expect(ru(25)).toBe("25 диалогов");
    expect(ru(100)).toBe("100 диалогов");
    expect(ru(101)).toBe("101 диалог");
    expect(ru(111)).toBe("111 диалогов");
    expect(ru(1002)).toBe("1002 диалога");
  });

  test("each form is its own word", () => {
    expect(pluralRu(1, "ход", "хода", "ходов")).toBe("1 ход");
    expect(pluralRu(3, "ход", "хода", "ходов")).toBe("3 хода");
    expect(pluralRu(7, "ход", "хода", "ходов")).toBe("7 ходов");
  });
});
