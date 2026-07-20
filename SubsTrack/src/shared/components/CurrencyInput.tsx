import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, TextInput, View } from "react-native";
import { PressableOpacity } from "./PressableOpacity";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "./Text";
import { COLORS } from "@/src/shared/constants";
import type { Currency } from "@/src/core/types";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { BottomSheetScaffold } from "./BottomSheetScaffold";

interface CurrencyInputProps {
  label?: string;
  // The literal amount the user typed (in the units of `currencyId`).
  amount: number | null;
  // The currency that `amount` is denominated in. null = USD.
  currencyId: string | null;
  onChange: (next: {
    amount: number | null;
    currencyId: string | null;
  }) => void;
  currencies: Currency[];
  error?: string | null;
  placeholder?: string;
  // When true, only allow the read-only USD label (used in edge cases like
  // form modes where the currency is fixed).
  lockCurrency?: boolean;
  // Externally-controlled disable (e.g. partial-payment max balance lock).
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

  // On first mount, if the caller didn't preselect a currency and didn't pass
  // an amount, apply the user's last-used currency as the default.
  useEffect(() => {
    if (initialDefaultApplied.current) return;
    initialDefaultApplied.current = true;
    if (currencyId === null && amount === null && lastUsedCurrencyId) {
      const exists = currencies.some(
        (c) => c.id === lastUsedCurrencyId && c.active,
      );
      if (exists) onChange({ amount: null, currencyId: lastUsedCurrencyId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeCurrencies = useMemo(
    () => currencies.filter((c) => c.active || c.id === currencyId),
    [currencies, currencyId],
  );
  const selected = useMemo(
    () => activeCurrencies.find((c) => c.id === currencyId) ?? null,
    [activeCurrencies, currencyId],
  );

  const [text, setText] = useState<string>(
    amount != null ? String(amount) : "",
  );
  // Keep local text in sync when parent resets `amount` programmatically.
  useEffect(() => {
    const incoming = amount != null ? String(amount) : "";
    setText((prev) => (Number(prev) === amount ? prev : incoming));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);

  function handleText(next: string) {
    // Allow empty, partial decimal like "12." while typing.
    const cleaned = next.replace(/[^0-9.]/g, "");
    setText(cleaned);
    if (cleaned === "" || cleaned === ".") {
      onChange({ amount: null, currencyId });
      return;
    }
    const parsed = parseFloat(cleaned);
    onChange({ amount: Number.isFinite(parsed) ? parsed : null, currencyId });
  }

  function handleCurrencyChange(nextId: string | null) {
    setLastUsedCurrencyId(nextId);
    onChange({ amount, currencyId: nextId });
  }

  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <View className="mb-4">
      {label ? (
        <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          {label}
        </Text>
      ) : null}

      <View
        className={`flex-row items-center border rounded-xl bg-white px-4 ${
          error ? "border-danger" : "border-gray-200"
        }`}
      >
        <TextInput
          value={text}
          onChangeText={handleText}
          onFocus={onFocus}
          placeholder={placeholder ?? "0.00"}
          placeholderTextColor={COLORS.gray400}
          keyboardType="decimal-pad"
          editable={editable}
          className="flex-1 py-3 text-base text-gray-900"
          style={{ fontFamily: "Cairo" }}
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
        <View className="flex-row items-center justify-between px-5 py-3 border-b border-gray-100">
          <Text className="text-base font-semibold text-gray-900">
            {t("tenant_settings.currencies_section_title")}
          </Text>
          <PressableOpacity onPress={() => setPickerOpen(false)}>
            <Text className="text-base text-primary font-medium">
              {t("common.cancel")}
            </Text>
          </PressableOpacity>
        </View>

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
                    className={`text-base font-semibold ${
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
