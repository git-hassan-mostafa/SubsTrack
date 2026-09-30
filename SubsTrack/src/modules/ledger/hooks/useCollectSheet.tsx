import { useCallback, useState } from "react";
import type { Collection, OpenItem } from "@shared/core/types";
import { useCollectSubmit } from "@shared/modules/ledger/hooks/useCollectSubmit";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";
import { CollectSheet } from "../components/CollectSheet";

interface Target {
  customerId: string;
  customerName: string;
  items: OpenItem[];
  single: boolean;
}

interface Options {
  onCollected?: (collection: Collection) => void;
}

// open/openOne/close are stable, the returned object is not — depend on the callbacks.
export function useCollectSheet({ onCollected }: Options = {}) {
  const submit = useCollectSubmit();
  const loading = useLedgerSlice((s) => s.loadingCollect);
  const [target, setTarget] = useState<Target | null>(null);

  const open = useCallback(
    (customerId: string, customerName: string, items: OpenItem[]) => {
      if (items.length === 0) return;
      setTarget({ customerId, customerName, items, single: false });
    },
    [],
  );

  const openOne = useCallback((customerName: string, item: OpenItem) => {
    setTarget({
      customerId: item.customerId,
      customerName,
      items: [item],
      single: true,
    });
  }, []);

  const close = useCallback(() => setTarget(null), []);

  const sheet = target ? (
    <CollectSheet
      visible
      customerName={target.customerName}
      owed={target.items}
      singleItem={target.single ? target.items[0] : null}
      loading={loading}
      onDismiss={close}
      onSubmit={async (submission) => {
        const collections = await submit(submission, target.customerId);
        if (collections.length === 0) return;
        setTarget(null);
        for (const created of collections) onCollected?.(created);
      }}
    />
  ) : null;

  return { open, openOne, close, sheet };
}
