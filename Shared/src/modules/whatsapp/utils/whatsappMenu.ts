import type { Customer, WhatsAppMessage } from "@shared/core/types";
import { canSendWhatsApp } from "@shared/core/utils/whatsappLink";
import {
  ADMIN_ONLY,
  pickMenu,
  withReason,
  type MenuItem,
  type MenuTable,
} from "@shared/shared/lib/menuItem";

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

// Staff see the admin's WhatsApp rows greyed, so they know the door exists.
export function whatsAppCustomerItems(
  customer: Customer,
  facts: WhatsAppMenuFacts,
): WhatsAppMenuItem[] {
  const items = adminWhatsAppItems(customer, facts);
  return facts.isAdmin ? items : items.map((item) => withReason(item, ADMIN_ONLY));
}

// Not connected leaves only the wa.me reminder; connected, the server sends.
function adminWhatsAppItems(customer: Customer, facts: WhatsAppMenuFacts): WhatsAppMenuItem[] {
  const hasPhone = canSendWhatsApp(customer.phoneNumber);
  const noPhone = !hasPhone && "invoice.no_phone";
  if (!facts.ready) {
    const [reminder] = pickMenu(MENU, ["whatsapp_reminder"], { whatsapp_reminder: noPhone });
    return [{ ...reminder, captionKey: reminder.captionKey ?? "whatsapp.opens_whatsapp" }];
  }
  const optedOut = facts.optedOutIds.has(customer.id);
  const blockedKey = blockedCaptionKey(hasPhone, optedOut);
  return pickMenu(
    MENU,
    ["whatsapp_reminder", "whatsapp_message", optedOut ? "whatsapp_allow" : "whatsapp_stop"],
    {
      whatsapp_reminder: blockedKey || (!facts.reminderReady && "whatsapp.template_pending"),
      whatsapp_message: blockedKey,
      whatsapp_allow: noPhone,
      whatsapp_stop: noPhone,
    },
  );
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
