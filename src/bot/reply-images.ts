// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Message } from "grammy/types";
import type { Storage } from "../storage/types";
import { pickPhotoSize } from "./photo";

export type ResolveReplyImagesArgs = {
  chatId: string;
  replyToMessage: Message;
  storage: Storage;
  fetchPhoto: (fileId: string) => Promise<Uint8Array>;
};

export async function resolveReplyImages(
  args: ResolveReplyImagesArgs,
): Promise<Uint8Array[]> {
  const mediaGroupId = args.replyToMessage.media_group_id;
  if (mediaGroupId !== undefined) {
    const album = await args.storage
      .getAlbumPhotos(args.chatId, mediaGroupId)
      .catch((err) => {
        console.error("getAlbumPhotos failed:", err);
        return [];
      });
    if (album.length > 0) {
      const sorted = [...album].sort((a, b) => a.messageId - b.messageId);
      try {
        return await Promise.all(sorted.map((a) => args.fetchPhoto(a.fileId)));
      } catch (err) {
        console.error("reply album photo download failed:", err);
        return [];
      }
    }
  }

  const photo = args.replyToMessage.photo;
  if (photo && photo.length > 0) {
    const picked = pickPhotoSize(photo);
    if (picked) {
      try {
        return [await args.fetchPhoto(picked.file_id)];
      } catch (err) {
        console.error("reply photo download failed:", err);
        return [];
      }
    }
  }

  return [];
}
