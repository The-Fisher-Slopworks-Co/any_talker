// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../storage/memory";
import { DualWindowLimiter } from "../../ratelimit/dual-window";
import { handleApi } from "../api";
import type { ApiRequest } from "./types";
import type {
  FeedbackEntry,
  ThreadSnapshot,
} from "../../shared/types/feedback";

const ownerId = "1";
const owner = { userId: ownerId, isOwner: true };
const guest = { userId: "99", isOwner: false };

function deps() {
  const storage = new MemoryStorage();
  return { storage, rateLimiter: new DualWindowLimiter(storage), ownerId };
}

function makeThread(over: Partial<ThreadSnapshot> = {}): ThreadSnapshot {
  return {
    kind: "chain",
    chatId: "chat-1",
    botId: null,
    ts: 900,
    turns: [
      {
        botMsgId: 42,
        userQuestion: "how are you",
        botAnswer: "fine",
        ts: 900,
        run: { gen: ["gen-1"], model: "anthropic/claude-sonnet-4.5" },
      },
    ],
    ...over,
  };
}

function makeFeedback(over: Partial<FeedbackEntry> = {}): FeedbackEntry {
  return {
    id: "f1",
    userId: "user-1",
    chatId: "chat-1",
    chatType: "supergroup",
    botId: null,
    isGuest: false,
    lang: "en",
    text: "the bot answered in the wrong language",
    createdAt: 1_000,
    threads: [makeThread()],
    systemPrompt: "You are a bot. ".repeat(500),
    systemPromptHash: "0123456789abcdef",
    build: "abc1234",
    status: "new",
    ...over,
  };
}

// The owner asking, with a `body` that defaults to null the way a GET or a
// DELETE arrives from `server.ts`.
function ask(
  d: ReturnType<typeof deps>,
  req: Partial<ApiRequest> & Pick<ApiRequest, "method" | "path">,
  actor = owner,
) {
  return handleApi({ body: null, ...req }, d, actor);
}

describe("GET /api/admin/feedback", () => {
  test("lists newest first without the heavy fields", async () => {
    const d = deps();
    await d.storage.feedback.save(makeFeedback({ id: "old", createdAt: 1 }));
    await d.storage.feedback.save(makeFeedback({ id: "new", createdAt: 2 }));

    const r = await ask(d, { method: "GET", path: "/api/admin/feedback" });
    expect(r.status).toBe(200);
    const body = r.body as { entries: Record<string, unknown>[] };
    expect(body.entries.map((e) => e.id)).toEqual(["new", "old"]);
    // The two fields a 25-row page cannot afford, replaced by their counts.
    expect(body.entries[0]).not.toHaveProperty("systemPrompt");
    expect(body.entries[0]).not.toHaveProperty("threads");
    expect(body.entries[0]).toMatchObject({ threadCount: 1, turnCount: 1 });
    // Everything else a row shows survives.
    expect(body.entries[0]).toMatchObject({
      text: "the bot answered in the wrong language",
      status: "new",
      systemPromptHash: "0123456789abcdef",
    });
  });

  test("filters by status", async () => {
    const d = deps();
    await d.storage.feedback.save(makeFeedback({ id: "a", status: "new" }));
    await d.storage.feedback.save(
      makeFeedback({ id: "b", status: "closed", createdAt: 2_000 }),
    );

    const r = await ask(d, {
      method: "GET",
      path: "/api/admin/feedback",
      query: { status: "closed" },
    });
    expect(r.status).toBe(200);
    const body = r.body as { entries: { id: string }[] };
    expect(body.entries.map((e) => e.id)).toEqual(["b"]);
  });

  test("pages through with limit and the returned cursor", async () => {
    const d = deps();
    for (const n of [1, 2, 3]) {
      await d.storage.feedback.save(
        makeFeedback({ id: `f${n}`, createdAt: n * 100 }),
      );
    }

    const first = await ask(d, {
      method: "GET",
      path: "/api/admin/feedback",
      query: { limit: "2" },
    });
    const page1 = first.body as {
      entries: { id: string }[];
      nextCursor: number | null;
    };
    expect(page1.entries.map((e) => e.id)).toEqual(["f3", "f2"]);
    expect(page1.nextCursor).toBe(200);

    const second = await ask(d, {
      method: "GET",
      path: "/api/admin/feedback",
      query: { limit: "2", cursor: String(page1.nextCursor) },
    });
    const page2 = second.body as {
      entries: { id: string }[];
      nextCursor: number | null;
    };
    expect(page2.entries.map((e) => e.id)).toEqual(["f1"]);
    expect(page2.nextCursor).toBeNull();
  });

  test("rejects an unknown status and a non-numeric cursor", async () => {
    const d = deps();
    const bad = async (query: Record<string, string>) =>
      ask(d, { method: "GET", path: "/api/admin/feedback", query });
    expect((await bad({ status: "triaged" })).status).toBe(400);
    expect((await bad({ cursor: "yesterday" })).status).toBe(400);
  });

  test("ignores a junk limit rather than failing the page", async () => {
    const d = deps();
    await d.storage.feedback.save(makeFeedback());
    const r = await ask(d, {
      method: "GET",
      path: "/api/admin/feedback",
      query: { limit: "lots" },
    });
    expect(r.status).toBe(200);
    expect((r.body as { entries: unknown[] }).entries).toHaveLength(1);
  });

  test("is admin-only: a non-owner gets 403", async () => {
    const r = await ask(
      deps(),
      { method: "GET", path: "/api/admin/feedback" },
      guest,
    );
    expect(r.status).toBe(403);
  });
});

