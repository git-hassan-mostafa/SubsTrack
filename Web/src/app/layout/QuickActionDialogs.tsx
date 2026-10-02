import { useUiStore } from "@shared/shared/lib/uiStore";
import { markCollectionsTableStale } from "@/state/collectionsTable";
import { markProductsTableStale } from "@/state/productsTable";
import { BatchRestockDialog } from "@/modules/admin/products/BatchRestockDialog";
import { CustomerFormDialog } from "@/modules/customer/customers/CustomerFormDialog";
import { CollectQuickActionDialog } from "@/modules/ledger/collect/CollectQuickActionDialog";
import { CustomDebtFormDialog } from "@/modules/transaction/debts/CustomDebtFormDialog";
import { SaleFormDialog } from "@/modules/transaction/sales/SaleFormDialog";

// The one host for dialogs a header quick action opens, on any page.
export function QuickActionDialogs() {
  const openSheet = useUiStore((s) => s.openSheet);
  const close = useUiStore((s) => s.closeQuickAction);

  switch (openSheet) {
    case "collect":
      return (
        <CollectQuickActionDialog
          onClose={close}
          onCollected={() => {
            close();
            markCollectionsTableStale();
          }}
        />
      );
    case "customer":
      return <CustomerFormDialog customer={null} onClose={close} onSaved={close} />;
    case "sale":
      return (
        <SaleFormDialog
          sale={null}
          onClose={close}
          onSaved={() => {
            close();
            markCollectionsTableStale();
          }}
        />
      );
    case "customDebt":
      return <CustomDebtFormDialog onClose={close} />;
    case "batchRestock":
      return <BatchRestockDialog onClose={close} onSaved={markProductsTableStale} />;
    default:
      return null;
  }
}
