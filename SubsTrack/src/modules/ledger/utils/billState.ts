import type { ChargeStatus } from "@/src/core/types";

export interface BillState {
  labelKey: string;
  bg: string;
  text: string;
  card: string;
  badge: string;
  amount: string;
  glyph: string;
}

/**
 * A bill's state, decided in ONE place from what happened to it.
 *
 * The order IS the rule: a void outranks a write-off (it says the record never
 * existed), a write-off outranks every live state (the remainder is given up
 * on), and only then does the money decide.
 */
export function chargeStatusOf(flags: {
  voided: boolean;
  writtenOff: boolean;
  amount: number;
  collected: number;
}): ChargeStatus {
  if (flags.voided) return "void";
  if (flags.writtenOff) return "written_off";
  if (flags.collected >= flags.amount) return "settled";
  return flags.collected > 0 ? "partial" : "open";
}

const LOOK: Record<ChargeStatus, BillState> = {
  void: {
    labelKey: "ledger.voided",
    bg: "bg-red-50",
    text: "text-red-700",
    card: "bg-gray-50 border-gray-200",
    badge: "bg-gray-400",
    amount: "text-gray-400 line-through",
    glyph: "✕",
  },
  written_off: {
    labelKey: "ledger.written_off",
    bg: "bg-orange-50",
    text: "text-orange-700",
    card: "bg-orange-50 border-orange-100",
    badge: "bg-orange-400",
    amount: "text-orange-600",
    glyph: "✕",
  },
  settled: {
    labelKey: "ledger.settled",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    card: "bg-green-50 border-green-100",
    badge: "bg-green-500",
    amount: "text-green-600",
    glyph: "✓",
  },
  partial: {
    labelKey: "ledger.partial",
    bg: "bg-amber-50",
    text: "text-amber-700",
    card: "bg-amber-50 border-amber-100",
    badge: "bg-amber-400",
    amount: "text-amber-600",
    glyph: "!",
  },
  open: {
    labelKey: "ledger.open",
    bg: "bg-red-50",
    text: "text-red-700",
    card: "bg-red-50 border-red-100",
    badge: "bg-red-400",
    amount: "text-red-500",
    glyph: "!",
  },
};

/** How a state LOOKS — shared so a month bill and a sale cannot drift apart. */
export function billLook(status: ChargeStatus): BillState {
  return LOOK[status];
}
