// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Minimal Prometheus exposition format implementation. We deliberately
// don't depend on prom-client to keep the runtime lean and Bun-native.

export type LabelValues = Record<string, string>;

export type MetricType = "counter" | "gauge" | "histogram";

export interface Metric {
  readonly name: string;
  readonly help: string;
  readonly type: MetricType;
  collect(): string;
}

const NAME_RE = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertName(name: string): void {
  if (!NAME_RE.test(name)) throw new Error(`invalid metric name: ${name}`);
}

function assertLabelName(name: string): void {
  if (!LABEL_NAME_RE.test(name)) {
    throw new Error(`invalid label name: ${name}`);
  }
}

function escapeLabelValue(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function escapeHelp(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
}

function renderLabels(labels: LabelValues, extra?: LabelValues): string {
  const merged: LabelValues = extra ? { ...labels, ...extra } : labels;
  const keys = Object.keys(merged).sort();
  if (keys.length === 0) return "";
  const parts = keys.map((k) => `${k}="${escapeLabelValue(merged[k]!)}"`);
  return "{" + parts.join(",") + "}";
}

function labelKey(labels: LabelValues, names: readonly string[]): string {
  if (names.length === 0) return "";
  return names.map((n) => labels[n] ?? "").join("\x1f");
}

function validateLabels(
  metricName: string,
  labels: LabelValues,
  names: readonly string[],
): void {
  const provided = Object.keys(labels);
  if (provided.length !== names.length) {
    throw new Error(
      `${metricName}: expected labels [${names.join(",")}], got [${provided.join(",")}]`,
    );
  }
  for (const n of names) {
    if (!(n in labels)) {
      throw new Error(`${metricName}: missing label "${n}"`);
    }
  }
}

function renderHeader(name: string, help: string, type: MetricType): string {
  return `# HELP ${name} ${escapeHelp(help)}\n# TYPE ${name} ${type}`;
}

export class Counter implements Metric {
  readonly type = "counter" as const;
  private readonly values = new Map<
    string,
    { labels: LabelValues; value: number }
  >();

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labelNames: readonly string[] = [],
  ) {
    assertName(name);
    for (const n of labelNames) assertLabelName(n);
  }

  inc(value?: number): void;
  inc(labels: LabelValues, value?: number): void;
  inc(labelsOrValue?: LabelValues | number, maybeValue?: number): void {
    let labels: LabelValues;
    let value: number;
    if (typeof labelsOrValue === "object") {
      labels = labelsOrValue;
      value = maybeValue ?? 1;
    } else {
      labels = {};
      value = labelsOrValue ?? 1;
    }
    if (value < 0) throw new Error(`${this.name}: counter must not decrease`);
    validateLabels(this.name, labels, this.labelNames);
    const key = labelKey(labels, this.labelNames);
    const existing = this.values.get(key);
    if (existing) existing.value += value;
    else this.values.set(key, { labels: { ...labels }, value });
  }

  collect(): string {
    const lines: string[] = [renderHeader(this.name, this.help, this.type)];
    if (this.values.size === 0 && this.labelNames.length === 0) {
      lines.push(`${this.name} 0`);
    }
    for (const entry of this.values.values()) {
      lines.push(`${this.name}${renderLabels(entry.labels)} ${entry.value}`);
    }
    return lines.join("\n");
  }
}

export class Gauge implements Metric {
  readonly type = "gauge" as const;
  private readonly values = new Map<
    string,
    { labels: LabelValues; value: number }
  >();

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labelNames: readonly string[] = [],
  ) {
    assertName(name);
    for (const n of labelNames) assertLabelName(n);
  }

  set(value: number): void;
  set(labels: LabelValues, value: number): void;
  set(labelsOrValue: LabelValues | number, maybeValue?: number): void {
    let labels: LabelValues;
    let value: number;
    if (typeof labelsOrValue === "object") {
      labels = labelsOrValue;
      value = maybeValue!;
    } else {
      labels = {};
      value = labelsOrValue;
    }
    validateLabels(this.name, labels, this.labelNames);
    const key = labelKey(labels, this.labelNames);
    this.values.set(key, { labels: { ...labels }, value });
  }

  inc(value = 1): void {
    validateLabels(this.name, {}, this.labelNames);
    const key = labelKey({}, this.labelNames);
    const existing = this.values.get(key);
    if (existing) existing.value += value;
    else this.values.set(key, { labels: {}, value });
  }

  dec(value = 1): void {
    this.inc(-value);
  }

  collect(): string {
    const lines: string[] = [renderHeader(this.name, this.help, this.type)];
    if (this.values.size === 0 && this.labelNames.length === 0) {
      lines.push(`${this.name} 0`);
    }
    for (const entry of this.values.values()) {
      lines.push(`${this.name}${renderLabels(entry.labels)} ${entry.value}`);
    }
    return lines.join("\n");
  }
}

