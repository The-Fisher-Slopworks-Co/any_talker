// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useCallback, useState } from "react";
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
import { AddRow } from "../components/add-row";
import { Sheet, SheetButton, useSheet } from "../components/sheet";
import { NavRow, SelectRow } from "../components/select-row";
import { INPUT_LEFT_CLS, ROW_CLS } from "../components/row";
import { useDelayedFlag } from "../lib/use-delayed-flag";
import { useLoadable } from "../lib/use-loadable";
import {
  parseString,
  readSession,
  useSessionState,
} from "../lib/session-state";
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
  // Which request is in flight: only a save turns Save into "Saving…".
  const [action, setAction] = useState<"save" | "delete" | null>(null);
  const busy = action !== null;
  const showSaving = useDelayedFlag(action === "save");
  const [error, setError] = useState<string | null>(null);
  const { closing, dismiss, cancel } = useSheet(onCancel);

  const normalizedKey = normalizeFactKey(key);
  const valid = normalizedKey !== null && normalizeFactValue(value) !== null;

  const run = async (
    kind: "save" | "delete",
    fn: () => Promise<FactsResponse>,
  ) => {
    setAction(kind);
    setError(null);
    try {
      const next = await fn();
      dismiss(() => onDone(next));
    } catch (err) {
      setError((err as { code?: string | null }).code ?? "save_failed");
      setAction(null);
    }
  };

  const save = () => {
    if (normalizedKey === null) return;
    void run("save", () =>
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
    void run("delete", () => writer.remove(scope, fact.key));
  };

  return (
    <Sheet
      title={fact ? s.ui_facts_edit_title : s.ui_facts_new_title}
      closing={closing}
      busy={busy}
      onCancel={cancel}
      leading={
        <SheetButton disabled={busy} onClick={cancel}>
          {s.ui_facts_cancel}
        </SheetButton>
      }
      trailing={
        <SheetButton bold disabled={busy || !valid} onClick={save}>
          {showSaving ? s.ui_saving : s.ui_save}
        </SheetButton>
      }
    >
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
    </Sheet>
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
        <AddRow
          label={s.ui_facts_add}
          disabled={data.facts.length >= data.cap}
          onClick={() => setOpen(NEW_FACT)}
        />
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

// The bots the viewer can pick a character of; shared with the admin's user
// page, which lists the same bots.
export const myBotsLoad = { key: "my-bots", load: () => api.listMyBots() };

const SCOPE_KEY = "facts-scope";

// The facts carry their scope: the previous scope's stay up, and editable,
// while a newly picked one loads.
export function myFactsLoads(
  scope = readSession(SCOPE_KEY, parseString) ?? MAIN_SCOPE,
) {
  return {
    bots: myBotsLoad,
    facts: {
      key: `my-facts:${scope}`,
      load: () => api.listMyFacts(scope).then((r) => ({ ...r, scope })),
    },
  };
}

export function FactsView() {
  const { t: s } = useI18n();
  const [scope, setScope] = useSessionState(SCOPE_KEY, MAIN_SCOPE, parseString);
  const loads = myFactsLoads(scope);
  const { data: botsData, error: botsError } = useLoadable(loads.bots);
  const { data, setData } = useLoadable(loads.facts);
  // The character picker sits above the list and exists only for more than one
  // bot, so the screen first shows once both have landed rather than letting
  // the picker push the list down.
  const ready = (botsData !== null || botsError) && data !== null;

  const bots = botsData?.bots ?? null;

  if (!ready) return <LoadingState />;

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
            key={data.scope}
            writer={MY_FACTS}
            scope={data.scope}
            data={data}
            onChange={(next) => setData({ ...next, scope: data.scope })}
          />
          <SectionFooter>
            {s.ui_facts_footer} {s.ui_facts_count(data.facts.length, data.cap)}
          </SectionFooter>
        </>
      )}
    </Stack>
  );
}
