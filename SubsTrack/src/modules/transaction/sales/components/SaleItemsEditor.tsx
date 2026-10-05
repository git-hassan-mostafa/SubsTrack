import { useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { Input } from "@/src/shared/components/Input";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import {
  Dropdown,
  type DropdownOption,
} from "@/src/shared/components/Dropdown";
import { COLORS } from "@/src/shared/constants";
import type { Service } from "@shared/core/types";
import {
  currencyChoices,
  findCurrency,
  formatMoney,
} from "@shared/core/utils/currency";
import type { SaleCart } from "@shared/modules/transaction/sales/hooks/useSaleCart";
import { ProductFormSheet } from "@/src/modules/admin/products";
import { ServiceFormSheet } from "@/src/modules/admin/service-catalog";

interface Props {
  cart: SaleCart;
  onFocusClearError?: () => void;
}

// The cart rules live in Shared `useSaleCart`; a row's kind is fixed (gotcha #101).
export function SaleItemsEditor({ cart, onFocusClearError }: Props) {
  const { t } = useTranslation();
  const { rows, currencyId, currency: saleCurrency, currencies } = cart;
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [addServiceFor, setAddServiceFor] = useState<string | null>(null);

  const currencyOptions: DropdownOption<string>[] = currencyChoices(
    currencies,
    currencyId,
  ).map((c) => ({ label: c.code, sublabel: c.name, value: c.id }));

  const productOptions: DropdownOption<string>[] = cart.products.map((p) => {
    const pool = cart.poolOf(p);
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

  const serviceOptions: DropdownOption<string>[] = cart.services.map((s) => ({
    label: s.name,
    sublabel: formatMoney(
      s.price,
      findCurrency(currencies, s.currencyId),
      saleCurrency,
    ),
    value: s.id,
    disabled: !s.active,
  }));

  const selectProduct = (key: string, productId: string | null) =>
    cart.selectProduct(
      key,
      cart.products.find((p) => p.id === productId) ?? null,
    );

  const selectService = (key: string, serviceId: string | null) =>
    cart.selectService(
      key,
      cart.services.find((s) => s.id === serviceId) ?? null,
    );

  function handleServiceCreated(service: Service) {
    if (!addServiceFor) return;
    cart.selectService(addServiceFor, service);
  }

  const multiple = rows.length > 1;

  return (
    <View className="mt-2 mb-2">
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
          onChange={cart.changeCurrency}
          nullable
          nullLabel="USD"
        />
      </View>

      {rows.map((row, i) => (
        <View
          key={row.key}
          className="rounded-2xl border border-gray-200 bg-gray-50 px-3.5 pt-4 pb-1 mb-3"
        >
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
              onPress={() => cart.removeRow(row.key)}
              accessibilityLabel={t("sales.remove_item")}
              hitSlop={8}
              className="flex-row items-center px-2 py-1 -me-1"
            >
              <Ionicons name="trash-outline" size={15} color={COLORS.danger} />
              <Text fontWeight="Medium" className="ms-1 text-xs text-danger">
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
                  onChangeText={(v) => cart.setCustomName(row.key, v)}
                  placeholder={t("sales.service_name_placeholder")}
                  onFocus={onFocusClearError}
                />
              ) : null}
            </>
          )}

          <View className="flex-row items-start gap-2">
            {row.lineType === "product" ? (
              <View className="mb-4">
                <Text
                  fontWeight="SemiBold"
                  className="text-xs text-gray-500 uppercase tracking-wide mb-1.5"
                >
                  {t("sales.quantity_label")}
                </Text>
                <View className="flex-row items-center border border-gray-200 rounded-xl bg-white px-2 py-1.5">
                  <PressableOpacity
                    onPress={() => cart.setQuantity(row.key, row.quantity - 1)}
                    className="w-8 h-8 rounded-lg bg-gray-100 items-center justify-center"
                  >
                    <Ionicons name="remove" size={16} color={COLORS.gray700} />
                  </PressableOpacity>
                  <Text
                    fontWeight="SemiBold"
                    className="text-base text-gray-900 w-9 text-center"
                  >
                    {row.quantity}
                  </Text>
                  <PressableOpacity
                    onPress={() => cart.setQuantity(row.key, row.quantity + 1)}
                    className="w-8 h-8 rounded-lg bg-gray-100 items-center justify-center"
                  >
                    <Ionicons name="add" size={16} color={COLORS.gray700} />
                  </PressableOpacity>
                </View>
              </View>
            ) : null}

            <View className="flex-1">
              <CurrencyInput
                label={
                  (row.lineType === "product"
                    ? t("sales.unit_amount_label")
                    : t("sales.service_price_label")) + " *"
                }
                amount={row.unitAmount}
                currencyId={currencyId}
                onChange={({ amount }) => cart.setUnitAmount(row.key, amount)}
                currencies={currencies}
                placeholder="0.00"
                lockCurrency
                onFocus={onFocusClearError}
              />
            </View>
          </View>

          {row.lineType === "product" && row.productId ? (
            <View className="-mt-2 mb-2">
              <Text className="text-xs text-gray-400">
                {t("sales.stock_left", {
                  quantity: cart.availableFor(row.key, row.productId),
                })}
              </Text>
            </View>
          ) : null}

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

      <View className="flex-row gap-3">
        <AddLineButton
          icon="cube-outline"
          label={t("sales.add_product")}
          onPress={() => cart.addRow("product")}
        />
        <AddLineButton
          icon="construct-outline"
          label={t("sales.add_service")}
          onPress={() => cart.addRow("service")}
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

// One per line kind; also the editor's empty state, so it reads with no rows.
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
