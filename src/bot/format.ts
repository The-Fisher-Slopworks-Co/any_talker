import type { MessageEntity } from "grammy/types";

export type DecoratedMessage = {
  text: string;
  entities: MessageEntity[] | undefined;
};

export function applyBotNamePrefix(
  text: string,
  botName: string | null,
): DecoratedMessage {
  const trimmed = botName?.trim() ?? "";
  if (trimmed.length === 0) return { text, entities: undefined };
  return {
    text: `${trimmed}\n${text}`,
    entities: [{ type: "bold", offset: 0, length: trimmed.length }],
  };
}
