import { useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { useTranslation } from "react-i18next";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { Input } from "@/src/shared/components/Input";
import { COLORS } from "@/src/shared/constants";
import type { Sale, SaleItem } from "@/src/core/types";
import {
  findCurrency,
  formatMoney,
  formatPaidFraction,
  paymentSnapshotCurrency,
} from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { formatDate } from "@/src/core/utils/date";
import { useDirtyForm } from "@/src/shared/hooks/useDirtyForm";
import { SendOnWhatsAppButton, useSendInvoice } from "@/src/modules/invoicing";
import { useAuth } from "@/src/modules/authentication/auth";
import { RecordHistorySheet } from "@/src/modules/admin/audit";

interface Props {
  sale: Sale | null;
  onDismiss: () => void;
  onVoid?: (reason: string) => void;
  // Opens the sale form on this sale. Omitted where correcting one makes no
  // sense; never offered for a voided sale.
  onEdit?: (sale: Sale) => void;
  voidLoading?: boolean;
}

export function SaleDetailSheet({
  sale,
  onDismiss,
  onVoid,
  onEdit,
  voidLoading,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";
  const { sendSaleInvoice } = useSendInvoice();
  const { isAdmin } = useAuth();

  const [voidMode, setVoidMode] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  // Only a typed reason is worth guarding — opening void mode loses nothing.
  const dirty = useDirtyForm({ voidReason });

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
    ? formatPaidFraction(sale.amountPaid, sale.totalAmount, source, source)
    : totalSourceLabel;
  const receiptId = sale.id.slice(-6).toUpperCase();
  const items = sale.items;
  const multipleItems = items.length > 1;
  // The frozen summary gets long with many products — the list below carries the
  // detail, so the hero only needs a count once there is more than one line.
  const itemsLabel = multipleItems
    ? t("sales.items_count", { count: items.length })
    : sale.itemsSummary;
  const remaining = sale.totalAmount - sale.amountPaid;
  const showTotals = multipleItems || partiallyPaid;

  return (
    <FormSheet
      onDismiss={handleDismiss}
      dirty={dirty}
      title={t("sales.receipt_title")}
      dismissLabel={t("common.close")}
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
          <Text className="text-sm text-gray-400 mt-1">{itemsLabel}</Text>
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
          <Text className="text-sm text-gray-400 mt-1">{itemsLabel}</Text>
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

      {/* Products card — one row per line, with a totals footer */}
      {items.length > 0 ? (
        <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4">
          <View className="flex-row items-center bg-gray-50 px-4 py-3 border-b border-gray-100">
            <Ionicons name="cart-outline" size={16} color={COLORS.gray500} />
            <Text
              fontWeight="SemiBold"
              className="ms-2 flex-1 text-sm text-gray-700"
            >
              {t("sales.items_section_title")}
            </Text>
            {multipleItems ? (
              <View className="rounded-full bg-gray-200 px-2 py-0.5">
                <Text fontWeight="SemiBold" className="text-xs text-gray-600">
                  {items.length}
                </Text>
              </View>
            ) : null}
          </View>

          {items.map((it, i) => (
            <ItemRow
              key={it.id}
              item={it}
              index={i}
              numbered={multipleItems}
              format={fmtSource}
              divider={i < items.length - 1 || showTotals}
            />
          ))}

          {/* Totals — redundant noise on a single fully-paid line, so only shown
              when it adds information. */}
          {showTotals ? (
            <View className="bg-gray-50 px-4 py-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-gray-500">
                  {t("sales.total_label")}
                </Text>
                <Text fontWeight="Bold" className="text-base text-gray-900">
                  {totalSourceLabel}
                </Text>
              </View>
              {partiallyPaid ? (
                <>
                  <View className="flex-row items-center justify-between mt-2">
                    <Text className="text-xs text-gray-400">
                      {t("sales.paid_label")}
                    </Text>
                    <Text className="text-xs font-semibold text-gray-700">
                      {fmtSource(sale.amountPaid)}
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-between mt-1">
                    <Text className="text-xs text-amber-600">
                      {t("sales.remaining_label")}
                    </Text>
                    <Text className="text-xs font-semibold text-amber-600">
                      {fmtSource(remaining)}
                    </Text>
                  </View>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Detail rows card */}
      <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4">
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

      {/* Send the receipt to the customer. A voided sale is not a receipt, so it
          is never sendable. */}
      {!voided && !voidMode ? (
        <SendOnWhatsAppButton
          phone={sale.customer?.phoneNumber}
          reason={sale.customer ? undefined : t("invoice.no_customer")}
          label={t("invoice.send_whatsapp")}
          onPress={() =>
            void sendSaleInvoice({
              phone: sale.customer?.phoneNumber ?? null,
              customerName: sale.customer?.name ?? null,
              sale,
            })
          }
          className="mb-4"
        />
      ) : null}

      {/* Correct the sale. A voided sale is a closed record — void is final, so
          the only way back is a new sale. */}
      {!voided && !voidMode && onEdit ? (
        <PressableOpacity
          onPress={() => onEdit(sale)}
          className="border border-gray-200 rounded-xl py-3 items-center mb-4 flex-row justify-center gap-2"
        >
          <Ionicons name="create-outline" size={16} color={COLORS.primary} />
          <Text className="text-primary font-medium">
            {t("sales.edit_sale")}
          </Text>
        </PressableOpacity>
      ) : null}

      {/* Change history — admin-only, mirroring the audit_logs read policy. */}
      {isAdmin && !voidMode ? (
        <PressableOpacity
          onPress={() => setHistoryOpen(true)}
          className="border border-gray-200 rounded-xl py-3 items-center mb-4 flex-row justify-center gap-2"
        >
          <Ionicons name="time-outline" size={16} color={COLORS.gray600} />
          <Text className="text-gray-600 font-medium">{t("audit.history")}</Text>
        </PressableOpacity>
      ) : null}

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

      {historyOpen ? (
        <RecordHistorySheet
          table="sales"
          recordId={sale.id}
          subtitle={sale.itemsSummary}
          onDismiss={() => setHistoryOpen(false)}
        />
      ) : null}

      <View className="h-8" />
    </FormSheet>
  );
}

// One line: name + "qty × unit price" on the left, line total on the right. A
// service line is marked with a small icon, so a receipt shows at a glance which
// part of the bill was labour rather than goods.
function ItemRow({
  item,
  index,
  numbered,
  format,
  divider,
}: {
  item: SaleItem;
  index: number;
  numbered: boolean;
  format: (v: number) => string;
  divider: boolean;
}) {
  const isService = item.lineType === "service";
  return (
    <View
      className={`flex-row items-center px-4 py-3 ${divider ? "border-b border-gray-100" : ""}`}
    >
      {numbered ? (
        <View className="w-6 h-6 rounded-full bg-gray-100 items-center justify-center me-3">
          <Text fontWeight="SemiBold" className="text-xs text-gray-500">
            {index + 1}
          </Text>
        </View>
      ) : null}
      <View className="flex-1 pe-3">
        <View className="flex-row items-center">
          {isService ? (
            <Ionicons
              name="construct-outline"
              size={13}
              color={COLORS.primary}
              style={{ marginEnd: 5 }}
            />
          ) : null}
          <Text
            fontWeight="SemiBold"
            className="flex-1 text-sm text-gray-900"
            numberOfLines={2}
          >
            {item.itemNameSnapshot}
          </Text>
        </View>
        {/* A service has no count — "1 × $25" next to a $25 total reads as noise */}
        {isService ? null : (
          <Text className="text-xs text-gray-400 mt-0.5">
            {item.quantity} × {format(item.unitAmount)}
          </Text>
        )}
      </View>
      <Text fontWeight="SemiBold" className="text-sm text-gray-900">
        {format(item.lineTotal)}
      </Text>
    </View>
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
