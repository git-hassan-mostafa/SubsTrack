import { useTranslation } from "react-i18next";
import { useVoidSales } from "@shared/modules/transaction/sales/hooks/useVoidSales";
import type { SaleVoidTarget } from "@shared/modules/transaction/sales/utils/saleView";
import type { SaleVoidResult } from "@shared/modules/transaction/sales/utils/types";
import { VoidBillDialog } from "@/modules/ledger/void/VoidBillDialog";

interface VoidSalesDialogProps {
  target: SaleVoidTarget;
  onDone: (result: SaleVoidResult) => void;
  onClose: () => void;
}

// One reason for one or many sales; their payments are voided with them.
export function VoidSalesDialog({ target, onDone, onClose }: VoidSalesDialogProps) {
  const { t } = useTranslation();
  const { run, error, clearError } = useVoidSales();
  const count = target.saleIds.length;

  return (
    <VoidBillDialog
      chargeIds={target.chargeIds}
      title={t("sales.bulk_void_title", { count })}
      message={t("sales.bulk_void_message", { count })}
      confirmLabel={t("sales.void_sale")}
      error={error}
      onDismissError={clearError}
      onConfirm={async (reason) => {
        const result = await run(target.saleIds, reason);
        if (result) onDone(result);
      }}
      onClose={() => {
        clearError();
        onClose();
      }}
    />
  );
}
