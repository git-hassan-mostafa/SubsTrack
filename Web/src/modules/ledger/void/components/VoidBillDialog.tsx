import { useSharedBills } from "@shared/modules/ledger/hooks/useSharedBills";
import { ReasonConfirmDialog } from "@/shared/components/ReasonConfirmDialog";
import { SharedBillsWarning } from "./SharedBillsWarning";

interface VoidBillDialogProps {
  chargeIds: string[];
  title: string;
  message: string;
  confirmLabel: string;
  error?: string | null;
  onDismissError?: () => void;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}

// THE bill void confirm; held back until the shared-bill check answers (#153).
export function VoidBillDialog({
  chargeIds,
  title,
  message,
  confirmLabel,
  error,
  onDismissError,
  onConfirm,
  onClose,
}: VoidBillDialogProps) {
  const { bills, checking } = useSharedBills(chargeIds);

  return (
    <ReasonConfirmDialog
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      destructive
      checking={checking}
      error={error}
      onDismissError={onDismissError}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <SharedBillsWarning bills={bills} />
    </ReasonConfirmDialog>
  );
}
