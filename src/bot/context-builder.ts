import type { Storage } from "../storage/types";
import type { AIMessage } from "../ai/types";
import { MAX_REPLY_CHAIN_DEPTH, composeFullName } from "../shared/types";

export type ReplyTarget = {
  messageId: number;
  text: string | null;
  authorFirstName: string | null;
  image: Uint8Array | null;
};

export type Sender = {
  firstName: string | null;
  lastName: string | null;
  nameOverride: string | null;
};

export type BuildContextArgs = {
  storage: Storage;
  chatId: string;
  sender: Sender;
  userText: string;
  quote: string | null;
  image: Uint8Array | null;
  replyTarget: ReplyTarget | null;
  maxDepth?: number;
};

export function buildUserEnvelope(args: {
  sender: Sender;
  quote: string | null;
  text: string;
}): string {
  const override = args.sender.nameOverride?.trim() ?? "";
  const author =
    override.length > 0
      ? override
      : composeFullName(args.sender.firstName, args.sender.lastName);

  const obj: Record<string, string> = { author };
  if (args.quote !== null && args.quote !== "") obj.quote = args.quote;
  obj.text = args.text;
  return JSON.stringify(obj);
}

export async function buildContext(args: BuildContextArgs): Promise<AIMessage[]> {
  const { storage, chatId, sender, userText, quote, image, replyTarget } = args;
  const maxDepth = args.maxDepth ?? MAX_REPLY_CHAIN_DEPTH;
  const messages: AIMessage[] = [];

  if (replyTarget !== null) {
    const node = await storage.getConversation(chatId, replyTarget.messageId);
    if (node) {
      const chain = await collectChain(storage, chatId, replyTarget.messageId, maxDepth);
      for (const c of chain) {
        messages.push({ role: "user", content: c.userQuestion });
        messages.push({ role: "assistant", content: c.botAnswer });
      }
    } else {
      const author = replyTarget.authorFirstName ?? "unknown";
      const text = replyTarget.text ?? "<media>";
      const header = `Context (replied message from ${author}): ${text}`;
      if (replyTarget.image !== null) {
        messages.push({
          role: "user",
          content: [
            { type: "text", text: header },
            { type: "image", image: replyTarget.image, mediaType: "image/jpeg" },
          ],
        });
      } else {
        messages.push({ role: "user", content: header });
      }
    }
  }

  const hasQuote = quote !== null && quote.trim() !== "";
  if (userText.trim() !== "" || hasQuote || image !== null) {
    const envelope = buildUserEnvelope({ sender, quote, text: userText });
    if (image !== null) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: envelope },
          { type: "image", image, mediaType: "image/jpeg" },
        ],
      });
    } else {
      messages.push({ role: "user", content: envelope });
    }
  }
  return messages;
}

async function collectChain(
  storage: Storage,
  chatId: string,
  startBotMsgId: number,
  maxDepth: number,
): Promise<Array<{ userQuestion: string; botAnswer: string }>> {
  const chain: Array<{ userQuestion: string; botAnswer: string }> = [];
  let cursor: number | null = startBotMsgId;
  while (cursor !== null && chain.length < maxDepth) {
    const node = await storage.getConversation(chatId, cursor);
    if (!node) break;
    chain.unshift({ userQuestion: node.userQuestion, botAnswer: node.botAnswer });
    cursor = node.parentBotMsgId;
  }
  return chain;
}
