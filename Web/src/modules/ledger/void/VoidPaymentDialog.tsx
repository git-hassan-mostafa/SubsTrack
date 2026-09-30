import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Collection } from "@shared/core/types";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { sharedBillsOf } from "@shared/modules/ledger/utils/sharedBills";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";
import { ReasonConfirmDialog } from "@/shared/components/ReasonConfirmDialog";
import { SharedBillsWarning } from "./SharedBillsWarning";

interface VoidPaymentDialogProps {
  collection: Collection;
  onBillChargeId?: string | null;
  onDone: (voided: Collection) => void;
  onClose: () => void;
}

// Undoes ONE hand-over whole; every bill it paid is owed again (#109).
export function VoidPaymentDialog({ collection, onBillChargeId = null, onDone, onClose }: VoidPaymentDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const voidCollection = useLedgerSlice((s) => s.voidCollection);
  const error = useLedgerSlice((s) => s.error);
  const clearError = useLedgerSlice((s) => s.clearError);
  const shared = sharedBillsOf(collection, onBillChargeId, t);

  useEffect(() => {
    clearError();
  }, [clearError]);

  const confirm = async (reason: string) => {
    if (!user) return;
    const voided = await voidCollection(collection, user.id, reason || null);
    if (voided) onDone(voided);
  };

  return (
    <ReasonConfirmDialog
      title={t("ledger.void_payment")}
      message={
        shared.length > 0
          ? t("ledger.void_covers_many_warning", { count: shared.length + 1 })
          : t("ledger.void_warning")
      }
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
      <SharedBillsWarning bills={shared} />
    </ReasonConfirmDialog>
  );
}
