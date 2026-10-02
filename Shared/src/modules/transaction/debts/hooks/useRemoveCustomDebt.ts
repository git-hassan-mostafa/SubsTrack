import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { OpenItem } from "@shared/core/types";
import { confirm } from "@shared/shared/lib/confirm";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { isEditableCustomDebt } from "@shared/modules/transaction/debts/utils/customDebtForm";

// Only a hand-typed debt; plain voidCharge refuses one that took money.
export function useRemoveCustomDebt() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const voidCharge = useLedgerSlice((s) => s.voidCharge);

  return useCallback(
    async (item: OpenItem) => {
      if (!user || !item.chargeId || !isEditableCustomDebt(item)) return;
      const chargeId = item.chargeId;
      await confirm({
        title: t("debts.void_custom_title"),
        message: t("debts.void_custom_message"),
        confirmLabel: t("common.delete"),
        destructive: true,
        onConfirm: async () => {
          await voidCharge(chargeId, user.id, null);
        },
      });
    },
    [user, t, voidCharge],
  );
}
