import { RedisClient } from "bun";
import type { Storage } from "./types";
import type {
  Settings,
  WhitelistEntry,
  BucketState,
  ConversationNode,
  User,
  Chat,
  ChatSettings,
} from "../shared/types";
import { CONVERSATION_TTL_SECONDS, isEmptyChatSettings } from "../shared/types";

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

  async getBucket(chatId: string, userId: string): Promise<BucketState | null> {
    const raw = await this.client.get(`${PREFIX}bucket:${chatId}:${userId}`);
    return raw ? (JSON.parse(raw) as BucketState) : null;
  }

  async saveBucket(
    chatId: string,
    userId: string,
    state: BucketState,
  ): Promise<void> {
    await this.client.set(
      `${PREFIX}bucket:${chatId}:${userId}`,
      JSON.stringify(state),
    );
  }

  async getUserName(userId: string): Promise<string | null> {
    return await this.client.get(`${PREFIX}user_name:${userId}`);
  }

  async setUserName(userId: string, name: string | null): Promise<void> {
    const key = `${PREFIX}user_name:${userId}`;
    if (name === null) await this.client.del(key);
    else await this.client.set(key, name);
  }

  async listUsers(): Promise<User[]> {
    const values = await this.client.hvals(`${PREFIX}users`);
    return values
      .map((raw) => JSON.parse(raw) as User)
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  async upsertUser(user: User): Promise<void> {
    await this.client.hset(`${PREFIX}users`, user.id, JSON.stringify(user));
  }

  async getUser(id: string): Promise<User | null> {
    const raw = await this.client.hget(`${PREFIX}users`, id);
    return raw ? (JSON.parse(raw) as User) : null;
  }

  async listChats(): Promise<Chat[]> {
    const values = await this.client.hvals(`${PREFIX}chats`);
    return values
      .map((raw) => JSON.parse(raw) as Chat)
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  async upsertChat(chat: Chat): Promise<void> {
    await this.client.hset(`${PREFIX}chats`, chat.id, JSON.stringify(chat));
  }

  async getChat(id: string): Promise<Chat | null> {
    const raw = await this.client.hget(`${PREFIX}chats`, id);
    return raw ? (JSON.parse(raw) as Chat) : null;
  }

  async getChatSettings(chatId: string): Promise<ChatSettings | null> {
    const raw = await this.client.get(`${PREFIX}chat_settings:${chatId}`);
    return raw ? (JSON.parse(raw) as ChatSettings) : null;
  }

  async saveChatSettings(chatId: string, settings: ChatSettings): Promise<void> {
    const key = `${PREFIX}chat_settings:${chatId}`;
    if (isEmptyChatSettings(settings)) {
      await this.client.del(key);
      return;
    }
    await this.client.set(key, JSON.stringify(settings));
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
