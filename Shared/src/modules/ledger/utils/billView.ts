import type { Charge, ChargeStatus, Currency } from "@shared/core/types";
import { formatMoney, formatPaidFraction } from "@shared/core/utils/currency";
import { formatDate, formatDateTime } from "@shared/core/utils/date";
import { getBlockRangeLabel } from "@shared/modules/customer/customer-payments/utils/blockRangeLabel";
import { chargeStatusOf } from "./billState";
import { roundMoney } from "./waterfall";

type Translate = (key: string, opts?: Record<string, unknown>) => string;
type UserName = (id: string | null) => string | null;

export interface LabeledValue {
  label: string;
  value: string | null | undefined;
}

export interface BillFacts {
  status: ChargeStatus;
  voided: boolean;
  writtenOff: boolean;
  settled: boolean;
  balance: number;
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
    balance,
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
  const closed = facts.voided || facts.settled;
  const amount = closed
    ? money(charge.amount)
    : formatPaidFraction(collected, charge.amount, source, source);
  if (facts.writtenOff) {
    return {
      amount,
      note: collected > 0 ? t("ledger.written_off_kept", { amount: money(collected) }) : null,
    };
  }
  return { amount, note: closed ? null : `${t("ledger.remaining")} ${money(facts.balance)}` };
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
    { label: t("ledger.billing_month"), value: monthLabel },
    { label: t("ledger.bill_total"), value: formatMoney(charge.amount, source, source) },
    { label: t("ledger.due_date"), value: formatDate(charge.dueDate) },
    { label: t("ledger.issued_at"), value: formatDateTime(charge.issuedAt) },
    { label: t("ledger.recorded_by"), value: userName(charge.recordedByUserId) },
    { label: t("ledger.notes"), value: charge.notes },
    { label: t("ledger.voided_at"), value: charge.voidedAt ? formatDateTime(charge.voidedAt) : null },
    { label: t("ledger.voided_by"), value: userName(charge.voidedBy) },
    { label: t("ledger.void_reason_label"), value: charge.voidReason },
    {
      label: t("ledger.written_off_at"),
      value: charge.writtenOffAt ? formatDateTime(charge.writtenOffAt) : null,
    },
    { label: t("ledger.written_off_by"), value: userName(charge.writtenOffBy) },
    { label: t("ledger.write_off_reason_label"), value: charge.writeOffReason },
  ];
}
