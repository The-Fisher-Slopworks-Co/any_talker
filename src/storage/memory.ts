import type { Storage } from "./types";
import type {
  Settings,
  WhitelistEntry,
  BucketState,
  ConversationNode,
  User,
} from "../shared/types";

export class MemoryStorage implements Storage {
  private settings: Settings | null = null;
  private whitelist: Record<"users" | "chats", Map<string, WhitelistEntry>> = {
    users: new Map(),
    chats: new Map(),
  };
  private buckets = new Map<string, BucketState>();
  private conversations = new Map<string, ConversationNode>();
  private userNames = new Map<string, string>();
  private users = new Map<string, User>();

  private convKey(chatId: string, botMsgId: number): string {
    return `${chatId}:${botMsgId}`;
  }

  async getSettings(): Promise<Settings | null> {
    return this.settings ? structuredClone(this.settings) : null;
  }

  async saveSettings(settings: Settings): Promise<void> {
    this.settings = structuredClone(settings);
  }

  async listWhitelist(kind: "users" | "chats"): Promise<WhitelistEntry[]> {
    return [...this.whitelist[kind].values()];
  }

  async addWhitelist(kind: "users" | "chats", entry: WhitelistEntry): Promise<void> {
    this.whitelist[kind].set(entry.id, { ...entry });
  }

  async removeWhitelist(kind: "users" | "chats", id: string): Promise<void> {
    this.whitelist[kind].delete(id);
  }

  async isWhitelisted(kind: "users" | "chats", id: string): Promise<boolean> {
    return this.whitelist[kind].has(id);
  }

  async getBucket(userId: string): Promise<BucketState | null> {
    const v = this.buckets.get(userId);
    return v ? { ...v } : null;
  }

  async saveBucket(userId: string, state: BucketState): Promise<void> {
    this.buckets.set(userId, { ...state });
  }

  async getUserName(userId: string): Promise<string | null> {
    return this.userNames.get(userId) ?? null;
  }

  async setUserName(userId: string, name: string | null): Promise<void> {
    if (name === null) this.userNames.delete(userId);
    else this.userNames.set(userId, name);
  }

  async listUsers(): Promise<User[]> {
    return [...this.users.values()]
      .map((u) => ({ ...u }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  async upsertUser(user: User): Promise<void> {
    this.users.set(user.id, { ...user });
  }

  async getUser(id: string): Promise<User | null> {
    const u = this.users.get(id);
    return u ? { ...u } : null;
  }

  async getConversation(chatId: string, botMsgId: number): Promise<ConversationNode | null> {
    const v = this.conversations.get(this.convKey(chatId, botMsgId));
    return v ? { ...v } : null;
  }

  async saveConversation(
    chatId: string,
    botMsgId: number,
    node: ConversationNode,
  ): Promise<void> {
    this.conversations.set(this.convKey(chatId, botMsgId), { ...node });
  }
}
