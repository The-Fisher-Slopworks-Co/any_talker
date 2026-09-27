// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { useI18n } from "../i18n-context";
import { api } from "../api-client";
import { LIMIT_CLASSES, type LimitClass } from "../../../shared/types";
import { Card, SectionFooter, SectionHeader } from "./layout";
import { SelectRow } from "./select-row";

// The admin puts a user in a limit class or takes them out of it. Each pick
// saves at once, like the whitelist toggle. `onChanged` lets the page refetch
// what the class moves (the usage bars).
export function LimitClassCard({
  userId,
  initial,
  onChanged,
}: {
  userId: string;
  initial: LimitClass | null;
  onChanged: () => void;
}) {
  const { t: s } = useI18n();
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  const pick = async (next: LimitClass | null) => {
    if (saving || next === value) return;
    setSaving(true);
    try {
      const r = await api.putUserLimitClass(userId, next);
      setValue(r.limitClass);
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SectionHeader>{s.ui_limit_class_header}</SectionHeader>
      <Card>
        <SelectRow
          label={s.ui_limit_class_none}
          selected={value === null}
          onSelect={() => pick(null)}
        />
        {LIMIT_CLASSES.map((c) => (
          <SelectRow
            key={c}
            label={s.ui_limit_class_name(c)}
            selected={value === c}
            onSelect={() => pick(c)}
          />
        ))}
      </Card>
      <SectionFooter>{s.ui_limit_class_footer}</SectionFooter>
    </>
  );
}
