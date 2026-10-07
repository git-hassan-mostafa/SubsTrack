import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Collection } from "@shared/core/types";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { voidPaymentsNotice } from "@shared/modules/ledger/utils/sharedBills";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";
import { ReasonConfirmDialog } from "@/shared/components/ReasonConfirmDialog";
import { SharedBillsWarning } from "./SharedBillsWarning";

type VoidablePayment = Pick<Collection, "id" | "items" | "currencyId" | "ratePerUsdSnapshot">;

interface VoidPaymentsDialogProps {
  payments: VoidablePayment[];
  onBillChargeId?: string | null;
  onDone: (voided: Collection[]) => void;
  onClose: () => void;
}

// Voids whole hand-overs in ONE write; every bill they paid is owed again (#109).
export function VoidPaymentsDialog({ payments, onBillChargeId = null, onDone, onClose }: VoidPaymentsDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const voidCollections = useLedgerSlice((s) => s.voidCollections);
  const error = useLedgerSlice((s) => s.error);
  const clearError = useLedgerSlice((s) => s.clearError);
  const notice = voidPaymentsNotice(payments, onBillChargeId, t);

  useEffect(() => {
    clearError();
  }, [clearError]);

  const confirm = async (reason: string) => {
    if (!user) return;
    const voided = await voidCollections(payments, user.id, reason || null);
    if (voided) onDone(voided);
  };

  return (
    <ReasonConfirmDialog
      title={notice.title}
      message={notice.message}
      confirmLabel={t("ledger.void_payment")}
      destructive
      error={error}
      onDismissError={clearError}
      onConfirm={confirm}
      onClose={() => {
        clearError();
        onClose();
      }}
    >
      <SharedBillsWarning bills={notice.bills} />
    </ReasonConfirmDialog>
  );
}
