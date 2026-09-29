import { useMemo, useState } from "react";
import type { Currency, Product } from "@shared/core/types";
import { findCurrency } from "@shared/core/utils/currency";
import {
  parseRestockCost,
  restockCostText,
} from "@shared/modules/admin/products/utils/stockCost";
import type { RestockEntry } from "@shared/modules/admin/products/utils/types";
import { useDirtyForm } from "@shared/shared/hooks/useDirtyForm";

// One delivery, one currency: every picked row's cost is typed in it.
export function useBatchRestockForm(products: Product[], currencies: Currency[]) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [currencyId, setCurrencyId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");

  const activeProducts = useMemo(
    () => products.filter((p) => p.active),
    [products],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return activeProducts;
    return activeProducts.filter((p) => p.name.toLowerCase().includes(term));
  }, [activeProducts, search]);

  const deliveryCurrency = findCurrency(currencies, currencyId);

  const entries = useMemo<RestockEntry[]>(
    () =>
      Object.entries(quantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([productId, quantity]) => ({
          productId,
          quantity,
          unitCost: parseRestockCost(costs[productId]),
        })),
    [quantities, costs],
  );
  const totalUnits = entries.reduce((sum, e) => sum + e.quantity, 0);
  const totalCost = entries.reduce(
    (sum, e) => sum + (e.unitCost ?? 0) * e.quantity,
    0,
  );

  const dirty = useDirtyForm({
    lineCount: entries.length,
    totalUnits,
    totalCost,
    note,
  });

  const seedCost = (product: Product, target: Currency | null) =>
    restockCostText(product, currencies, target);

  const setQuantity = (productId: string, quantity: number) => {
    const next = Math.max(0, quantity);
    setQuantities((prev) => ({ ...prev, [productId]: next }));
    if (next <= 0 || costs[productId] !== undefined) return;
    const product = activeProducts.find((p) => p.id === productId);
    if (!product) return;
    const firstPick = !Object.values(quantities).some((q) => q > 0);
    const adoptProductCurrency =
      firstPick && currencyId === null && product.costCurrencyId !== null;
    const target = adoptProductCurrency
      ? findCurrency(currencies, product.costCurrencyId)
      : deliveryCurrency;
    if (adoptProductCurrency) setCurrencyId(product.costCurrencyId);
    setCosts((prev) => ({ ...prev, [productId]: seedCost(product, target) }));
  };

  const setCost = (productId: string, text: string) =>
    setCosts((prev) => ({ ...prev, [productId]: text }));

  const changeCurrency = (next: string | null) => {
    setCurrencyId(next);
    const target = findCurrency(currencies, next);
    setCosts((prev) => {
      const out: Record<string, string> = {};
      for (const id of Object.keys(prev)) {
        const product = activeProducts.find((p) => p.id === id);
        out[id] = product ? seedCost(product, target) : "";
      }
      return out;
    });
  };

  const clearAll = () => {
    setQuantities({});
    setCosts({});
  };

  return {
    quantities,
    costs,
    currencyId,
    deliveryCurrency,
    note,
    setNote,
    search,
    setSearch,
    activeProducts,
    visible,
    entries,
    totalUnits,
    totalCost,
    dirty,
    setQuantity,
    setCost,
    changeCurrency,
    clearAll,
  };
}
