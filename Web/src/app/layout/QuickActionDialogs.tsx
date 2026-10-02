import { useUiStore } from "@shared/shared/lib/uiStore";
import { reloadCollectionsTableIfLoaded } from "@/state/collectionsTable";
import { reloadProductsTableIfLoaded } from "@/state/productsTable";
import { BatchRestockDialog } from "@/modules/admin/products/BatchRestockDialog";
import { CustomerFormDialog } from "@/modules/customer/customers/CustomerFormDialog";
import { CollectQuickActionDialog } from "@/modules/ledger/collect/CollectQuickActionDialog";

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
            reloadCollectionsTableIfLoaded();
          }}
        />
      );
    case "customer":
      return <CustomerFormDialog customer={null} onClose={close} onSaved={close} />;
    case "batchRestock":
      return <BatchRestockDialog onClose={close} onSaved={reloadProductsTableIfLoaded} />;
    default:
      return null;
  }
}
