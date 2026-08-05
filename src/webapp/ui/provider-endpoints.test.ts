// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import {
  pickEndpointBySort,
  toProviderOptions,
  type ProviderEndpoint,
} from "./provider-endpoints";

const ep = (e: Partial<ProviderEndpoint>): ProviderEndpoint => ({
  provider_name: "P",
  provider_slug: "p",
  pricing: {},
  throughput: null,
  latency: null,
  ...e,
});

describe("toProviderOptions", () => {
  test("keeps the order the gateway returned", () => {
    const opts = toProviderOptions([
      ep({ provider_name: "DeepInfra", provider_slug: "deepinfra" }),
      ep({ provider_name: "Together", provider_slug: "together" }),
    ]);
    expect(opts).toEqual([
      { slug: "deepinfra", name: "DeepInfra" },
      { slug: "together", name: "Together" },
    ]);
  });

  // Pinning the base slug routes to every variant/region of that provider, so
  // offering each quant separately would be a distinction without a difference.
  test("collapses quant and region variants onto the base slug", () => {
    const opts = toProviderOptions([
      ep({ provider_name: "DeepInfra", provider_slug: "deepinfra/fp4" }),
      ep({ provider_name: "DeepInfra", provider_slug: "deepinfra/fp8" }),
      ep({ provider_name: "Bedrock", provider_slug: "amazon-bedrock/eu-west-1" }),
    ]);
    expect(opts).toEqual([
      { slug: "deepinfra", name: "DeepInfra" },
      { slug: "amazon-bedrock", name: "Bedrock" },
    ]);
  });

  test("drops endpoints that carry no slug, since they can't be pinned", () => {
    expect(toProviderOptions([ep({ provider_slug: null })])).toEqual([]);
  });
});

describe("pickEndpointBySort", () => {
  const cheap = ep({
    provider_name: "Cheap",
    pricing: { prompt: "0.000001", completion: "0.000002" },
    throughput: 10,
    latency: 900,
  });
  const fast = ep({
    provider_name: "Fast",
    pricing: { prompt: "0.00001", completion: "0.00002" },
    throughput: 120,
    latency: 200,
  });

  test("price picks the lowest prompt+completion sum", () => {
    expect(pickEndpointBySort([fast, cheap], "price")?.provider_name).toBe(
      "Cheap",
    );
  });

  test("throughput picks the highest, latency the lowest", () => {
    expect(pickEndpointBySort([cheap, fast], "throughput")?.provider_name).toBe(
      "Fast",
    );
    expect(pickEndpointBySort([cheap, fast], "latency")?.provider_name).toBe(
      "Fast",
    );
  });

  // The stats source is undocumented and 404s for some models; "no numbers" has
  // to read as "unknown", never as a silent pick of an arbitrary provider.
  test("returns null when no endpoint carries the metric being sorted on", () => {
    const blind = ep({ throughput: null, latency: null });
    expect(pickEndpointBySort([blind], "throughput")).toBeNull();
    expect(pickEndpointBySort([blind], "latency")).toBeNull();
  });

  test("treats a missing price as worst rather than free", () => {
    const unpriced = ep({ provider_name: "Unpriced", pricing: {} });
    expect(pickEndpointBySort([unpriced, cheap], "price")?.provider_name).toBe(
      "Cheap",
    );
  });

  test("returns null for an empty list", () => {
    expect(pickEndpointBySort([], "price")).toBeNull();
  });
});
