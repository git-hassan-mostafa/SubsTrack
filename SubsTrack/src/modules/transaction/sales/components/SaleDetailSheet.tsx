import { useRef, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  FormSheet,
  type SheetScrollTo,
} from "@/src/shared/components/FormSheet";
import { toActionMenuItems } from "@/src/shared/lib/menuActions";
import { SALE_ACTION_ICONS } from "../hooks/saleActionIcons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { CARD_SURFACE, COLORS } from "@/src/shared/constants";
import type { Collection, Sale, SaleItem } from "@shared/core/types";
import {
  findCurrency,
  formatMoney,
  formatPaidFraction,
  snapshotCurrency,
} from "@shared/core/utils/currency";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import { saleTitle } from "@shared/core/utils/receiptId";
import {
  saleInfoRows,
  saleReceiptActions,
  saleReceiptFacts,
  saleVoidTarget,
} from "@shared/modules/transaction/sales/utils/saleView";
import { useUserNames } from "@shared/shared/hooks/useUserNames";
import { SendOnWhatsAppButton, useSendInvoice } from "@/src/modules/invoicing";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { BillHero, BillHistorySheet, BillPaymentsList } from "@/src/modules/ledger";
import { billLook } from "@shared/modules/ledger/utils/billState";
import type { SaleVoidResult } from "@shared/modules/transaction/sales/utils/types";
import { SaleBulkVoidSheet } from "./SaleBulkVoidSheet";

interface Props {
  sale: Sale | null;
  onDismiss: () => void;
  onVoided?: (result: SaleVoidResult) => void;
  onEdit?: (sale: Sale) => void;
  onChanged?: (voided: Collection, replacement?: Collection) => void;
}

