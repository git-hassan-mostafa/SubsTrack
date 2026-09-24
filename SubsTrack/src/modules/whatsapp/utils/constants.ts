import type { WhatsAppMessageStatus } from "@/src/core/types";

export const WHATSAPP_FUNCTIONS = {
  admin: "whatsapp-admin",
  send: "whatsapp-send",
  onboard: "whatsapp-onboard",
} as const;

export const HISTORY_PAGE_SIZE = 30;

export const HISTORY_STATUS_FILTERS: (WhatsAppMessageStatus | "all")[] = [
  "all",
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
];

export const PERIOD_LABEL_LIMIT = 3;
