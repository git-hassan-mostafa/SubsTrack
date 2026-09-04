import { useCallback, useState } from "react";
import type { Collection, OpenItem } from "@/src/core/types";
import { useAuth } from "@/src/modules/authentication/auth";
import { useLedgerSlice } from "@/src/state/hooks/useLedgerSlice";
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

/**
 * The one way any list opens the collect sheet.
 *
 * The items are passed IN rather than fetched: every debts surface already
 * holds what the customer owes, and re-reading it would let the preview drift
 * from the list the user is looking at. The branch comes off the items for the
 * same reason — a debts list never loads the whole customer.
 *
 * Returns `{ open, openOne, close, sheet }`: render `sheet`, call `open` with a
 * customer's whole pool (waterfall + split preview) or `openOne` with a single
 * bill.
 *
 * `open` / `openOne` / `close` are STABLE; the returned object is not (it holds
 * `sheet`, a fresh element every render). An effect that opens the sheet must
 * depend on the callback, never on the object — depending on the object makes
 * open → setState → re-render → open an infinite loop.
 */
export function useCollectSheet({ onCollected }: Options = {}) {
  const { user } = useAuth();
  const collect = useLedgerSlice((s) => s.collect);
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
      onSubmit={async (values) => {
        if (!user) return;
        const created = await collect({
          tenantId: user.tenantId,
          customerId: target.customerId,
          branchId: values.lines[0]?.item.branchId ?? user.branchId,
          amount: values.amount,
          currencyId: values.currencyId,
          ratePerUsdSnapshot: values.ratePerUsdSnapshot,
          receivedAt: values.receivedAt,
          receivedByUserId: user.id,
          notes: values.notes,
          lines: values.lines.map((l) => ({
            item: l.item,
            amount: l.amount,
            settles: l.amount >= l.item.balance,
          })),
        });
        if (!created) return;
        setTarget(null);
        onCollected?.(created);
      }}
    />
  ) : null;

  return { open, openOne, close, sheet };
}
