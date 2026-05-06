import { RedisClient } from "bun";
import type { Storage } from "./types";
import type {
  Settings,
  WhitelistEntry,
  BucketState,
  ConversationNode,
} from "../shared/types";
import { CONVERSATION_TTL_SECONDS } from "../shared/types";

const PREFIX = "at:";

export class KeyDBStorage implements Storage {
  constructor(private readonly client: RedisClient) {}

  static async connect(url: string): Promise<KeyDBStorage> {
    const client = new RedisClient(url);
    await client.connect();
    return new KeyDBStorage(client);
  }

  async getSettings(): Promise<Settings | null> {
    const raw = await this.client.get(`${PREFIX}settings`);
    return raw ? (JSON.parse(raw) as Settings) : null;
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.client.set(`${PREFIX}settings`, JSON.stringify(settings));
  }

  async listWhitelist(kind: "users" | "chats"): Promise<WhitelistEntry[]> {
    const raw = await this.client.get(`${PREFIX}whitelist:${kind}`);
    return raw ? (JSON.parse(raw) as WhitelistEntry[]) : [];
  }

  async addWhitelist(kind: "users" | "chats", entry: WhitelistEntry): Promise<void> {
    const list = await this.listWhitelist(kind);
    const next = [...list.filter((e) => e.id !== entry.id), { ...entry }];
    await this.client.set(`${PREFIX}whitelist:${kind}`, JSON.stringify(next));
  }

  async removeWhitelist(kind: "users" | "chats", id: string): Promise<void> {
    const list = await this.listWhitelist(kind);
    const next = list.filter((e) => e.id !== id);
    await this.client.set(`${PREFIX}whitelist:${kind}`, JSON.stringify(next));
  }

  async isWhitelisted(kind: "users" | "chats", id: string): Promise<boolean> {
    const list = await this.listWhitelist(kind);
    return list.some((e) => e.id === id);
  }

  async getBucket(userId: string): Promise<BucketState | null> {
    const raw = await this.client.get(`${PREFIX}bucket:${userId}`);
    return raw ? (JSON.parse(raw) as BucketState) : null;
  }

  async saveBucket(userId: string, state: BucketState): Promise<void> {
    await this.client.set(`${PREFIX}bucket:${userId}`, JSON.stringify(state));
  }

  async getConversation(chatId: string, botMsgId: number): Promise<ConversationNode | null> {
    const raw = await this.client.get(`${PREFIX}msg:${chatId}:${botMsgId}`);
    return raw ? (JSON.parse(raw) as ConversationNode) : null;
  }

  async saveConversation(
    chatId: string,
    botMsgId: number,
    node: ConversationNode,
  ): Promise<void> {
    const key = `${PREFIX}msg:${chatId}:${botMsgId}`;
    await this.client.set(key, JSON.stringify(node));
    await this.client.expire(key, CONVERSATION_TTL_SECONDS);
  }
}
