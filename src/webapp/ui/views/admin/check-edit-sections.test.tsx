// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { RecurringCheck } from "../../../../checks/types";
import { DateFmtProvider } from "../../datetime-context";
import { I18nProvider } from "../../i18n-context";
import { DEFAULT_DRAFT } from "./check-edit-form";
import {
  ButtonsSection,
  CheckStatusCard,
  CounterSection,
  EnabledSection,
  QuestionSection,
  RecipientSection,
  RepliesSection,
  ScheduleSection,
} from "./check-edit-sections";

function render(node: React.ReactNode): string {
  return renderToStaticMarkup(<I18nProvider lang="en">{node}</I18nProvider>);
}

const props = {
  draft: DEFAULT_DRAFT,
  set: () => {},
  setNow: () => {},
  commit: () => {},
  error: null,
};

describe("check editor groups", () => {
  test("the enabled switch is a row of its own, under no header", () => {
    const html = render(<EnabledSection {...props} />);
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-label="Enabled"');
    expect(html).not.toContain("section-header");
  });

  test("the title and the question share the Question card", () => {
    const html = render(<QuestionSection {...props} />);
    expect(html.match(/class="card /g)?.length).toBe(1);
    expect(html).toContain(">Question<");
    expect(html).toContain(">Title<");
    expect(html).toContain("<textarea");
    expect(html).toContain("{name} mentions the user");
  });

  test("the recipient group names the user and the chat", () => {
    const html = render(<RecipientSection {...props} />);
    for (const label of ["Recipient", "Chat ID", "User ID", "Name Shown"]) {
      expect(html).toContain(`>${label}<`);
    }
    expect(html).toContain("Replaces {name}");
  });

  test("the buttons group labels both answers", () => {
    const html = render(<ButtonsSection {...props} />);
    expect(html).toContain(">Buttons<");
    expect(html).toContain(">Yes Label<");
    expect(html).toContain(">No Label<");
  });

  test("the schedule is one time row, one timezone picker and a timeout in min", () => {
    const html = render(<ScheduleSection {...props} />);
    expect(html).toContain(">Schedule<");
    // The app-formatted time is the visible text; the native input lies over it.
    expect(html).toContain(">23:30</span>");
    expect(html).toContain('type="time"');
    expect(html).toContain("opacity-0");
    // One pop-up for the zone, with no "automatic" choice.
    expect(html.match(/<select/g)?.length).toBe(1);
    expect(html).toContain('<option value="Europe/Moscow" selected="">');
    expect(html).not.toContain("Automatic");
    expect(html).toContain(">Timeout<");
    expect(html).toContain(">min<");
  });

  test("the replies share one card, each under a small caption", () => {
    const html = render(<RepliesSection {...props} />);
    expect(html.match(/class="card /g)?.length).toBe(1);
    expect(html.match(/<textarea/g)?.length).toBe(2);
    expect(html).toContain(">When Yes<");
    expect(html).toContain(">When No / Timeout<");
  });

  test("a hand-kept counter is a source picker, a value and an On Yes picker", () => {
    const html = render(<CounterSection {...props} />);
    expect(html.match(/<select/g)?.length).toBe(2);
    for (const text of ["Source", "Value", "On Yes", "Manual Number"]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain('type="date"');
    expect(html).toContain("Value of {count}.");
  });

  test("a counter by date swaps the value for a start date and its footer", () => {
    const draft = { ...DEFAULT_DRAFT, counterAnchorDate: "2026-01-02" };
    const html = render(<CounterSection {...props} draft={draft} />);
    expect(html).toContain(">Start Date<");
    // The app-formatted date is the visible text; the native input lies over it.
    expect(html).toContain(">Jan 2, 2026</span>");
    expect(html).toContain('type="date"');
    expect(html).toContain('value="2026-01-02"');
    expect(html).not.toContain(">Value<");
    expect(html).toContain("days since this date");
  });

  test("the status shows when it last fired and whether a reply is pending", () => {
    const check = { lastFiredAtMs: 0, pendingMessageId: 5 } as RecurringCheck;
    const html = renderToStaticMarkup(
      <I18nProvider lang="en">
        <DateFmtProvider dateFormat="iso" timezone="UTC">
          <CheckStatusCard check={check} />
        </DateFmtProvider>
      </I18nProvider>,
    );
    for (const text of ["Status", "Last Fired", "Never", "Pending Reply"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain(">Yes<");
  });

  test("a refused field shows its error in red under its own group only", () => {
    const html = render(
      <>
        <QuestionSection {...props} />
        <RecipientSection {...props} error="chat_id_empty" />
        <ButtonsSection {...props} error="chat_id_empty" />
      </>,
    );
    expect(html.match(/Enter a chat ID./g)?.length).toBe(1);
    expect(html).toContain("text-tg-destructive");
    // The hint it replaces is gone; the other groups keep theirs.
    expect(html).not.toContain("Replaces {name}");
    expect(html).toContain("{name} mentions the user");
  });

  test("the error is worded in the viewer's language", () => {
    const html = renderToStaticMarkup(
      <I18nProvider lang="ru">
        <RecipientSection {...props} error="chat_id_empty" />
      </I18nProvider>,
    );
    expect(html).toContain("Укажите ID чата.");
  });

  test("a group without a hint gets a footer only for an error", () => {
    expect(render(<ButtonsSection {...props} />)).not.toContain("pt-0.5");
    expect(
      render(<ButtonsSection {...props} error="no_button_empty" />),
    ).toContain("Enter the No label.");
  });
});
