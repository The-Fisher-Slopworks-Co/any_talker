// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RedisClient } from "bun";
import type { ProfileStore } from "../types/profile";
import type { Gender } from "../../shared/types";
import { isValidGender } from "../../shared/types";
import { isValidLang, type Lang } from "../../shared/i18n";
import { isValidDateFormat, type DateFormat } from "../../shared/date-format";
import { PREFIX } from "./shared";

export class KeyDBProfileStore implements ProfileStore {
  constructor(private readonly client: RedisClient) {}

  async getName(userId: string): Promise<string | null> {
    return await this.client.get(`${PREFIX}user_name:${userId}`);
  }

  async setName(userId: string, name: string | null): Promise<void> {
    const key = `${PREFIX}user_name:${userId}`;
    if (name === null) await this.client.del(key);
    else await this.client.set(key, name);
  }

  async getTimezone(userId: string): Promise<string | null> {
    return await this.client.get(`${PREFIX}user_tz:${userId}`);
  }

  async setTimezone(userId: string, timezone: string | null): Promise<void> {
    const key = `${PREFIX}user_tz:${userId}`;
    if (timezone === null) await this.client.del(key);
    else await this.client.set(key, timezone);
  }

  async getDateFormat(userId: string): Promise<DateFormat | null> {
    const raw = await this.client.get(`${PREFIX}user_datefmt:${userId}`);
    return isValidDateFormat(raw) ? raw : null;
  }

  async setDateFormat(
    userId: string,
    format: DateFormat | null,
  ): Promise<void> {
    const key = `${PREFIX}user_datefmt:${userId}`;
    if (format === null) await this.client.del(key);
    else await this.client.set(key, format);
  }

  async getGender(userId: string): Promise<Gender | null> {
    const raw = await this.client.get(`${PREFIX}user_gender:${userId}`);
    return isValidGender(raw) ? raw : null;
  }

  async setGender(userId: string, gender: Gender | null): Promise<void> {
    const key = `${PREFIX}user_gender:${userId}`;
    if (gender === null) await this.client.del(key);
    else await this.client.set(key, gender);
  }

  async getLang(userId: string): Promise<Lang | null> {
    const raw = await this.client.get(`${PREFIX}user_lang:${userId}`);
    return isValidLang(raw) ? raw : null;
  }

  async setLang(userId: string, lang: Lang | null): Promise<void> {
    const key = `${PREFIX}user_lang:${userId}`;
    if (lang === null) await this.client.del(key);
    else await this.client.set(key, lang);
  }
}
