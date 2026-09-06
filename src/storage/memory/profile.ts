// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Gender } from "../../shared/types";
import type { Lang } from "../../shared/i18n";
import type { DateFormat } from "../../shared/date-format";
import type { ProfileStore } from "../types/profile";
import type { Backing } from "../memory";

export class MemoryProfileStore implements ProfileStore {
  constructor(private readonly b: Backing) {}

  async getName(userId: string): Promise<string | null> {
    return this.b.userNames.get(userId) ?? null;
  }

  async setName(userId: string, name: string | null): Promise<void> {
    if (name === null) this.b.userNames.delete(userId);
    else this.b.userNames.set(userId, name);
  }

  async getTimezone(userId: string): Promise<string | null> {
    return this.b.userTimezones.get(userId) ?? null;
  }

  async setTimezone(userId: string, timezone: string | null): Promise<void> {
    if (timezone === null) this.b.userTimezones.delete(userId);
    else this.b.userTimezones.set(userId, timezone);
  }

  async getDateFormat(userId: string): Promise<DateFormat | null> {
    return this.b.userDateFormats.get(userId) ?? null;
  }

  async setDateFormat(
    userId: string,
    format: DateFormat | null,
  ): Promise<void> {
    if (format === null) this.b.userDateFormats.delete(userId);
    else this.b.userDateFormats.set(userId, format);
  }

  async getGender(userId: string): Promise<Gender | null> {
    return this.b.userGenders.get(userId) ?? null;
  }

  async setGender(userId: string, gender: Gender | null): Promise<void> {
    if (gender === null) this.b.userGenders.delete(userId);
    else this.b.userGenders.set(userId, gender);
  }

  async getLang(userId: string): Promise<Lang | null> {
    return this.b.userLangs.get(userId) ?? null;
  }

  async setLang(userId: string, lang: Lang | null): Promise<void> {
    if (lang === null) this.b.userLangs.delete(userId);
    else this.b.userLangs.set(userId, lang);
  }
}
