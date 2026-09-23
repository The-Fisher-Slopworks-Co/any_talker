// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Where the character prompt goes in the optimization request the server
// renders (`ai/prompt-optimization.ts`). The Web App fills it with whatever the
// admin has in the textarea right now, saved or not, so the copy happens in the
// click handler itself with no request in between: clipboard writes need the
// user's gesture, which an awaited fetch can use up.
export const CHARACTER_PROMPT_SLOT = "{{CHARACTER_PROMPT}}";

// split/join rather than String.replace: a prompt containing `$&` or `$1`
// would otherwise be read as a replacement pattern.
export function fillOptimizationTemplate(
  template: string,
  characterPrompt: string,
): string {
  return template.split(CHARACTER_PROMPT_SLOT).join(characterPrompt.trim());
}
