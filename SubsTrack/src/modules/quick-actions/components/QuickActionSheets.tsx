import { useUiStore } from "@/src/shared/lib/uiStore";
import { CustomerFormSheet } from "@/src/modules/customer/customers";
import {
  CollectQuickActionSheet,
  CollectionsHistorySheet,
} from "@/src/modules/ledger";
import {
  SaleFormSheet,
  useSaleDetailSheet,
} from "@/src/modules/transaction/sales";
import { ProductBatchRestockSheet } from "@/src/modules/admin/products";
import { CustomDebtFormSheet } from "@/src/modules/transaction/debts";
import { ExpenseFormSheet } from "@/src/modules/transaction/expenses";

/**
 * Hosts the global "quick add" form sheets once, high in the app tree, so the
 * PageHeader quick-actions menu can launch them from any screen. Which sheet is
 * open is driven by the `ui` slice; each sheet opens standalone (with
 * its own customer picker) and self-updates its slice on create.
 */
export function QuickActionSheets() {
  const openSheet = useUiStore((s) => s.openSheet);
  const close = useUiStore((s) => s.closeQuickAction);

  // The money-in history can open a sale's receipt. The sheet lives here rather
  // than in the ledger, which must not depend on the sales module.
  const saleDetail = useSaleDetailSheet();

  if (!openSheet) return null;

  switch (openSheet) {
    case "customer":
      return <CustomerFormSheet onDismiss={close} />;
    case "sale":
      return <SaleFormSheet onDismiss={close} />;
    case "customDebt":
      return <CustomDebtFormSheet onDismiss={close} />;
    case "collect":
      return <CollectQuickActionSheet onDismiss={close} />;
    case "expense":
      return <ExpenseFormSheet onDismiss={close} />;
    case "collectionsHistory":
      return (
        <>
          <CollectionsHistorySheet onDismiss={close} onOpenSale={saleDetail.openSale} />
          {saleDetail.sheet}
        </>
      );
    case "batchRestock":
      return <ProductBatchRestockSheet onDismiss={close} />;
    default:
      return null;
  }
}
