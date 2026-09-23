// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { describe, expect, test } from "bun:test";
import { buildInstruction } from "./instruction";
import { buildPromptOptimizationTemplate } from "./prompt-optimization";
import {
  CHARACTER_PROMPT_SLOT,
  fillOptimizationTemplate,
} from "../shared/prompt-optimization";

describe("buildPromptOptimizationTemplate", () => {
  test("embeds the system prompt the bot wraps a character in", () => {
    const template = buildPromptOptimizationTemplate();
    // The character section is the only part that varies with the prompt, so
    // everything up to it must match what `buildInstruction` renders.
    const frame = buildInstruction("X");
    const head = frame.slice(0, frame.indexOf("X"));
    expect(template).toContain(head);
    expect(template).toContain("<system_prompt>");
  });

  test("leaves exactly one slot for the character prompt", () => {
    const template = buildPromptOptimizationTemplate();
    expect(template.split(CHARACTER_PROMPT_SLOT)).toHaveLength(2);
  });
});

describe("fillOptimizationTemplate", () => {
  test("puts the trimmed character prompt into the slot", () => {
    const text = fillOptimizationTemplate(
      buildPromptOptimizationTemplate(),
      "  Ты пират.\n",
    );
    expect(text).toContain(
      "<character_prompt>\nТы пират.\n</character_prompt>",
    );
    expect(text).not.toContain(CHARACTER_PROMPT_SLOT);
  });

  test("keeps replacement-pattern characters in the prompt verbatim", () => {
    const text = fillOptimizationTemplate(
      `a ${CHARACTER_PROMPT_SLOT} b`,
      "costs $& and $1",
    );
    expect(text).toBe("a costs $& and $1 b");
  });
});
