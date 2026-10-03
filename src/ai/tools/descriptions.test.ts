// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { z } from "zod";
import { MemoryStorage } from "../../storage/memory";
import type { Tool } from "./registry";
import { calculatorTool } from "./calculator";
import { currencyConvertTool } from "./currency-convert";
import { fetchPageTool } from "./fetch-page";
import { randomChoiceTool } from "./random-choice";
import { randomNumberTool } from "./random-number";
import { createReminderTools } from "./reminders";
import { createSearchWebTool } from "./search-web";
import { createUserFactsTools } from "./user-facts";
import { createUserSettingsTools } from "./user-settings";
import { createYoutubeTranscriptTool } from "./youtube-transcript";

// Every tool definition goes out with every model call of every turn, so its
// size is paid for on each request. These budgets keep the descriptions from
// growing back; raise them deliberately, not to make a new sentence fit.
const MAX_DESCRIPTION_CHARS = 1200;
const MAX_TOTAL_DEFINITION_CHARS = 13_000;

function allTools(): Tool[] {
  const storage = new MemoryStorage();
  return [
    randomNumberTool,
    randomChoiceTool,
    currencyConvertTool,
    calculatorTool,
    fetchPageTool,
    createSearchWebTool("key", 1),
    createYoutubeTranscriptTool("key"),
    ...createReminderTools({ storage }),
    ...createUserFactsTools({ storage }),
    ...createUserSettingsTools({ storage }),
  ] as Tool[];
}

// Roughly what reaches the provider for one tool: name, description and the
// JSON Schema of its parameters.
function definitionChars(tool: Tool): number {
  return JSON.stringify({
    name: tool.name,
    description: tool.description,
    parameters: z.toJSONSchema(tool.parameters),
  }).length;
}

describe("tool descriptions", () => {
  test.each(allTools().map((t) => [t.name, t] as const))(
    "%s stays within the per-tool budget",
    (_name, tool) => {
      expect(tool.description.length).toBeLessThanOrEqual(
        MAX_DESCRIPTION_CHARS,
      );
    },
  );

  test("all definitions together stay within the total budget", () => {
    const total = allTools().reduce((sum, t) => sum + definitionChars(t), 0);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_DEFINITION_CHARS);
  });

  test("update_user_settings keeps its timezone rules", () => {
    const tool = allTools().find((t) => t.name === "update_user_settings");
    expect(tool?.description).toContain("ONLY when the user explicitly names");
    expect(tool?.description).toContain("set the timezone FIRST");
  });
});
