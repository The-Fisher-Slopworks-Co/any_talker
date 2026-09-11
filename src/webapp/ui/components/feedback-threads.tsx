// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import { useDateFmt } from "../datetime-context";
import type { ThreadSnapshot, ThreadSnapshotTurn } from "../api-client";
import { Card } from "./layout";
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

function ThreadRow({
  thread,
  index,
  pointed,
}: {
  thread: ThreadSnapshot;
  index: number;
  // This is the thread the report's `pointedAt` refers to.
  pointed: boolean;
}) {
  const { t: s } = useI18n();
  const { format } = useDateFmt();
  const gens = threadGenerations(thread);
  const kind =
    thread.kind === "guest"
      ? s.ui_feedback_thread_guest
      : s.ui_feedback_thread_chain;

  return (
    <div className="row relative flex flex-col gap-1 px-4 py-[11px]">
      <div className="flex items-center justify-between gap-3">
        <span className="shrink-0 text-base font-medium">
          {format(thread.ts)}
        </span>
        <span className="text-[13px] text-tg-hint truncate">
          {pointed ? `${kind} · ${s.ui_feedback_pointed_here}` : kind}
        </span>
      </div>
      <div className="text-[13px] text-tg-hint break-all">
        {s.ui_feedback_thread_meta(index, thread.chatId, thread.turns.length)}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px]">
        <span className="text-tg-hint">{s.ui_feedback_gens}</span>
        {gens.length === 0 ? (
          <span className="text-tg-hint">{s.ui_feedback_gens_empty}</span>
        ) : (
          gens.map((gen) => <GenerationLink key={gen} gen={gen} />)
        )}
      </div>
      {/* The snapshot as stored, not a reading of it: a turn-by-turn render
          comes after someone has actually used this. `select-all` is what gets
          the blob out of Telegram in one tap. */}
      <pre className="mt-1 max-h-80 overflow-auto rounded-lg bg-tg-secondary p-2 text-[12px] leading-[1.4] whitespace-pre select-all">
        {JSON.stringify(thread, null, 2)}
      </pre>
    </div>
  );
}

export function FeedbackThreads({
  threads,
  pointedAt,
}: {
  // Newest thread first, as the record stores them. Empty is a normal state:
  // the copied threads expire with the conversation graph.
  threads: ThreadSnapshot[];
  pointedAt: { chatId: string; botMsgId: number } | null;
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

  return (
    <Card>
      {threads.length === 0 ? (
        <EmptyState>{s.ui_feedback_threads_empty}</EmptyState>
      ) : (
        <>
          {pointedAt !== null && pointedIndex === -1 && (
            <EmptyState>{s.ui_feedback_pointed_missing}</EmptyState>
          )}
          {threads.map((thread, i) => (
            <ThreadRow
              key={`${thread.chatId}:${thread.ts}:${i}`}
              thread={thread}
              index={i + 1}
              pointed={i === pointedIndex}
            />
          ))}
        </>
      )}
    </Card>
  );
}
