// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../storage/memory";
import { DualWindowLimiter } from "../../ratelimit/dual-window";
import { handleApi } from "../api";
import type { AdminSummary } from "../../shared/types/admin-summary";
import type { ApiRequest } from "./types";
import type { FeedbackEntry } from "../../shared/types/feedback";

const ownerId = "1";
const owner = { userId: ownerId, isOwner: true };
const guest = { userId: "99", isOwner: false };

function deps() {
  const storage = new MemoryStorage();
  return { storage, rateLimiter: new DualWindowLimiter(storage), ownerId };
}

const get: ApiRequest = {
  method: "GET",
  path: "/api/admin/summary",
  body: null,
};

function report(id: string, status: FeedbackEntry["status"]): FeedbackEntry {
  return {
    id,
    userId: "u",
    chatId: "c",
    chatType: "private",
    botId: null,
    isGuest: false,
    lang: "en",
    text: "t",
    createdAt: 1,
    threads: [],
    systemPrompt: "",
    systemPromptHash: "h",
    build: null,
    status,
  };
}

describe("admin summary route", () => {
  test("is empty on a fresh install, with the settings defaults", async () => {
    const res = await handleApi(get, deps(), owner);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      bots: 0,
      budgetEnabled: true,
      whitelistEnabled: true,
      users: 0,
      chats: 0,
      reminders: 0,
      quarantined: 0,
      checks: 0,
      newFeedback: 0,
      apiTokenCreated: false,
    } satisfies AdminSummary);
  });

  test("counts what is stored, and only new feedback", async () => {
    const d = deps();
    const now = Date.now();
    for (const id of ["5", "6"]) {
      await d.storage.users.upsert({
        id,
        firstName: null,
        lastName: null,
        username: null,
        firstSeenAt: now,
        lastSeenAt: now,
      });
    }
    await d.storage.feedback.save(report("a", "new"));
    await d.storage.feedback.save(report("b", "closed"));
    await d.storage.apiToken.save({ hash: "h", createdAt: now });
    const body = (await handleApi(get, d, owner)).body as AdminSummary;
    expect(body.users).toBe(2);
    expect(body.newFeedback).toBe(1);
    expect(body.apiTokenCreated).toBe(true);
  });

  test("is owner-only", async () => {
    expect((await handleApi(get, deps(), guest)).status).toBe(403);
  });
});
