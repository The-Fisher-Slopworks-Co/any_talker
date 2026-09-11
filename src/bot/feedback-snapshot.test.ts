// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import type { ConversationNode, GuestThreadNode } from "../shared/types";
import { USER_THREAD_INDEX_MAX } from "../shared/types";
import {
  buildThreadSnapshots,
  SNAPSHOT_MAX_TURNS,
  SNAPSHOT_MAX_BYTES,
} from "./feedback-snapshot";

const USER = "u1";

function node(over: Partial<ConversationNode> = {}): ConversationNode {
  return {
    userQuestion: "q",
    botAnswer: "a",
    parentBotMsgId: null,
    ts: 1000,
    ...over,
  };
}

// Stores a chain of `length` turns in `chatId`, oldest first, message ids
// 1..length, and indexes it for USER exactly as `ask.ts` does — one
// `indexUserThread` per turn, so the index ends up holding the head alone.
async function seedChain(
  storage: MemoryStorage,
  opts: {
    chatId: string;
    botId?: string | null;
    length: number;
    baseTs?: number;
    answer?: (i: number) => string;
  },
): Promise<void> {
  const botId = opts.botId ?? null;
  const scoped = storage.forBot(botId);
  for (let i = 1; i <= opts.length; i++) {
    const ts = (opts.baseTs ?? 1000) + i;
    await scoped.conversations.save(
      opts.chatId,
      i,
      node({
        userQuestion: `q${i}`,
        botAnswer: opts.answer ? opts.answer(i) : `a${i}`,
        parentBotMsgId: i === 1 ? null : i - 1,
        ts,
      }),
    );
    await storage.conversations.indexUserThread(USER, {
      kind: "chain",
      chatId: opts.chatId,
      botId,
      botMsgId: i,
      parentBotMsgId: i === 1 ? null : i - 1,
      ts,
    });
  }
}