describe("GET /api/admin/feedback/:id", () => {
  test("returns the whole record, snapshots and prompt included", async () => {
    const d = deps();
    const entry = makeFeedback();
    await d.storage.feedback.save(entry);

    const r = await ask(d, { method: "GET", path: "/api/admin/feedback/f1" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ entry });
  });

  test("serves a record whose threads expired and whose pointedAt dangles", async () => {
    const d = deps();
    await d.storage.feedback.save(
      makeFeedback({
        threads: [],
        pointedAt: { chatId: "chat-1", botMsgId: 999 },
      }),
    );

    const r = await ask(d, { method: "GET", path: "/api/admin/feedback/f1" });
    expect(r.status).toBe(200);
    expect((r.body as { entry: FeedbackEntry }).entry.threads).toEqual([]);
  });

  test("404s on an unknown id", async () => {
    const r = await ask(deps(), {
      method: "GET",
      path: "/api/admin/feedback/nope",
    });
    expect(r.status).toBe(404);
  });
});

describe("PATCH /api/admin/feedback/:id", () => {
  test("sets the status and leaves the rest of the record alone", async () => {
    const d = deps();
    await d.storage.feedback.save(makeFeedback());

    const r = await ask(d, {
      method: "PATCH",
      path: "/api/admin/feedback/f1",
      body: { status: "closed" },
    });
    expect(r.status).toBe(200);
    const stored = await d.storage.feedback.get("f1");
    expect(stored).toEqual(makeFeedback({ status: "closed" }));
    expect(r.body).toEqual({ entry: stored as FeedbackEntry });
  });

  test("rejects an unknown status, and anything but status is ignored", async () => {
    const d = deps();
    await d.storage.feedback.save(makeFeedback());

    const bad = await ask(d, {
      method: "PATCH",
      path: "/api/admin/feedback/f1",
      body: { status: "triaged" },
    });
    expect(bad.status).toBe(400);
    expect((await d.storage.feedback.get("f1"))?.status).toBe("new");

    await ask(d, {
      method: "PATCH",
      path: "/api/admin/feedback/f1",
      body: { status: "closed", text: "rewritten", userId: "someone-else" },
    });
    const stored = await d.storage.feedback.get("f1");
    expect(stored?.text).toBe("the bot answered in the wrong language");
    expect(stored?.userId).toBe("user-1");
  });

  test("404s on an unknown id", async () => {
    const r = await ask(deps(), {
      method: "PATCH",
      path: "/api/admin/feedback/nope",
      body: { status: "closed" },
    });
    expect(r.status).toBe(404);
  });
});

describe("DELETE /api/admin/feedback/:id", () => {
  test("removes the record", async () => {
    const d = deps();
    await d.storage.feedback.save(makeFeedback());

    const r = await ask(d, {
      method: "DELETE",
      path: "/api/admin/feedback/f1",
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(await d.storage.feedback.get("f1")).toBeNull();
  });

  test("is admin-only: a non-owner gets 403 and the record stays", async () => {
    const d = deps();
    await d.storage.feedback.save(makeFeedback());

    const r = await ask(
      d,
      { method: "DELETE", path: "/api/admin/feedback/f1" },
      guest,
    );
    expect(r.status).toBe(403);
    expect(await d.storage.feedback.get("f1")).not.toBeNull();
  });
});
