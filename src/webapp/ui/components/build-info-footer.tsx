// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState } from "react";
import { api, type BuildInfoResponse } from "../api-client";

export function BuildInfoFooter() {
  const [info, setInfo] = useState<BuildInfoResponse | null>(null);

  useEffect(() => {
    api.getBuildInfo().then(setInfo).catch(() => setInfo(null));
  }, []);

  if (!info?.shortCommit) return null;
  return (
    <div className="pt-6 text-center text-[12px] text-tg-hint font-mono">
      <span title={info.commit ?? undefined}>{info.shortCommit}</span>
    </div>
  );
}
