import { escapeHtmlText } from "./html";

export type DecoratedMessage = {
  text: string;
  parseMode: "HTML";
};

export function applyBotNamePrefix(
  sanitizedBody: string,
  botName: string | null,
): DecoratedMessage {
  const trimmed = botName?.trim() ?? "";
  if (trimmed.length === 0) return { text: sanitizedBody, parseMode: "HTML" };
  return {
    text: `<b>${escapeHtmlText(trimmed)}</b>\n${sanitizedBody}`,
    parseMode: "HTML",
  };
}
