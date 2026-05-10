export type DeliveryTarget =
  | { kind: "ask_reply"; chatId: string; replyToMessageId: number }
  | { kind: "guest_dm"; userId: string };

export type Reminder = {
  id: string;
  userId: string;
  fireAtMs: number;
  text: string;
  target: DeliveryTarget;
  createdAtMs: number;
};

export const MIN_LEAD_MS = 60_000;
