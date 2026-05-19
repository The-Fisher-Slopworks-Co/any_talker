// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";
import type { AIMessage, AIUserContentPart } from "../ai/types";
import type { Gender } from "../shared/types";
import { MAX_REPLY_CHAIN_DEPTH, composeFullName } from "../shared/types";

export type ReplyTarget = {
  messageId: number;
  text: string | null;
  authorFirstName: string | null;
  images: Uint8Array[];
};

export type Sender = {
  firstName: string | null;
  lastName: string | null;
  nameOverride: string | null;
  gender: Gender | null;
};

export type BuildContextArgs = {
  storage: Storage;
  chatId: string;
  sender: Sender;
  userText: string;
  quote: string | null;
  images: Uint8Array[];
  replyTarget: ReplyTarget | null;
  maxDepth?: number;
  fetchPhoto?: (fileId: string) => Promise<Uint8Array | null>;
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
  if (args.sender.gender !== null) obj.gender = args.sender.gender;
  if (args.quote !== null && args.quote !== "") obj.quote = args.quote;
  obj.text = args.text;
  return JSON.stringify(obj);
}

function withImages(text: string, images: Uint8Array[]): AIUserContentPart[] {
  const parts: AIUserContentPart[] = [{ type: "text", text }];
  for (const image of images) {
    parts.push({ type: "image", image, mediaType: "image/jpeg" });
  }
  return parts;
}

export async function buildContext(args: BuildContextArgs): Promise<AIMessage[]> {
  const { storage, chatId, sender, userText, quote, images, replyTarget } = args;
  const maxDepth = args.maxDepth ?? MAX_REPLY_CHAIN_DEPTH;
  const messages: AIMessage[] = [];

  if (replyTarget !== null) {
    const node = await storage.getConversation(chatId, replyTarget.messageId);
    if (node) {
      const chain = await collectChain(storage, chatId, replyTarget.messageId, maxDepth);
      for (const c of chain) {
        const chainImages = await loadChainImages(c.userImageFileIds, args.fetchPhoto);
        if (chainImages.length > 0) {
          messages.push({
            role: "user",
            content: withImages(c.userQuestion, chainImages),
          });
        } else {
          messages.push({ role: "user", content: c.userQuestion });
        }
        messages.push({ role: "assistant", content: c.botAnswer });
      }
    } else {
      const author = replyTarget.authorFirstName ?? "unknown";
      const text = replyTarget.text ?? "<media>";
      const header = `Context (replied message from ${author}): ${text}`;
      if (replyTarget.images.length > 0) {
        messages.push({
          role: "user",
          content: withImages(header, replyTarget.images),
        });
      } else {
        messages.push({ role: "user", content: header });
      }
    }
  }

  const hasQuote = quote !== null && quote.trim() !== "";
  if (userText.trim() !== "" || hasQuote || images.length > 0) {
    const envelope = buildUserEnvelope({ sender, quote, text: userText });
    if (images.length > 0) {
      messages.push({ role: "user", content: withImages(envelope, images) });
    } else {
      messages.push({ role: "user", content: envelope });
    }
  }
  return messages;
}

type ChainEntry = {
  userQuestion: string;
  botAnswer: string;
  userImageFileIds: string[] | undefined;
};

async function collectChain(
  storage: Storage,
  chatId: string,
  startBotMsgId: number,
  maxDepth: number,
): Promise<ChainEntry[]> {
  const chain: ChainEntry[] = [];
  let cursor: number | null = startBotMsgId;
  while (cursor !== null && chain.length < maxDepth) {
    const node = await storage.getConversation(chatId, cursor);
    if (!node) break;
    chain.unshift({
      userQuestion: node.userQuestion,
      botAnswer: node.botAnswer,
      userImageFileIds: node.userImageFileIds,
    });
    cursor = node.parentBotMsgId;
  }
  return chain;
}

async function loadChainImages(
  fileIds: string[] | undefined,
  fetchPhoto: ((fileId: string) => Promise<Uint8Array | null>) | undefined,
): Promise<Uint8Array[]> {
  if (!fileIds || fileIds.length === 0 || !fetchPhoto) return [];
  const fetched = await Promise.all(
    fileIds.map((id) =>
      fetchPhoto(id).catch((err) => {
        console.error("chain photo fetch failed:", err);
        return null;
      }),
    ),
  );
  return fetched.filter((b): b is Uint8Array => b !== null);
}