export function SaleDetailSheet({
  sale,
  onDismiss,
  onVoided,
  onEdit,
  onChanged,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const { sendSaleInvoice } = useSendInvoice();
  const { isAdmin } = useAuth();
  const userName = useUserNames();

  const [voidMode, setVoidMode] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollBody = useRef<SheetScrollTo | null>(null);

  if (!sale) return null;

  const source = snapshotCurrency(sale, currencies);
  const target = findCurrency(currencies, displayCurrencyId);
  const fmtSource = (v: number) => formatMoney(v, source, source);
  const fmtTarget = (v: number) => formatMoney(v, source, target);
  const showEquivalent = (source?.id ?? null) !== (target?.id ?? null);

  const facts = saleReceiptFacts(sale);
  const { voided, writtenOff } = facts;
  const partiallyPaid = facts.partlyPaid;
  const totalSourceLabel = fmtSource(sale.totalAmount);
  const heroSourceLabel = partiallyPaid
    ? formatPaidFraction(sale.amountPaid, sale.totalAmount, source, source)
    : totalSourceLabel;
  const state = billLook(facts.status);
  const menuActions = voidMode
    ? []
    : toActionMenuItems(saleReceiptActions(sale, { isAdmin }), t, {
        icons: SALE_ACTION_ICONS,
        run: {
          edit: onEdit ? () => onEdit(sale) : undefined,
          history: () => setHistoryOpen(true),
          void: onVoided
            ? () => {
                setVoidMode(true);
                scrollBody.current?.(0);
              }
            : undefined,
        },
      });
  const items = sale.items;
  const multipleItems = items.length > 1;
  const itemsLabel = multipleItems
    ? t("sales.items_count", { count: items.length })
    : sale.itemsSummary;
  const remaining = sale.totalAmount - sale.amountPaid;
  const showTotals = multipleItems || partiallyPaid;
  const infoRows = saleInfoRows(sale, t, userName).filter((row) => !!row.value);
  const totalsOutsideItems = items.length === 0 && partiallyPaid;

  return (
    <FormSheet
      onDismiss={onDismiss}
      title={t("sales.receipt_title")}
      subject={sale.customer?.name ?? t("sales.walk_in")}
      menuActions={menuActions}
      scrollRef={scrollBody}
    >
      <BillHero
        state={state}
        amount={voided ? totalSourceLabel : heroSourceLabel}
        approx={showEquivalent ? `≈ ${fmtTarget(sale.totalAmount)}` : null}
        caption={itemsLabel}
        note={
          writtenOff && sale.amountPaid > 0
            ? t("ledger.written_off_kept", {
                amount: fmtSource(sale.amountPaid),
              })
            : null
        }
      />

      {voidMode ? (
        <SaleBulkVoidSheet
          {...saleVoidTarget([sale])}
          onVoided={(result) => {
            setVoidMode(false);
            onVoided?.(result);
            onDismiss();
          }}
          onDismiss={() => setVoidMode(false)}
        />
      ) : null}

      {partiallyPaid ? (
        <View className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4">
          <Text className="text-sm text-amber-700">
            {t("sales.partial_debt_notice")}
          </Text>
        </View>
      ) : null}

      {items.length > 0 ? (
        <View className={`${CARD_SURFACE} overflow-hidden mb-4`}>
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

          {showTotals ? (
            <TotalsFooter
              total={totalSourceLabel}
              paid={partiallyPaid ? fmtSource(sale.amountPaid) : null}
              remaining={partiallyPaid ? fmtSource(remaining) : null}
            />
          ) : null}
        </View>
      ) : null}

      {totalsOutsideItems ? (
        <View className={`${CARD_SURFACE} overflow-hidden mb-4`}>
          <TotalsFooter
            total={totalSourceLabel}
            paid={fmtSource(sale.amountPaid)}
            remaining={fmtSource(remaining)}
          />
        </View>
      ) : null}

      {sale.chargeId ? (
        <View className="mb-4">
          <BillPaymentsList
            chargeId={sale.chargeId}
            snapshot={sale}
            visible
            billVoided={voided}
            recipient={
              sale.customer
                ? { name: sale.customer.name, phone: sale.customer.phoneNumber }
                : null
            }
            onChanged={onChanged}
          />
        </View>
      ) : null}

      <View className={`${CARD_SURFACE} overflow-hidden mb-4`}>
        {infoRows.map((row, i) => (
          <Row
            key={row.key}
            label={row.label}
            value={row.value ?? ""}
            valueColor={
              row.key === "void_reason" ? "text-red-600" : undefined
            }
            last={i === infoRows.length - 1}
          />
        ))}
      </View>

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

      {historyOpen ? (
        <BillHistorySheet
          targets={[{ table: "sales", recordId: sale.id }]}
          chargeId={sale.chargeId}
          subtitle={saleTitle(sale.id, sale.itemsSummary)}
          onDismiss={() => setHistoryOpen(false)}
        />
      ) : null}

      <View className="h-8" />
    </FormSheet>
  );
}

// Its own component because an itemless sale has no items card to sit in (#142).
function TotalsFooter({
  total,
  paid,
  remaining,
}: {
  total: string;
  paid: string | null;
  remaining: string | null;
}) {
  const { t } = useTranslation();
  return (
    <View className="bg-gray-50 px-4 py-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm text-gray-500">{t("sales.total_label")}</Text>
        <Text fontWeight="Bold" className="text-base text-gray-900">
          {total}
        </Text>
      </View>
      {paid != null && remaining != null ? (
        <>
          <View className="flex-row items-center justify-between mt-2">
            <Text className="text-xs text-gray-400">
              {t("sales.paid_label")}
            </Text>
            <Text fontWeight="SemiBold" className="text-xs text-gray-700">
              {paid}
            </Text>
          </View>
          <View className="flex-row items-center justify-between mt-1">
            <Text className="text-xs text-amber-600">
              {t("sales.remaining_label")}
            </Text>
            <Text fontWeight="SemiBold" className="text-xs text-amber-600">
              {remaining}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

// A service line has a tool icon and no count: labour is one job at one price.
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
        fontWeight="SemiBold"
        className={`text-sm flex-1 ms-4 text-right ${valueColor}`}
      >
        {value}
      </Text>
    </View>
  );
}
