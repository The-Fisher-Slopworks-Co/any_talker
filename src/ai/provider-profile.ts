// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Which non-standard surface the configured chat-completions endpoint exposes
// beyond the plain OpenAI contract. The bot speaks OpenAI-compatible to
// everything; this profile decides what *extra* it is allowed to send and read
// back, so one deployment can point at OpenRouter and another at OpenAI itself.
//
// The gate is load-bearing rather than cosmetic: a strict endpoint (OpenAI's own
// API among them) answers HTTP 400 "Unrecognized request argument" when a body
// carries a field it doesn't know, so a mis-declared capability breaks *every*
// request, not just the feature.

export type ProviderFlavor = "openrouter" | "generic";

export const PROVIDER_FLAVORS: readonly ProviderFlavor[] = [
  "openrouter",
  "generic",
];

export type ProviderCapabilities = {
  // Server-side fallback chain: extra model ids in the `models` body field, tried
  // in order when the primary fails.
  modelFallback: boolean;
  // `provider` body field — sort all providers by a metric, or pin one.
  providerRouting: boolean;
  // `service_tier` body field (cheaper-but-slower / faster-but-pricier).
  serviceTier: boolean;
  // The response reports the request's real USD cost (`usage.cost`), so spend is
  // read back instead of being re-derived from token counts and a price list.
  usageAccounting: boolean;
  // A per-model endpoints API exists, listing each upstream provider with its
  // price and p50 throughput/latency.
  endpointStats: boolean;
  // Reasoning effort is expressed as the unified `reasoning: { effort }` object
  // rather than OpenAI's flat `reasoning_effort`. Exactly one spelling is sent —
  // both at once would be two names for one setting in a single body.
  unifiedReasoning: boolean;
  // `session_id` body field — a stable id for the conversation a request belongs
  // to. The gateway uses it as the sticky-routing key, so every turn of one
  // conversation lands on the upstream provider that already holds a warm prompt
  // cache for it instead of drifting between providers and paying full price.
  sessionId: boolean;
};

const PROFILES: Record<ProviderFlavor, ProviderCapabilities> = {
  openrouter: Object.freeze({
    modelFallback: true,
    providerRouting: true,
    serviceTier: true,
    usageAccounting: true,
    endpointStats: true,
    unifiedReasoning: true,
    sessionId: true,
  }),
  // Everything off — the plain OpenAI chat-completions contract and nothing more.
  generic: Object.freeze({
    modelFallback: false,
    providerRouting: false,
    serviceTier: false,
    usageAccounting: false,
    endpointStats: false,
    unifiedReasoning: false,
    sessionId: false,
  }),
};

export function capabilitiesFor(flavor: ProviderFlavor): ProviderCapabilities {
  return PROFILES[flavor];
}

export function isValidProviderFlavor(v: unknown): v is ProviderFlavor {
  return v === "openrouter" || v === "generic";
}

// Infers the flavor from the configured base URL. Deliberately host-exact
// (openrouter.ai or a subdomain of it) rather than a substring match, so a
// look-alike host can't switch the profile on. Anything else — including a proxy
// or gateway that fronts OpenRouter — is generic; that case is what the explicit
// `AI_PROVIDER_FLAVOR` override exists for.
export function detectProviderFlavor(baseUrl: string): ProviderFlavor {
  let host: string;
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return "generic";
  }
  return host === "openrouter.ai" || host.endsWith(".openrouter.ai")
    ? "openrouter"
    : "generic";
}
