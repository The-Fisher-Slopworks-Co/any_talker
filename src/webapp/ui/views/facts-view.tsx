// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { useI18n } from "../i18n-context";
import {
  api,
  type FactBot,
  type FactsResponse,
  type UserFact,
} from "../api-client";
import { Card, SectionFooter, SectionHeader, Stack } from "../components/layout";
import { EmptyState, LoadingState } from "../components/states";
import { RowButton } from "../components/controls";
import { NavRow, SelectRow } from "../components/select-row";
import { INPUT_CLS, ROW_CLS, ROW_LABEL_CLS } from "../components/row";
import { useLoadable } from "../lib/use-loadable";
import { botLabel, FACT_ERR_KEY } from "../lib/labels";
import type { Strings } from "../lib/routes";
import {
  FACT_KEY_MAX_LEN,
  FACT_VALUE_MAX_LEN,
  normalizeFactKey,
  normalizeFactValue,
} from "../../../shared/user-facts";

const MAIN_SCOPE = "main";

const TEXTAREA_CLS =
  "block w-full box-border bg-transparent border-0 px-4 py-3 text-base min-h-[80px]";
const EDIT_BTN_CLS =
  "bg-transparent border-0 p-0 text-base font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

function botScope(b: FactBot): string {
  return b.botId ?? MAIN_SCOPE;
}

function factErrorText(s: Strings, code: string): string {
  const key = FACT_ERR_KEY[code as keyof typeof FACT_ERR_KEY];
  return key ? s[key] : s.ui_facts_save_error(code);
}

// Inline editor for one fact (or a new one when `fact` is null). Renders as
// rows inside the parent Card; every successful mutation hands the server's
// fresh list back up via onDone.
function FactForm({
  scope,
  fact,
  onDone,
  onCancel,
}: {
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

  const normalizedKey = normalizeFactKey(key);
  const valid = normalizedKey !== null && normalizeFactValue(value) !== null;

  const run = async (fn: () => Promise<FactsResponse>) => {
    setBusy(true);
    setError(null);
    try {
      onDone(await fn());
    } catch (err) {
      setError((err as { code?: string | null }).code ?? "save_failed");
      setBusy(false);
    }
  };

  const save = () => {
    if (normalizedKey === null) return;
    void run(() =>
      fact
        ? api.updateMyFact(
            scope,
            fact.key,
            normalizedKey !== fact.key
              ? { value, newKey: normalizedKey }
              : { value },
          )
        : api.addMyFact(scope, { key: normalizedKey, value }),
    );
  };

  const remove = () => {
    if (!fact) return;
    if (!confirm(s.ui_facts_delete_confirm)) return;
    void run(() => api.deleteMyFact(scope, fact.key));
  };

  return (
    <div>
      <label className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_facts_key_label}</span>
        <input
          className={INPUT_CLS}
          value={key}
          maxLength={FACT_KEY_MAX_LEN}
          placeholder={s.ui_facts_key_placeholder}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <textarea
        className={TEXTAREA_CLS}
        value={value}
        maxLength={FACT_VALUE_MAX_LEN}
        placeholder={s.ui_facts_value_placeholder}
        onChange={(e) => setValue(e.target.value)}
      />
      {error ? (
        <div className="px-4 pb-2 text-[13px] text-tg-destructive">
          {factErrorText(s, error)}
        </div>
      ) : null}
      <div className={ROW_CLS}>
        <button
          type="button"
          className={`${EDIT_BTN_CLS} text-tg-link`}
          disabled={busy || !valid}
          onClick={save}
        >
          {busy ? s.ui_saving : s.ui_save}
        </button>
        <button
          type="button"
          className={`${EDIT_BTN_CLS} text-tg-hint`}
          disabled={busy}
          onClick={onCancel}
        >
          {s.ui_facts_cancel}
        </button>
        <span className="flex-1" />
        {fact ? (
          <button
            type="button"
            className={`${EDIT_BTN_CLS} text-tg-destructive`}
            disabled={busy}
            onClick={remove}
          >
            {s.ui_remove}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function FactsView() {
  const { t: s } = useI18n();
  const { data: botsData } = useLoadable(api.listMyBots, []);
  const [scope, setScope] = useState<string>(MAIN_SCOPE);
  const { data, setData } = useLoadable(() => api.listMyFacts(scope), [scope]);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const bots = botsData?.bots ?? null;

  const applyResult = (next: FactsResponse) => {
    setData(next);
    setEditing(null);
    setAdding(false);
  };

  const switchScope = (next: string) => {
    if (next === scope) return;
    setScope(next);
    setEditing(null);
    setAdding(false);
  };

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
                onSelect={() => switchScope(botScope(b))}
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
          <Card>
            {data.facts.map((f) =>
              editing === f.key ? (
                <FactForm
                  key={f.key}
                  scope={scope}
                  fact={f}
                  onDone={applyResult}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <NavRow
                  key={f.key}
                  title={f.key}
                  subtitle={f.value}
                  onClick={() => {
                    setAdding(false);
                    setEditing(f.key);
                  }}
                />
              ),
            )}
            {data.facts.length === 0 && !adding ? (
              <EmptyState>{s.ui_facts_empty}</EmptyState>
            ) : null}
          </Card>
          {adding ? (
            <Card>
              <FactForm
                scope={scope}
                fact={null}
                onDone={applyResult}
                onCancel={() => setAdding(false)}
              />
            </Card>
          ) : (
            <Card>
              <RowButton
                disabled={data.facts.length >= data.cap}
                onClick={() => {
                  setEditing(null);
                  setAdding(true);
                }}
              >
                {s.ui_facts_add}
              </RowButton>
            </Card>
          )}
          <SectionFooter>
            {s.ui_facts_footer} {s.ui_facts_count(data.facts.length, data.cap)}
          </SectionFooter>
        </>
      )}
    </Stack>
  );
}
