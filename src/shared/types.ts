export type RateLimitConfig = {
  capacity: number;
  refillAmount: number;
  refillIntervalMs: number;
  ownerExempt: boolean;
};

export type Settings = {
  systemPrompt: string;
  models: string[];
  rateLimit: RateLimitConfig;
};

export type WhitelistEntry = {
  id: string;
  label?: string;
};

export type Whitelist = {
  users: WhitelistEntry[];
  chats: WhitelistEntry[];
};

export type BucketState = {
  tokens: number;
  lastRefillTs: number;
};

export type ConversationNode = {
  userQuestion: string;
  botAnswer: string;
  parentBotMsgId: number | null;
  ts: number;
};

export const DEFAULT_SETTINGS: Settings = {
  systemPrompt: "You are a helpful assistant in a Telegram chat. Be concise.",
  models: ["anthropic/claude-sonnet-4-5"],
  rateLimit: {
    capacity: 30000,
    refillAmount: 3000,
    refillIntervalMs: 40 * 60 * 1000,
    ownerExempt: true,
  },
};

export const MAX_REPLY_CHAIN_DEPTH = 20;
export const CONVERSATION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
