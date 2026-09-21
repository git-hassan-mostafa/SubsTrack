import { useTranslation } from "react-i18next";
import { useAuth } from "@/src/modules/authentication/auth";
import { useSaleSlice } from "@/src/state/hooks/useSaleSlice";
import { VoidConfirmDialog } from "@/src/modules/ledger";
import type { SaleVoidResult } from "../utils/types";

interface Props {
  saleIds: string[];
  chargeIds: string[];
  onVoided: (result: SaleVoidResult) => void;
  onDismiss: () => void;
}

// Voids one or many sales with one shared reason. The dialog itself is the
// ledger's — a sale and a month say the same thing when voided (gotcha #153).
export function SaleBulkVoidSheet({
  saleIds,
  chargeIds,
  onVoided,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const voidSales = useSaleSlice((s) => s.voidSales);
  const error = useSaleSlice((s) => s.error);
  const clearError = useSaleSlice((s) => s.clearError);

  async function handleConfirm(reason: string) {
    if (!user) return;
    clearError();
    const result = await voidSales(saleIds, user.id, reason);
    if (result.ok === 0 && result.failed > 0) return;
    onVoided(result);
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
