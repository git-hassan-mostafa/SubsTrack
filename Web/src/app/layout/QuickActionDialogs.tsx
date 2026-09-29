import { useUiStore } from "@shared/shared/lib/uiStore";
import { reloadProductsTableIfLoaded } from "@/state/productsTable";
import { BatchRestockDialog } from "@/modules/admin/products/BatchRestockDialog";

// The one host for dialogs a header quick action opens, on any page.
export function QuickActionDialogs() {
  const openSheet = useUiStore((s) => s.openSheet);
  const close = useUiStore((s) => s.closeQuickAction);

  switch (openSheet) {
    case "batchRestock":
      return <BatchRestockDialog onClose={close} onSaved={reloadProductsTableIfLoaded} />;
    default:
      return null;
  }
}
