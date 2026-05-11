// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ReactNode } from "react";
import { useI18n } from "../i18n-context";
import { Card, SectionFooter, SectionHeader } from "./layout";
import { Toggle } from "./controls";
import { ROW_CLS, ROW_LABEL_CLS } from "./row";

export function OverrideSection({
  title,
  footer,
  override,
  onToggle,
  children,
}: {
  title: string;
  footer?: ReactNode;
  override: boolean;
  onToggle: (v: boolean) => void;
  children: ReactNode;
}) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{title}</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_chat_override_global}</span>
          <span className="flex-1" />
          <Toggle value={override} onChange={onToggle} />
        </div>
      </Card>
      {override ? children : null}
      {footer ? <SectionFooter>{footer}</SectionFooter> : null}
    </>
  );
}
