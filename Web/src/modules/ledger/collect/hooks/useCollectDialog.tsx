import { useCallback, useState } from "react";
import type { Collection, OpenItem } from "@shared/core/types";
import { CollectDialog, type CollectTarget } from "../components/CollectDialog";

interface CollectDialogOptions {
  onCollected?: (collections: Collection[]) => void;
}

// open/openOne/close are stable, the returned object is not — depend on the callbacks.
export function useCollectDialog({ onCollected }: CollectDialogOptions = {}) {
  const [target, setTarget] = useState<CollectTarget | null>(null);

  const open = useCallback((customerId: string, customerName: string, items: OpenItem[]) => {
    if (items.length === 0) return;
    setTarget({ customerId, customerName, items, single: false });
  }, []);

  const openOne = useCallback((customerName: string, item: OpenItem) => {
    setTarget({ customerId: item.customerId, customerName, items: [item], single: true });
  }, []);

  const close = useCallback(() => setTarget(null), []);

  const dialog = target ? (
    <CollectDialog
      target={target}
      onClose={close}
      onCollected={(collections) => {
        setTarget(null);
        onCollected?.(collections);
      }}
    />
  ) : null;

  return { open, openOne, close, dialog };
}