describe("buildThreadSnapshots", () => {
  test("no indexed threads: no snapshots", async () => {
    const storage = new MemoryStorage();
    expect(await buildThreadSnapshots(storage, USER)).toEqual([]);
  });

  test("a chain is copied oldest first, with everything the turn stored", async () => {
    const storage = new MemoryStorage();
    await storage.conversations.save(
      "c1",
      1,
      node({ userQuestion: "q1", botAnswer: "a1", ts: 1001 }),
    );
    await storage.conversations.save(
      "c1",
      2,
      node({
        userQuestion: "q2",
        botAnswer: "a2",
        parentBotMsgId: 1,
        ts: 1002,
        userImageFileIds: ["file-1"],
        toolCalls: [
          { callId: "t1", name: "web", arguments: "{}", output: "boom" },
        ],
        run: { gen: ["gen-1"], model: "some/model", instr: "abc123" },
      }),
    );
    await storage.conversations.indexUserThread(USER, {
      kind: "chain",
      chatId: "c1",
      botId: null,
      botMsgId: 2,
      parentBotMsgId: 1,
      ts: 1002,
    });

    expect(await buildThreadSnapshots(storage, USER)).toEqual([
      {
        kind: "chain",
        chatId: "c1",
        botId: null,
        ts: 1002,
        turns: [
          { botMsgId: 1, userQuestion: "q1", botAnswer: "a1", ts: 1001 },
          {
            botMsgId: 2,
            userQuestion: "q2",
            botAnswer: "a2",
            ts: 1002,
            userImageFileIds: ["file-1"],
            toolCalls: [
              { callId: "t1", name: "web", arguments: "{}", output: "boom" },
            ],
            run: { gen: ["gen-1"], model: "some/model", instr: "abc123" },
          },
        ],
      },
    ]);
  });

  test("a chain deeper than the cap keeps its newest turns", async () => {
    const storage = new MemoryStorage();
    await seedChain(storage, { chatId: "c1", length: SNAPSHOT_MAX_TURNS + 4 });

    const [thread] = await buildThreadSnapshots(storage, USER);
    expect(thread?.turns).toHaveLength(SNAPSHOT_MAX_TURNS);
    expect(thread?.turns.map((t) => t.botMsgId)).toEqual([
      5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  test("a chain whose head expired is dropped whole", async () => {
    const storage = new MemoryStorage();
    await seedChain(storage, { chatId: "c1", length: 3 });
    // The index outliving the nodes it points at is the normal end of a
    // thread's life: c2's head was never stored, so nothing resolves.
    await storage.conversations.indexUserThread(USER, {
      kind: "chain",
      chatId: "c2",
      botId: null,
      botMsgId: 99,
      parentBotMsgId: null,
      ts: 2000,
    });

    const threads = await buildThreadSnapshots(storage, USER);
    expect(threads.map((t) => t.chatId)).toEqual(["c1"]);
  });

  test("a chain trimmed by the TTL keeps the turns that survived", async () => {
    const storage = new MemoryStorage();
    // Head and its parent are there; the turn above them has expired.
    await storage.conversations.save(
      "c1",
      2,
      node({ userQuestion: "q2", parentBotMsgId: 1, ts: 1002 }),
    );
    await storage.conversations.save(
      "c1",
      3,
      node({ userQuestion: "q3", parentBotMsgId: 2, ts: 1003 }),
    );
    await storage.conversations.indexUserThread(USER, {
      kind: "chain",
      chatId: "c1",
      botId: null,
      botMsgId: 3,
      parentBotMsgId: 2,
      ts: 1003,
    });

    const [thread] = await buildThreadSnapshots(storage, USER);
    expect(thread?.turns.map((t) => t.userQuestion)).toEqual(["q2", "q3"]);
  });

  test("threads resolve through the scope their entry names", async () => {
    const storage = new MemoryStorage();
    // Same chat and message id in two scopes: only the managed bot's node is
    // the one the entry points at.
    await storage
      .forBot(null)
      .conversations.save("c1", 1, node({ botAnswer: "main bot" }));
    await storage
      .forBot("b1")
      .conversations.save("c1", 1, node({ botAnswer: "managed bot" }));
    await storage.conversations.indexUserThread(USER, {
      kind: "chain",
      chatId: "c1",
      botId: "b1",
      botMsgId: 1,
      parentBotMsgId: null,
      ts: 1000,
    });

    const threads = await buildThreadSnapshots(storage, USER);
    expect(threads[0]?.botId).toBe("b1");
    expect(threads[0]?.turns[0]?.botAnswer).toBe("managed bot");
  });

  test("a guest thread is copied without per-turn ids, newest turns kept", async () => {
    const storage = new MemoryStorage();
    const thread: GuestThreadNode = {
      chatId: "g1",
      ts: 5000,
      turns: Array.from({ length: SNAPSHOT_MAX_TURNS + 2 }, (_, i) => ({
        userQuestion: `q${i + 1}`,
        botAnswer: `a${i + 1}`,
      })),
    };
    await storage.forBot("b1").conversations.saveGuest("g1", thread);
    await storage.conversations.indexUserThread(USER, {
      kind: "guest",
      chatId: "g1",
      botId: "b1",
      ts: 5000,
    });

    const [snapshot] = await buildThreadSnapshots(storage, USER);
    expect(snapshot?.kind).toBe("guest");
    expect(snapshot?.ts).toBe(5000);
    expect(snapshot?.turns).toHaveLength(SNAPSHOT_MAX_TURNS);
    expect(snapshot?.turns[0]).toEqual({ userQuestion: "q3", botAnswer: "a3" });
  });

  test("an empty guest thread is dropped rather than snapshotted", async () => {
    const storage = new MemoryStorage();
    await storage.forBot("b1").conversations.saveGuest("g1", {
      chatId: "g1",
      ts: 5000,
      turns: [],
    });
    await storage.conversations.indexUserThread(USER, {
      kind: "guest",
      chatId: "g1",
      botId: "b1",
      ts: 5000,
    });

    expect(await buildThreadSnapshots(storage, USER)).toEqual([]);
  });

  test("no more threads than the index keeps, newest first", async () => {
    const storage = new MemoryStorage();
    for (let i = 1; i <= USER_THREAD_INDEX_MAX + 2; i++) {
      await seedChain(storage, {
        chatId: `c${i}`,
        length: 1,
        baseTs: i * 1000,
      });
    }

    const threads = await buildThreadSnapshots(storage, USER);
    expect(threads).toHaveLength(USER_THREAD_INDEX_MAX);
    expect(threads.map((t) => t.chatId)).toEqual([
      "c7",
      "c6",
      "c5",
      "c4",
      "c3",
    ]);
  });

  test("older threads are dropped whole until the rest fits the ceiling", async () => {
    const storage = new MemoryStorage();
    const filler = "x".repeat(4096);
    for (const i of [1, 2, 3]) {
      await seedChain(storage, {
        chatId: `c${i}`,
        length: 2,
        baseTs: i * 1000,
        answer: () => filler,
      });
    }

    const threads = await buildThreadSnapshots(storage, USER, 20 * 1024);
    // Two threads of two 4 KB answers each fit; the third does not, and it is
    // dropped with both of its turns rather than trimmed.
    expect(threads.map((t) => t.chatId)).toEqual(["c3", "c2"]);
    expect(threads.every((t) => t.turns.length === 2)).toBe(true);
  });

  test("the newest thread survives even when it alone exceeds the ceiling", async () => {
    const storage = new MemoryStorage();
    await seedChain(storage, {
      chatId: "c1",
      length: 2,
      answer: () => "y".repeat(4096),
    });

    const threads = await buildThreadSnapshots(storage, USER, 64);
    expect(threads).toHaveLength(1);
    expect(threads[0]?.turns).toHaveLength(2);
  });

  test("the default ceiling leaves ordinary threads untouched", async () => {
    const storage = new MemoryStorage();
    for (const i of [1, 2]) {
      await seedChain(storage, {
        chatId: `c${i}`,
        length: 3,
        baseTs: i * 1000,
      });
    }

    const threads = await buildThreadSnapshots(storage, USER);
    expect(threads).toHaveLength(2);
    expect(Buffer.byteLength(JSON.stringify(threads))).toBeLessThan(
      SNAPSHOT_MAX_BYTES,
    );
  });
});
