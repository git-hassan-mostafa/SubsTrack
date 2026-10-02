import { useCallback, useState } from "react";
import type { CustomerDebts, OpenItem } from "@shared/core/types";
import { useRemoveCustomDebt } from "@shared/modules/transaction/debts/hooks/useRemoveCustomDebt";
import { useWriteOffActions } from "@shared/modules/ledger/hooks/useWriteOffActions";
import { isEditableCustomDebt } from "@shared/modules/transaction/debts/utils/customDebtForm";
import { debtorOwedItems } from "@shared/modules/transaction/debts/utils/debtorView";
import { CustomDebtFormSheet } from "../components/CustomDebtFormSheet";

// No "changed" callback: the ledger slice bumps `owedVersion` (useOwedChanged).
export function useDebtRowActions() {
  const voidItem = useRemoveCustomDebt();
  const {
    writeOff: writeOffItem,
    revert: revertWriteOffItem,
    writeOffAll,
  } = useWriteOffActions();

  const writeOffDebtor = useCallback(
    (debtor: CustomerDebts) =>
      writeOffAll(debtor.customerName, debtorOwedItems(debtor)),
    [writeOffAll],
  );

  const [editing, setEditing] = useState<OpenItem | null>(null);

  const editItem = useCallback((item: OpenItem) => {
    if (!isEditableCustomDebt(item)) return;
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
