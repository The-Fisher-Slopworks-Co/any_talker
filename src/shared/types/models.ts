// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Reasoning effort passed through to the model per request, sent as
// OpenRouter's unified `reasoning: { effort }` field (honored by reasoning
// models, ignored by others).
export type ReasoningEffort = "low" | "high";

// How OpenRouter should pick among the upstreams serving one model.
export type ProviderSort = "price" | "throughput" | "latency";

// Service tiers trade cost against latency/availability. Omitting the field
// (null) uses the standard tier; "flex" is cheaper but slower, and "priority" is
// faster at a higher price.
export type ServiceTier = "flex" | "priority";

export function isValidProviderSort(v: unknown): v is ProviderSort {
  return v === "price" || v === "throughput" || v === "latency";
}

export function isValidServiceTier(v: unknown): v is ServiceTier {
  return v === "flex" || v === "priority";
}

// Provider slugs are lowercase identifiers, optionally with variant/region
// segments after a slash (e.g. "deepinfra", "deepinfra/fp4",
// "google-vertex/us-east5"). Validate the shape rather than an allow-list so we
// don't have to track a gateway's evolving provider catalogue; the value is only
// ever placed in a JSON body field, so there's no injection surface.
const PROVIDER_SLUG_RE =
  /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?(\/[a-z0-9]([a-z0-9._-]*[a-z0-9])?)*$/i;

export function isValidProviderSlug(v: unknown): v is string {
  return typeof v === "string" && v.length <= 100 && PROVIDER_SLUG_RE.test(v);
}
