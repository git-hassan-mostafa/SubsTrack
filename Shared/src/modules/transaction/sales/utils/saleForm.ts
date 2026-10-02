import type { Customer, Sale } from "@shared/core/types";
import {
  collectedFor,
  type PaymentMode,
} from "@shared/modules/ledger/utils/amountCollected";

const EPSILON = 1e-9;

export type SaleTotalCheck = "no_items" | "manual" | null;

// An edit opens on what the sale ALREADY collected, so saving changes nothing.
export function initialPaymentMode(sale: Sale): PaymentMode {
  if (sale.amountPaid <= 0) return "debt";
  return sale.amountPaid + EPSILON >= sale.totalAmount ? "full" : "partial";
}

// A walk-in sale has nobody to owe it, so it is always paid in full.
export function saleCollected(args: {
  hasCustomer: boolean;
  mode: PaymentMode;
  typed: number | null;
  total: number;
}): number {
  if (!args.hasCustomer) return args.total;
  return collectedFor(args.mode, args.typed, args.total);
}

// Less cash, or another currency, voids and re-records the hand-over (#111).
export function rebuildsSaleCash(
  collectedBefore: number,
  collectedAfter: number,
  currencyBefore: string | null,
  currencyAfter: string | null,
): boolean {
  return (
    collectedBefore > 0 &&
    (collectedAfter + EPSILON < collectedBefore ||
      currencyAfter !== currencyBefore)
  );
}

export function totalDiffersFromLines(
  lineCount: number,
  lineSum: number,
  total: number,
): boolean {
  return lineCount > 0 && Math.abs(total - lineSum) > EPSILON;
}

// Nothing is refused: only the person saving can tell a discount from a typo.
export function saleTotalCheck(
  lineCount: number,
  lineSum: number,
  total: number,
): SaleTotalCheck {
  if (lineCount === 0) return "no_items";
  return totalDiffersFromLines(lineCount, lineSum, total) ? "manual" : null;
}

export function canSaveSale(args: {
  ready: boolean;
  total: number;
  hasCustomer: boolean;
  mode: PaymentMode;
  typed: number | null;
}): boolean {
  if (!args.ready || !(args.total > 0)) return false;
  if (!args.hasCustomer || args.mode !== "partial") return true;
  return args.typed != null && args.typed >= 0 && args.typed <= args.total + EPSILON;
}

// The customer's branch wins; else an edit keeps its own, a new sale the user's.
export function saleBranchId(
  customer: Customer | null,
  sale: Sale | null,
  userBranchId: string | null,
): string | null {
  return customer?.branchId ?? (sale ? sale.branchId : userBranchId);
}
