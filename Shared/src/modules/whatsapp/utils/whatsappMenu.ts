import type { Customer, WhatsAppMessage } from "@shared/core/types";
import { canSendWhatsApp } from "@shared/core/utils/whatsappLink";
import { pickMenu, type MenuItem, type MenuTable } from "@shared/shared/lib/menuItem";

export type WhatsAppActionKey =
  | "whatsapp_reminder"
  | "whatsapp_message"
  | "whatsapp_stop"
  | "whatsapp_allow"
  | "whatsapp_send";

export type WhatsAppMenuItem = MenuItem<WhatsAppActionKey>;

export interface WhatsAppMenuFacts {
  isAdmin: boolean;
  ready: boolean;
  reminderReady: boolean;
  optedOutIds: ReadonlySet<string>;
}

const MENU: MenuTable<WhatsAppActionKey> = {
  whatsapp_reminder: { group: "send", labelKey: "whatsapp.send_reminder" },
  whatsapp_message: { group: "send", labelKey: "whatsapp.send_message" },
  whatsapp_stop: { group: "manage", labelKey: "whatsapp.stop_messages" },
  whatsapp_allow: { group: "manage", labelKey: "whatsapp.allow_messages" },
  whatsapp_send: { group: "send", labelKey: "whatsapp.send_on_whatsapp" },
};

function blockedCaptionKey(hasPhone: boolean, optedOut: boolean): string | undefined {
  if (!hasPhone) return "invoice.no_phone";
  return optedOut ? "whatsapp.opted_out_caption" : undefined;
}

// Not connected leaves only the wa.me reminder; connected, the server sends.
export function whatsAppCustomerItems(
  customer: Customer,
  facts: WhatsAppMenuFacts,
): WhatsAppMenuItem[] {
  if (!facts.isAdmin) return [];
  const hasPhone = canSendWhatsApp(customer.phoneNumber);
  if (!facts.ready) {
    if (!hasPhone) return [];
    const [reminder] = pickMenu(MENU, ["whatsapp_reminder"]);
    return [{ ...reminder, captionKey: "whatsapp.opens_whatsapp" }];
  }
  const optedOut = facts.optedOutIds.has(customer.id);
  const blockedKey = blockedCaptionKey(hasPhone, optedOut);
  const [reminder, message, toggle] = pickMenu(MENU, [
    "whatsapp_reminder",
    "whatsapp_message",
    optedOut ? "whatsapp_allow" : "whatsapp_stop",
  ]);
  return [
    {
      ...reminder,
      disabled: !!blockedKey || !facts.reminderReady,
      captionKey: blockedKey ?? (facts.reminderReady ? undefined : "whatsapp.template_pending"),
    },
    { ...message, disabled: !!blockedKey, captionKey: blockedKey },
    { ...toggle, disabled: !hasPhone },
  ];
}

export function whatsAppSelectionItems(
  selected: readonly Customer[],
  facts: WhatsAppMenuFacts,
): WhatsAppMenuItem[] {
  if (!facts.isAdmin || !facts.ready || selected.length === 0) return [];
  return pickMenu(MENU, ["whatsapp_send"]);
}

export type WhatsAppMessageActionKey = "cancel_batch";

const MESSAGE_MENU: MenuTable<WhatsAppMessageActionKey> = {
  cancel_batch: { group: "danger", labelKey: "whatsapp.cancel_batch", destructive: true },
};

// Only a message still waiting in the queue can be stopped, with its whole send.
export function whatsAppMessageItems(message: WhatsAppMessage): MenuItem<WhatsAppMessageActionKey>[] {
  return message.status === "queued" ? pickMenu(MESSAGE_MENU, ["cancel_batch"]) : [];
}
