// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { Counter, Gauge, Histogram, Registry } from "./registry";

describe("Counter", () => {
  test("renders zero for a label-less counter that was never touched", () => {
    const c = new Counter("ops_total", "ops");
    expect(c.collect()).toBe(
      ["# HELP ops_total ops", "# TYPE ops_total counter", "ops_total 0"].join(
        "\n",
      ),
    );
  });

  test("accumulates increments and renders sorted labels", () => {
    const c = new Counter("ops_total", "ops", ["kind", "result"]);
    c.inc({ kind: "ask", result: "ok" });
    c.inc({ kind: "ask", result: "ok" }, 2);
    c.inc({ kind: "ask", result: "err" });
    const out = c.collect();
    expect(out).toContain(`ops_total{kind="ask",result="ok"} 3`);
    expect(out).toContain(`ops_total{kind="ask",result="err"} 1`);
  });

  test("rejects negative increments", () => {
    const c = new Counter("ops_total", "ops");
    expect(() => c.inc(-1)).toThrow(/must not decrease/);
  });

  test("rejects missing labels", () => {
    const c = new Counter("ops_total", "ops", ["kind"]);
    expect(() => c.inc({})).toThrow(/expected labels \[kind\]/);
    expect(() => c.inc({ wrong: "x" })).toThrow(/missing label "kind"/);
  });

  test("escapes quotes and backslashes in label values", () => {
    const c = new Counter("ops_total", "ops", ["msg"]);
    c.inc({ msg: 'a"b\\c' });
    expect(c.collect()).toContain(`ops_total{msg="a\\"b\\\\c"} 1`);
  });
});

describe("Gauge", () => {
  test("set, inc and dec", () => {
    const g = new Gauge("queue_depth", "depth");
    g.set(5);
    g.inc();
    g.dec(2);
    expect(g.collect()).toContain("queue_depth 4");
  });

  test("set with labels stores one series per distinct label set", () => {
    const g = new Gauge("workers", "workers", ["role"]);
    g.set({ role: "a" }, 1);
    g.set({ role: "b" }, 2);
    g.set({ role: "a" }, 3);
    const out = g.collect();
    expect(out).toContain(`workers{role="a"} 3`);
    expect(out).toContain(`workers{role="b"} 2`);
  });
});

describe("Histogram", () => {
  test("buckets are cumulative; _sum and _count match observations", () => {
    const h = new Histogram("dur_seconds", "dur", [], [0.1, 1, 10]);
    h.observe(0.05);
    h.observe(0.5);
    h.observe(5);
    h.observe(50);
    const out = h.collect();
    expect(out).toContain(`dur_seconds_bucket{le="0.1"} 1`);
    expect(out).toContain(`dur_seconds_bucket{le="1"} 2`);
    expect(out).toContain(`dur_seconds_bucket{le="10"} 3`);
    expect(out).toContain(`dur_seconds_bucket{le="+Inf"} 4`);
    expect(out).toContain(`dur_seconds_count 4`);
    expect(out).toContain(`dur_seconds_sum 55.55`);
  });

  test("separate label sets get separate bucket series", () => {
    const h = new Histogram("dur_seconds", "dur", ["op"], [1]);
    h.observe({ op: "a" }, 0.5);
    h.observe({ op: "b" }, 2);
    const out = h.collect();
    expect(out).toContain(`dur_seconds_bucket{le="1",op="a"} 1`);
    expect(out).toContain(`dur_seconds_bucket{le="+Inf",op="a"} 1`);
    expect(out).toContain(`dur_seconds_bucket{le="1",op="b"} 0`);
    expect(out).toContain(`dur_seconds_bucket{le="+Inf",op="b"} 1`);
  });

  test("rejects unsorted or empty buckets", () => {
    expect(() => new Histogram("x", "x", [], [])).toThrow(/empty/);
    expect(() => new Histogram("x", "x", [], [1, 0.5])).toThrow(/ascending/);
  });

  test("rejects `le` as a user label", () => {
    expect(() => new Histogram("x", "x", ["le"])).toThrow(/reserved/);
  });

  test("startTimer records elapsed seconds", async () => {
    const h = new Histogram("dur_seconds", "dur", [], [1]);
    const end = h.startTimer();
    await new Promise((r) => setTimeout(r, 5));
    const elapsed = end();
    expect(elapsed).toBeGreaterThan(0);
    expect(h.collect()).toContain(`dur_seconds_count 1`);
  });
});

describe("Registry", () => {
  test("render concatenates registered metrics and runs collectors", () => {
    const r = new Registry();
    const c = r.register(new Counter("a_total", "a"));
    const g = r.register(new Gauge("b", "b"));
    let called = 0;
    r.onCollect(() => {
      called++;
      g.set(7);
    });
    c.inc();
    const out = r.render();
    expect(called).toBe(1);
    expect(out).toContain("a_total 1");
    expect(out).toContain("b 7");
    expect(out.endsWith("\n")).toBe(true);
  });

  test("rejects duplicate metric names", () => {
    const r = new Registry();
    r.register(new Counter("x", "x"));
    expect(() => r.register(new Counter("x", "x"))).toThrow(/already registered/);
  });

  test("collector exceptions don't break rendering", () => {
    const r = new Registry();
    r.register(new Counter("x_total", "x"));
    r.onCollect(() => {
      throw new Error("boom");
    });
    const out = r.render();
    expect(out).toContain("x_total 0");
  });
});

describe("metric names and label names", () => {
  test("rejects invalid metric names", () => {
    expect(() => new Counter("1bad", "x")).toThrow(/invalid metric name/);
    expect(() => new Counter("with-dash", "x")).toThrow(/invalid metric name/);
  });

  test("rejects invalid label names", () => {
    expect(() => new Counter("ok_total", "x", ["bad-name"])).toThrow(
      /invalid label name/,
    );
  });
});
