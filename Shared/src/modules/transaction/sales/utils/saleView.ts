import type { OpenItem, Sale } from "@shared/core/types";
import { formatDate } from "@shared/core/utils/date";
import { receiptId } from "@shared/core/utils/receiptId";
import {
  billFacts,
  type BillFacts,
  type LabeledValue,
} from "@shared/modules/ledger/utils/billView";
import { openItemFromCharge } from "@shared/modules/ledger/utils/openItems";
import { saleRecipient, sendBlockedKey } from "@shared/modules/invoicing/utils/invoiceRecipient";
import { pickMenu, type MenuItem, type MenuTable } from "@shared/shared/lib/menuItem";

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

// The sale's bill as one collect item; a receipt passes the cash it just read.
export function saleCollectItem(
  sale: Sale,
  paid: number = sale.amountPaid,
): OpenItem | null {
  if (!sale.charge) return null;
  const name = sale.customer?.name ?? "";
  return openItemFromCharge(sale.charge, paid, sale.itemsSummary, name);
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

export type SaleMenuItem = MenuItem<SaleActionKey>;

export interface SaleMenuViewer {
  isAdmin: boolean;
}

const MENU: MenuTable<SaleActionKey> = {
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
  const blockedKey = sendBlockedKey(saleRecipient(sale));
  return pickMenu(MENU, keys).map((item) => {
    if (item.key !== "invoice" || !blockedKey) return item;
    return { ...item, disabled: true, captionKey: blockedKey };
  });
}

// One receipt covers every live sale of a pick; voided ones drop out of both rows.
export function saleSelectionItems(selected: readonly Sale[]): SaleMenuItem[] {
  if (!selected.some((sale) => sale.voidedAt === null)) return [];
  return pickMenu(MENU, ["invoice", "void"]);
}

// The receipt's own menu: collect and send sit on the receipt as buttons.
export function saleReceiptActions(
  sale: Sale,
  viewer: Pick<SaleMenuViewer, "isAdmin">,
): SaleMenuItem[] {
  const voided = sale.voidedAt !== null;
  const keys: SaleActionKey[] = [];
  if (!voided) keys.push("edit");
  if (viewer.isAdmin) keys.push("history");
  if (!voided) keys.push("void");
  return pickMenu(MENU, keys);
}

export interface SaleReceiptFacts extends BillFacts {
  partlyPaid: boolean;
}

// A receipt judges the sale by the LIVE cash its payments list just read.
export function saleReceiptFacts(
  sale: Sale,
  collected: number = sale.amountPaid,
): SaleReceiptFacts {
  const facts = billFacts(
    {
      amount: sale.totalAmount,
      voidedAt: sale.voidedAt,
      writtenOffAt: sale.charge?.writtenOffAt ?? null,
    },
    collected,
  );
  return {
    ...facts,
    canCollect: facts.canCollect && !!sale.customerId && !!sale.charge,
    partlyPaid: !facts.voided && facts.balance > 0,
  };
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
