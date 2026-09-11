// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Message } from "grammy/types";
import type { BotRuntime } from "../runtime";
import type { BotContext } from "../middleware/lang";
import { createMediaGroupBuffer } from "../media-group-buffer";
import { matchAsk } from "../routing";
import { replyEphemeral } from "../ephemeral";
import { pickPhotoSize } from "../photo";
import {
  pickVideo,
  describeAlbumVideoFrames,
  ALBUM_VIDEO_FRAMES,
  type VideoClip,
} from "../video";
import { videoErrorText } from "../video-pipeline";
import { dispatchAsk } from "./ask";

export type MediaGroupDispatcher = {
  // Buffers one album item; the whole group is dispatched once it settles.
  push: (
    chatId: number,
    groupId: string,
    ctx: BotContext,
    msg: Message,
  ) => void;
};

export function createMediaGroupDispatcher(
  rt: BotRuntime,
): MediaGroupDispatcher {
  const mediaGroupBuffer = createMediaGroupBuffer<Message, BotContext>({
    onFlush: async ({ key, context: ctx, items }) => {
      rt.debugLog("media_group_flush", {
        key,
        items: items.length,
        message_ids: items.map((it) => it.message_id),
        captions: items.filter((it) => (it.caption ?? "").length > 0).length,
      });

      const matchOf = (it: Message) =>
        matchAsk(it.caption ?? "", ctx.me.username);
      const askItem = items.find((it) => matchOf(it) !== null);
      if (!askItem) {
        rt.debugLog("media_group_dropped", { key, reason: "no_ask_caption" });
        return;
      }
      if (askItem.forward_origin) {
        rt.debugLog("media_group_dropped", { key, reason: "forward_origin" });
        return;
      }

      const captionMatch = matchOf(askItem)!;
      if (
        !(await rt.shouldAnswer(ctx, captionMatch, askItem.reply_to_message))
      ) {
        rt.debugLog("media_group_dropped", { key, reason: "not_addressed" });
        return;
      }
      const detailLevel = captionMatch.detailLevel;
      const userText = captionMatch.userText;
      const askMessageId = items[0]!.message_id;

      // Album items are resolved in arrival (message) order and one at a time:
      // a group holds up to ten items and a video costs a download plus two
      // ffmpeg passes, so running ten of those at once would spike the host.
      // Video items contribute frames only — an album's worth of soundtracks
      // would dwarf everything else in the request.
      // One clip in the album can go to the model whole; several cannot — ten
      // 20 MB clips base64'd into one request is not a request anyone wants to
      // send, so a multi-clip album falls back to frames for all of them.
      const albumChatId = String(ctx.chat?.id ?? "");
      const clipCount = items.filter((it) => pickVideo(it) !== null).length;
      const albumMode = clipCount > 1 ? "frames" : undefined;

      const fileIds: string[] = [];
      const images: Uint8Array[] = [];
      const videos: VideoClip[] = [];
      let albumVideos = 0;
      let albumVideoFrames = 0;
      for (const it of items) {
        const picked = it.photo ? pickPhotoSize(it.photo) : null;
        if (picked) {
          try {
            images.push(await rt.fetchPhoto(picked.file_id));
            fileIds.push(picked.file_id);
          } catch (err) {
            console.error("media group photo download failed:", err);
            await replyEphemeral(
              ctx,
              ctx.t.bot_photo_cant_fetch,
              ctx.from?.id,
            ).catch(() => {});
            return;
          }
          continue;
        }
        const video = pickVideo(it);
        if (!video) continue;
        const parts = await rt.video.loadParts(
          albumChatId,
          video,
          ALBUM_VIDEO_FRAMES,
          albumMode,
        );
        if (!parts.ok) {
          await replyEphemeral(
            ctx,
            videoErrorText(ctx, parts.reason),
            ctx.from?.id,
          ).catch(() => {});
          return;
        }
        if (parts.mode === "native") {
          videos.push(parts.clip);
        } else {
          images.push(...parts.frames);
          albumVideos += 1;
          albumVideoFrames += parts.frames.length;
        }
        if (video.thumbnailFileId) fileIds.push(video.thumbnailFileId);
      }

      await dispatchAsk(rt, ctx, {
        userText,
        askMessageId,
        images,
        imageFileIds: fileIds,
        audios: [],
        videos,
        attachments:
          albumVideos > 0
            ? describeAlbumVideoFrames(albumVideos, albumVideoFrames)
            : undefined,
        replyToMessage: askItem.reply_to_message,
        quote: askItem.quote?.text ?? null,
        forwardOrigin: false,
        detailLevel,
      });
    },
  });

  return {
    // An album item is never answered on its own: it joins the buffer keyed by
    // chat + media group and the whole group is dispatched once it settles.
    push: (chatId, groupId, ctx, msg) => {
      const key = `${chatId}:${groupId}`;
      mediaGroupBuffer.push({ key, context: ctx, item: msg });
      rt.debugLog("media_group_push", {
        key,
        message_id: msg.message_id,
        pending_groups: mediaGroupBuffer.pendingCount(),
      });
    },
  };
}
