import type { ChargeStatus } from "@shared/core/types";
import type { ChipTone } from "@/shared/components/StatusChip";

export interface BillStatusLook {
  tone: ChipTone;
  labelKey: string;
  amountColor: string;
  struck: boolean;
}

const LOOKS: Record<ChargeStatus, BillStatusLook> = {
  void: { tone: "red", labelKey: "ledger.voided", amountColor: "text.disabled", struck: true },
  written_off: { tone: "orange", labelKey: "ledger.written_off", amountColor: "warning.dark", struck: false },
  settled: { tone: "emerald", labelKey: "ledger.settled", amountColor: "success.main", struck: false },
  partial: { tone: "amber", labelKey: "ledger.partial", amountColor: "warning.dark", struck: false },
  open: { tone: "red", labelKey: "ledger.open", amountColor: "error.main", struck: false },
};

// The phone's bill colours in MUI terms, so a bill reads the same on both apps.
export function billStatusLook(status: ChargeStatus): BillStatusLook {
  return LOOKS[status];
}
