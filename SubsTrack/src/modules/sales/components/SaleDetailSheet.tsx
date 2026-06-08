import { useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { Input } from "@/src/shared/components/Input";
import { COLORS } from "@/src/shared/constants";
import type { Sale } from "@/src/core/types";
import {
  findCurrency,
  formatMoney,
  paymentSnapshotCurrency,
} from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { formatDate } from "@/src/core/utils/date";

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

  // Snapshot rate keeps historical USD equivalents stable when the live FX
  // rate is later edited. Same principle as PaymentDetailSheet.
  const source = paymentSnapshotCurrency(sale, currencies);
  const target = findCurrency(currencies, displayCurrencyId);
  const fmtSource = (v: number) => formatMoney(v, source, source);
  const fmtTarget = (v: number) => formatMoney(v, source, target);
  const showEquivalent = (source?.id ?? null) !== (target?.id ?? null);

  const voided = sale.voidedAt !== null;
  const receiptId = sale.id.slice(-6).toUpperCase();

  return (
    <Modal
      visible={sale !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleDismiss}
    >
      <SafeAreaView className="flex-1 bg-white">
        <View className="items-center pt-3 pb-1">
          <View className="w-10 h-1 rounded-full bg-gray-300" />
        </View>
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

        <ScrollView className="flex-1 px-6 pt-6">
          {/* Status badge */}
          <View
            className={`self-start rounded-full px-3 py-1 flex-row items-center mb-4 ${
              voided ? "bg-red-50" : "bg-emerald-50"
            }`}
          >
            <Ionicons
              name={voided ? "close-circle" : "checkmark-circle"}
              size={14}
              color={voided ? COLORS.danger : COLORS.success}
            />
            <Text
              className={`text-xs font-semibold ms-1 ${
                voided ? "text-red-600" : "text-emerald-700"
              }`}
            >
              {voided ? t("sales.voided") : t("sales.sold")}
            </Text>
          </View>

          {/* Product name + quantity */}
          <Text className="text-2xl font-bold text-gray-900">
            {sale.productNameSnapshot}
            {sale.quantity > 1 ? ` × ${sale.quantity}` : ""}
          </Text>

          {/* Amounts */}
          <View className="mt-6 mb-4">
            <Text className="text-xs uppercase tracking-wide text-gray-500 mb-1">
              {t("sales.total_label")}
            </Text>
            <Text className="text-3xl font-bold text-gray-900">
              {fmtSource(sale.totalAmount)}
            </Text>
            {showEquivalent ? (
              <Text className="text-sm text-gray-400 mt-1">
                ≈ {fmtTarget(sale.totalAmount)}
              </Text>
            ) : null}
          </View>

          {sale.quantity > 1 ? (
            <DetailRow
              label={t("sales.unit_amount_label")}
              value={fmtSource(sale.unitAmount)}
            />
          ) : null}

          <DetailRow
            label={t("sales.customer_label")}
            value={sale.customer?.name ?? t("sales.walk_in")}
          />
          <DetailRow
            label={t("sales.sold_at_label")}
            value={formatDate(sale.soldAt, locale)}
          />
          <DetailRow label={t("sales.receipt_id_label")} value={receiptId} />

          {sale.notes ? (
            <View className="mt-2 px-4 py-3 rounded-xl bg-gray-50">
              <Text className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                {t("sales.notes_label")}
              </Text>
              <Text className="text-sm text-gray-700">{sale.notes}</Text>
            </View>
          ) : null}

          {voided && sale.voidReason ? (
            <View className="mt-2 px-4 py-3 rounded-xl bg-red-50">
              <Text className="text-xs uppercase tracking-wide text-red-600 mb-1">
                {t("sales.void_reason_label")}
              </Text>
              <Text className="text-sm text-red-700">{sale.voidReason}</Text>
            </View>
          ) : null}

          {/* Void controls (active sales only) */}
          {!voided && onVoid ? (
            voidMode ? (
              <View className="mt-6">
                <Input
                  label={t("sales.void_reason_label")}
                  value={voidReason}
                  onChangeText={setVoidReason}
                  placeholder={t("sales.void_reason_placeholder")}
                  multiline
                />
                <View className="flex-row" style={{ gap: 8 }}>
                  <PressableOpacity
                    onPress={() => {
                      setVoidMode(false);
                      setVoidReason("");
                    }}
                    className="flex-1 border border-gray-200 rounded-xl py-3 items-center"
                  >
                    <Text className="text-gray-700 font-semibold">
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
                className="border border-red-200 rounded-xl py-3.5 items-center mt-6"
              >
                <Text className="text-red-500 font-semibold">
                  {t("sales.void_sale")}
                </Text>
              </PressableOpacity>
            )
          ) : null}

          <View className="h-24" />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-2 border-b border-gray-50">
      <Text className="text-sm text-gray-500">{label}</Text>
      <Text className="text-sm text-gray-900 font-medium">{value}</Text>
    </View>
  );
}
