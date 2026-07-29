import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import {
  Dropdown,
  type DropdownOption,
} from "@/src/shared/components/Dropdown";
import { COLORS } from "@/src/shared/constants";
import type { Currency, Product } from "@/src/core/types";
import { convert, findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useProductSlice } from "@/src/state/hooks/useProductSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { ProductFormSheet } from "@/src/modules/admin/products";

// One resolved product line ready for CreateSaleInput.
export interface SaleLineDraft {
  product: Product;
  quantity: number;
  unitAmount: number;
}

// The live cart state the parent form needs: the resolved lines, the summed
// total, the single sale currency, and whether the cart is submittable.
export interface SaleCartDraft {
  lines: SaleLineDraft[];
  total: number;
  currency: Currency | null;
  currencyId: string | null;
  // true when there is ≥1 line and no half-filled row.
  ready: boolean;
}

interface Props {
  // Called whenever the cart changes. Pass a stable setter (React setState).
  onChange: (draft: SaleCartDraft) => void;
  onFocusClearError?: () => void;
}

type Row = {
  key: string;
  productId: string | null;
  quantity: number;
  unitAmount: number | null;
};

// Round a converted price to the target currency's decimals for a clean prefill.
function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

// Row keys only need to be unique within one editor, so the suffix is handed in
// by the caller. Pure on purpose — see the note on CustomerPlansEditor.makeRow.
function makeRow(suffix: number): Row {
  return { key: `row-${suffix}`, productId: null, quantity: 1, unitAmount: null };
}

