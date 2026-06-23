import { useState } from "react";
import { Modal, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { useTranslation } from "react-i18next";
import type { MonthEntry } from "@/src/core/types";
import { formatDate } from "@/src/core/utils/date";
import {
  findCurrency,
  formatMoney,
  paymentSnapshotCurrency,
} from "@/src/core/utils/currency";
import { getBlockRangeLabel } from "../utils/blockRangeLabel";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { useLanguageStore } from "@/src/core/i18n/languageStore";

interface Props {
  entry: MonthEntry | null;
  // Shown as a detail row when the sheet is opened outside a customer's own
  // screen (e.g. the tenant-wide Payments list) so the customer is identifiable.
  customerName?: string;
  onVoid?: () => void;
  onEdit?: (next: {
    amountDue: number;
    amountPaid: number;
    currencyId: string | null;
  }) => void;
  editLoading?: boolean;
  onDismiss: () => void;
}

export function PaymentDetailSheet({
  entry,
  customerName,
  onVoid,
  onEdit,
  editLoading,
  onDismiss,
}: Props) {
  const { t, i18n } = useTranslation();
  const payment = entry?.payment;
  const currencies = useCurrencySlice((s) => s.items);
  const { displayCurrencyId } = useUiPrefStore();
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";
  // Use the snapshot rate frozen on the payment so historical USD equivalents
  // don't drift when the live currencies.ratePerUsd is later edited.
  const source = payment ? paymentSnapshotCurrency(payment, currencies) : null;
  const target = findCurrency(currencies, displayCurrencyId);
  // Primary display = stored (source) currency (preserves the literal amount
  // collected). When the user's display currency differs, also show the
  // equivalent in the display currency as a secondary line.
  const fmtSource = (v: number) => formatMoney(v, source, source);
  const fmtTarget = (v: number) => formatMoney(v, source, target);
  const showEquivalent =
    payment != null && (source?.id ?? null) !== (target?.id ?? null);

  const [editMode, setEditMode] = useState(false);
  const [editDue, setEditDue] = useState<number | null>(null);
  const [editPaid, setEditPaid] = useState<number | null>(null);
  const [editCurrencyId, setEditCurrencyId] = useState<string | null>(null);

  function handleOpenEdit() {
    setEditDue(payment ? payment.amountDue : null);
    setEditPaid(payment ? payment.amountPaid : null);
    setEditCurrencyId(payment ? payment.currencyId : null);
    setEditMode(true);
  }

  function handleCancelEdit() {
    setEditMode(false);
    setEditDue(null);
    setEditPaid(null);
    setEditCurrencyId(null);
  }

  function handleSaveEdit() {
    if (
      editDue != null &&
      editDue > 0 &&
      editPaid != null &&
      editPaid >= 0 &&
      editPaid <= editDue &&
      onEdit
    ) {
      onEdit({
        amountDue: editDue,
        amountPaid: editPaid,
        currencyId: editCurrencyId,
      });
      setEditMode(false);
      setEditDue(null);
      setEditPaid(null);
      setEditCurrencyId(null);
    }
  }

  function handleDismiss() {
    setEditMode(false);
    setEditDue(null);
    setEditPaid(null);
    setEditCurrencyId(null);
    onDismiss();
  }

  const saveDisabled =
    editDue == null ||
    editDue <= 0 ||
    editPaid == null ||
    editPaid < 0 ||
    editPaid > editDue ||
    !!editLoading;

  const receiptId = payment ? payment.id.slice(-6).toUpperCase() : "—";

  const isMultiMonth = (payment?.durationMonths ?? 1) > 1;
  const blockRangeLabel = payment
    ? getBlockRangeLabel(payment.billingMonth, payment.durationMonths, t)
    : "";

  const voidLabel = isMultiMonth
    ? t("payments.void_entire_block")
    : t("payments.void_this_payment");

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleDismiss}
    >
      <SafeAreaView className="flex-1 bg-white">
        <ResponsiveContainer className="flex-1">
          {/* Handle + header */}
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 rounded-full bg-gray-300" />
          </View>
          <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
            <Text fontWeight="Bold" className="text-lg text-gray-900">
              {isMultiMonth
                ? t("payments.block_receipt_title")
                : t("payments.receipt_title")}
            </Text>
            <PressableOpacity onPress={handleDismiss}>
              <Text className="text-base text-primary font-medium">
                {t("common.close")}
              </Text>
            </PressableOpacity>
          </View>

          <View className="px-6 pt-5">
            {/* Success card — green for full payment, amber for partial */}
            {payment?.balance != null && payment.balance > 0 ? (
              <View className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-5 items-center mb-6">
                <View className="w-10 h-10 rounded-full bg-warning items-center justify-center mb-3">
                  <Text fontWeight="Bold" className="text-white text-lg">
                    !
                  </Text>
                </View>
                <Text fontWeight="Bold" className="text-3xl text-amber-600">
                  {fmtSource(payment.amountPaid)}
                </Text>
                {showEquivalent ? (
                  <Text className="text-xs text-gray-400 mt-0.5">
                    ≈ {fmtTarget(payment.amountPaid)}
                  </Text>
                ) : null}
                <Text className="text-sm text-gray-400 mt-1">
                  {t("payments.paid_partial", { monthYear: blockRangeLabel })}
                </Text>
                <Text className="text-xs text-amber-600 font-semibold mt-1">
                  {t("payments.balance_remaining", {
                    amount: fmtSource(payment.balance),
                  })}
                </Text>
                {isMultiMonth ? (
                  <View className="mt-2 bg-amber-100 rounded-full px-3 py-1">
                    <Text className="text-xs text-amber-700 font-semibold">
                      {t("payments.block_months_label", {
                        count: payment.durationMonths,
                      })}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <View className="bg-green-50 border border-green-100 rounded-2xl px-4 py-5 items-center mb-6">
                <View className="w-10 h-10 rounded-full bg-green-500 items-center justify-center mb-3">
                  <Text fontWeight="Bold" className="text-white text-lg">
                    ✓
                  </Text>
                </View>
                <Text fontWeight="Bold" className="text-3xl text-green-600">
                  {payment ? fmtSource(payment.amountPaid) : "—"}
                </Text>
                {showEquivalent && payment ? (
                  <Text className="text-xs text-gray-400 mt-0.5">
                    ≈ {fmtTarget(payment.amountPaid)}
                  </Text>
                ) : null}
                <Text className="text-sm text-gray-400 mt-1">
                  {t("payments.paid_in_full", { monthYear: blockRangeLabel })}
                </Text>
                {isMultiMonth ? (
                  <View className="mt-2 bg-green-100 rounded-full px-3 py-1">
                    <Text className="text-xs text-green-700 font-semibold">
                      {t("payments.block_months_label", {
                        count: payment?.durationMonths,
                      })}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}

            {/* Detail rows */}
            {payment ? (
              <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4">
                {customerName ? (
                  <Row label={t("sales.customer_label")} value={customerName} />
                ) : null}
                <Row
                  label={t("payments.paid_on")}
                  value={formatDate(payment.paidAt, i18n.language)}
                />
                <Row label={t("payments.receipt_id")} value={receiptId} />
                <Row
                  label={t("payments.amount_due_label")}
                  value={fmtSource(payment.amountDue)}
                />
                <Row
                  label={t("payments.amount_paid_label")}
                  value={fmtSource(payment.amountPaid)}
                />
                {payment.balance > 0 ? (
                  <Row
                    label={t("payments.balance_label")}
                    value={fmtSource(payment.balance)}
                    valueColor="text-amber-600"
                  />
                ) : null}
                {payment.notes ? (
                  <Row label={t("payments.notes")} value={payment.notes} last />
                ) : null}
              </View>
            ) : null}

            {/* Edit payment */}
            {onEdit && !editMode ? (
              <PressableOpacity
                onPress={handleOpenEdit}
                className="border border-primary rounded-xl py-3 items-center mb-3"
              >
                <Text className="text-primary font-semibold">
                  {t("payments.edit_payment")}
                </Text>
              </PressableOpacity>
            ) : null}

            {onEdit && editMode ? (
              <View className="mb-3">
                {/* Amount Due — currency picker unlocked. Switching currency
                  re-snapshots the FX rate at save time (handled by the service). */}
                <CurrencyInput
                  label={t("payments.amount_due_label")}
                  amount={editDue}
                  currencyId={editCurrencyId}
                  onChange={({ amount, currencyId }) => {
                    setEditDue(amount);
                    if (currencyId !== editCurrencyId) {
                      setEditCurrencyId(currencyId);
                      // Switching currency invalidates the previously-typed paid
                      // value in the old unit.
                      setEditPaid(null);
                    }
                  }}
                  currencies={currencies}
                  placeholder={t("payments.enter_amount")}
                />
                {/* Amount Paid — locked to whatever currency Amount Due is in. */}
                <View className="h-2" />
                <CurrencyInput
                  label={t("payments.amount_paid_label")}
                  amount={editPaid}
                  currencyId={editCurrencyId}
                  onChange={({ amount }) => setEditPaid(amount)}
                  currencies={currencies}
                  placeholder={t("payments.enter_amount")}
                  lockCurrency
                />
                <View className="flex-row gap-3 mt-2">
                  <PressableOpacity
                    onPress={handleCancelEdit}
                    className="flex-1 border border-gray-200 rounded-xl py-3 items-center"
                  >
                    <Text className="text-gray-600 font-medium">
                      {t("common.cancel")}
                    </Text>
                  </PressableOpacity>
                  <PressableOpacity
                    onPress={handleSaveEdit}
                    disabled={saveDisabled}
                    className={`flex-1 rounded-xl py-3 items-center ${saveDisabled ? "bg-gray-200" : "bg-primary"}`}
                  >
                    <Text
                      className={`font-semibold ${saveDisabled ? "text-gray-400" : "text-white"}`}
                    >
                      {editLoading ? "..." : t("common.save_changes")}
                    </Text>
                  </PressableOpacity>
                </View>
              </View>
            ) : null}

            {/* Void button */}
            {onVoid && !editMode ? (
              <PressableOpacity
                onPress={onVoid}
                className="border border-red-300 rounded-xl py-3.5 items-center"
              >
                <Text className="text-red-500 font-semibold">{voidLabel}</Text>
              </PressableOpacity>
            ) : null}
          </View>
        </ResponsiveContainer>
      </SafeAreaView>
    </Modal>
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
