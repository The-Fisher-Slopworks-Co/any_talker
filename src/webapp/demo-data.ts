// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Plausible content for `bun run webapp:demo`, so every screen of the Web App
// shows a populated state rather than its empty one. Written through the public
// `Storage` / `RateLimiter` interfaces only, so it stays valid for any backend.

import type { Storage } from "../storage/types";
import type { RateLimiter } from "../ratelimit/types";
import type { Chat, User } from "../shared/types";
import type { Reminder } from "../reminders/types";
import type { RecurringCheck } from "../checks/types";
import type { FeedbackEntry } from "../shared/types/feedback";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type DemoIds = { ownerId: string; userId: string };

export async function seedDemoData(
  storage: Storage,
  rateLimiter: RateLimiter,
  ids: DemoIds,
  now: number,
): Promise<void> {
  const user = (
    id: string,
    firstName: string,
    lastName: string | null,
    username: string | null,
    ageDays: number,
  ): User => ({
    id,
    firstName,
    lastName,
    username,
    firstSeenAt: now - ageDays * DAY,
    lastSeenAt: now - (ageDays % 5) * HOUR,
  });
  const users: User[] = [
    user(ids.ownerId, "Alex", "Morgan", "alex_morgan", 120),
    user(ids.userId, "Sam", "Rivera", "samrivera", 45),
    user("1000003", "Jordan", null, "jordan_k", 30),
    user("1000004", "Taylor", "Kim", null, 12),
    user("1000005", "Casey", "Lee", "casey_lee", 2),
  ];
  for (const u of users) await storage.users.upsert(u);

  const chat = (
    id: string,
    type: Chat["type"],
    title: string,
    username: string | null,
    ageDays: number,
  ): Chat => ({
    id,
    type,
    title,
    username,
    firstSeenAt: now - ageDays * DAY,
    lastSeenAt: now - HOUR,
  });
  const chats: Chat[] = [
    chat(
      "-1001000000001",
      "supergroup",
      "Weekend Hikers",
      "weekend_hikers",
      90,
    ),
    chat("-1001000000002", "supergroup", "Book Club", null, 40),
    chat("-1000000000003", "group", "Family", null, 15),
  ];
  for (const c of chats) await storage.chats.upsert(c);

  await storage.access.addWhitelist("users", { id: ids.userId, label: "Sam" });
  await storage.access.addWhitelist("users", {
    id: "1000003",
    label: "Jordan",
  });
  await storage.access.addWhitelist("chats", {
    id: chats[0]!.id,
    label: chats[0]!.title!,
  });
  await storage.access.addBlacklist("users", {
    id: "1000005",
    label: "Casey",
  });

  await storage.profile.setName(ids.ownerId, "Alex");
  await storage.profile.setTimezone(ids.ownerId, "Europe/Berlin");
  await storage.profile.setName(ids.userId, "Sam");
  await storage.profile.setGender(ids.userId, "male");

  for (const [userId, facts] of [
    [ids.ownerId, { city: "Berlin", hobby: "Trail running" }],
    [ids.userId, { pet: "A cat called Miso", job: "Frontend developer" }],
  ] as const) {
    for (const [key, value] of Object.entries(facts)) {
      await storage.facts.remember(userId, key, value);
    }
  }

  const reminder = (
    id: string,
    userId: string,
    chatId: string,
    inMs: number,
    text: string,
    extra: Partial<Reminder> = {},
  ): Reminder => ({
    id,
    userId,
    chatId,
    lang: "en",
    fireAtMs: now + inMs,
    text,
    target: { kind: "ask_reply", chatId, replyToMessageId: 1 },
    createdAtMs: now - DAY,
    contextMessages: [],
    ...extra,
  });
  const reminders: Reminder[] = [
    reminder(
      "demo-r1",
      ids.ownerId,
      chats[0]!.id,
      3 * HOUR,
      "Check the trail forecast before Saturday",
    ),
    reminder(
      "demo-r2",
      ids.userId,
      ids.userId,
      DAY + 2 * HOUR,
      "Renew the gym membership",
      { target: { kind: "guest_dm", userId: ids.userId } },
    ),
    reminder(
      "demo-r3",
      ids.userId,
      chats[1]!.id,
      2 * DAY,
      "Finish chapter 7 before the meetup",
      {
        recurrence: {
          spec: {
            kind: "calendar",
            everyDays: 7,
            hour: 19,
            minute: 0,
            timezone: "Europe/Berlin",
          },
          occurrencesLeft: 3,
          occurrencesTotal: 4,
        },
      },
    ),
  ];
  for (const r of reminders) await storage.reminders.save(r);

  const check: RecurringCheck = {
    id: "demo-c1",
    title: "Morning stretch",
    chatId: chats[2]!.id,
    targetUserId: "1000004",
    targetName: "Taylor",
    scheduleHour: 8,
    scheduleMinute: 30,
    timezone: "Europe/Berlin",
    question: "Did you stretch this morning?",
    yesButton: "Yes",
    noButton: "Not yet",
    yesReply: "Nice, keep the streak going!",
    noReply: "There is still time today.",
    timeoutMinutes: 120,
    counter: 6,
    counterMode: "reset_on_yes",
    counterAnchorDate: null,
    enabled: true,
    lastFiredAtMs: now - DAY,
    pendingMessageId: null,
    pendingFiredAtMs: null,
    createdAtMs: now - 20 * DAY,
  };
  await storage.checks.save(check);

  await storage.managedBots.save({
    botId: "2000001",
    ownerUserId: ids.ownerId,
    username: "captain_nemo_demo_bot",
    displayName: "Captain Nemo",
    systemPrompt:
      "You are Captain Nemo: calm, precise, fond of the sea and of machines.",
    createdAtMs: now - 10 * DAY,
  });
  await storage.managedBots.save({
    botId: "2000002",
    ownerUserId: ids.ownerId,
    username: "sherlock_demo_bot",
    displayName: "Sherlock",
    systemPrompt: "You are Sherlock Holmes. Deduce first, answer second.",
    createdAtMs: now - 3 * DAY,
  });

  const feedback = (
    id: string,
    userId: string,
    text: string,
    status: FeedbackEntry["status"],
    ageHours: number,
  ): FeedbackEntry => ({
    id,
    userId,
    chatId: chats[0]!.id,
    chatType: "supergroup",
    botId: null,
    isGuest: false,
    lang: "en",
    text,
    createdAt: now - ageHours * HOUR,
    threads: [
      {
        kind: "chain",
        chatId: chats[0]!.id,
        botId: null,
        ts: now - ageHours * HOUR,
        turns: [
          {
            userQuestion: "How long is the Zugspitze trail?",
            botAnswer: "About 21 km one way via the Reintal route.",
          },
        ],
      },
    ],
    systemPrompt: "You are a helpful assistant.",
    systemPromptHash: "demo",
    build: null,
    status,
  });
  await storage.feedback.save(
    feedback("demo-f1", ids.userId, "The distance looks off", "new", 5),
  );
  await storage.feedback.save(
    feedback("demo-f2", "1000003", "Great answer, thanks!", "closed", 50),
  );

  // Token usage fills the limit bars; spend fills the owner's dashboard.
  // Against the default 30k / 300k limits: 40% of the 5-hour window, 24% of
  // the week. Each window keeps one bucket and a deduction from an older
  // window replaces it, so the earlier spend has to go first.
  await rateLimiter.deduct(ids.userId, 60_000, now - 6 * HOUR);
  await rateLimiter.deduct(ids.userId, 12_000, now - MINUTE);
  await rateLimiter.deduct("1000003", 15_000, now - MINUTE);
  for (const [userId, chatId, model, usd] of [
    [ids.ownerId, chats[0]!.id, "anthropic/claude-sonnet-5", 1.84],
    [ids.userId, chats[1]!.id, "openai/gpt-5-mini", 0.37],
    ["1000003", chats[0]!.id, "google/gemini-3-flash", 0.12],
  ] as const) {
    await storage.spend.addUser(userId, usd, now - HOUR);
    await storage.spend.addChat(chatId, usd, now - HOUR);
    await storage.spend.addModel(model, usd, now - HOUR);
    await storage.spend.addGlobal(usd, now - HOUR);
  }
}