// Multi-product "cart" editor for a sale. Owns the row + sale-currency state and
// reports the resolved draft up via onChange. One currency per sale: each
// product's catalog price is auto-converted into the sale currency (editable).
// Mirrors CustomerPlansEditor's add / remove-row pattern.
export function SaleItemsEditor({ onChange, onFocusClearError }: Props) {
  const { t } = useTranslation();
  const products = useProductSlice((s) => s.items);
  const getProducts = useProductSlice((s) => s.getProducts);
  const currencies = useCurrencySlice((s) => s.items);
  const { lastUsedCurrencyId } = useUiPrefStore();

  // Suffix of the last row added in this session. Only ever touched from an event
  // handler — never during render.
  const rowKey = useRef(0);

  const [rows, setRows] = useState<Row[]>(() => [makeRow(0)]);
  // The single currency for the whole sale. Defaults to last-used until the
  // first product is picked (which adopts its currency, unless the user has
  // already changed it manually).
  const [currencyId, setCurrencyId] = useState<string | null>(
    lastUsedCurrencyId ?? null,
  );
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [addProductOpen, setAddProductOpen] = useState(false);

  // `getProducts` self-guards on the slice's `loaded` flag — no length check, and
  // no re-query on every sale-form open for a tenant with no products yet.
  useEffect(() => {
    void getProducts();
  }, [getProducts]);

  const activeProducts = useMemo(
    () => products.filter((p) => p.active),
    [products],
  );
  const currencyOptions: DropdownOption<string>[] = currencies
    .filter((c) => c.active || c.id === currencyId)
    .map((c) => ({ label: c.code, sublabel: c.name, value: c.id }));

  const saleCurrency = findCurrency(currencies, currencyId);

  // Prices show in the sale currency so products priced in different currencies
  // stay comparable — and match the unit amount the pick will prefill.
  // Out-of-stock products stay listed but greyed out, so the user can see why
  // they can't be sold. SaleService re-checks on submit — this is only a hint.
  const productOptions: DropdownOption<string>[] = activeProducts.map((p) => ({
    label: p.name,
    sublabel:
      p.stockOnHand > 0
        ? `${formatMoney(p.price, findCurrency(currencies, p.currencyId), saleCurrency)} · ${t("sales.stock_left", { quantity: p.stockOnHand })}`
        : t("products.out_of_stock"),
    value: p.id,
    disabled: p.stockOnHand <= 0,
  }));

  // What's still sellable for a row: on-hand minus what the OTHER rows already
  // took of the same product (the same product can sit on several lines).
  function availableIn(list: Row[], key: string, productId: string | null): number {
    const product = activeProducts.find((p) => p.id === productId);
    if (!product) return 0;
    const takenElsewhere = list
      .filter((r) => r.key !== key && r.productId === productId)
      .reduce((sum, r) => sum + r.quantity, 0);
    return product.stockOnHand - takenElsewhere;
  }

  // Convert a product's catalog price into the given sale currency (rounded).
  function priceInCurrency(product: Product, target: Currency | null): number {
    const source = findCurrency(currencies, product.currencyId);
    return roundTo(
      convert(product.price, source, target),
      target?.decimals ?? 2,
    );
  }

  function selectProduct(key: string, productId: string | null) {
    const product = activeProducts.find((p) => p.id === productId) ?? null;
    const firstProduct =
      product != null && !rows.some((r) => r.productId && r.key !== key);
    // The first product picked adopts its own currency as the sale currency,
    // unless the user has already chosen one manually.
    let targetId = currencyId;
    if (firstProduct && !currencyTouched) {
      targetId = product.currencyId;
      setCurrencyId(product.currencyId);
    }
    const target = findCurrency(currencies, targetId);
    setRows((prev) =>
      prev.map((r) =>
        r.key === key
          ? {
              ...r,
              productId,
              // A switch to a lower-stock product must not carry the old quantity over.
              quantity: product
                ? Math.min(r.quantity, Math.max(1, availableIn(prev, key, productId)))
                : r.quantity,
              unitAmount: product
                ? priceInCurrency(product, target)
                : r.unitAmount,
            }
          : r,
      ),
    );
  }

  function changeSaleCurrency(nextId: string | null) {
    setCurrencyTouched(true);
    setCurrencyId(nextId);
    const target = findCurrency(currencies, nextId);
    // Re-price every line from its product's catalog price into the new currency.
    setRows((prev) =>
      prev.map((r) => {
        const p = activeProducts.find((pp) => pp.id === r.productId);
        return p ? { ...r, unitAmount: priceInCurrency(p, target) } : r;
      }),
    );
  }

  // Capped at what's left in stock so the form can't build a sale the service
  // would reject.
  function setQuantity(key: string, quantity: number) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const max = Math.max(1, availableIn(prev, key, r.productId));
        return { ...r, quantity: Math.min(max, Math.max(1, quantity)) };
      }),
    );
  }

  function setUnitAmount(key: string, unitAmount: number | null) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, unitAmount } : r)),
    );
  }

  function addRow() {
    rowKey.current += 1;
    setRows((prev) => [...prev, makeRow(rowKey.current)]);
  }

  function removeRow(key: string) {
    setRows((prev) =>
      prev.length <= 1 ? prev : prev.filter((r) => r.key !== key),
    );
  }

  // Resolve the cart draft and report it to the parent whenever it changes.
  useEffect(() => {
    const lines: SaleLineDraft[] = [];
    let incomplete = false;
    for (const r of rows) {
      const product = activeProducts.find((p) => p.id === r.productId) ?? null;
      const validAmount = r.unitAmount != null && r.unitAmount > 0;
      if (product && validAmount && r.quantity > 0) {
        lines.push({
          product,
          quantity: r.quantity,
          unitAmount: r.unitAmount as number,
        });
      } else {
        incomplete = true;
      }
    }
    // Sum per product, not per line — the same product can sit on two rows and
    // only their total is what stock has to cover. Mirrors SaleService's check.
    const perProduct = new Map<string, number>();
    for (const l of lines) {
      perProduct.set(l.product.id, (perProduct.get(l.product.id) ?? 0) + l.quantity);
    }
    const oversold = [...perProduct].some(([id, qty]) => {
      const product = activeProducts.find((p) => p.id === id);
      return !product || product.stockOnHand < qty;
    });
    const total = lines.reduce((sum, l) => sum + l.unitAmount * l.quantity, 0);
    onChange({
      lines,
      total,
      currency: saleCurrency,
      currencyId,
      ready: lines.length > 0 && !incomplete && !oversold,
    });
  }, [rows, currencyId, activeProducts, saleCurrency, onChange]);

  const multiple = rows.length > 1;

  return (
    <View className="mt-2 mb-2">
      {/* Section header + sale currency */}
      <View className="flex-row items-center mb-3">
        <Ionicons name="cart-outline" size={18} color={COLORS.gray500} />
        <View className="ms-2 flex-1">
          <Text fontWeight="SemiBold" className="text-base text-gray-900">
            {t("sales.items_section_title")}
          </Text>
          <Text className="text-xs text-gray-400 mt-0.5">
            {t("sales.items_section_subtitle")}
          </Text>
        </View>
        {multiple ? (
          <View className="rounded-full bg-gray-100 px-2.5 py-1">
            <Text fontWeight="SemiBold" className="text-xs text-gray-500">
              {rows.length}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="mb-3">
        <Dropdown<string>
          label={t("sales.sale_currency_label")}
          placeholder="USD"
          options={currencyOptions}
          value={currencyId}
          onChange={changeSaleCurrency}
          nullable
          nullLabel="USD"
        />
      </View>

      {/* Line cards */}
      {rows.map((row, i) => (
        <View
          key={row.key}
          className="rounded-2xl border border-gray-200 bg-gray-50 px-3.5 pt-4 pb-1 mb-3"
        >
          {multiple ? (
            <View className="flex-row items-center justify-between mb-1">
              <View className="flex-row items-center">
                <View className="w-6 h-6 rounded-full bg-emerald-50 items-center justify-center">
                  <Text fontWeight="Bold" className="text-xs text-success">
                    {i + 1}
                  </Text>
                </View>
                <Text
                  fontWeight="SemiBold"
                  className="ms-2 text-sm text-gray-700"
                >
                  {t("sales.item_label", { number: i + 1 })}
                </Text>
              </View>
              <PressableOpacity
                onPress={() => removeRow(row.key)}
                accessibilityLabel={t("sales.remove_product")}
                hitSlop={8}
                className="flex-row items-center px-2 py-1 -me-1"
              >
                <Ionicons
                  name="trash-outline"
                  size={15}
                  color={COLORS.danger}
                />
                <Text className="ms-1 text-xs text-danger font-medium">
                  {t("sales.remove_product")}
                </Text>
              </PressableOpacity>
            </View>
          ) : null}

          <Dropdown<string>
            label={t("sales.product_label") + " *"}
            placeholder={t("sales.product_placeholder")}
            options={productOptions}
            value={row.productId}
            onChange={(v) => selectProduct(row.key, v)}
            onAddNew={() => setAddProductOpen(true)}
          />

          <View className="flex-row items-start gap-2">
            {/* Quantity stepper — capped at what stock is left for this row */}
            <View className="mb-4">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {t("sales.quantity_label")}
              </Text>
              <View className="flex-row items-center border border-gray-200 rounded-xl bg-white px-2 py-1.5">
                <PressableOpacity
                  onPress={() => setQuantity(row.key, row.quantity - 1)}
                  className="w-8 h-8 rounded-lg bg-gray-100 items-center justify-center"
                >
                  <Ionicons name="remove" size={16} color={COLORS.gray700} />
                </PressableOpacity>
                <Text className="text-base font-semibold text-gray-900 w-9 text-center">
                  {row.quantity}
                </Text>
                <PressableOpacity
                  onPress={() => setQuantity(row.key, row.quantity + 1)}
                  className="w-8 h-8 rounded-lg bg-gray-100 items-center justify-center"
                >
                  <Ionicons name="add" size={16} color={COLORS.gray700} />
                </PressableOpacity>
              </View>
            </View>

            {/* Unit amount, locked to the sale currency */}
            <View className="flex-1">
              <CurrencyInput
                label={t("sales.unit_amount_label") + " *"}
                amount={row.unitAmount}
                currencyId={currencyId}
                onChange={({ amount }) => setUnitAmount(row.key, amount)}
                currencies={currencies}
                placeholder="0.00"
                lockCurrency
                onFocus={onFocusClearError}
              />
            </View>
          </View>

          {/* Remaining stock for this row */}
          {row.productId ? (
            <View className="-mt-2 mb-2">
              <Text className="text-xs text-gray-400">
                {t("sales.stock_left", {
                  quantity: availableIn(rows, row.key, row.productId),
                })}
              </Text>
            </View>
          ) : null}

          {/* Line total */}
          {row.unitAmount != null && row.unitAmount > 0 && row.quantity > 1 ? (
            <View className="-mt-2 mb-2 flex-row justify-end">
              <Text className="text-xs text-gray-500">
                {formatMoney(
                  row.unitAmount * row.quantity,
                  saleCurrency,
                  saleCurrency,
                )}
              </Text>
            </View>
          ) : null}
        </View>
      ))}

      {/* Add product — dashed affordance */}
      <PressableOpacity
        onPress={addRow}
        className="flex-row items-center justify-center rounded-2xl border border-dashed border-gray-300 py-3"
      >
        <Ionicons name="add" size={18} color={COLORS.primary} />
        <Text className="text-primary text-sm font-semibold ms-1">
          {t("sales.add_product")}
        </Text>
      </PressableOpacity>

      {addProductOpen && (
        <ProductFormSheet onDismiss={() => setAddProductOpen(false)} />
      )}
    </View>
  );
}