export const DEFAULT_BUCKETS: readonly number[] = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

type HistogramSeries = {
  labels: LabelValues;
  buckets: number[]; // cumulative counts per upper bound
  sum: number;
  count: number;
};

export class Histogram implements Metric {
  readonly type = "histogram" as const;
  readonly buckets: readonly number[];
  private readonly series = new Map<string, HistogramSeries>();

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labelNames: readonly string[] = [],
    buckets: readonly number[] = DEFAULT_BUCKETS,
  ) {
    assertName(name);
    for (const n of labelNames) {
      assertLabelName(n);
      if (n === "le") {
        throw new Error(`${name}: "le" is reserved for histogram buckets`);
      }
    }
    if (buckets.length === 0) throw new Error(`${name}: buckets empty`);
    const sorted = [...buckets];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]! <= sorted[i - 1]!) {
        throw new Error(`${name}: buckets must be strictly ascending`);
      }
    }
    this.buckets = sorted;
  }

  observe(value: number): void;
  observe(labels: LabelValues, value: number): void;
  observe(labelsOrValue: LabelValues | number, maybeValue?: number): void {
    let labels: LabelValues;
    let value: number;
    if (typeof labelsOrValue === "object") {
      labels = labelsOrValue;
      value = maybeValue!;
    } else {
      labels = {};
      value = labelsOrValue;
    }
    validateLabels(this.name, labels, this.labelNames);
    const key = labelKey(labels, this.labelNames);
    let entry = this.series.get(key);
    if (!entry) {
      entry = {
        labels: { ...labels },
        buckets: new Array(this.buckets.length).fill(0),
        sum: 0,
        count: 0,
      };
      this.series.set(key, entry);
    }
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]!) entry.buckets[i]!++;
    }
    entry.sum += value;
    entry.count++;
  }

  startTimer(labels: LabelValues = {}): () => number {
    const start = performance.now();
    return () => {
      const seconds = (performance.now() - start) / 1000;
      this.observe(labels, seconds);
      return seconds;
    };
  }

  collect(): string {
    const lines: string[] = [renderHeader(this.name, this.help, this.type)];
    for (const entry of this.series.values()) {
      for (let i = 0; i < this.buckets.length; i++) {
        lines.push(
          `${this.name}_bucket${renderLabels(entry.labels, { le: String(this.buckets[i]) })} ${entry.buckets[i]}`,
        );
      }
      lines.push(
        `${this.name}_bucket${renderLabels(entry.labels, { le: "+Inf" })} ${entry.count}`,
      );
      lines.push(
        `${this.name}_sum${renderLabels(entry.labels)} ${entry.sum}`,
      );
      lines.push(
        `${this.name}_count${renderLabels(entry.labels)} ${entry.count}`,
      );
    }
    return lines.join("\n");
  }
}

export class Registry {
  private readonly metrics: Metric[] = [];
  private readonly collectors: Array<() => void> = [];

  register<T extends Metric>(metric: T): T {
    if (this.metrics.some((m) => m.name === metric.name)) {
      throw new Error(`metric already registered: ${metric.name}`);
    }
    this.metrics.push(metric);
    return metric;
  }

  onCollect(fn: () => void): void {
    this.collectors.push(fn);
  }

  render(): string {
    for (const c of this.collectors) {
      try {
        c();
      } catch (err) {
        console.error("metrics collector failed:", err);
      }
    }
    return this.metrics.map((m) => m.collect()).join("\n") + "\n";
  }

  clear(): void {
    this.metrics.length = 0;
    this.collectors.length = 0;
  }
}

export const CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";
