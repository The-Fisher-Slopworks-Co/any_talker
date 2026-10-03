// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";
import type { AIMessage, AIUserContentPart } from "../ai/types";
import { append, emptyTranscript, type Transcript } from "../ai/transcript";
import type { Gender, ToolCallRecord, TurnAuthor } from "../shared/types";
import { composeFullName } from "../shared/types";
import { messageTimeString } from "../shared/tz";
import { TRANSCODED_AUDIO_MEDIA_TYPE } from "./transcode";
import type { VideoClip } from "./video";
import { profileField, type UserProfile } from "./profile";

export type ReplyTarget = {
  messageId: number;
  text: string | null;
  authorFirstName: string | null;
  images: Uint8Array[];
  audios?: Uint8Array[] | undefined;
  // Whole clips, when the answering model takes video natively.
  videos?: VideoClip[] | undefined;
  // What the attached media actually is, when that isn't self-evident — in
  // frames mode a video arrives as stills, which would read as loose photos.
  mediaNote?: string | undefined;
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
//
// `conversationBotId` is the scope on its own, for the caller that stores it
// rather than a view of it: an entry in the per-user thread index names the
// scope its nodes live in, and is resolved later through `storage.forBot`.
export function conversationBotId(
  botId: string | null,
  chatId: string,
): string | null {
  const isGroupChat = chatId.startsWith("-");
  return isGroupChat ? null : botId;
}

export function conversationStorage(
  base: Storage,
  botId: string | null,
  chatId: string,
): Storage {
  return base.forBot(conversationBotId(botId, chatId));
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
  audios?: Uint8Array[] | undefined;
  videos?: VideoClip[] | undefined;
  attachments?: string | undefined;
  replyTarget: ReplyTarget | null;
  // Stamped onto the new user turn. Callers that persist the same turn must
  // reuse the very same value (see `ask.ts`), or the stored envelope would
  // differ from the one the model saw and break the cache on the next turn.
  sentAt: SentAt | null;
  // The author's profile when the new turn has to carry it (`profileToCarry`),
  // null when the chain already says it. Same rule as `sentAt`: a caller that
  // persists the turn passes the very same value.
  profile?: UserProfile | null | undefined;
  fetchPhoto?: ((fileId: string) => Promise<Uint8Array | null>) | undefined;
};

export function buildUserEnvelope(args: {
  sender: Sender;
  quote: string | null;
  text: string;
  sentAt: SentAt | null;
  // See `BuildContextArgs.profile`.
  profile?: UserProfile | null | undefined;
  // Describes media that isn't self-evident from the parts themselves (video
  // frames). Persisted with the turn, so a follow-up reads the same envelope.
  attachments?: string | undefined;
}): string {
  const override = args.sender.nameOverride?.trim() ?? "";
  const author =
    override.length > 0
      ? override
      : composeFullName(args.sender.firstName, args.sender.lastName);

  const obj: Record<string, unknown> = { author };
  if (args.sender.gender !== null) obj.gender = args.sender.gender;
  if (args.sentAt) {
    obj.time = messageTimeString(args.sentAt.ms, args.sentAt.timezone);
  }
  if (args.profile) obj.profile = profileField(args.profile);
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

export async function buildContext(
  args: BuildContextArgs,
): Promise<Transcript> {
  const { storage, chatId, sender, userText, quote, images, replyTarget } =
    args;
  const audios = args.audios ?? [];
  const videos = args.videos ?? [];
  let messages = emptyTranscript;

  if (replyTarget !== null) {
    const node = await storage.conversations.get(chatId, replyTarget.messageId);
    if (node) {
      const chain = await collectChain(storage, chatId, replyTarget.messageId);
      // `collectChain` walks parents from the replied-to node and unshifts, so
      // the replied-to node is always the LAST entry.
      for (const [i, c] of chain.entries()) {
        let chainImages = await loadChainImages(
          c.userImageFileIds,
          args.fetchPhoto,
        );
        // A stored file id was issued to whichever family bot persisted the
        // node, and Telegram file ids are bot-scoped — so when a DIFFERENT
        // family bot continues a shared-graph chain, the reload above comes
        // back short. For the replied-to node the dispatcher already fetched
        // the media through this bot's own update (`replyTarget.images`), so
        // prefer those bytes over silently dropping the images. When the
        // reload succeeded (same bot), it already covers the reply's images —
        // the count check keeps them from being attached twice.
        if (
          i === chain.length - 1 &&
          chainImages.length < replyTarget.images.length
        ) {
          chainImages = replyTarget.images;
        }
        if (chainImages.length > 0) {
          messages = append(messages, {
            role: "user",
            content: withMedia(c.userQuestion, chainImages, []),
          });
        } else {
          messages = append(messages, {
            role: "user",
            content: c.userQuestion,
          });
        }
        // Between the question and the answer, where the calls actually
        // happened. Appending after the question rather than before it also
        // keeps the cacheable prefix of every older turn byte-identical.
        if (c.toolCalls) {
          messages = append(messages, ...toolCallMessages(c.toolCalls));
        }
        messages = append(messages, {
          role: "assistant",
          content: c.botAnswer,
        });
      }
    } else {
      messages = append(messages, buildReplyFallbackMessage(replyTarget));
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
      profile: args.profile,
    });
    if (images.length > 0 || audios.length > 0 || videos.length > 0) {
      messages = append(messages, {
        role: "user",
        content: withMedia(envelope, images, audios, videos),
      });
    } else {
      messages = append(messages, { role: "user", content: envelope });
    }
  }
  return messages;
}

// The stored turns a reply into a chain replays, oldest first, as far as
// `profileToCarry` needs to see them. Empty when the replied-to message is not
// a stored turn.
export async function chainAuthors(
  storage: Storage,
  chatId: string,
  replyTarget: ReplyTarget | null,
): Promise<Array<{ author?: TurnAuthor | undefined }>> {
  if (replyTarget === null) return [];
  return collectChain(storage, chatId, replyTarget.messageId);
}

type ChainEntry = {
  author: TurnAuthor | undefined;
  userQuestion: string;
  botAnswer: string;
  userImageFileIds: string[] | undefined;
  toolCalls: ToolCallRecord[] | undefined;
};

// The whole chain, root first. Deliberately uncapped: a window that kept only
// the newest N turns would drop the oldest one on every new turn, so the
// request would never start the way the previous one did and the prompt cache
// would miss the whole history each time. The chain is append-only, and so is
// what is sent of it.
//
// `seen` guards against a parent pointer that loops back (only possible with
// corrupt data — a reply always points at an older message): the walk stops
// instead of spinning forever.
async function collectChain(
  storage: Storage,
  chatId: string,
  startBotMsgId: number,
): Promise<ChainEntry[]> {
  const chain: ChainEntry[] = [];
  const seen = new Set<number>();
  let cursor: number | null = startBotMsgId;
  while (cursor !== null && !seen.has(cursor)) {
    seen.add(cursor);
    const node = await storage.conversations.get(chatId, cursor);
    if (!node) break;
    chain.unshift({
      author: node.author,
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
