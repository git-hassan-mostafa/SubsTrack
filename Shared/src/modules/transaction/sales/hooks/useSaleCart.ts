import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Currency,
  Product,
  SaleLineType,
  Service,
} from "@shared/core/types";
import { activeCurrencyId, findCurrency } from "@shared/core/utils/currency";
import {
  availableFor,
  cartSignature,
  clampQuantity,
  initialRows,
  newCartRow,
  poolOf,
  priceIn,
  resolveCart,
  rowIsNamed,
  sellableProducts,
  sellableServices,
  stockCredit,
  type CartRow,
  type SaleCartDraft,
  type SaleEditorInitial,
} from "@shared/modules/transaction/sales/utils/saleCart";
import { useUiPrefStore } from "@shared/shared/lib/uiPrefStore";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useProductSlice } from "@shared/state/hooks/useProductSlice";
import { useServiceSlice } from "@shared/state/hooks/useServiceSlice";

export interface SaleCart {
  rows: CartRow[];
  currencyId: string | null;
  currency: Currency | null;
  currencies: Currency[];
  products: Product[];
  services: Service[];
  poolOf: (product: Product) => number;
  availableFor: (key: string, productId: string | null) => number;
  draft: SaleCartDraft;
  addRow: (lineType: SaleLineType) => void;
  removeRow: (key: string) => void;
  selectProduct: (key: string, product: Product | null) => void;
  selectService: (key: string, service: Service | null) => void;
  setCustomName: (key: string, name: string) => void;
  setQuantity: (key: string, quantity: number) => void;
  setUnitAmount: (key: string, amount: number | null) => void;
  changeCurrency: (currencyId: string | null) => void;
}

// One currency per sale; each catalog price is converted into it, still editable.
export function useSaleCart(initial: SaleEditorInitial | null): SaleCart {
  const products = useProductSlice((s) => s.items);
  const getProducts = useProductSlice((s) => s.getProducts);
  const services = useServiceSlice((s) => s.items);
  const getServices = useServiceSlice((s) => s.getServices);
  const currencies = useCurrencySlice((s) => s.items);
  const lastUsedCurrencyId = useUiPrefStore((s) => s.lastUsedCurrencyId);
  const rememberCurrency = useUiPrefStore((s) => s.setLastUsedCurrencyId);

  const [rows, setRows] = useState<CartRow[]>(() => initialRows(initial));
  const rowKey = useRef(rows.length - 1);
  const [currencyId, setCurrencyId] = useState<string | null>(
    initial ? initial.currencyId : activeCurrencyId(lastUsedCurrencyId, currencies),
  );
  const [currencyTouched, setCurrencyTouched] = useState(initial != null);
  const [baseline] = useState(() => cartSignature(rows, currencyId));

  useEffect(() => {
    void getProducts();
    void getServices();
  }, [getProducts, getServices]);

  const credit = useMemo(() => stockCredit(initial), [initial]);
  const sellable = useMemo(
    () => sellableProducts(products, credit),
    [products, credit],
  );
  const sellableJobs = useMemo(
    () => sellableServices(services, initial),
    [services, initial],
  );
  const currency = findCurrency(currencies, currencyId);
  const signature = cartSignature(rows, currencyId);

  const draft = useMemo<SaleCartDraft>(() => {
    const resolved = resolveCart(rows, sellable, sellableJobs, credit);
    return {
      ...resolved,
      currency,
      currencyId,
      dirty: signature !== baseline,
      signature,
    };
  }, [rows, sellable, sellableJobs, credit, currency, currencyId, signature, baseline]);

  const findProduct = (id: string | null) => sellable.find((p) => p.id === id);

  const patchRow = (key: string, patch: (row: CartRow, all: CartRow[]) => CartRow) =>
    setRows((prev) => prev.map((r) => (r.key === key ? patch(r, prev) : r)));

  const adoptCurrency = (key: string, itemCurrencyId: string | null) => {
    const isFirstPick = !rows.some((r) => r.key !== key && rowIsNamed(r));
    if (!isFirstPick || currencyTouched) return currency;
    setCurrencyId(itemCurrencyId);
    return findCurrency(currencies, itemCurrencyId);
  };

  const selectProduct = (key: string, product: Product | null) => {
    const target = product ? adoptCurrency(key, product.currencyId) : currency;
    patchRow(key, (r, all) => {
      if (!product) return { ...r, productId: null };
      const available = availableFor(all, key, product, credit);
      return {
        ...r,
        productId: product.id,
        quantity: clampQuantity(r.quantity, available),
        unitAmount: priceIn(product, target, currencies),
      };
    });
  };

  const selectService = (key: string, service: Service | null) => {
    const target = service ? adoptCurrency(key, service.currencyId) : currency;
    patchRow(key, (r) => ({
      ...r,
      serviceId: service?.id ?? null,
      customName: service ? "" : r.customName,
      unitAmount: service ? priceIn(service, target, currencies) : null,
    }));
  };

  const changeCurrency = (nextId: string | null) => {
    rememberCurrency(nextId);
    setCurrencyTouched(true);
    setCurrencyId(nextId);
    const target = findCurrency(currencies, nextId);
    setRows((prev) =>
      prev.map((r) => {
        const item =
          r.lineType === "product"
            ? sellable.find((p) => p.id === r.productId)
            : sellableJobs.find((s) => s.id === r.serviceId);
        return item ? { ...r, unitAmount: priceIn(item, target, currencies) } : r;
      }),
    );
  };

  const setQuantity = (key: string, quantity: number) =>
    patchRow(key, (r, all) => {
      if (r.lineType !== "product") return r;
      const available = availableFor(all, key, findProduct(r.productId), credit);
      return { ...r, quantity: clampQuantity(quantity, available) };
    });

  const addRow = (lineType: SaleLineType) => {
    rowKey.current += 1;
    const row = newCartRow(rowKey.current, lineType);
    setRows((prev) => [...prev, row]);
  };

  return {
    rows,
    currencyId,
    currency,
    currencies,
    products: sellable,
    services: sellableJobs,
    poolOf: (product) => poolOf(product, credit),
    availableFor: (key, productId) =>
      availableFor(rows, key, findProduct(productId), credit),
    draft,
    addRow,
    removeRow: (key) => setRows((prev) => prev.filter((r) => r.key !== key)),
    selectProduct,
    selectService,
    setCustomName: (key, customName) => patchRow(key, (r) => ({ ...r, customName })),
    setQuantity,
    setUnitAmount: (key, unitAmount) => patchRow(key, (r) => ({ ...r, unitAmount })),
    changeCurrency,
  };
}
