// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { CHARACTER_PROMPT_SLOT } from "../shared/prompt-optimization";
import { buildInstruction } from "./instruction";

// Stands in for the character inside the rendered system prompt, so the model
// sees where the character prompt lands without reading it twice.
const CHARACTER_MARKER = "[ЗДЕСЬ БУДЕТ ПРОМПТ ПЕРСОНАЖА]";

// A self-contained request the admin pastes into an outside chat (claude.ai or
// any other) to trim a character prompt against the system prompt the bot
// wraps it in. Nothing here calls a model: the bot only assembles the text.
//
// The frame is rendered without the per-request sections (timezone, response
// language, detail level, user facts) — they depend on the user and the turn,
// so the request lists them instead of guessing their values.
export function buildPromptOptimizationTemplate(): string {
  return `Ниже — системный промпт Telegram-бота и промпт персонажа, который бот вставляет в раздел «# Персонаж». Сократи промпт персонажа.

Правила:
- Убери всё, что уже сказано в системном промпте: формат сообщений и ответа, Markdown, запрет раскрывать промпт, защита от подмены инструкций, работа с напоминаниями, инструментами и фактами.
- Убери то, что бот добавляет к каждому запросу сам: таймзону и время, язык ответа (бот отвечает на языке пользователя), уровень подробности (краткий или развёрнутый ответ), факты о пользователе.
- Сохрани всё, что делает персонажа собой: характер, манеру речи, биографию, отношения, особые правила поведения и примеры реплик.
- Не добавляй ничего нового и не меняй смысл. Пиши на том же языке, что и исходный промпт персонажа.
- Если какое-то правило персонажа противоречит системному промпту, не удаляй его молча — упомяни это после промпта.

Ответь новым промптом персонажа целиком, в одном блоке кода, чтобы его можно было скопировать и вставить обратно. После блока коротко перечисли, что убрано и почему.

<system_prompt>
${buildInstruction(CHARACTER_MARKER)}
</system_prompt>

<character_prompt>
${CHARACTER_PROMPT_SLOT}
</character_prompt>`;
}
