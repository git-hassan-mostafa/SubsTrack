import type { MonthEntry } from "@shared/core/types";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import type { SkipMode } from "@shared/modules/customer/customer-payments/utils/skipText";
import { getStore } from "@shared/state/globalStore";
import { usePaymentSlice } from "@shared/state/hooks/usePaymentSlice";

// An unskip keeps the note the skip was written with; true when it saved.
export function useSkipMonths(customerId: string, lineId: string) {
  const { user } = useAuth();
  const setMonthsSkipped = usePaymentSlice((s) => s.setMonthsSkipped);
  const saving = usePaymentSlice((s) => s.loadingSkip);
  const error = usePaymentSlice((s) => s.error);
  const clearError = usePaymentSlice((s) => s.clearError);

  const submit = async (
    entries: MonthEntry[],
    mode: SkipMode,
    note: string,
  ): Promise<boolean> => {
    if (!user || entries.length === 0) return false;
    const skipping = mode === "skip";
    await setMonthsSkipped(
      entries.map((entry) => ({
        customerId,
        customerPlanId: lineId,
        billingMonth: entry.billingMonth,
        note: skipping ? note.trim() : (entry.skip?.note ?? null),
      })),
      skipping,
      user.tenantId,
      user.id,
    );
    return !getStore().getState().payments.error;
  };

  return { submit, saving, error, clearError };
}
