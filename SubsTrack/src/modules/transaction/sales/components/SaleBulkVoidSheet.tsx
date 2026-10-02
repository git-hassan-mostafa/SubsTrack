import { useTranslation } from "react-i18next";
import { VoidConfirmDialog } from "@/src/modules/ledger";
import { useVoidSales } from "@shared/modules/transaction/sales/hooks/useVoidSales";
import type { SaleVoidTarget } from "@shared/modules/transaction/sales/utils/saleView";
import type { SaleVoidResult } from "@shared/modules/transaction/sales/utils/types";

interface Props extends SaleVoidTarget {
  onVoided: (result: SaleVoidResult) => void;
  onDismiss: () => void;
}

// One shared reason for one or many sales; the dialog is the ledger's (#153).
export function SaleBulkVoidSheet({
  saleIds,
  chargeIds,
  onVoided,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const { run, error, clearError } = useVoidSales();

  async function handleConfirm(reason: string) {
    const result = await run(saleIds, reason);
    if (result) onVoided(result);
  }

  return (
    <VoidConfirmDialog
      chargeIds={chargeIds}
      title={t("sales.bulk_void_title", { count: saleIds.length })}
      message={t("sales.bulk_void_message", { count: saleIds.length })}
      confirmLabel={t("sales.void_sale")}
      error={error}
      onClearError={clearError}
      onConfirm={handleConfirm}
      onDismiss={() => {
        clearError();
        onDismiss();
      }}
    />
  );
}
