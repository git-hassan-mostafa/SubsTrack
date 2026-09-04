import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { Input } from "@/src/shared/components/Input";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import {
  Dropdown,
  type DropdownOption,
} from "@/src/shared/components/Dropdown";
import { COLORS } from "@/src/shared/constants";
import type {
  Currency,
  Product,
  SaleLineType,
  Service,
} from "@/src/core/types";
import { convert, findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useProductSlice } from "@/src/state/hooks/useProductSlice";
import { useServiceSlice } from "@/src/state/hooks/useServiceSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { ProductFormSheet } from "@/src/modules/admin/products";
import { ServiceFormSheet } from "@/src/modules/admin/service-catalog";
import { lineQuantity } from "../utils/saleLines";
import type { CreateSaleItemInput } from "../utils/types";

// One resolved line ready for CreateSaleInput. Same discriminated shape the
// service consumes, so the cart hands its lines straight through.
export type SaleLineDraft = CreateSaleItemInput;

// The live cart state the parent form needs: the resolved lines, the summed
// total, the single sale currency, and whether the cart is submittable.
export interface SaleCartDraft {
  lines: SaleLineDraft[];
  total: number;
  currency: Currency | null;
  currencyId: string | null;
  ready: boolean;
  dirty: boolean;
}

// The saved sale an edit starts from. Its product units are still on this sale,
// so they count as available while it is being re-cut. `name` is the frozen line
// name — the only record of a one-off service, which has no catalog row.
export interface SaleEditorInitial {
  items: {
    lineType: SaleLineType;
    productId: string | null;
    serviceId: string | null;
    name: string;
    quantity: number;
    unitAmount: number;
  }[];
  currencyId: string | null;
}

interface Props {
  onChange: (draft: SaleCartDraft) => void;
  onFocusClearError?: () => void;
  initial?: SaleEditorInitial | null;
  currencyLocked?: boolean;
}

type Row = {
  key: string;
  lineType: SaleLineType;
  productId: string | null;
  serviceId: string | null;
  customName: string;
  quantity: number;
  unitAmount: number | null;
};

// True once the row identifies something sellable. A product row needs its
// catalog row; a service row takes either a catalog pick or a typed name.
function rowIsNamed(r: Row): boolean {
  return r.lineType === "product"
    ? r.productId != null
    : r.serviceId != null || r.customName.trim().length > 0;
}

// What the cart holds, ignoring rows the user hasn't identified yet — so adding
// and then removing a blank row is not an edit. Every field a row can be
// switched on is in here, or flipping a row to a service would read as untouched.
function signatureOf(rows: Row[], currencyId: string | null): string {
  return `${currencyId ?? ""}#${rows
    .filter(rowIsNamed)
    .map(
      (r) =>
        `${r.lineType}:${r.productId ?? ""}:${r.serviceId ?? ""}:${r.customName.trim()}:${r.quantity}:${r.unitAmount ?? ""}`,
    )
    .join("|")}`;
}

// A new sale starts with NO rows: the two add buttons are how the first line's
// kind is chosen, so there is never a blank row of the wrong kind to undo.
function buildInitialRows(initial?: SaleEditorInitial | null): Row[] {
  if (!initial || initial.items.length === 0) return [];
  return initial.items.map((it, i) => ({
    key: `row-${i}`,
    lineType: it.lineType,
    productId: it.productId,
    serviceId: it.serviceId,
    customName:
      it.lineType === "service" && it.serviceId === null ? it.name : "",
    quantity: it.lineType === "service" ? 1 : it.quantity,
    unitAmount: it.unitAmount,
  }));
}

// Round a converted price to the target currency's decimals for a clean prefill.
function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

// Row keys only need to be unique within one editor, so the suffix is handed in
// by the caller. Pure on purpose — see the note on CustomerPlansEditor.makeRow.
// The kind is fixed at creation: a line sells goods or labour, and there is no
// switch that could silently throw away what the user already picked.
function makeRow(suffix: number, lineType: SaleLineType): Row {
  return {
    key: `row-${suffix}`,
    lineType,
    productId: null,
    serviceId: null,
    customName: "",
    quantity: 1,
    unitAmount: null,
  };
}

