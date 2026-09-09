import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, View } from "react-native";
import { PressableOpacity } from "./PressableOpacity";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "./Text";
import { COLORS } from "@/src/shared/constants";
import type { Currency } from "@/src/core/types";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { BottomSheetScaffold } from "./BottomSheetScaffold";
import { SheetDragArea } from "./SheetDragArea";
import { AppTextInput } from "./AppTextInput";
import { useTextField } from "@/src/shared/hooks/useTextField";
import { decimalDigitsOnly } from "@/src/core/utils/inputText";

function amountText(amount: number | null): string {
  return amount != null ? String(amount) : "";
}

function parseAmount(text: string): number | null {
  if (text === "" || text === ".") return null;
  const parsed = parseFloat(text);
  return Number.isFinite(parsed) ? parsed : null;
}

interface CurrencyInputProps {
  label?: string;
  amount: number | null;
  currencyId: string | null;
  onChange: (next: {
    amount: number | null;
    currencyId: string | null;
  }) => void;
  currencies: Currency[];
  error?: string | null;
  placeholder?: string;
  lockCurrency?: boolean;
  editable?: boolean;
  onFocus?: () => void;
}

// CurrencyInput combines a numeric input with an embedded currency picker.
// Amount and currency are stored AS-TYPED — no silent unit conversion.
//
// Defaults the selected currency to the user's `lastUsedCurrencyId` from
// `uiPrefStore` on first mount (when no `currencyId` is provided by caller),
// then writes back to the store whenever the user picks a different currency.
export function CurrencyInput({
  label,
  amount,
  currencyId,
  onChange,
  currencies,
  error,
  placeholder,
  lockCurrency = false,
  editable = true,
  onFocus,
}: CurrencyInputProps) {
  const { t } = useTranslation();
  const { lastUsedCurrencyId, setLastUsedCurrencyId } = useUiPrefStore();
  const initialDefaultApplied = useRef(false);

  useEffect(() => {
    if (initialDefaultApplied.current) return;
    initialDefaultApplied.current = true;
    if (currencyId === null && amount === null && lastUsedCurrencyId) {
      const exists = currencies.some(
        (c) => c.id === lastUsedCurrencyId && c.active,
      );
      if (exists) onChange({ amount: null, currencyId: lastUsedCurrencyId });
    }
  }, [amount, currencyId, currencies, lastUsedCurrencyId, onChange]);

  const activeCurrencies = useMemo(
    () => currencies.filter((c) => c.active || c.id === currencyId),
    [currencies, currencyId],
  );
  const selected = useMemo(
    () => activeCurrencies.find((c) => c.id === currencyId) ?? null,
    [activeCurrencies, currencyId],
  );

  const field = useTextField(
    amountText(amount),
    (next) => onChange({ amount: parseAmount(next), currencyId }),
    {
      sanitize: decimalDigitsOnly,
      expectedEcho: (next) => amountText(parseAmount(next)),
    },
  );

  function handleCurrencyChange(nextId: string | null) {
    setLastUsedCurrencyId(nextId);
    onChange({ amount, currencyId: nextId });
  }

  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <View className="mb-4">
      {label ? (
        <Text
          fontWeight="SemiBold"
          className="text-xs text-gray-500 uppercase tracking-wide mb-1.5"
        >
          {label}
        </Text>
      ) : null}

      <View
        className={`flex-row items-center border rounded-xl bg-white px-4 ${
          error ? "border-danger" : "border-gray-200"
        }`}
      >
        <AppTextInput
          {...field}
          onFocus={onFocus}
          placeholder={placeholder ?? "0.00"}
          placeholderTextColor={COLORS.gray400}
          keyboardType="decimal-pad"
          editable={editable}
          containerClassName="flex-1"
          className="py-3 text-base text-gray-900"
        />

        <PressableOpacity
          onPress={() => {
            if (!lockCurrency) setPickerOpen(true);
          }}
          disabled={lockCurrency}
          className="flex-row items-center ps-3 ms-2 border-s border-gray-100 py-2.5"
        >
          <Text fontWeight="SemiBold" className="text-sm text-gray-700">
            {selected ? selected.code : "USD"}
          </Text>
          {!lockCurrency ? (
            <Ionicons
              name="chevron-down"
              size={14}
              color={COLORS.gray400}
              style={{ marginInlineStart: 4 }}
            />
          ) : null}
        </PressableOpacity>
      </View>

      {error ? <Text className="text-sm text-danger mt-1">{error}</Text> : null}

      <BottomSheetScaffold
        visible={pickerOpen}
        onDismiss={() => setPickerOpen(false)}
      >
        <SheetDragArea className="flex-row items-center justify-between px-5 py-3 border-b border-gray-100">
          <Text fontWeight="SemiBold" className="text-base text-gray-900">
            {t("tenant_settings.currencies_section_title")}
          </Text>
          <PressableOpacity onPress={() => setPickerOpen(false)}>
            <Text fontWeight="Medium" className="text-base text-primary">
              {t("common.cancel")}
            </Text>
          </PressableOpacity>
        </SheetDragArea>

        <FlatList
          data={[
            {
              id: null as string | null,
              code: "USD",
              label: "USD",
              sublabel: null as string | null,
            },
            ...activeCurrencies.map((c) => ({
              id: c.id as string | null,
              code: c.code,
              label: c.code,
              sublabel: c.name,
            })),
          ]}
          keyExtractor={(item) => item.id ?? "__usd__"}
          style={{ maxHeight: 360 }}
          renderItem={({ item }) => {
            const isSelected = item.id === currencyId;
            return (
              <PressableOpacity
                onPress={() => {
                  handleCurrencyChange(item.id);
                  setPickerOpen(false);
                }}
                className={`flex-row items-center px-5 py-3.5 border-b border-gray-50 ${
                  isSelected ? "bg-indigo-50" : "bg-white"
                }`}
              >
                <View className="flex-1">
                  <Text
                    fontWeight="SemiBold"
                    className={`text-base ${
                      isSelected ? "text-primary" : "text-gray-900"
                    }`}
                  >
                    {item.label}
                  </Text>
                  {item.sublabel ? (
                    <Text className="text-xs text-gray-400 mt-0.5">
                      {item.sublabel}
                    </Text>
                  ) : null}
                </View>
                {isSelected ? (
                  <Ionicons name="checkmark" size={18} color={COLORS.primary} />
                ) : null}
              </PressableOpacity>
            );
          }}
        />
      </BottomSheetScaffold>
    </View>
  );
}
