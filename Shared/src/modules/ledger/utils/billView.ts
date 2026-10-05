import type { Charge, ChargeStatus, Currency } from "@shared/core/types";
import { formatMoney, formatPaidFraction } from "@shared/core/utils/currency";
import { formatDate, formatDateTime } from "@shared/core/utils/date";
import { pickMenu, type MenuItem, type MenuTable } from "@shared/shared/lib/menuItem";
import { getBlockRangeLabel } from "@shared/modules/customer/customer-payments/utils/blockRangeLabel";
import { chargeStatusOf } from "./billState";
import { roundMoney } from "./waterfall";

type Translate = (key: string, opts?: Record<string, unknown>) => string;
type UserName = (id: string | null) => string | null;

export type InfoKey =
  | "billing_month"
  | "bill_total"
  | "due_date"
  | "issued_at"
  | "recorded_by"
  | "received_at"
  | "recorded_at"
  | "collected_by"
  | "held_by"
  | "banked_at"
  | "banked_by"
  | "notes"
  | "voided_at"
  | "voided_by"
  | "void_reason"
  | "written_off_at"
  | "written_off_by"
  | "write_off_reason"
  | "sold_at"
  | "receipt_id";

export interface LabeledValue {
  key: InfoKey;
  label: string;
  value: string | null | undefined;
}

export interface BillFacts {
  status: ChargeStatus;
  voided: boolean;
  writtenOff: boolean;
  settled: boolean;
  closed: boolean;
  balance: number;
  figure: number;
  canCollect: boolean;
  canWriteOff: boolean;
  canRevertWriteOff: boolean;
  canVoid: boolean;
}

export interface BillHeadline {
  amount: string;
  note: string | null;
}

type BillFlags = Pick<Charge, "amount" | "voidedAt" | "writtenOffAt">;

// What one bill is and allows, from the bill and the LIVE cash on it (#115).
export function billFacts(charge: BillFlags, collected: number): BillFacts {
  const voided = charge.voidedAt !== null;
  const writtenOff = !voided && charge.writtenOffAt !== null;
  const balance = roundMoney(charge.amount - collected) || 0;
  const settled = !voided && balance <= 0;
  const closed = voided || settled;
  const live = !voided && !writtenOff;
  return {
    status: chargeStatusOf({
      voided,
      writtenOff,
      amount: charge.amount,
      collected: roundMoney(collected),
    }),
    voided,
    writtenOff,
    settled,
    closed,
    balance,
    figure: closed ? charge.amount : balance,
    canCollect: live && !settled,
    canWriteOff: live && !settled,
    canRevertWriteOff: writtenOff,
    canVoid: !voided,
  };
}

// The big figure a bill opens with, in the bill's OWN currency.
export function billHeadline(
  charge: Pick<Charge, "amount">,
  facts: BillFacts,
  collected: number,
  source: Currency | null,
  t: Translate,
): BillHeadline {
  const money = (value: number) => formatMoney(value, source, source);
  const amount = facts.closed
    ? money(facts.figure)
    : formatPaidFraction(collected, charge.amount, source, source);
  if (facts.writtenOff) {
    return {
      amount,
      note: collected > 0 ? t("ledger.written_off_kept", { amount: money(collected) }) : null,
    };
  }
  return { amount, note: facts.closed ? null : `${t("ledger.remaining")} ${money(facts.figure)}` };
}

// Every field a bill MIGHT print; an empty value is dropped by the view.
export function billInfoRows(
  charge: Charge,
  source: Currency | null,
  t: Translate,
  userName: UserName,
): LabeledValue[] {
  const monthLabel =
    charge.kind === "month" && charge.billingMonth
      ? getBlockRangeLabel(charge.billingMonth, charge.durationMonths, t)
      : null;
  return [
    { key: "billing_month", label: t("ledger.billing_month"), value: monthLabel },
    { key: "bill_total", label: t("ledger.bill_total"), value: formatMoney(charge.amount, source, source) },
    { key: "due_date", label: t("ledger.due_date"), value: formatDate(charge.dueDate) },
    { key: "issued_at", label: t("ledger.issued_at"), value: formatDateTime(charge.issuedAt) },
    { key: "recorded_by", label: t("ledger.recorded_by"), value: userName(charge.recordedByUserId) },
    { key: "notes", label: t("ledger.notes"), value: charge.notes },
    { key: "voided_at", label: t("ledger.voided_at"), value: charge.voidedAt ? formatDateTime(charge.voidedAt) : null },
    { key: "voided_by", label: t("ledger.voided_by"), value: userName(charge.voidedBy) },
    { key: "void_reason", label: t("ledger.void_reason_label"), value: charge.voidReason },
    {
      key: "written_off_at",
      label: t("ledger.written_off_at"),
      value: charge.writtenOffAt ? formatDateTime(charge.writtenOffAt) : null,
    },
    { key: "written_off_by", label: t("ledger.written_off_by"), value: userName(charge.writtenOffBy) },
    { key: "write_off_reason", label: t("ledger.write_off_reason_label"), value: charge.writeOffReason },
  ];
}

export type BillActionKey = "history" | "revert_write_off" | "write_off" | "void";

export type BillMenuItem = MenuItem<BillActionKey>;

export interface BillMenuDoors {
  revertWriteOff: boolean;
  writeOff: boolean;
  void: boolean;
}

const BILL_MENU: MenuTable<BillActionKey> = {
  history: { group: "history", labelKey: "audit.history" },
  revert_write_off: {
    group: "manage",
    labelKey: "ledger.revert_write_off",
    captionKey: "ledger.revert_write_off_caption",
  },
  write_off: {
    group: "danger",
    labelKey: "ledger.write_off",
    captionKey: "ledger.write_off_caption",
  },
  void: { group: "danger", labelKey: "ledger.void_month", destructive: true },
};

// Each money door is opt-in per surface; the audit trail is admin-only.
export function billMenuItems(
  facts: BillFacts,
  viewer: { isAdmin: boolean },
  doors: BillMenuDoors,
): BillMenuItem[] {
  const keys: BillActionKey[] = [];
  if (viewer.isAdmin) keys.push("history");
  if (doors.revertWriteOff && facts.canRevertWriteOff) keys.push("revert_write_off");
  if (doors.writeOff && facts.canWriteOff) keys.push("write_off");
  if (doors.void && facts.canVoid) keys.push("void");
  return pickMenu(BILL_MENU, keys);
}
