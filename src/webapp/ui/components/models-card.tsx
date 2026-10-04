// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { Fragment, useEffect, useId, useRef, useState } from "react";
import { useI18n } from "../i18n-context";
import {
  fetchModelCatalog,
  formatPricePerMillion,
  lookupModel,
  supportsCaching,
  supportsTools,
  type ModelInfo as CatalogModel,
} from "../model-catalog";
import {
  fetchProviderEndpoints,
  pickEndpointBySort,
  type ProviderEndpoint,
} from "../provider-endpoints";
import type { ProviderSort } from "../../../shared/types";
import { AddRow } from "./add-row";
import { Card } from "./layout";
import { SwipeToDelete } from "./swipe-row";
import { INPUT_LEFT_CLS } from "./row";

// Which upstream a sort would actually land on, and what it costs there. Only
// asked for when the deployment has per-provider stats and a sort is set; every
// failure degrades to the catalogue's own numbers rather than an error.
function useSortedEndpoint(
  modelId: string | undefined,
  providerSort: ProviderSort | null,
): ProviderEndpoint | null | undefined {
  const [endpoint, setEndpoint] = useState<ProviderEndpoint | null | undefined>(
    undefined,
  );
  useEffect(() => {
    if (!modelId || !providerSort) {
      setEndpoint(null);
      return;
    }
    let cancelled = false;
    setEndpoint(undefined);
    fetchProviderEndpoints(modelId)
      .then((eps) => {
        if (!cancelled) setEndpoint(pickEndpointBySort(eps, providerSort));
      })
      .catch(() => {
        if (!cancelled) setEndpoint(null);
      });
    return () => {
      cancelled = true;
    };
  }, [modelId, providerSort]);
  return endpoint;
}

const joinParts = (parts: (string | null)[]) =>
  parts.filter(Boolean).join(" · ");

function ModelInfo({
  model,
  providerSort,
}: {
  model: CatalogModel | undefined;
  providerSort: ProviderSort | null;
}) {
  const { t: s } = useI18n();
  const endpoint = useSortedEndpoint(model?.id, providerSort);

  if (model === undefined)
    return <span className="text-tg-hint">{s.ui_modelinfo_loading}</span>;

  // With a sort in play the resolved endpoint's own prices are what this request
  // would be billed at, so they replace the catalogue's cross-provider figures.
  const resolved = providerSort !== null && endpoint ? endpoint : null;
  const inputPrice = resolved
    ? formatPricePerMillion(Number(resolved.pricing.prompt))
    : formatPricePerMillion(model.pricing?.promptPerToken);
  const outputPrice = resolved
    ? formatPricePerMillion(Number(resolved.pricing.completion))
    : formatPricePerMillion(model.pricing?.completionPerToken);
  const imagePrice = resolved
    ? formatPricePerMillion(Number(resolved.pricing.image))
    : formatPricePerMillion(model.pricing?.imagePerToken);
  const modalities = model.capabilities?.modalities ?? [];
  const hasTools = model.capabilities?.tools !== undefined;
  const caching = supportsCaching(model);

  const prices = [
    [s.ui_modelinfo_input, inputPrice],
    [s.ui_modelinfo_output, outputPrice],
    [s.ui_modelinfo_image, imagePrice],
  ].map(([label, price]) => (price ? `${label} ${price}` : null));
  const flags = [
    hasTools
      ? `${s.ui_modelinfo_tools}: ${supportsTools(model) ? s.ui_yes : s.ui_no}`
      : null,
    caching !== undefined
      ? `${s.ui_modelinfo_caching}: ${caching ? s.ui_yes : s.ui_no}`
      : null,
  ];
  const abilities = joinParts([modalities.join(", "), ...flags]);

  return (
    <div className="text-tg-hint">
      <div>{joinParts([model.name ?? model.id, ...prices])}</div>
      {abilities && <div>{abilities}</div>}
      {providerSort !== null && (
        <div>
          {endpoint === undefined
            ? s.ui_modelinfo_resolving_provider
            : endpoint === null
              ? s.ui_modelinfo_no_provider_data(providerSort)
              : `${s.ui_modelinfo_provider_prefix}${endpoint.provider_name}`}
          {endpoint &&
            providerSort === "throughput" &&
            endpoint.throughput !== null && (
              <>
                {" · "}
                {Math.round(endpoint.throughput)} {s.ui_modelinfo_tokps}
              </>
            )}
          {endpoint &&
            providerSort === "latency" &&
            endpoint.latency !== null && (
              <>
                {" · "}
                {Math.round(endpoint.latency)} {s.ui_modelinfo_ms}
              </>
            )}
        </div>
      )}
    </div>
  );
}

