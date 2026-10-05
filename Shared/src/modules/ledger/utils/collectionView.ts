import type { Collection, CollectionListItem } from "@shared/core/types";
import { formatDateTime } from "@shared/core/utils/date";
import { pickMenu, type MenuItem, type MenuTable } from "@shared/shared/lib/menuItem";
import type { LabeledValue } from "./billView";

type Translate = (key: string, opts?: Record<string, unknown>) => string;
type UserName = (id: string | null) => string | null;

// Every field one hand-over MIGHT print; custody only while it still counts.
export function collectionInfoRows(
  collection: CollectionListItem,
  t: Translate,
  userName: UserName,
): LabeledValue[] {
  const voided = collection.voidedAt !== null;
  const banked = !voided && collection.heldByUserId === null;
  const received = formatDateTime(collection.receivedAt);
  const recorded = formatDateTime(collection.createdAt);
  const unknown = t("common.unknown");
  const heldBy = banked ? t("ledger.banked") : (userName(collection.heldByUserId) ?? unknown);
  return [
    { key: "received_at", label: t("ledger.received_at"), value: received },
    { key: "recorded_at", label: t("ledger.recorded_at"), value: recorded !== received ? recorded : null },
    { key: "collected_by", label: t("ledger.collected_by"), value: userName(collection.receivedByUserId) ?? unknown },
    { key: "held_by", label: t("ledger.held_by"), value: voided ? null : heldBy },
    {
      key: "banked_at",
      label: t("ledger.banked_at"),
      value: banked && collection.remittedAt ? formatDateTime(collection.remittedAt) : null,
    },
    { key: "banked_by", label: t("ledger.banked_by"), value: banked ? userName(collection.remittedBy) : null },
    { key: "notes", label: t("ledger.notes"), value: collection.notes },
    {
      key: "voided_at",
      label: t("ledger.voided_at"),
      value: collection.voidedAt ? formatDateTime(collection.voidedAt) : null,
    },
    { key: "voided_by", label: t("ledger.voided_by"), value: userName(collection.voidedBy) },
    { key: "void_reason", label: t("ledger.void_reason_label"), value: collection.voidReason },
  ];
}

export type PaymentActionKey = "details" | "invoice" | "correct" | "void";

export type PaymentMenuItem = MenuItem<PaymentActionKey>;

const PAYMENT_MENU: MenuTable<PaymentActionKey> = {
  details: { group: "open", labelKey: "ledger.payment_details" },
  invoice: { group: "send", labelKey: "invoicing.send_on_whatsapp" },
  correct: {
    group: "manage",
    labelKey: "ledger.correct_payment",
    captionKey: "ledger.correct_payment_caption",
  },
  void: { group: "danger", labelKey: "ledger.void_payment", destructive: true },
};

type Voidable = Pick<Collection, "voidedAt">;

// A voided hand-over, or any payment on a voided bill, can only be looked at.
export function paymentMenuItems(
  payment: Voidable,
  options: { sendable: boolean; billVoided?: boolean },
): PaymentMenuItem[] {
  const keys: PaymentActionKey[] = ["details"];
  if (!options.billVoided && payment.voidedAt === null) {
    if (options.sendable) keys.push("invoice");
    keys.push("correct", "void");
  }
  return pickMenu(PAYMENT_MENU, keys);
}

export function voidablePayments<T extends Voidable>(payments: readonly T[]): T[] {
  return payments.filter((payment) => payment.voidedAt === null);
}

export function paymentSelectionItems(selected: readonly Voidable[]): PaymentMenuItem[] {
  return voidablePayments(selected).length > 0 ? pickMenu(PAYMENT_MENU, ["void"]) : [];
}
