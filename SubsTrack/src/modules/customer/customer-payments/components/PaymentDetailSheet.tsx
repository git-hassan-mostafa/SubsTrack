import { useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { useTranslation } from "react-i18next";
import type { MonthEntry } from "@/src/core/types";
import { formatDate } from "@/src/core/utils/date";
import { confirm } from "@/src/shared/lib/confirm";
import {
  findCurrency,
  formatMoney,
  formatPaidFraction,
  paymentSnapshotCurrency,
} from "@/src/core/utils/currency";
import { getBlockRangeLabel } from "../utils/blockRangeLabel";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { useAuth } from "@/src/modules/authentication/auth";
import { RecordHistorySheet } from "@/src/modules/admin/audit";
import { SendOnWhatsAppButton, useSendInvoice } from "@/src/modules/invoicing";

interface Props {
  entry: MonthEntry | null;
  // Shown as a detail row when the sheet is opened outside a customer's own
  // screen (e.g. the tenant-wide Payments list) so the customer is identifiable.
  customerName?: string;
  // Who to send the WhatsApp invoice to. Deliberately separate from
  // `customerName` (which drives the visible row), so adding a send button to a
  // caller never adds a "Customer" row it didn't have before. Omit to hide it.
  recipient?: { name: string; phone: string | null };
  // Plan name for the invoice text — the sheet only holds the payment.
  planName?: string | null;
  onVoid?: () => void;
  onEdit?: (next: { amountPaid: number }) => void;
  editLoading?: boolean;
  onDismiss: () => void;
}

export function PaymentDetailSheet({
  entry,
  customerName,
  recipient,
  planName,
  onVoid,
  onEdit,
  editLoading,
  onDismiss,
}: Props) {
  const { t, i18n } = useTranslation();
  const payment = entry?.payment;
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const { sendPaymentInvoice } = useSendInvoice();
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
  const [editPaid, setEditPaid] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Only admins can read the audit trail (audit_logs_select RLS), so staff
  // must not see a button that would come back empty.
  const { isAdmin } = useAuth();

  // Guard only a real amount CHANGE. Not `useDirtyForm`: `editPaid` is seeded
  // from the payment when edit mode opens, so a null-baseline diff would flag
  // merely tapping "Edit" — and opening edit mode loses nothing.
  const dirty =
    editMode && editPaid != null && editPaid !== payment?.amountPaid;

  function handleOpenEdit() {
    setEditPaid(payment ? payment.amountPaid : null);
    setEditMode(true);
  }

  function handleCancelEdit() {
    setEditMode(false);
    setEditPaid(null);
  }

  function handleSaveEdit() {
    if (!payment || editPaid == null || !onEdit) return;
    if (editPaid < 0 || editPaid > payment.amountDue) return;
    // 0 would un-pay the month behind the void guard's back — explain, and keep
    // edit mode open so the amount can be corrected. Same rule as the service.
    if (editPaid === 0) {
      void confirm({
        title: t("common.not_available"),
        message: t("errors.edit_amount_zero"),
        confirmLabel: t("common.close"),
        hideCancel: true,
      });
      return;
    }
    onEdit({ amountPaid: editPaid });
    setEditMode(false);
    setEditPaid(null);
  }

  function handleDismiss() {
    setEditMode(false);
    setEditPaid(null);
    onDismiss();
  }

  const saveDisabled =
    !payment ||
    editPaid == null ||
    editPaid < 0 ||
    editPaid > payment.amountDue ||
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
    <FormSheet
      onDismiss={handleDismiss}
      dirty={dirty}
      title={
        isMultiMonth
          ? t("payments.block_receipt_title")
          : t("payments.receipt_title")
      }
      dismissLabel={t("common.close")}
    >
      {/* Success card — green for full payment, amber for partial */}
      {payment?.balance != null && payment.balance > 0 ? (
        <View className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-5 items-center mb-6">
          <View className="w-10 h-10 rounded-full bg-warning items-center justify-center mb-3">
            <Text fontWeight="Bold" className="text-white text-lg">
              !
            </Text>
          </View>
          {/* Paid out of due — the fraction is what makes "partial" concrete. */}
          <Text fontWeight="Bold" className="text-3xl text-amber-600">
            {formatPaidFraction(
              payment.amountPaid,
              payment.amountDue,
              source,
              source,
            )}
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
            {t("payments.balance_to_debts", {
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

      {/* Send the receipt to the customer. A voided payment is not a receipt, so
          it is never sendable. */}
      {payment && payment.voidedAt === null && recipient && !editMode ? (
        <SendOnWhatsAppButton
          phone={recipient.phone}
          label={t("invoice.send_whatsapp")}
          onPress={() =>
            void sendPaymentInvoice({
              phone: recipient.phone,
              customerName: recipient.name,
              rows: [{ payment, planName: planName ?? null }],
            })
          }
          className="mb-3"
        />
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

      {onEdit && editMode && payment ? (
        <View className="mb-3">
          {/* Amount Due is fixed once a payment is recorded — only the
                  paid amount can be adjusted here. */}
          <CurrencyInput
            label={t("payments.amount_paid_label")}
            amount={editPaid}
            currencyId={payment.currencyId}
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

      {/* Change history — admin-only, mirroring the audit_logs read policy. */}
      {isAdmin && payment && !editMode ? (
        <PressableOpacity
          onPress={() => setHistoryOpen(true)}
          className="border border-gray-200 rounded-xl py-3 items-center mb-3 flex-row justify-center gap-2"
        >
          <Ionicons name="time-outline" size={16} color={COLORS.gray600} />
          <Text className="text-gray-600 font-medium">
            {t("audit.history")}
          </Text>
        </PressableOpacity>
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

      {historyOpen && payment ? (
        <RecordHistorySheet
          table="payments"
          recordId={payment.id}
          subtitle={entry?.label}
          onDismiss={() => setHistoryOpen(false)}
        />
      ) : null}
    </FormSheet>
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
