// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { I18nProvider } from "../i18n-context";
import { api } from "../api-client";
import { UserAboutSection, type UserAbout } from "./user-about-section";

function render(initial: UserAbout): string {
  return renderToStaticMarkup(
    <I18nProvider lang="en">
      <UserAboutSection
        userId="1"
        fallbackName="Sam Rivera"
        initial={initial}
      />
    </I18nProvider>,
  );
}

const UNSET: UserAbout = {
  displayName: null,
  timezone: null,
  gender: null,
  language: null,
};

test("lists name, gender, timezone and language as rows with the unset choice first", () => {
  const html = render(UNSET);
  expect(html).toContain("About");
  for (const label of ["Name", "Gender", "Timezone", "Language"])
    expect(html).toContain(`>${label}</span>`);
  expect(html).toContain('placeholder="Sam Rivera"');
  expect(html).toMatch(/<option value="" selected="">Not Set<\/option>/);
  expect(html).toContain(">Automatic</option>");
  expect(html).toContain("English");
});

test("shows the stored values and explains the automatic choices", () => {
  const html = render({
    displayName: "Sam",
    timezone: "Europe/Berlin",
    gender: "male",
    language: "ru",
  });
  expect(html).toContain('value="Sam"');
  expect(html).toMatch(/<option value="male" selected="">Male<\/option>/);
  expect(html).toMatch(/<option value="ru" selected="">/);
  expect(html).toContain("What the AI calls the user (empty: Sam Rivera)");
});

// Picking in a real tree needs a DOM; linkedom does not feed React's event
// plumbing, so the handler React attached to the select is called directly.
describe("UserAboutSection picks", () => {
  const { window, document } = parseHTML(
    "<!doctype html><html><body></body></html>",
  );
  Object.assign(globalThis, { window, document });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

  type SelectProps = { value: string; onChange: (e: unknown) => void };
  // The mocks answer at once, so a run of microtask turns lets every save and
  // revert play out without depending on timers.
  const settle = async () => {
    for (let i = 0; i < 50; i++) await Promise.resolve();
  };

  test("a refused pick does not undo a newer one", async () => {
    let puts = 0;
    Object.assign(api, {
      putAdminUser: async (_id: string, patch: Partial<UserAbout>) => {
        if (puts++ === 0) throw new Error("refused");
        return { ...UNSET, ...patch };
      },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <I18nProvider lang="en">
          <UserAboutSection userId="1" fallbackName="Sam" initial={UNSET} />
        </I18nProvider>,
      ),
    );
    const gender = container.querySelector("select")!;
    const key = Object.keys(gender).find((k) => k.startsWith("__reactProps"))!;
    const props = () =>
      (gender as unknown as Record<string, SelectProps>)[key]!;
    await act(async () => {
      props().onChange({ target: { value: "male" } });
      props().onChange({ target: { value: "female" } });
      await settle();
    });
    expect(props().value).toBe("female");
    await act(async () => root.unmount());
  });

  test("a refused pick goes back to the last saved value", async () => {
    Object.assign(api, {
      putAdminUser: async () => {
        throw new Error("refused");
      },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <I18nProvider lang="en">
          <UserAboutSection userId="1" fallbackName="Sam" initial={UNSET} />
        </I18nProvider>,
      ),
    );
    const gender = container.querySelector("select")!;
    const key = Object.keys(gender).find((k) => k.startsWith("__reactProps"))!;
    const props = () =>
      (gender as unknown as Record<string, SelectProps>)[key]!;
    await act(async () => {
      props().onChange({ target: { value: "male" } });
      await settle();
    });
    expect(props().value).toBe("");
    await act(async () => root.unmount());
  });
});
