// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { I18nProvider } from "../../i18n-context";
import { api } from "../../api-client";
import type { ManagedBot } from "../../../../managed-bots/types";
import type { ManagedBotInput } from "../../../../managed-bots/validate";
import { ManagedBotEditView } from "./managed-bot-edit-view";

// Typing into the page and taking it away needs a DOM. linkedom does not feed
// React's event plumbing, so the handlers React attached to the fields are
// called directly, as its event system would.
const { window, document } = parseHTML(
  "<!doctype html><html><body></body></html>",
);
Object.assign(globalThis, { window, document });
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type FieldProps = {
  value: string;
  onChange: (e: unknown) => void;
  onBlur: () => void;
};

const BOT: ManagedBot = {
  botId: "2000001",
  ownerUserId: "1",
  username: "nemo_bot",
  displayName: "Captain Nemo",
  systemPrompt: "Calm.",
  createdAtMs: 0,
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
type Pending = { input: ManagedBotInput; answer: (ok: boolean) => void };

async function mount() {
  const puts: Pending[] = [];
  Object.assign(api, {
    getManagedBot: async () => ({ bot: BOT, running: true }),
    updateManagedBot: (_id: string, input: ManagedBotInput) =>
      new Promise((resolve, reject) =>
        puts.push({
          input,
          answer: (ok) =>
            ok
              ? resolve({ bot: { ...BOT, ...input }, running: true })
              : reject(new Error("refused")),
        }),
      ),
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <I18nProvider lang="en">
        <ManagedBotEditView botId={BOT.botId} onClose={() => {}} />
      </I18nProvider>,
    ),
  );
  await until(() => container.querySelector("textarea") !== null);
  const field = (selector: string) => {
    const el = container.querySelector(selector)!;
    const key = Object.keys(el).find((k) => k.startsWith("__reactProps"))!;
    return () => (el as unknown as Record<string, FieldProps>)[key]!;
  };
  const name = field("input[placeholder]");
  const prompt = field("textarea");
  const type = async (props: () => FieldProps, value: string) => {
    await act(async () => props().onChange({ target: { value } }));
  };
  const leave = (props: () => FieldProps) => act(async () => props().onBlur());
  const answer = async (n: number, ok: boolean) => {
    await until(() => puts.length > n);
    await act(async () => puts[n]!.answer(ok));
  };
  return {
    root,
    container,
    name,
    prompt,
    type,
    leave,
    puts,
    answer,
  };
}

describe("ManagedBotEditView avatar", () => {
  // The picker returns a file; reading it needs a FileReader, which the DOM
  // stand-in lacks.
  class FakeReader {
    result = "data:image/png;base64,AA==";
    onload: () => void = () => {};
    readAsDataURL() {
      this.onload();
    }
  }

  async function pick(container: Element) {
    const input = container.querySelector('input[type="file"]')!;
    const key = Object.keys(input).find((k) => k.startsWith("__reactProps"))!;
    const props = (
      input as unknown as Record<string, { onChange: (e: unknown) => unknown }>
    )[key]!;
    await act(async () => {
      void props.onChange({ target: { files: [{}] } });
    });
  }

  const editButton = (container: Element) =>
    Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Edit",
    )!;

  test("greys the Edit link out while a picture uploads, and names a failure", async () => {
    const { root, container } = await mount();
    Object.assign(globalThis, { FileReader: FakeReader });
    let refuse: () => void = () => {};
    Object.assign(api, {
      setManagedBotAvatar: () =>
        new Promise((_, reject) => {
          refuse = () => reject(new Error("is the bot running?"));
        }),
    });
    await pick(container);
    await until(() => editButton(container).hasAttribute("disabled"));
    const toast = () =>
      Array.from(container.querySelectorAll('[role="status"]')).find((n) =>
        n.textContent!.includes("Couldn't set the avatar"),
      )!;
    expect(toast().getAttribute("aria-hidden")).toBe("true");
    await act(async () => refuse());
    await until(() => !editButton(container).hasAttribute("disabled"));
    expect(toast().getAttribute("aria-hidden")).toBe("false");
    await act(async () => root.unmount());
  });
});

