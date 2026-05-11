// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState } from "react";
import { useI18n } from "../i18n-context";
import {
  fetchOpenRouterEndpoints,
  fetchOpenRouterModels,
  formatPricePerMillion,
  lookupOpenRouterModel,
  pickEndpointBySort,
  supportsCaching,
  supportsTools,
  type OpenRouterEndpoint,
  type OpenRouterModel,
} from "../openrouter-models";
import type { ProviderSort } from "../../../shared/types";
import { Card } from "./layout";
import { RowButton } from "./controls";
import { INPUT_LEFT_CLS } from "./row";

function ModelInfo({
  model,
  providerSort,
}: {
  model: OpenRouterModel | null | undefined;
  providerSort: ProviderSort | null;
}) {
  const { t: s } = useI18n();
  const [endpoint, setEndpoint] = useState<
    OpenRouterEndpoint | null | undefined
  >(undefined);

  useEffect(() => {
    if (!model || !providerSort) {
      setEndpoint(null);
      return;
    }
    let cancelled = false;
    setEndpoint(undefined);
    fetchOpenRouterEndpoints(model.id)
      .then((eps) => {
        if (cancelled) return;
        setEndpoint(pickEndpointBySort(eps, providerSort));
      })
      .catch(() => {
        if (!cancelled) setEndpoint(null);
      });
    return () => {
      cancelled = true;
    };
  }, [model?.id, providerSort]);

  if (model === undefined)
    return <span className="text-tg-hint">{s.ui_modelinfo_loading}</span>;
  if (model === null)
    return <span className="text-tg-hint">{s.ui_modelinfo_unknown}</span>;

  const useEndpoint =
    providerSort !== null && endpoint !== null && endpoint !== undefined;
  const inputPrice = formatPricePerMillion(
    useEndpoint ? endpoint.pricing.prompt : model.pricing.prompt,
  );
  const outputPrice = formatPricePerMillion(
    useEndpoint ? endpoint.pricing.completion : model.pricing.completion,
  );
  const imagePrice = formatPricePerMillion(
    useEndpoint ? endpoint.pricing.image : model.pricing.image,
  );
  const modalities = model.architecture?.input_modalities ?? [];
  const tools = supportsTools(model);
  const caching = supportsCaching(model);

  return (
    <div className="flex flex-col gap-1">
      <div className="font-medium text-tg-text">{model.name}</div>
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
      <div className="flex flex-wrap gap-x-3">
        <span>
          <span className="text-tg-hint">{s.ui_modelinfo_tools}</span>{" "}
          {tools ? s.ui_yes : s.ui_no}
        </span>
        <span>
          <span className="text-tg-hint">{s.ui_modelinfo_caching}</span>{" "}
          {caching ? s.ui_yes : s.ui_no}
        </span>
      </div>
    </div>
  );
}

export function ModelsCard({
  models,
  onChange,
  providerSort,
}: {
  models: string[];
  onChange: (next: string[]) => void;
  providerSort: ProviderSort | null;
}) {
  const { t: s } = useI18n();
  const [catalog, setCatalog] = useState<Map<string, OpenRouterModel> | null>(
    null,
  );

  useEffect(() => {
    fetchOpenRouterModels()
      .then(setCatalog)
      .catch(() => setCatalog(new Map()));
  }, []);

  const lookupModel = (id: string): OpenRouterModel | null | undefined => {
    const trimmed = id.trim();
    if (trimmed.length === 0) return null;
    if (catalog === null) return undefined;
    return lookupOpenRouterModel(catalog, trimmed);
  };

  const updateAt = (idx: number, value: string) =>
    onChange(models.map((m, i) => (i === idx ? value : m)));
  const removeAt = (idx: number) => onChange(models.filter((_, i) => i !== idx));
  const addFallback = () => onChange([...models, ""]);

  return (
    <Card>
      {models.map((m, idx) => {
        const info = m.trim().length > 0 ? lookupModel(m) : null;
        return (
          <div
            key={idx}
            className="row relative flex flex-col gap-2 px-4 py-[11px]"
          >
            <div className="flex items-center gap-3">
              <span className="shrink-0 text-tg-hint text-[15px] w-6">
                {s.ui_models_fallback_n(idx + 1)}
              </span>
              <input
                className={INPUT_LEFT_CLS}
                value={m}
                onChange={(e) => updateAt(idx, e.target.value)}
                placeholder={s.ui_models_model_id}
              />
              {idx > 0 && (
                <button
                  className="bg-transparent border-0 px-2 py-1.5 text-[15px] text-tg-destructive cursor-pointer"
                  onClick={() => removeAt(idx)}
                  aria-label={s.ui_models_remove_fallback}
                >
                  {s.ui_remove}
                </button>
              )}
            </div>
            {m.trim().length > 0 && (
              <div className="pl-[36px] text-[13px] leading-[1.45]">
                <ModelInfo model={info} providerSort={providerSort} />
              </div>
            )}
          </div>
        );
      })}
      <RowButton onClick={addFallback}>{s.ui_models_add_fallback}</RowButton>
    </Card>
  );
}
