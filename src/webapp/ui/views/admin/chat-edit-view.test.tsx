// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { I18nProvider } from "../../i18n-context";
import { DateFmtProvider } from "../../datetime-context";
import { api } from "../../api-client";
import { DEFAULT_SETTINGS, type ChatSettings } from "../../../../shared/types";
import { ChatEditView } from "./chat-edit-view";

// Typing into the page and taking it away needs a DOM. linkedom does not feed
// React's event plumbing, so the handlers React attached to the input are
// called directly, as its event system would.
const { window, document } = parseHTML(
  "<!doctype html><html><body></body></html>",
);
Object.assign(globalThis, { window, document });
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type InputProps = {
  value: string;
  onChange: (e: unknown) => void;
  onBlur: () => void;
};

// Lets the page run until `done` holds, however loaded the machine is.
async function until(done: () => boolean) {
  for (let i = 0; i < 300 && !done(); i++)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  expect(done()).toBe(true);
}

// A save the test answers itself, when it chooses.
type Pending = { settings: ChatSettings; answer: (ok: boolean) => void };

async function mount() {
  const puts: Pending[] = [];
  Object.assign(api, {
    getSettings: async () => DEFAULT_SETTINGS,
    getAdminChat: async () => ({
      chat: {
        id: "-100",
        type: "supergroup",
        title: "Hikers",
        username: null,
        firstSeenAt: 0,
        lastSeenAt: 0,
      },
      settings: {},
      whitelisted: false,
      blacklisted: false,
    }),
    putAdminChat: (_id: string, settings: ChatSettings) =>
      new Promise((resolve, reject) =>
        puts.push({
          settings,
          answer: (ok) =>
            ok ? resolve({ settings }) : reject(new Error("refused")),
        }),
      ),
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <I18nProvider lang="en">
        <DateFmtProvider dateFormat="iso" timezone="UTC">
          <ChatEditView chatId="-100" />
        </DateFmtProvider>
      </I18nProvider>,
    ),
  );
  await until(() => container.querySelector("input") !== null);
  const input = container.querySelector("input")!;
  const key = Object.keys(input).find((k) => k.startsWith("__reactProps"))!;
  const props = () => (input as unknown as Record<string, InputProps>)[key]!;
  const type = async (value: string) => {
    await act(async () => props().onChange({ target: { value } }));
    await act(async () => props().onBlur());
  };
  const answer = async (n: number, ok: boolean) => {
    await until(() => puts.length > n);
    await act(async () => puts[n]!.answer(ok));
  };
  return { root, props, type, container, puts, answer };
}

describe("ChatEditView", () => {
  test("opens with the chat as the page heading, its details and access", async () => {
    const { root, container } = await mount();
    const heading = container.querySelector("h1")!;
    expect(heading.textContent).toBe("Hikers");
    const text = container.textContent;
    for (const label of ["-100", "Last Seen", "Allowed", "Blocked", "Bot Name"])
      expect(text).toContain(label);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    await act(async () => root.unmount());
  });
});

describe("ChatEditView autosave", () => {
  test("sends the whole record when a field is left, once", async () => {
    const { root, props, type, puts, answer } = await mount();
    await type("Rex");
    await answer(0, true);
    expect(props().value).toBe("Rex");
    await act(async () => root.unmount());
    expect(puts.map((p) => p.settings)).toEqual([{ botName: "Rex" }]);
  });

  test("a refused save puts the field back", async () => {
    const { root, props, type, answer } = await mount();
    await type("Rex");
    await answer(0, false);
    await until(() => props().value === "");
    await act(async () => root.unmount());
  });

  test("a refused save does not undo a newer one that went through", async () => {
    const { root, props, type, answer, puts } = await mount();
    // The second change is made while the first is still in flight.
    await type("A");
    await type("AB");
    await answer(0, false);
    await answer(1, true);
    expect(puts.map((p) => p.settings)).toEqual([
      { botName: "A" },
      { botName: "AB" },
    ]);
    expect(props().value).toBe("AB");
    await act(async () => root.unmount());
  });

  test("a refused newer save goes back to what the older one saved", async () => {
    const { root, props, type, answer } = await mount();
    await type("A");
    await type("AB");
    await answer(0, true);
    await answer(1, false);
    await until(() => props().value === "A");
    await act(async () => root.unmount());
  });
});
