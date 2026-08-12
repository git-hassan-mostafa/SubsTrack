import { useTranslation } from "react-i18next";
import type { Customer } from "@/src/core/types";
import { HistorySheet, useCustomerHistory } from "@/src/modules/admin/audit";

interface CustomerHistorySheetProps {
  customer: Customer;
  onDismiss: () => void;
}

/**
 * One customer's change timeline: the customer row, every service line it has ever
 * held, and the month payments / skips on those lines — merged newest-first, so
 * "renamed, then a plan was cancelled, then March was voided" reads as one story.
 *
 * Every entry is found through its frozen `subject_id`, not a list of child ids:
 * a cancelled line, a deleted plan and a voided payment all stay in the trail, and
 * skipped months (whose ids are a hash of line + month) become reachable at all.
 * That loader is the only thing separating this from a plain record History — the
 * sheet chrome and the admin gate are the shared HistorySheet's.
 *
 * Sales and debts stay out — a sale is a one-off with its own panel on the customer
 * screen, and the debt tables are append-only, so the Debts view is their history.
 * The set lives in CUSTOMER_HISTORY_TABLES.
 */
export function CustomerHistorySheet({
  customer,
  onDismiss,
}: CustomerHistorySheetProps) {
  const { t } = useTranslation();
  const timeline = useCustomerHistory(customer.id);

  return (
    <HistorySheet
      title={t("audit.customer_history_title")}
      subtitle={customer.name}
      timeline={timeline}
      onDismiss={onDismiss}
    />
  );
}