// The ids to save for `list`: trimmed, blank rows dropped. Null when nothing is
// left or some id is not `known`, so a half-typed chain never reaches the server.
export function committableModels(
  list: string[],
  known: (id: string) => boolean,
): string[] | null {
  const ids = list.map((m) => m.trim()).filter((m) => m.length > 0);
  return ids.length > 0 && ids.every(known) ? ids : null;
}

// The model picker. With `fallback` off it edits a single id — a plain
// OpenAI-compatible endpoint has no server-side fallback chain, so extra ids
// would never be sent. With it on, the trailing rows are the chain the gateway
// tries in order.
//
// Catalogue ids feed a native <datalist> for autocomplete, and a typed id the
// catalogue doesn't know is flagged invalid. Validity is reported via
// `onValidityChange` so the parent can disable its Save button; the server
// re-checks on write. Both layers stay quiet while the catalogue is loading or
// when the endpoint exposes no list, so saves are never blocked without a list.
export function ModelsCard({
  models,
  onChange,
  onValidityChange,
  onCommit,
  fallback = false,
  providerSort = null,
}: {
  models: string[];
  onChange: (next: string[]) => void;
  onValidityChange?: (valid: boolean) => void;
  // For autosaving callers: the list to save, trimmed and without blank rows,
  // offered when an input loses focus or a row is removed. Never called with an
  // empty list or one holding an id the catalogue rejects.
  onCommit?: (ids: string[]) => void;
  fallback?: boolean;
  providerSort?: ProviderSort | null;
}) {
  const { t: s } = useI18n();
  const listId = useId();
  const [catalog, setCatalog] = useState<Map<string, CatalogModel> | null>(
    null,
  );

  useEffect(() => {
    fetchModelCatalog()
      .then(setCatalog)
      .catch(() => setCatalog(new Map()));
  }, []);

  // Only a populated catalogue can declare a model unknown. While loading (null)
  // or when the endpoint exposes no catalogue (empty) we don't validate.
  const canValidate = catalog !== null && catalog.size > 0;
  const rows = fallback ? models : models.slice(0, 1);
  const resolve = (id: string): CatalogModel | null =>
    canValidate ? lookupModel(catalog, id.trim()) : null;
  // Every row has to be resolvable — a fallback the gateway can't serve is as
  // broken as a bad primary, just later and harder to notice.
  const valid = !rows.some(
    (m) => m.trim().length > 0 && canValidate && resolve(m) === null,
  );
  useEffect(() => {
    onValidityChange?.(valid);
  }, [valid, onValidityChange]);

  const options = catalog ? [...catalog.keys()] : [];
  // The detail sits under the input, not under the `N` marker.
  const detailCls = `text-[13px] leading-[1.45]${fallback ? " col-start-2" : ""}`;
  // Rows keep their identity when one is swiped away, so the next one does not
  // inherit its slide.
  const keys = useRef<number[]>([]);
  const nextKey = useRef(0);
  while (keys.current.length < rows.length)
    keys.current.push(nextKey.current++);
  // The row a tap on "Add Fallback" just made, ready to be typed into.
  const [added, setAdded] = useState<number | null>(null);
  // Without a fallback chain the card owns exactly one id, so an edit replaces
  // the whole list. Otherwise ids left over from a gateway that *did* support
  // fallbacks would stay hidden below the fold and still be saved — and still be
  // rejected by the catalogue check the admin can't see.
  // Whether an id was typed since the last commit.
  const edited = useRef(false);
  const updateAt = (idx: number, value: string) => {
    edited.current = true;
    onChange(
      fallback ? models.map((m, i) => (i === idx ? value : m)) : [value],
    );
  };
  const commit = (list: string[]) => {
    edited.current = false;
    const ids = committableModels(list, (id) => !canValidate || !!resolve(id));
    if (ids) onCommit?.(ids);
  };
  // Telegram's back button unmounts the card without a blur, so an edit still
  // pending is offered for saving on unmount, as NumberRow does. Only a real
  // edit: the card is also removed by whatever hides it (a switch turned off),
  // and a snapshot of its rows must not be saved then.
  const latest = useRef({ rows, commit });
  useEffect(() => {
    latest.current = { rows, commit };
  });
  useEffect(
    () => () => {
      if (onCommit && edited.current)
        latest.current.commit(latest.current.rows);
    },
    [],
  );
  const removeAt = (idx: number) => {
    keys.current.splice(idx, 1);
    const next = models.filter((_, i) => i !== idx);
    onChange(next);
    commit(next);
  };

  return (
    <Card>
      {rows.map((m, idx) => {
        const trimmed = m.trim();
        const matched = resolve(m);
        const invalid = trimmed.length > 0 && canValidate && matched === null;
        const row = (
          <div
            className={`row relative grid items-baseline gap-x-3 gap-y-1 px-4 py-[11px]${fallback ? " grid-cols-[14px_1fr]" : ""}`}
          >
            {fallback && (
              <span className="text-tg-hint text-[15px]">
                {s.ui_models_fallback_n(idx + 1)}
              </span>
            )}
            <input
              className={INPUT_LEFT_CLS}
              value={m}
              onChange={(e) => updateAt(idx, e.target.value)}
              onBlur={() => {
                if (idx === added) setAdded(null);
                // An emptied fallback is a removed one: the keyboard path.
                if (fallback && idx > 0 && trimmed.length === 0) removeAt(idx);
                else commit(rows);
              }}
              placeholder={s.ui_models_model_id}
              list={listId}
              autoFocus={idx === added}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {trimmed.length > 0 &&
              (invalid ? (
                <div className={`${detailCls} text-tg-destructive`}>
                  {s.ui_models_not_in_catalog}
                </div>
              ) : catalog === null ? (
                <div className={detailCls}>
                  <ModelInfo model={undefined} providerSort={providerSort} />
                </div>
              ) : canValidate ? (
                <div className={detailCls}>
                  {/* Reaching here implies matched !== null; coalesce for the type. */}
                  <ModelInfo
                    model={matched ?? undefined}
                    providerSort={providerSort}
                  />
                </div>
              ) : // No catalogue to describe the model with — leave the row bare
              // rather than sit on a "loading" that will never resolve.
              null)}
          </div>
        );
        return (
          <Fragment key={keys.current[idx]}>
            {fallback && idx > 0 ? (
              <SwipeToDelete
                label={s.ui_models_delete_fallback}
                onDelete={() => removeAt(idx)}
              >
                {row}
              </SwipeToDelete>
            ) : (
              row
            )}
          </Fragment>
        );
      })}
      {fallback && (
        <AddRow
          label={s.ui_models_add_fallback}
          onClick={() => {
            setAdded(models.length);
            onChange([...models, ""]);
          }}
        />
      )}
      {/* One list shared by every row. Rendered unconditionally — an empty
          <datalist> suggests nothing, exactly like no list at all, and keeping
          it out of a conditional means the `list=` above can never point at an
          element that isn't there. It goes *last* because the card's separators
          are adjacent-sibling rules (`.row + .row`, `.row + .action-row` in
          styles.css): an element between two rows renders nothing but still
          breaks the pair, and the hairline silently disappears. */}
      <datalist id={listId}>
        {options.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>
    </Card>
  );
}
