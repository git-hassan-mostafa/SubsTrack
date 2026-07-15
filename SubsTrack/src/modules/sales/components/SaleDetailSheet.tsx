import { useState } from "react";
import { View } from "react-native";
import { SheetModal } from "@/src/shared/components/SheetModal";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { useTranslation } from "react-i18next";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { Input } from "@/src/shared/components/Input";
import type { Currency, Sale } from "@/src/core/types";
import {
  findCurrency,
  formatMoney,
  paymentSnapshotCurrency,
} from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { formatDate } from "@/src/core/utils/date";

// Strips the trailing currency symbol/code that formatMoney appends, so a
// paid/total fraction shows the currency label once instead of twice.
function stripCurrencyLabel(
  formatted: string,
  target: Currency | null,
): string {
  if (!target) return formatted.replace(/^\$/, "");
  const suffix = ` ${target.symbol || target.code}`;
  return formatted.endsWith(suffix)
    ? formatted.slice(0, -suffix.length)
    : formatted;
}

interface Props {
  sale: Sale | null;
  onDismiss: () => void;
  onVoid?: (reason: string) => void;
  voidLoading?: boolean;
}

export function SaleDetailSheet({
  sale,
  onDismiss,
  onVoid,
  voidLoading,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const { displayCurrencyId } = useUiPrefStore();
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";

  const [voidMode, setVoidMode] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  function handleDismiss() {
    setVoidMode(false);
    setVoidReason("");
    onDismiss();
  }

  function handleConfirmVoid() {
    if (!onVoid) return;
    onVoid(voidReason.trim());
    setVoidMode(false);
    setVoidReason("");
  }

  if (!sale) return null;

  const source = paymentSnapshotCurrency(sale, currencies);
  const target = findCurrency(currencies, displayCurrencyId);
  const fmtSource = (v: number) => formatMoney(v, source, source);
  const fmtTarget = (v: number) => formatMoney(v, source, target);
  const showEquivalent = (source?.id ?? null) !== (target?.id ?? null);

  const voided = sale.voidedAt !== null;
  const partiallyPaid = !voided && sale.amountPaid < sale.totalAmount;
  const totalSourceLabel = fmtSource(sale.totalAmount);
  const heroSourceLabel = partiallyPaid
    ? `${stripCurrencyLabel(fmtSource(sale.amountPaid), source)}/${totalSourceLabel}`
    : totalSourceLabel;
  const receiptId = sale.id.slice(-6).toUpperCase();
  const productLabel =
    sale.quantity > 1
      ? `${sale.productNameSnapshot} × ${sale.quantity}`
      : sale.productNameSnapshot;

  return (
    <SheetModal visible={sale !== null} onDismiss={handleDismiss}>
      <SafeAreaView className="flex-1 bg-white">
        <ResponsiveContainer className="flex-1">
          {/* Handle */}
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 rounded-full bg-gray-300" />
          </View>

          {/* Header */}
          <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
            <Text fontWeight="Bold" className="text-lg text-gray-900">
              {t("sales.receipt_title")}
            </Text>
            <PressableOpacity onPress={handleDismiss}>
              <Text className="text-base text-primary font-medium">
                {t("common.close")}
              </Text>
            </PressableOpacity>
          </View>

          <KeyboardAwareScrollView
            className="flex-1 px-6 pt-5"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 48 }}
            bottomOffset={24}
          >
            {/* Hero card */}
            {voided || partiallyPaid ? (
              <View className="bg-red-50 border border-red-100 rounded-2xl px-4 py-5 items-center mb-4">
                <View className="w-10 h-10 rounded-full bg-red-400 items-center justify-center mb-3">
                  <Text fontWeight="Bold" className="text-white text-lg">
                    ✕
                  </Text>
                </View>
                <Text fontWeight="Bold" className="text-3xl text-red-500">
                  {heroSourceLabel}
                </Text>
                {showEquivalent ? (
                  <Text className="text-xs text-gray-400 mt-0.5">
                    ≈ {fmtTarget(sale.totalAmount)}
                  </Text>
                ) : null}
                <Text className="text-sm text-gray-400 mt-1">
                  {productLabel}
                </Text>
                {voided ? (
                  <View className="mt-2 bg-red-100 rounded-full px-3 py-1">
                    <Text className="text-xs text-red-600 font-semibold">
                      {t("sales.voided")}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <View className="bg-green-50 border border-green-100 rounded-2xl px-4 py-5 items-center mb-4">
                <View className="w-10 h-10 rounded-full bg-green-500 items-center justify-center mb-3">
                  <Text fontWeight="Bold" className="text-white text-lg">
                    ✓
                  </Text>
                </View>
                <Text fontWeight="Bold" className="text-3xl text-green-600">
                  {fmtSource(sale.totalAmount)}
                </Text>
                {showEquivalent ? (
                  <Text className="text-xs text-gray-400 mt-0.5">
                    ≈ {fmtTarget(sale.totalAmount)}
                  </Text>
                ) : null}
                <Text className="text-sm text-gray-400 mt-1">
                  {productLabel}
                </Text>
              </View>
            )}

            {/* Partial payment notice */}
            {partiallyPaid ? (
              <View className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4">
                <Text className="text-sm text-amber-700">
                  {t("sales.partial_debt_notice")}
                </Text>
              </View>
            ) : null}

            {/* Detail rows card */}
            <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4">
              {sale.quantity > 1 ? (
                <Row
                  label={t("sales.unit_amount_label")}
                  value={fmtSource(sale.unitAmount)}
                />
              ) : null}
              <Row
                label={t("sales.customer_label")}
                value={sale.customer?.name ?? t("sales.walk_in")}
              />
              <Row
                label={t("sales.sold_at_label")}
                value={formatDate(sale.soldAt, locale)}
              />
              <Row
                label={t("sales.receipt_id_label")}
                value={receiptId}
                last={!sale.notes && !(voided && sale.voidReason)}
              />
              {sale.notes ? (
                <Row
                  label={t("sales.notes_label")}
                  value={sale.notes}
                  last={!(voided && sale.voidReason)}
                />
              ) : null}
              {voided && sale.voidReason ? (
                <Row
                  label={t("sales.void_reason_label")}
                  value={sale.voidReason}
                  valueColor="text-red-600"
                  last
                />
              ) : null}
            </View>

            {/* Void controls (active sales only) */}
            {!voided && onVoid ? (
              voidMode ? (
                <View className="mb-4">
                  <Input
                    label={t("sales.void_reason_label")}
                    value={voidReason}
                    onChangeText={setVoidReason}
                    placeholder={t("sales.void_reason_placeholder")}
                    multiline
                  />
                  <View className="flex-row gap-3 mt-2">
                    <PressableOpacity
                      onPress={() => {
                        setVoidMode(false);
                        setVoidReason("");
                      }}
                      className="flex-1 border border-gray-200 rounded-xl py-3 items-center"
                    >
                      <Text className="text-gray-600 font-medium">
                        {t("common.cancel")}
                      </Text>
                    </PressableOpacity>
                    <PressableOpacity
                      onPress={handleConfirmVoid}
                      disabled={voidLoading}
                      className={`flex-1 rounded-xl py-3 items-center ${
                        voidLoading ? "bg-red-200" : "bg-red-500"
                      }`}
                    >
                      <Text className="text-white font-semibold">
                        {t("sales.confirm_void")}
                      </Text>
                    </PressableOpacity>
                  </View>
                </View>
              ) : (
                <PressableOpacity
                  onPress={() => setVoidMode(true)}
                  className="border border-red-300 rounded-xl py-3.5 items-center mb-4"
                >
                  <Text className="text-red-500 font-semibold">
                    {t("sales.void_sale")}
                  </Text>
                </PressableOpacity>
              )
            ) : null}

            <View className="h-8" />
          </KeyboardAwareScrollView>
        </ResponsiveContainer>
      </SafeAreaView>
    </SheetModal>
  );
}

function Row({
  label,
  value,
  last,
  valueColor = "text-gray-900",
}: {
  label: string;
  value: string;
  last?: boolean;
  valueColor?: string;
}) {
  return (
    <View
      className={`flex-row justify-between items-center px-4 py-3.5 ${last ? "" : "border-b border-gray-100"}`}
    >
      <Text className="text-sm text-gray-400">{label}</Text>
      <Text
        className={`text-sm font-semibold flex-1 ms-4 text-right ${valueColor}`}
      >
        {value}
      </Text>
    </View>
  );
}
