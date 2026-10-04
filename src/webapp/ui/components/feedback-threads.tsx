// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ReactNode } from "react";
import { useI18n } from "../i18n-context";
import { useDateFmt } from "../datetime-context";
import type { ThreadSnapshot, ThreadSnapshotTurn } from "../api-client";
import { Card } from "./layout";
import { ROW_CLS, ROW_LABEL_CLS, ROW_VALUE_CLS } from "./row";
import { EmptyState } from "./states";

// OpenRouter publishes no per-generation permalink: `/api/v1/generation?id=`
// resolves an id, but it is a machine route that answers 401 to a browser, and
// `/api/v1/activity` is refused to an inference key altogether. What a human
// has is the activity list at `/activity`, behind that account's own login — so
// the link goes there and carries the id along, and the link's text is the id
// itself, which is what gets pasted into the list's search either way.
const ACTIVITY_URL = "https://openrouter.ai/activity";

function generationUrl(gen: string): string {
  return `${ACTIVITY_URL}?id=${encodeURIComponent(gen)}`;
}

// Every model call the thread made, in call order: one id per tool-loop round
// plus the final answer, flattened across the thread's turns.
function threadGenerations(thread: ThreadSnapshot): string[] {
  return thread.turns.flatMap(
    (turn: ThreadSnapshotTurn) => turn.run?.gen ?? [],
  );
}

// Telegram's in-app browser ignores `target="_blank"`, so the WebApp's own
// `openLink` takes the tap when it is there; the href stays for everywhere else.
function GenerationLink({ gen }: { gen: string }) {
  const url = generationUrl(gen);
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="text-tg-link break-all"
      onClick={(e) => {
        const tg = window.Telegram?.WebApp;
        if (!tg?.openLink) return;
        e.preventDefault();
        tg.openLink(url);
      }}
    >
      {gen}
    </a>
  );
}

// Text inset in a card, on the page background: the snapshot as stored, not a
// reading of it, and the system prompt. `select-all` is what gets the blob out
// of Telegram in one tap.
export function CodeBlock({
  wrap,
  children,
}: {
  // Prose wraps; JSON keeps its indentation and scrolls.
  wrap?: boolean;
  children: ReactNode;
}) {
  return (
    <pre
      className={`mx-4 mb-[11px] max-h-80 overflow-auto rounded-lg bg-tg-secondary px-3 py-2.5 font-mono text-[13px] leading-[18px] select-all ${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}
    >
      {children}
    </pre>
  );
}

function ThreadCard({
  thread,
  index,
  chat,
  pointed,
}: {
  thread: ThreadSnapshot;
  index: number;
  // The chat's title, or its id when there is none.
  chat: string;
  // This is the thread the report's `pointedAt` refers to.
  pointed: boolean;
}) {
  const { t: s } = useI18n();
  const { short } = useDateFmt();
  const gens = threadGenerations(thread);
  const kind =
    thread.kind === "guest"
      ? s.ui_feedback_thread_guest
      : s.ui_feedback_thread_chain;

  return (
    <Card>
      <div className={ROW_CLS}>
        <div className="flex-1 min-w-0">
          <div className="truncate">{short(thread.ts)}</div>
          <div className="text-[13px] text-tg-hint truncate">
            {s.ui_feedback_thread_meta(index, chat, thread.turns.length)}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-tg-text/10 px-2.5 py-0.5 text-[13px] text-tg-hint">
          {pointed ? s.ui_feedback_pointed_here : kind}
        </span>
      </div>
      <div className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_feedback_gens}</span>
        {gens.length === 0 && (
          <span className={ROW_VALUE_CLS}>{s.ui_feedback_gens_empty}</span>
        )}
      </div>
      {gens.map((gen) => (
        <div key={gen} className={ROW_CLS}>
          <GenerationLink gen={gen} />
        </div>
      ))}
      <CodeBlock>{JSON.stringify(thread, null, 2)}</CodeBlock>
    </Card>
  );
}

// One card per thread. Empty is a normal state: the copied threads expire with
// the conversation graph.
export function FeedbackThreads({
  threads,
  pointedAt,
  chatId,
  chatTitle,
}: {
  // Newest thread first, as the record stores them.
  threads: ThreadSnapshot[];
  pointedAt: { chatId: string; botMsgId: number } | null;
  // The chat the report was sent from, which is all the directory was asked
  // about: other chats show their id.
  chatId: string;
  chatTitle: string | null;
}) {
  const { t: s } = useI18n();
  // The snapshot is "recent threads" regardless, so the target may well be in
  // none of them — said plainly rather than left as a silent absence.
  const pointedIndex = pointedAt
    ? threads.findIndex(
        (thread) =>
          thread.chatId === pointedAt.chatId &&
          thread.turns.some((turn) => turn.botMsgId === pointedAt.botMsgId),
      )
    : -1;

  if (threads.length === 0) {
    return (
      <Card>
        <EmptyState>{s.ui_feedback_threads_empty}</EmptyState>
      </Card>
    );
  }

  return (
    <>
      {pointedAt !== null && pointedIndex === -1 && (
        <Card>
          <EmptyState>{s.ui_feedback_pointed_missing}</EmptyState>
        </Card>
      )}
      {threads.map((thread, i) => (
        <ThreadCard
          key={`${thread.chatId}:${thread.ts}:${i}`}
          thread={thread}
          index={i + 1}
          chat={
            thread.chatId === chatId && chatTitle ? chatTitle : thread.chatId
          }
          pointed={i === pointedIndex}
        />
      ))}
    </>
  );
}
