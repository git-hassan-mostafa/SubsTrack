import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CustomerDebts, OpenItem } from "@shared/core/types";
import { confirm } from "@shared/shared/lib/confirm";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useWriteOffActions } from "@shared/modules/ledger/hooks/useWriteOffActions";
import { CustomDebtFormSheet } from "../components/CustomDebtFormSheet";

// No "changed" callback: the ledger slice bumps `owedVersion` (useOwedChanged).
export function useDebtRowActions() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const voidCharge = useLedgerSlice((s) => s.voidCharge);
  const {
    writeOff: writeOffItem,
    revert: revertWriteOffItem,
    writeOffAll,
  } = useWriteOffActions();

  const writeOffDebtor = useCallback(
    (debtor: CustomerDebts) =>
      writeOffAll(debtor.customerName, [
        ...debtor.items,
        ...debtor.unpaidMonths,
      ]),
    [writeOffAll],
  );

  const voidItem = useCallback(
    async (item: OpenItem) => {
      if (!user || !item.chargeId || item.kind !== "manual") return;
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

  const [editing, setEditing] = useState<OpenItem | null>(null);

  const editItem = useCallback((item: OpenItem) => {
    if (item.kind !== "manual" || !item.chargeId) return;
    setEditing(item);
  }, []);

  const editSheet = editing ? (
    <CustomDebtFormSheet item={editing} onDismiss={() => setEditing(null)} />
  ) : null;

  return {
    voidItem,
    writeOffItem,
    revertWriteOffItem,
    writeOffAll,
    writeOffDebtor,
    editItem,
    editSheet,
  };
}
