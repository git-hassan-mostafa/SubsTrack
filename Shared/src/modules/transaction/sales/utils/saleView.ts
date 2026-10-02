import type { Sale } from "@shared/core/types";
import { formatDate } from "@shared/core/utils/date";
import { receiptId } from "@shared/core/utils/receiptId";
import type { LabeledValue } from "@shared/modules/ledger/utils/billView";
import type { ActionGroup } from "@shared/shared/lib/actionOrder";

type Translate = (key: string, opts?: Record<string, unknown>) => string;

const MONEY_EPSILON = 1e-9;

export interface SaleFacts {
  voided: boolean;
  writtenOff: boolean;
  fullyPaid: boolean;
  owed: number;
  canCollect: boolean;
}

// A walk-in sale has no customer to owe, so it is never collected later.
export function saleFacts(sale: Sale): SaleFacts {
  const voided = sale.voidedAt !== null;
  const owed = sale.totalAmount - sale.amountPaid;
  return {
    voided,
    writtenOff: !voided && sale.charge?.writtenOffAt != null,
    fullyPaid: sale.amountPaid >= sale.totalAmount,
    owed,
    canCollect:
      !voided && owed > MONEY_EPSILON && !!sale.customerId && !!sale.charge,
  };
}

export interface SaleVoidTarget {
  saleIds: string[];
  chargeIds: string[];
}

// The live sales of a pick and their bills: what one void confirm names.
export function saleVoidTarget(sales: Sale[]): SaleVoidTarget {
  const live = sales.filter((sale) => sale.voidedAt === null);
  return {
    saleIds: live.map((sale) => sale.id),
    chargeIds: live
      .map((sale) => sale.chargeId)
      .filter((id): id is string => !!id),
  };
}

export type SaleActionKey =
  | "view"
  | "edit"
  | "collect"
  | "invoice"
  | "history"
  | "void";

export interface SaleMenuItem {
  key: SaleActionKey;
  group: ActionGroup;
  labelKey: string;
  captionKey?: string;
  disabled?: boolean;
  destructive?: boolean;
}

export interface SaleMenuViewer {
  isAdmin: boolean;
  canSend: (phone: string | null) => boolean;
}

const MENU: Record<SaleActionKey, Omit<SaleMenuItem, "key">> = {
  view: { group: "open", labelKey: "sales.view_receipt" },
  edit: { group: "manage", labelKey: "sales.edit_sale" },
  collect: { group: "money", labelKey: "ledger.collect_remaining" },
  invoice: { group: "send", labelKey: "invoice.send_invoice_whatsapp" },
  history: { group: "history", labelKey: "audit.history" },
  void: { group: "danger", labelKey: "sales.void_sale", destructive: true },
};

// The audit trail is admin-only, so History is too; a voided sale only opens.
export function saleMenuItems(
  sale: Sale,
  viewer: SaleMenuViewer,
): SaleMenuItem[] {
  const { voided, canCollect } = saleFacts(sale);
  const keys: SaleActionKey[] = ["view"];
  if (!voided) keys.push("edit");
  if (canCollect) keys.push("collect");
  if (!voided) keys.push("invoice");
  if (viewer.isAdmin) keys.push("history");
  if (!voided) keys.push("void");
  const phone = sale.customer?.phoneNumber ?? null;
  const sendable = viewer.canSend(phone);
  return keys.map((key) => {
    const item: SaleMenuItem = { key, ...MENU[key] };
    if (key !== "invoice" || sendable) return item;
    return {
      ...item,
      disabled: true,
      captionKey: sale.customer ? "invoice.no_phone" : "invoice.no_customer",
    };
  });
}

// Every field a receipt MIGHT print; an empty value is dropped by the view.
export function saleInfoRows(
  sale: Sale,
  t: Translate,
  userName: (id: string | null) => string | null,
): LabeledValue[] {
  return [
    { key: "sold_at", label: t("sales.sold_at_label"), value: formatDate(sale.soldAt) },
    { key: "receipt_id", label: t("sales.receipt_id_label"), value: receiptId(sale.id) },
    { key: "recorded_by", label: t("ledger.recorded_by"), value: userName(sale.recordedByUserId) },
    { key: "notes", label: t("sales.notes_label"), value: sale.notes },
    { key: "void_reason", label: t("sales.void_reason_label"), value: sale.voidedAt ? sale.voidReason : null },
  ];
}
