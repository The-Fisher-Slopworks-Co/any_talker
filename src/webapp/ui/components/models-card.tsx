// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useId, useState } from "react";
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
import { Card } from "./layout";
import { RowButton } from "./controls";
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

  return (
    <div className="flex flex-col gap-1">
      <div className="font-medium text-tg-text">{model.name ?? model.id}</div>
      {providerSort !== null && (
        <div className="text-tg-hint">
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
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {inputPrice && (
          <span>
            <span className="text-tg-hint">{s.ui_modelinfo_input}</span>{" "}
            {inputPrice}
          </span>
        )}
        {outputPrice && (
          <span>
            <span className="text-tg-hint">{s.ui_modelinfo_output}</span>{" "}
            {outputPrice}
          </span>
        )}
        {imagePrice && (
          <span>
            <span className="text-tg-hint">{s.ui_modelinfo_image}</span>{" "}
            {imagePrice}
          </span>
        )}
      </div>
      {modalities.length > 0 && (
        <div>
          <span className="text-tg-hint">{s.ui_modelinfo_modalities}</span>{" "}
          {modalities.join(", ")}
        </div>
      )}
      {(hasTools || caching !== undefined) && (
        <div className="flex flex-wrap gap-x-3">
          {hasTools && (
            <span>
              <span className="text-tg-hint">{s.ui_modelinfo_tools}</span>{" "}
              {supportsTools(model) ? s.ui_yes : s.ui_no}
            </span>
          )}
          {caching !== undefined && (
            <span>
              <span className="text-tg-hint">{s.ui_modelinfo_caching}</span>{" "}
              {caching ? s.ui_yes : s.ui_no}
            </span>
          )}
        </div>
      )}
    </div>
  );
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
  fallback = false,
  providerSort = null,
}: {
  models: string[];
  onChange: (next: string[]) => void;
  onValidityChange?: (valid: boolean) => void;
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
  // A chain row is prefixed by a 24px `#N` marker plus a 12px gap, so its detail
  // text has to clear the same 36px or it reads as a second column under the
  // marker instead of a caption under the field.
  const detailCls = `text-[13px] leading-[1.45]${fallback ? " pl-[36px]" : ""}`;
  // Without a fallback chain the card owns exactly one id, so an edit replaces
  // the whole list. Otherwise ids left over from a gateway that *did* support
  // fallbacks would stay hidden below the fold and still be saved — and still be
  // rejected by the catalogue check the admin can't see.
  const updateAt = (idx: number, value: string) =>
    onChange(fallback ? models.map((m, i) => (i === idx ? value : m)) : [value]);
  const removeAt = (idx: number) => onChange(models.filter((_, i) => i !== idx));

  return (
    <Card>
      {rows.map((m, idx) => {
        const trimmed = m.trim();
        const matched = resolve(m);
        const invalid = trimmed.length > 0 && canValidate && matched === null;
        return (
          <div
            key={idx}
            className="row relative flex flex-col gap-2 px-4 py-[11px]"
          >
            <div className="flex items-center gap-3">
              {fallback && (
                <span className="shrink-0 text-tg-hint text-[15px] w-6">
                  {s.ui_models_fallback_n(idx + 1)}
                </span>
              )}
              <input
                className={INPUT_LEFT_CLS}
                value={m}
                onChange={(e) => updateAt(idx, e.target.value)}
                placeholder={s.ui_models_model_id}
                list={listId}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              {fallback && idx > 0 && (
                <button
                  className="bg-transparent border-0 px-2 py-1.5 text-[15px] text-tg-destructive cursor-pointer"
                  onClick={() => removeAt(idx)}
                  aria-label={s.ui_models_remove_fallback}
                >
                  {s.ui_remove}
                </button>
              )}
            </div>
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
      })}
      {fallback && (
        <RowButton onClick={() => onChange([...models, ""])}>
          {s.ui_models_add_fallback}
        </RowButton>
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
