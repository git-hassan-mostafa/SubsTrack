import { useUiSlice } from "@/src/state/hooks/useUiSlice";
import { CustomerFormSheet } from "@/src/modules/customer/customers";
import { SaleFormSheet } from "@/src/modules/transaction/sales";
import {
  CustomDebtFormSheet,
  DebtPaymentFormSheet,
} from "@/src/modules/transaction/debts";

/**
 * Hosts the global "quick add" form sheets once, high in the app tree, so the
 * PageHeader quick-actions menu can launch them from any screen. Which sheet is
 * open is driven by the `ui` slice; each sheet opens standalone (with
 * its own customer picker) and self-updates its slice on create.
 */
export function QuickActionSheets() {
  const openSheet = useUiSlice((s) => s.openSheet);
  const close = useUiSlice((s) => s.closeQuickAction);

  if (!openSheet) return null;

  switch (openSheet) {
    case "customer":
      return <CustomerFormSheet onDismiss={close} />;
    case "sale":
      return <SaleFormSheet onDismiss={close} />;
    case "customDebt":
      return <CustomDebtFormSheet onDismiss={close} />;
    case "debtPayment":
      return <DebtPaymentFormSheet onDismiss={close} />;
    default:
      return null;
  }
}
