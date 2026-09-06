// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RedisClient } from "bun";
import type { PhotosStore } from "../types/photos";
import {
  CONVERSATION_TTL_SECONDS,
  PHOTO_CACHE_TTL_SECONDS,
} from "../../shared/types";
import { photoCacheErrorsTotal } from "../../metrics";
import { PREFIX, type ScopedKey } from "./shared";

// Mixed scoping on purpose: the file-bytes cache is keyed by Telegram's global
// `fileId` and built from `PREFIX` directly (shared by every bot view), while
// the album buffers are per-character and go through `sk`.
export class KeyDBPhotosStore implements PhotosStore {
  constructor(
    private readonly client: RedisClient,
    private readonly sk: ScopedKey,
  ) {}

  async getBytes(fileId: string): Promise<Uint8Array | null> {
    const key = `${PREFIX}photo_cache:${fileId}`;
    const raw = await this.client.get(key);
    if (raw === null) return null;
    // Renew TTL on access so hot photos stay cached longer than the original
    // 7-day window if the conversation chain keeps referencing them. A
    // renewal failure is logged and counted, not raised: the photo bytes
    // are already in hand, premature eviction is the worst case.
    await this.client.expire(key, PHOTO_CACHE_TTL_SECONDS).catch((err) => {
      console.error("photo cache expire renewal failed:", err);
      photoCacheErrorsTotal.inc({ op: "ttl" });
    });
    return new Uint8Array(Buffer.from(raw, "base64"));
  }

  async saveBytes(fileId: string, bytes: Uint8Array): Promise<void> {
    const key = `${PREFIX}photo_cache:${fileId}`;
    const b64 = Buffer.from(bytes).toString("base64");
    await this.client.set(key, b64);
    await this.client.expire(key, PHOTO_CACHE_TTL_SECONDS);
  }

  async appendAlbum(
    chatId: string,
    mediaGroupId: string,
    photo: { messageId: number; fileId: string },
  ): Promise<void> {
    const key = this.sk(`album:${chatId}:${mediaGroupId}`);
    await this.client.hset(key, String(photo.messageId), photo.fileId);
    await this.client.expire(key, CONVERSATION_TTL_SECONDS);
  }

  async listAlbum(
    chatId: string,
    mediaGroupId: string,
  ): Promise<Array<{ messageId: number; fileId: string }>> {
    const key = this.sk(`album:${chatId}:${mediaGroupId}`);
    const all = await this.client.hgetall(key);
    const out: Array<{ messageId: number; fileId: string }> = [];
    for (const [field, value] of Object.entries(all)) {
      const messageId = Number(field);
      if (Number.isFinite(messageId)) out.push({ messageId, fileId: value });
    }
    return out;
  }
}
