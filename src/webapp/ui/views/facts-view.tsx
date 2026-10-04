// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { useI18n } from "../i18n-context";
import {
  api,
  type FactBot,
  type FactsResponse,
  type UserFact,
} from "../api-client";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../components/layout";
import { EmptyState, LoadingState } from "../components/states";
import { RowButton } from "../components/controls";
import { NavRow, SelectRow } from "../components/select-row";
import { INPUT_LEFT_CLS, ROW_CLS } from "../components/row";
import { useLoadable } from "../lib/use-loadable";
import { parseString, useSessionState } from "../lib/session-state";
import { botLabel, FACT_ERR_KEY } from "../lib/labels";
import type { Strings } from "../lib/routes";
import {
  FACT_KEY_MAX_LEN,
  FACT_VALUE_MAX_LEN,
  normalizeFactKey,
  normalizeFactValue,
} from "../../../shared/user-facts";

const MAIN_SCOPE = "main";
// Sheet state for "adding a fact"; can't clash with a key ([a-z0-9_]).
const NEW_FACT = "+new";

const TEXTAREA_CLS =
  "block w-full box-border bg-transparent border-0 px-4 py-[11px] text-base text-tg-text min-h-[110px] resize-none";
const SHEET_BTN_CLS =
  "bg-transparent border-0 p-0 text-[17px] text-tg-link cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
// How long the sheet takes to slide in or out; the close waits this long
// before unmounting it.
const SHEET_MS = 400;

// Motion of the sheet: it rises from the bottom edge over a fading-in dim and
// sinks back the same way when closing. With "reduce motion" on it only fades.
export function sheetMotion(closing: boolean): {
  backdrop: string;
  panel: string;
} {
  const base = "transition-[opacity,translate] duration-[400ms] ease-tg-spring";
  return {
    backdrop: `${base} starting:opacity-0 ${closing ? "opacity-0" : ""}`,
    panel: `${base} motion-safe:starting:translate-y-full motion-reduce:starting:opacity-0 ${
      closing ? "motion-safe:translate-y-full motion-reduce:opacity-0" : ""
    }`,
  };
}

// Whether letting go of a pulled-down sheet closes it rather than snapping it
// back: pulled past a third of its height, or flicked down (px/ms).
export function dragDismisses(
  dy: number,
  velocity: number,
  height: number,
): boolean {
  return dy > height / 3 || (dy > 10 && velocity > 0.5);
}

// Pulling the sheet down by its grabber: how far it has moved, the sheet's
// height, and whether the finger is still down.
type Drag = { dy: number; height: number; live: boolean };

function botScope(b: FactBot): string {
  return b.botId ?? MAIN_SCOPE;
}

function factErrorText(s: Strings, code: string): string {
  const key = FACT_ERR_KEY[code as keyof typeof FACT_ERR_KEY];
  return key ? s[key] : s.ui_facts_save_error(code);
}

// Where a FactsEditor sends its writes: the caller's own vault, or (admin) the
// vault of the user being viewed.
export type FactsWriter = {
  add: (scope: string, fact: UserFact) => Promise<FactsResponse>;
  update: (
    scope: string,
    key: string,
    patch: { value: string; newKey?: string },
  ) => Promise<FactsResponse>;
  remove: (scope: string, key: string) => Promise<FactsResponse>;
};

const MY_FACTS: FactsWriter = {
  add: api.addMyFact,
  update: api.updateMyFact,
  remove: api.deleteMyFact,
};

