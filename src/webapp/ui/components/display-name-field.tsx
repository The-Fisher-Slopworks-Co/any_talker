// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ReactNode } from "react";
import { useI18n } from "../i18n-context";
import type { DisplayNameError } from "../../../shared/display-name";
import { Card, SectionFooter, SectionHeader } from "./layout";
import { INPUT_CLS, ROW_CLS, ROW_LABEL_CLS } from "./row";
import { DISPLAY_NAME_ERR_KEY } from "../lib/labels";

// Validation stays with the caller: it also drives the save button, so the
// already-computed `error` is passed back in rather than recomputed here.
export function DisplayNameField({
  label,
  placeholder,
  footer,
  value,
  onChange,
  error,
}: {
  label: string;
  placeholder: string;
  footer: ReactNode;
  value: string;
  onChange: (v: string) => void;
  error: DisplayNameError | null;
}) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{s.ui_main_display_name}</SectionHeader>
      <Card>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{label}</span>
          <input
            className={INPUT_CLS}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      </Card>
      <SectionFooter>
        {error ? (
          <span className="text-tg-destructive">
            {s[DISPLAY_NAME_ERR_KEY[error]]}
          </span>
        ) : (
          footer
        )}
      </SectionFooter>
    </>
  );
}
