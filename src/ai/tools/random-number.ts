import { z } from "zod";
import type { Tool } from "./registry";

const Schema = z
  .object({
    min: z.number().int(),
    max: z.number().int(),
  })
  .refine((v) => v.min <= v.max, { message: "min must be <= max" });

type Input = z.infer<typeof Schema>;

export const randomNumberTool: Tool<Input, number> = {
  name: "random_number",
  description:
    "Pick a random integer in the inclusive range [min, max]. Use this when the user asks to think of, guess, or roll a number.",
  parameters: Schema,
  execute: ({ min, max }) => Math.floor(Math.random() * (max - min + 1)) + min,
};
