// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import type { Tool } from "./registry";

const Schema = z.object({
  items: z.array(z.string()).min(1),
});

type Input = z.infer<typeof Schema>;

export const randomChoiceTool: Tool<Input, string> = {
  name: "random_choice",
  description:
    "Pick one item at random from a non-empty list of strings. Use this when the user asks to choose, pick, or decide between several options.",
  parameters: Schema,
  execute: ({ items }, _ctx) =>
    items[Math.floor(Math.random() * items.length)]!,
};
