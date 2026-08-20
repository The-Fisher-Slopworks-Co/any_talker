// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";
import type { AIMessage, AIUserContentPart } from "../ai/types";
import type { Gender, ToolCallRecord } from "../shared/types";
import { MAX_REPLY_CHAIN_DEPTH, composeFullName } from "../shared/types";
import { localDateTimeString } from "../shared/tz";
import { TRANSCODED_AUDIO_MEDIA_TYPE } from "./transcode";
import type { VideoClip } from "./video";

export type ReplyTarget = {
  messageId: number;
  text: string | null;
  authorFirstName: string | null;
  images: Uint8Array[];
  audios?: Uint8Array[];
  // Whole clips, when the answering model takes video natively.
  videos?: VideoClip[];
  // What the attached media actually is, when that isn't self-evident — in
  // frames mode a video arrives as stills, which would read as loose photos.
  mediaNote?: string;
};

// Picks the storage view that holds a chat's conversation graph.
//
// Conversation nodes in a *group* chat are shared across the whole bot family
// (the main bot + every managed bot) by keeping them in the main bot's
// namespace (`forBot(null)`). That lets a reply to ANY family bot's message
// carry the full conversation chain when a DIFFERENT bot answers — cross-bot
// context — and links the answering bot's new node to the replied-to one across
// the bot boundary. Within a single group, Telegram message ids are unique
// across all senders, so there is no key collision.
//
// Private chats stay per-character (`forBot(botId)`): a DM's `chat.id` equals
// the user id, so two bots' DMs with the same user share a chat id while having
// independent message-id sequences — a shared namespace would collide (and leak
// one character's DM into another's). Cross-bot context is also moot in a DM,
// since each bot's DM is a separate physical chat.
//
// Telegram group/supergroup/channel ids are negative; a private chat id is the
// (positive) user id — which is what distinguishes the two cases here.
export function conversationStorage(
  base: Storage,
  botId: string | null,
  chatId: string,
): Storage {
  const isGroupChat = chatId.startsWith("-");
  return base.forBot(isGroupChat ? null : botId);
}

// Telegram voice notes are ogg/opus; they're transcoded to mp3 at the download
// boundary (see `bot/transcode.ts`) before reaching here, because the
// OpenAI-compatible `input_audio` field accepts only wav/mp3.
const VOICE_MEDIA_TYPE = TRANSCODED_AUDIO_MEDIA_TYPE;

export type Sender = {
  firstName: string | null;
  lastName: string | null;
  nameOverride: string | null;
  gender: Gender | null;
};

// When a turn was sent, as the model sees it: the instant plus the timezone to
// read it in. Carried per message rather than in the system prompt so the
// prompt's cacheable prefix survives — see the comment on `timeSection`
// (`ai/instruction.ts`). `null` omits the stamp (older stored turns predate it,
// and tests that don't care about the clock pass null).
export type SentAt = { ms: number; timezone: string };

export type BuildContextArgs = {
  storage: Storage;
  chatId: string;
  sender: Sender;
  userText: string;
  quote: string | null;
  images: Uint8Array[];
  audios?: Uint8Array[];
  videos?: VideoClip[];
  attachments?: string;
  replyTarget: ReplyTarget | null;
  // Stamped onto the new user turn. Callers that persist the same turn must
  // reuse the very same value (see `ask.ts`), or the stored envelope would
  // differ from the one the model saw and break the cache on the next turn.
  sentAt: SentAt | null;
  maxDepth?: number;
  fetchPhoto?: (fileId: string) => Promise<Uint8Array | null>;
};

export function buildUserEnvelope(args: {
  sender: Sender;
  quote: string | null;
  text: string;
  sentAt: SentAt | null;
  // Describes media that isn't self-evident from the parts themselves (video
  // frames). Persisted with the turn, so a follow-up reads the same envelope.
  attachments?: string;
}): string {
  const override = args.sender.nameOverride?.trim() ?? "";
  const author =
    override.length > 0
      ? override
      : composeFullName(args.sender.firstName, args.sender.lastName);

  const obj: Record<string, string> = { author };
  if (args.sender.gender !== null) obj.gender = args.sender.gender;
  if (args.sentAt) {
    obj.time = localDateTimeString(args.sentAt.ms, args.sentAt.timezone);
  }
  if (args.quote !== null && args.quote !== "") obj.quote = args.quote;
  if (args.attachments) obj.attachments = args.attachments;
  obj.text = args.text;
  return JSON.stringify(obj);
}

