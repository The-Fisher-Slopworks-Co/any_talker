import type {
  Settings,
  WhitelistEntry,
  BucketState,
  ConversationNode,
  GuestThreadNode,
  User,
  Chat,
  ChatSettings,
} from "../shared/types";

export interface Storage {
  getSettings(): Promise<Settings | null>;
  saveSettings(settings: Settings): Promise<void>;

  listWhitelist(kind: "users" | "chats"): Promise<WhitelistEntry[]>;
  addWhitelist(kind: "users" | "chats", entry: WhitelistEntry): Promise<void>;
  removeWhitelist(kind: "users" | "chats", id: string): Promise<void>;
  isWhitelisted(kind: "users" | "chats", id: string): Promise<boolean>;

  getBucket(chatId: string, userId: string): Promise<BucketState | null>;
  saveBucket(chatId: string, userId: string, state: BucketState): Promise<void>;

  getUserName(userId: string): Promise<string | null>;
  setUserName(userId: string, name: string | null): Promise<void>;

  getUserTimezone(userId: string): Promise<string | null>;
  setUserTimezone(userId: string, timezone: string | null): Promise<void>;

  listUsers(): Promise<User[]>;
  upsertUser(user: User): Promise<void>;
  getUser(id: string): Promise<User | null>;

  listChats(): Promise<Chat[]>;
  upsertChat(chat: Chat): Promise<void>;
  getChat(id: string): Promise<Chat | null>;

  getChatSettings(chatId: string): Promise<ChatSettings | null>;
  saveChatSettings(chatId: string, settings: ChatSettings): Promise<void>;

  getConversation(chatId: string, botMsgId: number): Promise<ConversationNode | null>;
  saveConversation(
    chatId: string,
    botMsgId: number,
    node: ConversationNode,
  ): Promise<void>;

  getGuestThread(chatId: string): Promise<GuestThreadNode | null>;
  saveGuestThread(chatId: string, thread: GuestThreadNode): Promise<void>;
}