// Multi-line "cart" editor for a sale. Each row sells EITHER a product (moves
// stock, quantity capped by what's left) OR a service (labour — no stock and no
// quantity at all, just a price), picked from the catalog or typed as a one-off.
// A row's kind comes from which add button made it — a sale holding both is two
// rows, never one row toggled twice (see gotcha #101).
// Owns the row + sale-currency state and reports the resolved draft up. One
// currency per sale: each catalog price is auto-converted into it (editable).
// Mirrors CustomerPlansEditor's add / remove-row pattern.
export function SaleItemsEditor({
  onChange,
  onFocusClearError,
  initial = null,
  currencyLocked = false,
}: Props) {
  const { t } = useTranslation();
  const products = useProductSlice((s) => s.items);
  const getProducts = useProductSlice((s) => s.getProducts);
  const services = useServiceSlice((s) => s.items);
  const getServices = useServiceSlice((s) => s.getServices);
  const currencies = useCurrencySlice((s) => s.items);
  const { lastUsedCurrencyId } = useUiPrefStore();

  const [rows, setRows] = useState<Row[]>(() => buildInitialRows(initial));
  const rowKey = useRef(rows.length - 1);
  const [currencyId, setCurrencyId] = useState<string | null>(
    initial ? initial.currencyId : (lastUsedCurrencyId ?? null),
  );
  const [currencyTouched, setCurrencyTouched] = useState(initial != null);
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [addServiceFor, setAddServiceFor] = useState<string | null>(null);
  const [baseline] = useState(() => signatureOf(rows, currencyId));

  useEffect(() => {
    void getProducts();
    void getServices();
  }, [getProducts, getServices]);

  const stockCredit = useMemo(() => {
    const credit = new Map<string, number>();
    for (const it of initial?.items ?? []) {
      if (it.lineType !== "product" || !it.productId) continue;
      credit.set(it.productId, (credit.get(it.productId) ?? 0) + it.quantity);
    }
    return credit;
  }, [initial]);

  const sellableProducts = useMemo(
    () => products.filter((p) => p.active || stockCredit.has(p.id)),
    [products, stockCredit],
  );

  const usedServiceIds = useMemo(
    () =>
      new Set(
        (initial?.items ?? [])
          .map((it) => it.serviceId)
          .filter((id): id is string => id != null),
      ),
    [initial],
  );
  const sellableServices = useMemo(
    () => services.filter((s) => s.active || usedServiceIds.has(s.id)),
    [services, usedServiceIds],
  );

  const poolFor = useCallback(
    (product: Product) => product.stockOnHand + (stockCredit.get(product.id) ?? 0),
    [stockCredit],
  );
  const currencyOptions: DropdownOption<string>[] = currencies
    .filter((c) => c.active || c.id === currencyId)
    .map((c) => ({ label: c.code, sublabel: c.name, value: c.id }));

  const saleCurrency = findCurrency(currencies, currencyId);

  const productOptions: DropdownOption<string>[] = sellableProducts.map((p) => {
    const pool = poolFor(p);
    return {
      label: p.name,
      sublabel:
        pool > 0
          ? `${formatMoney(p.price, findCurrency(currencies, p.currencyId), saleCurrency)} · ${t("sales.stock_left", { quantity: pool })}`
          : t("products.out_of_stock"),
      value: p.id,
      disabled: pool <= 0 || !p.active,
    };
  });

  const serviceOptions: DropdownOption<string>[] = sellableServices.map((s) => ({
    label: s.name,
    sublabel: formatMoney(
      s.price,
      findCurrency(currencies, s.currencyId),
      saleCurrency,
    ),
    value: s.id,
    disabled: !s.active,
  }));

  // What's still sellable for a row: the pool minus what the OTHER rows already
  // took of the same product (the same product can sit on several lines).
  function availableIn(list: Row[], key: string, productId: string | null): number {
    const product = sellableProducts.find((p) => p.id === productId);
    if (!product) return 0;
    const takenElsewhere = list
      .filter((r) => r.key !== key && r.productId === productId)
      .reduce((sum, r) => sum + r.quantity, 0);
    return poolFor(product) - takenElsewhere;
  }

  // Convert a catalog price into the given sale currency (rounded).
  function priceInCurrency(
    item: { price: number; currencyId: string | null },
    target: Currency | null,
  ): number {
    const source = findCurrency(currencies, item.currencyId);
    return roundTo(convert(item.price, source, target), target?.decimals ?? 2);
  }

  // Adopt the first picked catalog item's currency as the sale currency, unless
  // the user already chose one. Returns the currency the caller should price in.
  // A one-off typed service has no currency of its own, so it never gets here.
  function adoptCurrency(key: string, itemCurrencyId: string | null): Currency | null {
    const isFirstPick = !rows.some((r) => r.key !== key && rowIsNamed(r));
    let targetId = currencyId;
    if (isFirstPick && !currencyTouched) {
      targetId = itemCurrencyId;
      setCurrencyId(itemCurrencyId);
    }
    return findCurrency(currencies, targetId);
  }

  function selectProduct(key: string, productId: string | null) {
    const product = sellableProducts.find((p) => p.id === productId) ?? null;
    const target = product ? adoptCurrency(key, product.currencyId) : saleCurrency;
    setRows((prev) =>
      prev.map((r) =>
        r.key === key
          ? {
              ...r,
              productId,
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

  // Takes the resolved row, not an id: a service created from this form is not in
  // `services` yet on this render, so a lookup would miss it and the line would
  // open with no price.
  function applyService(key: string, service: Service | null) {
    const target = service ? adoptCurrency(key, service.currencyId) : saleCurrency;
    setRows((prev) =>
      prev.map((r) =>
        r.key === key
          ? {
              ...r,
              serviceId: service?.id ?? null,
              customName: service ? "" : r.customName,
              unitAmount: service ? priceInCurrency(service, target) : null,
            }
          : r,
      ),
    );
  }

  function selectService(key: string, serviceId: string | null) {
    applyService(key, sellableServices.find((s) => s.id === serviceId) ?? null);
  }

  function setCustomName(key: string, customName: string) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, customName } : r)),
    );
  }

  function changeSaleCurrency(nextId: string | null) {
    setCurrencyTouched(true);
    setCurrencyId(nextId);
    const target = findCurrency(currencies, nextId);
    setRows((prev) =>
      prev.map((r) => {
        const catalogItem =
          r.lineType === "product"
            ? sellableProducts.find((p) => p.id === r.productId)
            : sellableServices.find((s) => s.id === r.serviceId);
        return catalogItem
          ? { ...r, unitAmount: priceInCurrency(catalogItem, target) }
          : r;
      }),
    );
  }

  // Product rows only — a service row has no stepper. Capped at what's left in
  // stock so the form can't build a sale the service layer would reject.
  function setQuantity(key: string, quantity: number) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key || r.lineType !== "product") return r;
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

  function addRow(lineType: SaleLineType) {
    rowKey.current += 1;
    setRows((prev) => [...prev, makeRow(rowKey.current, lineType)]);
  }

  // The last row may go too: an empty cart is a valid state (the add buttons are
  // still there), and it is the only way to change a line's kind.
  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  // A service created from a row's "add new" is selected on that row right away,
  // priced from the object the form just saved.
  function handleServiceCreated(service: Service) {
    if (!addServiceFor) return;
    applyService(addServiceFor, service);
  }

  useEffect(() => {
    const lines: SaleLineDraft[] = [];
    let incomplete = false;
    for (const r of rows) {
      const validAmount = r.unitAmount != null && r.unitAmount > 0;
      const amount = r.unitAmount as number;
      if (!validAmount || r.quantity <= 0) {
        incomplete = true;
        continue;
      }
      if (r.lineType === "product") {
        const product = sellableProducts.find((p) => p.id === r.productId) ?? null;
        if (product) {
          lines.push({ kind: "product", product, quantity: r.quantity, unitAmount: amount });
        } else {
          incomplete = true;
        }
        continue;
      }
      const service = sellableServices.find((s) => s.id === r.serviceId) ?? null;
      const name = service?.name ?? r.customName.trim();
      if (name) {
        lines.push({ kind: "service", service, name, unitAmount: amount });
      } else {
        incomplete = true;
      }
    }
    const perProduct = new Map<string, number>();
    for (const l of lines) {
      if (l.kind !== "product") continue;
      perProduct.set(l.product.id, (perProduct.get(l.product.id) ?? 0) + l.quantity);
    }
    const oversold = [...perProduct].some(([id, qty]) => {
      const product = sellableProducts.find((p) => p.id === id);
      return !product || poolFor(product) < qty;
    });
    const total = lines.reduce(
      (sum, l) => sum + l.unitAmount * lineQuantity(l),
      0,
    );
    onChange({
      lines,
      total,
      currency: saleCurrency,
      currencyId,
      ready: lines.length > 0 && !incomplete && !oversold,
      dirty: signatureOf(rows, currencyId) !== baseline,
    });
  }, [
    rows,
    currencyId,
    sellableProducts,
    sellableServices,
    saleCurrency,
    poolFor,
    baseline,
    onChange,
  ]);

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
          disabled={currencyLocked}
          disabledHint={currencyLocked ? t("errors.sale_currency_locked") : undefined}
        />
      </View>

      {/* Line cards */}
      {rows.map((row, i) => (
        <View
          key={row.key}
          className="rounded-2xl border border-gray-200 bg-gray-50 px-3.5 pt-4 pb-1 mb-3"
        >
          {/* What this line sells — a label, not a switch. To change it, remove
              the line and add the other kind. */}
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center flex-1">
              <View
                className={`w-6 h-6 rounded-full items-center justify-center ${
                  row.lineType === "product" ? "bg-emerald-50" : "bg-indigo-50"
                }`}
              >
                <Ionicons
                  name={
                    row.lineType === "product"
                      ? "cube-outline"
                      : "construct-outline"
                  }
                  size={13}
                  color={
                    row.lineType === "product" ? COLORS.success : COLORS.primary
                  }
                />
              </View>
              <Text
                fontWeight="SemiBold"
                className="ms-2 text-sm text-gray-700"
              >
                {row.lineType === "product"
                  ? t("sales.line_type_product")
                  : t("sales.line_type_service")}
              </Text>
              {multiple ? (
                <Text className="ms-1.5 text-xs text-gray-400">
                  {`#${i + 1}`}
                </Text>
              ) : null}
            </View>
            <PressableOpacity
              onPress={() => removeRow(row.key)}
              accessibilityLabel={t("sales.remove_item")}
              hitSlop={8}
              className="flex-row items-center px-2 py-1 -me-1"
            >
              <Ionicons name="trash-outline" size={15} color={COLORS.danger} />
              <Text className="ms-1 text-xs text-danger font-medium">
                {t("sales.remove_item")}
              </Text>
            </PressableOpacity>
          </View>

          {row.lineType === "product" ? (
            <Dropdown<string>
              label={t("sales.product_label") + " *"}
              placeholder={t("sales.product_placeholder")}
              options={productOptions}
              value={row.productId}
              onChange={(v) => selectProduct(row.key, v)}
              onAddNew={() => setAddProductOpen(true)}
            />
          ) : (
            <>
              {/* "Other" (null) is the one-off: the name below IS the record. */}
              <Dropdown<string>
                label={t("sales.service_label") + " *"}
                placeholder={t("sales.service_placeholder")}
                options={serviceOptions}
                value={row.serviceId}
                onChange={(v) => selectService(row.key, v)}
                nullable
                nullLabel={t("sales.service_other")}
                nullSublabel={t("sales.service_other_hint")}
                onAddNew={() => setAddServiceFor(row.key)}
              />
              {row.serviceId === null ? (
                <Input
                  label={t("sales.service_name_label") + " *"}
                  value={row.customName}
                  onChangeText={(v) => setCustomName(row.key, v)}
                  placeholder={t("sales.service_name_placeholder")}
                  onFocus={onFocusClearError}
                />
              ) : null}
            </>
          )}

          <View className="flex-row items-start gap-2">
            {/* Quantity stepper — products only; labour is one job, one price */}
            {row.lineType === "product" ? (
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
            ) : null}

            {/* The line's money: a product's unit price, a service's whole fee */}
            <View className="flex-1">
              <CurrencyInput
                label={
                  (row.lineType === "product"
                    ? t("sales.unit_amount_label")
                    : t("sales.service_price_label")) + " *"
                }
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

          {/* Remaining stock for this row — products only */}
          {row.lineType === "product" && row.productId ? (
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

      {/* Add a line — one button per kind, so the choice is made here and never
          has to be undone on a row that already holds something. */}
      <View className="flex-row gap-3">
        <AddLineButton
          icon="cube-outline"
          label={t("sales.add_product")}
          onPress={() => addRow("product")}
        />
        <AddLineButton
          icon="construct-outline"
          label={t("sales.add_service")}
          onPress={() => addRow("service")}
        />
      </View>

      {addProductOpen && (
        <ProductFormSheet onDismiss={() => setAddProductOpen(false)} />
      )}

      {addServiceFor && (
        <ServiceFormSheet
          onDismiss={() => setAddServiceFor(null)}
          onSaved={handleServiceCreated}
        />
      )}
    </View>
  );
}

// Half-width dashed affordance — one per line kind. Also the editor's empty
// state, which is why it must stay readable with no rows above it.
function AddLineButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressableOpacity
      onPress={onPress}
      className="flex-1 flex-row items-center justify-center rounded-2xl border border-dashed border-gray-300 py-3 px-2"
    >
      <Ionicons name={icon} size={16} color={COLORS.primary} />
      <Text
        fontWeight="SemiBold"
        className="text-primary text-[13px] ms-1.5"
        numberOfLines={1}
      >
        {label}
      </Text>
    </PressableOpacity>
  );
}