export function withMedia(
  text: string,
  images: Uint8Array[],
  audios: Uint8Array[],
  videos: VideoClip[] = [],
): AIUserContentPart[] {
  const parts: AIUserContentPart[] = [{ type: "text", text }];
  for (const image of images) {
    parts.push({ type: "image", image, mediaType: "image/jpeg" });
  }
  for (const audio of audios) {
    parts.push({ type: "audio", audio, mediaType: VOICE_MEDIA_TYPE });
  }
  // Whole clips, for a model that takes video natively; a model that doesn't
  // never gets one — the dispatcher hands over sampled frames as images instead.
  for (const clip of videos) {
    parts.push({ type: "video", video: clip.bytes, mediaType: clip.mediaType });
  }
  return parts;
}

// The unknown-reply fallback: a replied-to message that no stored context
// (conversation node / guest thread) can speak for is surfaced verbatim,
// media included. Shared by /ask's `buildContext` and the guest flow so both
// present replies to the model identically.
export function buildReplyFallbackMessage(replyTarget: ReplyTarget): AIMessage {
  const author = replyTarget.authorFirstName ?? "unknown";
  const text = replyTarget.text ?? "<media>";
  const note = replyTarget.mediaNote ? `, ${replyTarget.mediaNote}` : "";
  const header = `Context (replied message from ${author}${note}): ${text}`;
  const replyAudios = replyTarget.audios ?? [];
  const replyVideos = replyTarget.videos ?? [];
  if (
    replyTarget.images.length > 0 ||
    replyAudios.length > 0 ||
    replyVideos.length > 0
  ) {
    return {
      role: "user",
      content: withMedia(header, replyTarget.images, replyAudios, replyVideos),
    };
  }
  return { role: "user", content: header };
}

// Replays a past turn's tool calls as what they were. Each record becomes one
// `tool` message, which `ai/responses-input.ts` expands back into the
// provider's `function_call` / `function_call_output` pair — the model sees its
// own call and the result it was given, in the same shape as when it made them.
export function toolCallMessages(records: ToolCallRecord[]): AIMessage[] {
  return records.map((r) => ({ role: "tool", ...r }));
}

export async function buildContext(args: BuildContextArgs): Promise<AIMessage[]> {
  const { storage, chatId, sender, userText, quote, images, replyTarget } = args;
  const audios = args.audios ?? [];
  const videos = args.videos ?? [];
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
            content: withMedia(c.userQuestion, chainImages, []),
          });
        } else {
          messages.push({ role: "user", content: c.userQuestion });
        }
        // Between the question and the answer, where the calls actually
        // happened. Appending after the question rather than before it also
        // keeps the cacheable prefix of every older turn byte-identical.
        if (c.toolCalls) messages.push(...toolCallMessages(c.toolCalls));
        messages.push({ role: "assistant", content: c.botAnswer });
      }
    } else {
      messages.push(buildReplyFallbackMessage(replyTarget));
    }
  }

  const hasQuote = quote !== null && quote.trim() !== "";
  // A bare /ask replying into a stored chain adds no content of its own, but
  // the prompt must still end with a user turn: a chat-completions prompt
  // ending on an assistant message reads as a prefill of an already-complete
  // answer, and models reliably "continue" it with an empty completion.
  const endsWithAssistant = messages.at(-1)?.role === "assistant";
  if (
    userText.trim() !== "" ||
    hasQuote ||
    images.length > 0 ||
    audios.length > 0 ||
    videos.length > 0 ||
    endsWithAssistant
  ) {
    const envelope = buildUserEnvelope({
      sender,
      quote,
      text: userText,
      attachments: args.attachments,
      sentAt: args.sentAt,
    });
    if (images.length > 0 || audios.length > 0 || videos.length > 0) {
      messages.push({
        role: "user",
        content: withMedia(envelope, images, audios, videos),
      });
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
  toolCalls: ToolCallRecord[] | undefined;
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
      toolCalls: node.toolCalls,
    });
    cursor = node.parentBotMsgId;
  }
  return chain;
}

export async function loadChainImages(
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
