import type {
  Settings,
  WhitelistEntry,
  BucketState,
  ConversationNode,
} from "../shared/types";

export interface Storage {
  getSettings(): Promise<Settings | null>;
  saveSettings(settings: Settings): Promise<void>;

  listWhitelist(kind: "users" | "chats"): Promise<WhitelistEntry[]>;
  addWhitelist(kind: "users" | "chats", entry: WhitelistEntry): Promise<void>;
  removeWhitelist(kind: "users" | "chats", id: string): Promise<void>;
  isWhitelisted(kind: "users" | "chats", id: string): Promise<boolean>;

  getBucket(userId: string): Promise<BucketState | null>;
  saveBucket(userId: string, state: BucketState): Promise<void>;

  getConversation(chatId: string, botMsgId: number): Promise<ConversationNode | null>;
  saveConversation(
    chatId: string,
    botMsgId: number,
    node: ConversationNode,
  ): Promise<void>;
}
