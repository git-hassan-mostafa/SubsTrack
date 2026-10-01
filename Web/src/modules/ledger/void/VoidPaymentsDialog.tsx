import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Collection, CollectionListItem } from "@shared/core/types";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { sharedBillsOf } from "@shared/modules/ledger/utils/sharedBills";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";
import { ReasonConfirmDialog } from "@/shared/components/ReasonConfirmDialog";
import { SharedBillsWarning } from "./SharedBillsWarning";

interface VoidPaymentsDialogProps {
  payments: CollectionListItem[];
  onDone: (voided: Collection[]) => void;
  onClose: () => void;
}

// Voids whole hand-overs from a list, in ONE write; one payment names its bills.
export function VoidPaymentsDialog({ payments, onDone, onClose }: VoidPaymentsDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const voidCollections = useLedgerSlice((s) => s.voidCollections);
  const error = useLedgerSlice((s) => s.error);
  const clearError = useLedgerSlice((s) => s.clearError);
  const single = payments.length === 1 ? payments[0] : null;
  const shared = single && single.items.length > 1 ? sharedBillsOf(single, null, t) : [];

  useEffect(() => {
    clearError();
  }, [clearError]);

  const message = (): string => {
    if (!single) return t("payments.bulk_void_message", { count: payments.length });
    if (shared.length > 0) return t("ledger.void_covers_many_warning", { count: shared.length });
    return t("ledger.void_warning");
  };

  const confirm = async (reason: string) => {
    if (!user) return;
    const voided = await voidCollections(
      payments.map((payment) => payment.id),
      user.id,
      reason || null,
    );
    if (voided) onDone(voided);
  };

  return (
    <ReasonConfirmDialog
      title={single ? t("ledger.void_payment") : t("payments.bulk_void_title", { count: payments.length })}
      message={message()}
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