// Modal sheet that edits one fact (or creates one when `fact` is null), laid
// out the iOS way: Cancel / Save in the sheet's own header, the fields as
// form rows, and the destructive action apart at the bottom. Every successful
// mutation hands the server's fresh list back up via onDone once the sheet has
// slid away.
function FactSheet({
  writer,
  scope,
  fact,
  onDone,
  onCancel,
}: {
  writer: FactsWriter;
  scope: string;
  fact: UserFact | null;
  onDone: (next: FactsResponse) => void;
  onCancel: () => void;
}) {
  const { t: s } = useI18n();
  const [key, setKey] = useState(fact?.key ?? "");
  const [value, setValue] = useState(fact?.value ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ startY: number; y: number; t: number; v: number }>(
    null,
  );

  // Slides the sheet out, then hands control back to the caller.
  const dismiss = useCallback((then: () => void) => {
    setClosing(true);
    setTimeout(then, SHEET_MS);
  }, []);
  const cancel = useCallback(() => dismiss(onCancel), [dismiss, onCancel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    // The page behind must not scroll along with the sheet.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [cancel]);

  // Telegram would take a downward swipe as "minimize the app", so the
  // sheet's own pull-down needs it off while the sheet is open.
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.isVerticalSwipesEnabled) return;
    tg.disableVerticalSwipes?.();
    return () => tg.enableVerticalSwipes?.();
  }, []);

  const grab = (e: PointerEvent<HTMLDivElement>) => {
    if (busy || closing || (e.target as Element).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointer.current = { startY: e.clientY, y: e.clientY, t: e.timeStamp, v: 0 };
    setDrag({
      dy: 0,
      height: panelRef.current?.offsetHeight ?? window.innerHeight,
      live: true,
    });
  };

  const pull = (e: PointerEvent<HTMLDivElement>) => {
    const p = pointer.current;
    if (!p) return;
    const dt = e.timeStamp - p.t;
    if (dt > 0) p.v = (e.clientY - p.y) / dt;
    p.y = e.clientY;
    p.t = e.timeStamp;
    const dy = Math.max(0, p.y - p.startY);
    setDrag((d) => (d ? { ...d, dy } : d));
  };

  // On release the sheet either goes on down from where the finger left it
  // or slides back up.
  const release = (e: PointerEvent<HTMLDivElement>) => {
    const p = pointer.current;
    if (!p) return;
    pointer.current = null;
    const dy = Math.max(0, p.y - p.startY);
    const height = drag?.height ?? window.innerHeight;
    if (e.type === "pointerup" && dragDismisses(dy, p.v, height)) {
      setDrag({ dy, height, live: false });
      cancel();
    } else {
      setDrag(null);
    }
  };

  const normalizedKey = normalizeFactKey(key);
  const valid = normalizedKey !== null && normalizeFactValue(value) !== null;

  const run = async (fn: () => Promise<FactsResponse>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await fn();
      dismiss(() => onDone(next));
    } catch (err) {
      setError((err as { code?: string | null }).code ?? "save_failed");
      setBusy(false);
    }
  };

  const save = () => {
    if (normalizedKey === null) return;
    void run(() =>
      fact
        ? writer.update(
            scope,
            fact.key,
            normalizedKey !== fact.key
              ? { value, newKey: normalizedKey }
              : { value },
          )
        : writer.add(scope, { key: normalizedKey, value }),
    );
  };

  const remove = () => {
    if (!fact) return;
    if (!confirm(s.ui_facts_delete_confirm)) return;
    void run(() => writer.remove(scope, fact.key));
  };

  const motion = sheetMotion(closing);
  // While pulled, the sheet follows the finger and the dim thins out with it.
  const panelStyle = drag
    ? ({
        "--sheet-drag": `${drag.dy}px`,
        ...(drag.live ? { transitionDuration: "0s" } : {}),
      } as CSSProperties)
    : undefined;
  const backdropStyle = drag?.live
    ? { opacity: 1 - drag.dy / drag.height, transitionDuration: "0s" }
    : undefined;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col ${closing ? "pointer-events-none" : ""}`}
    >
      <div
        className={`absolute inset-0 bg-black/40 ${motion.backdrop}`}
        style={backdropStyle}
        onClick={cancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        ref={panelRef}
        className={`relative mt-12 flex-1 overflow-y-auto rounded-t-[14px] bg-tg-secondary px-3 pb-8 ${drag ? "translate-y-(--sheet-drag)" : ""} ${motion.panel}`}
        style={panelStyle}
      >
        <div
          className="-mx-3 touch-none px-3 pt-2 pb-4 cursor-grab active:cursor-grabbing"
          onPointerDown={grab}
          onPointerMove={pull}
          onPointerUp={release}
          onPointerCancel={release}
        >
          <div className="mx-auto mb-3 h-[5px] w-9 rounded-full bg-tg-hint/40" />
          <div className="flex items-center px-1">
            <button
              type="button"
              className={SHEET_BTN_CLS}
              disabled={busy}
              onClick={cancel}
            >
              {s.ui_facts_cancel}
            </button>
            <span className="flex-1 text-center text-[17px] font-semibold">
              {fact ? s.ui_facts_edit_title : s.ui_facts_new_title}
            </span>
            <button
              type="button"
              className={`${SHEET_BTN_CLS} font-semibold`}
              disabled={busy || !valid}
              onClick={save}
            >
              {busy ? s.ui_saving : s.ui_save}
            </button>
          </div>
        </div>
        <Stack>
          <SectionHeader>{s.ui_facts_key_label}</SectionHeader>
          <Card>
            <div className={ROW_CLS}>
              <input
                className={INPUT_LEFT_CLS}
                value={key}
                maxLength={FACT_KEY_MAX_LEN}
                placeholder={s.ui_facts_key_placeholder}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setKey(e.target.value)}
              />
            </div>
          </Card>
          <SectionFooter>{s.ui_facts_key_hint}</SectionFooter>
          <SectionHeader>{s.ui_facts_value_label}</SectionHeader>
          <Card>
            <textarea
              className={TEXTAREA_CLS}
              value={value}
              maxLength={FACT_VALUE_MAX_LEN}
              placeholder={s.ui_facts_value_placeholder}
              onChange={(e) => setValue(e.target.value)}
            />
          </Card>
          <SectionFooter>
            {error ? (
              <span className="text-tg-destructive">
                {factErrorText(s, error)}
              </span>
            ) : (
              s.ui_facts_value_count(value.length, FACT_VALUE_MAX_LEN)
            )}
          </SectionFooter>
          {fact ? (
            <div className="mt-4">
              <Card>
                <button
                  type="button"
                  className={`${ROW_CLS} w-full justify-center border-0 bg-transparent text-base text-tg-destructive cursor-pointer disabled:opacity-50`}
                  disabled={busy}
                  onClick={remove}
                >
                  {s.ui_facts_delete}
                </button>
              </Card>
            </div>
          ) : null}
        </Stack>
      </div>
    </div>
  );
}

// The editable fact list of one vault scope: a row per fact that opens it in
// a FactSheet, plus an add row. Sheet state is local, so callers key it by
// scope to drop an open sheet when the scope changes.
export function FactsEditor({
  writer,
  scope,
  data,
  onChange,
}: {
  writer: FactsWriter;
  scope: string;
  data: FactsResponse;
  onChange: (next: FactsResponse) => void;
}) {
  const { t: s } = useI18n();
  // The fact open in the sheet: a key, "new" for an add, or null when closed.
  const [open, setOpen] = useState<string | null>(null);
  const openFact =
    open === null || open === NEW_FACT
      ? null
      : (data.facts.find((f) => f.key === open) ?? null);
  const close = useCallback(() => setOpen(null), []);

  const applyResult = (next: FactsResponse) => {
    onChange(next);
    setOpen(null);
  };

  return (
    <>
      <Card>
        {data.facts.map((f) => (
          <NavRow
            key={f.key}
            title={f.key}
            subtitle={f.value}
            onClick={() => setOpen(f.key)}
          />
        ))}
        {data.facts.length === 0 ? (
          <EmptyState>{s.ui_facts_empty}</EmptyState>
        ) : null}
      </Card>
      <Card>
        <RowButton
          disabled={data.facts.length >= data.cap}
          onClick={() => setOpen(NEW_FACT)}
        >
          {s.ui_facts_add}
        </RowButton>
      </Card>
      {open !== null ? (
        <FactSheet
          key={open}
          writer={writer}
          scope={scope}
          fact={openFact}
          onDone={applyResult}
          onCancel={close}
        />
      ) : null}
    </>
  );
}

export function FactsView() {
  const { t: s } = useI18n();
  const { data: botsData } = useLoadable(api.listMyBots, []);
  const [scope, setScope] = useSessionState(
    "facts-scope",
    MAIN_SCOPE,
    parseString,
  );
  const { data, setData } = useLoadable(() => api.listMyFacts(scope), [scope]);

  const bots = botsData?.bots ?? null;

  return (
    <Stack>
      {bots && bots.length > 1 ? (
        <>
          <SectionHeader>{s.ui_facts_character}</SectionHeader>
          <Card>
            {bots.map((b) => (
              <SelectRow
                key={botScope(b)}
                label={botLabel(s, b)}
                selected={scope === botScope(b)}
                onSelect={() => setScope(botScope(b))}
              />
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader>{s.ui_facts_header}</SectionHeader>
      {data === null ? (
        <LoadingState />
      ) : (
        <>
          <FactsEditor
            key={scope}
            writer={MY_FACTS}
            scope={scope}
            data={data}
            onChange={setData}
          />
          <SectionFooter>
            {s.ui_facts_footer} {s.ui_facts_count(data.facts.length, data.cap)}
          </SectionFooter>
        </>
      )}
    </Stack>
  );
}