describe("ManagedBotEditView deleting", () => {
  // The server's save is read-modify-write, so a save still in flight when
  // the delete lands could resurrect the bot or find it gone.
  test("waits for a save in flight before deleting", async () => {
    const { root, container, name, type, leave, answer } = await mount();
    const deletes: string[] = [];
    Object.assign(api, {
      deleteManagedBot: async (id: string) => {
        deletes.push(id);
        return { ok: true };
      },
    });
    Object.assign(globalThis, { confirm: () => true });
    await type(name, "Kitty");
    await leave(name);
    const button = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Delete Bot",
    )!;
    const key = Object.keys(button).find((k) => k.startsWith("__reactProps"))!;
    const click = (
      button as unknown as Record<string, { onClick: () => void }>
    )[key]!.onClick;
    await act(async () => {
      void click();
    });
    expect(deletes).toEqual([]);
    await answer(0, true);
    await until(() => deletes.length === 1);
    expect(deletes).toEqual([BOT.botId]);
    await act(async () => root.unmount());
  });
});

describe("ManagedBotEditView", () => {
  test("opens with the bot as the page heading, with its handle and status", async () => {
    const { root, container } = await mount();
    expect(container.querySelector("h1")!.textContent).toBe("Captain Nemo");
    const text = container.textContent;
    for (const part of ["@nemo_bot", "Running", "Display Name", "Delete Bot"])
      expect(text).toContain(part);
    expect(text).not.toContain("Save");
    await act(async () => root.unmount());
  });

  test("sends both fields when one is left, and nothing when none changed", async () => {
    const { root, container, name, prompt, type, leave, puts, answer } =
      await mount();
    await leave(name);
    await type(prompt, "Calm and wise.");
    await leave(prompt);
    await answer(0, true);
    await leave(prompt);
    await act(async () => root.unmount());
    expect(puts.map((p) => p.input)).toEqual([
      { displayName: "Captain Nemo", systemPrompt: "Calm and wise." },
    ]);
    expect(container.textContent).not.toContain("Couldn't save");
  });

  test("saves what is still being typed when the screen goes away", async () => {
    const { root, name, type, puts } = await mount();
    await type(name, "Nemo");
    await act(async () => root.unmount());
    expect(puts.map((p) => p.input.displayName)).toEqual(["Nemo"]);
  });

  test("a refused save puts back only the field it changed", async () => {
    const { root, name, prompt, type, leave, answer } = await mount();
    await type(name, "Kitty");
    await leave(name);
    await type(prompt, "Calm. Brief.");
    await answer(0, false);
    await until(() => name().value === "Captain Nemo");
    expect(prompt().value).toBe("Calm. Brief.");
    await act(async () => root.unmount());
  });

  test("a refused save does not undo a newer one that went through", async () => {
    const { root, name, type, leave, answer, puts } = await mount();
    await type(name, "A");
    await leave(name);
    await type(name, "AB");
    await leave(name);
    await answer(0, false);
    await answer(1, true);
    expect(puts.map((p) => p.input.displayName)).toEqual(["A", "AB"]);
    expect(name().value).toBe("AB");
    await act(async () => root.unmount());
  });

  test("a change back to the saved value while a save is in flight is still sent", async () => {
    const { root, name, type, leave, puts, answer } = await mount();
    await type(name, "A");
    await leave(name);
    await type(name, "Captain Nemo");
    await leave(name);
    await answer(0, true);
    await answer(1, true);
    expect(puts.map((p) => p.input.displayName)).toEqual(["A", "Captain Nemo"]);
    await act(async () => root.unmount());
  });
});

async function mountCreate(canManageBots: boolean) {
  Object.assign(api, {
    getManagedBotNewInfo: async () => ({ username: "main_bot", canManageBots }),
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <I18nProvider lang="en">
        <ManagedBotEditView botId={null} onClose={() => {}} />
      </I18nProvider>,
    ),
  );
  await until(() => container.querySelector("button") !== null);
  return { root, container };
}

describe("ManagedBotEditView creating", () => {
  test("asks for a suggested name and username, then offers Create in Telegram", async () => {
    const { root, container } = await mountCreate(true);
    const text = container.textContent;
    for (const part of [
      "Suggested Name",
      "Suggested Username",
      "Create in Telegram",
    ])
      expect(text).toContain(part);
    expect(text).not.toContain("First enable bot management");
    expect(container.querySelector("button")!.hasAttribute("disabled")).toBe(
      false,
    );
    await act(async () => root.unmount());
  });

  test("greys the action out under a warning when bot management is off", async () => {
    const { root, container } = await mountCreate(false);
    expect(container.textContent).toContain("First enable bot management");
    expect(container.querySelector("button")!.hasAttribute("disabled")).toBe(
      true,
    );
    await act(async () => root.unmount());
  });
});
