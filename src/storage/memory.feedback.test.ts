// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "./memory";
import type {
  FeedbackEntry,
  ThreadSnapshot,
  ThreadSnapshotTurn,
} from "../shared/types/feedback";

function makeTurn(over: Partial<ThreadSnapshotTurn> = {}): ThreadSnapshotTurn {
  return {
    botMsgId: 42,
    userQuestion: "how are you",
    botAnswer: "fine",
    ts: 900,
    run: { gen: ["gen-1"], model: "anthropic/claude-sonnet-4.5" },
    ...over,
  };
}

function makeThread(over: Partial<ThreadSnapshot> = {}): ThreadSnapshot {
  return {
    kind: "chain",
    chatId: "chat-1",
    botId: null,
    ts: 900,
    turns: [makeTurn()],
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
    systemPrompt: "You are a bot.",
    systemPromptHash: "0123456789abcdef",
    build: "abc1234",
    status: "new",
    ...over,
  };
}

describe("MemoryStorage feedback", () => {
  test("save then get round-trips the whole record", async () => {
    const s = new MemoryStorage();
    await s.feedback.save(makeFeedback());
    expect(await s.feedback.get("f1")).toEqual(makeFeedback());
  });

  test("get returns null for an unknown id", async () => {
    const s = new MemoryStorage();
    expect(await s.feedback.get("nope")).toBeNull();
  });

  test("stored records are deep-cloned (no aliasing through the caller)", async () => {
    const s = new MemoryStorage();
    const entry = makeFeedback();
    await s.feedback.save(entry);
    entry.threads[0]!.turns[0]!.botAnswer = "mutated";
    const got = await s.feedback.get("f1");
    expect(got?.threads[0]?.turns[0]?.botAnswer).toBe("fine");

    // …and reading twice does not hand out the same object either.
    got!.text = "mutated";
    expect((await s.feedback.get("f1"))?.text).toBe(makeFeedback().text);
  });

  test("the store is global — a forBot view sees the same corpus", async () => {
    const s = new MemoryStorage();
    await s.forBot("cat-bot").feedback.save(makeFeedback({ botId: "cat-bot" }));
    expect(await s.feedback.get("f1")).not.toBeNull();
    expect((await s.forBot("dog-bot").feedback.list()).entries).toHaveLength(1);
  });

  test("list returns newest first", async () => {
    const s = new MemoryStorage();
    await s.feedback.save(makeFeedback({ id: "old", createdAt: 100 }));
    await s.feedback.save(makeFeedback({ id: "new", createdAt: 300 }));
    await s.feedback.save(makeFeedback({ id: "mid", createdAt: 200 }));
    const page = await s.feedback.list();
    expect(page.entries.map((e) => e.id)).toEqual(["new", "mid", "old"]);
    expect(page.nextCursor).toBeNull();
  });

  test("list is empty on a fresh store", async () => {
    const s = new MemoryStorage();
    expect(await s.feedback.list()).toEqual({ entries: [], nextCursor: null });
  });

  test("the cursor walks pages without repeating or skipping a record", async () => {
    const s = new MemoryStorage();
    for (let i = 1; i <= 5; i++) {
      await s.feedback.save(makeFeedback({ id: `f${i}`, createdAt: i * 100 }));
    }
    const first = await s.feedback.list({ limit: 2 });
    expect(first.entries.map((e) => e.id)).toEqual(["f5", "f4"]);
    expect(first.nextCursor).toBe(400);

    const second = await s.feedback.list({
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.entries.map((e) => e.id)).toEqual(["f3", "f2"]);

    const last = await s.feedback.list({
      limit: 2,
      cursor: second.nextCursor!,
    });
    expect(last.entries.map((e) => e.id)).toEqual(["f1"]);
    // The last page reports no cursor even though it was not full.
    expect(last.nextCursor).toBeNull();
  });

  test("limit is clamped to at least 1 and at most the page maximum", async () => {
    const s = new MemoryStorage();
    for (let i = 1; i <= 3; i++) {
      await s.feedback.save(makeFeedback({ id: `f${i}`, createdAt: i * 100 }));
    }
    expect((await s.feedback.list({ limit: 0 })).entries).toHaveLength(1);
    expect((await s.feedback.list({ limit: 10_000 })).entries).toHaveLength(3);
  });

  test("a status filter pages within that status alone", async () => {
    const s = new MemoryStorage();
    await s.feedback.save(makeFeedback({ id: "a", createdAt: 100 }));
    await s.feedback.save(
      makeFeedback({ id: "b", createdAt: 200, status: "closed" }),
    );
    await s.feedback.save(makeFeedback({ id: "c", createdAt: 300 }));

    const fresh = await s.feedback.list({ status: "new" });
    expect(fresh.entries.map((e) => e.id)).toEqual(["c", "a"]);
    const closed = await s.feedback.list({ status: "closed" });
    expect(closed.entries.map((e) => e.id)).toEqual(["b"]);

    // A full page of `closed` records ahead of the `new` one does not hide it.
    const page = await s.feedback.list({ status: "new", limit: 1 });
    expect(page.entries.map((e) => e.id)).toEqual(["c"]);
    expect(page.nextCursor).toBe(300);
  });

  test("re-saving with a new status moves it between filters", async () => {
    const s = new MemoryStorage();
    await s.feedback.save(makeFeedback());
    await s.feedback.save(makeFeedback({ status: "closed" }));
    expect((await s.feedback.get("f1"))?.status).toBe("closed");
    expect((await s.feedback.list({ status: "new" })).entries).toEqual([]);
    expect(
      (await s.feedback.list({ status: "closed" })).entries.map((e) => e.id),
    ).toEqual(["f1"]);
  });

  test("delete removes the record from get and from every listing", async () => {
    const s = new MemoryStorage();
    await s.feedback.save(makeFeedback());
    await s.feedback.delete("f1");
    expect(await s.feedback.get("f1")).toBeNull();
    expect((await s.feedback.list()).entries).toEqual([]);
    expect((await s.feedback.list({ status: "new" })).entries).toEqual([]);
  });
});
