import type { Storage } from "../storage/types";
import type { AIMessage } from "../ai/types";
import { MAX_REPLY_CHAIN_DEPTH } from "../shared/types";

export type ReplyTarget = {
  messageId: number;
  text: string | null;
  authorFirstName: string | null;
};

export type BuildContextArgs = {
  storage: Storage;
  chatId: string;
  userText: string;
  replyTarget: ReplyTarget | null;
  maxDepth?: number;
};

export async function buildContext(args: BuildContextArgs): Promise<AIMessage[]> {
  const { storage, chatId, userText, replyTarget } = args;
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
      messages.push({
        role: "user",
        content: `Context (replied message from ${author}): ${text}`,
      });
    }
  }

  if (userText.trim() !== "") {
    messages.push({ role: "user", content: userText });
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
