import { useTranslation } from "react-i18next";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { CollectionsPanel } from "../screens/CollectionsPanel";

interface Props {
  onDismiss: () => void;
  /** Opens a sale's receipt — see CollectionsPanel for why it is injected. */
  onOpenSale?: (saleId: string) => Promise<void> | void;
}

/**
 * The money-in history as a sheet — the quick-actions entry point.
 *
 * One component replaces the payments history AND the debt-payments history:
 * there is a single stream of hand-overs now, whatever they settled.
 */
export function CollectionsHistorySheet({ onDismiss, onOpenSale }: Props) {
  const { t } = useTranslation();
  return (
    <FormSheet
      visible
      onDismiss={onDismiss}
      title={t("ledger.history_title")}
      fullBleed
    >
      <CollectionsPanel onOpenSale={onOpenSale} />
    </FormSheet>
  );
}
