// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { expect, test } from "bun:test";

// Placeholder until the harness lands (issue #110, steps 4-7). It already
// guards the one thing this scaffold exists for: nothing on the commit gate
// may reach `e2e/`, or `bun run check` starts needing a Telegram account, a
// KeyDB and two repository secrets.
test("the unit gate never reaches e2e/", async () => {
  const pkg = (await Bun.file("package.json").json()) as {
    scripts: Record<string, string>;
  };
  expect(pkg.scripts.test).toBe("bun test src");

  // A bare `bun test` walks the whole repository, `e2e/` included, so both
  // gates go through the script instead.
  for (const path of ["lefthook.yml", ".github/workflows/check.yml"]) {
    expect(await Bun.file(path).text()).not.toMatch(
      /^\s*(?:-\s*)?run:\s*bun test\s*$/m,
    );
  }
});
