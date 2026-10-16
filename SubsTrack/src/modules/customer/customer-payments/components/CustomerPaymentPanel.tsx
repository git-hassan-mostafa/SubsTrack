import { useState } from "react";
import {
  ActivityIndicator,
  InteractionManager,
  ScrollView,
  View,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { useHorizontalSwipe } from "@/src/shared/hooks/useHorizontalSwipe";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { FilterChip } from "@/src/shared/components/FilterChip";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { InlineSelectionToolbar } from "@/src/shared/components/InlineSelectionToolbar";
import type { SelectionAction } from "@/src/shared/components/PageHeader";
import {
  toActionMenuItems,
  toSelectionActions,
  type Glyph,
} from "@/src/shared/lib/menuActions";
import type { Collection, Customer, MonthEntry } from "@shared/core/types";
import { billingMonthLabel } from "@shared/core/utils/billingMonth";
import { CARD_SURFACE, COLORS } from "@/src/shared/constants";
import { lineLabel } from "@shared/modules/customer/customer-plans/utils/lineLabel";
import { useCustomerMonthGrid } from "@shared/modules/customer/customer-payments/hooks/useCustomerMonthGrid";
import type { LineIndicator } from "@shared/modules/customer/customer-payments/utils/gridSummary";
import type {
  MonthMenuKey,
  MonthSelectionKey,
} from "@shared/modules/customer/customer-payments/utils/monthActions";
import { MonthGrid } from "./MonthGrid";
import { SkipMonthSheet } from "./SkipMonthSheet";
import {
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelectionBackHandler";
import { useSendInvoice, WhatsAppComboIcon } from "@/src/modules/invoicing";
import { customerRecipient } from "@shared/modules/invoicing/utils/invoiceRecipient";
import {
  BillHistorySheet,
  BillSheet,
  useCollectSheet,
  VoidConfirmDialog,
} from "@/src/modules/ledger";

interface CustomerPaymentPanelProps {
  customer: Customer;
  refreshToken?: number;
}

const INDICATOR_DOT: Record<LineIndicator, string> = {
  paid: "bg-green-500",
  unpaid: "bg-red-500",
};

const MENU_ICONS: Record<MonthMenuKey, Glyph> = {
  open: "open-outline",
  "quick-pay": "flash-outline",
  "quick-pay-whatsapp": "logo-whatsapp",
  "collect-part": "cash-outline",
  skip: "play-skip-forward-outline",
  unskip: "refresh-outline",
  bill: "receipt-outline",
  "collect-remaining": "cash-outline",
  history: "time-outline",
  "write-off": "remove-circle-outline",
  "revert-write-off": "arrow-undo-outline",
  "void-month": "close-circle-outline",
};

const SELECTION_ICONS: Record<MonthSelectionKey, Glyph> = {
  pay: "cash-outline",
  "pay-whatsapp": "logo-whatsapp",
  skip: "play-skip-forward-outline",
  unskip: "refresh-outline",
  "write-off": "remove-circle-outline",
};

// The deep-linked collect sheet waits for the screen push to finish.
function afterInteractions(run: () => void): () => void {
  const task = InteractionManager.runAfterInteractions(run);
  return () => task.cancel();
}

function payAndSendIcon(size: number) {
  return <WhatsAppComboIcon variant="pay" size={size} />;
}

export function CustomerPaymentPanel({
  customer,
  refreshToken = 0,
}: CustomerPaymentPanelProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { quickPay } = useLocalSearchParams<{ quickPay?: string }>();
  const { canSend, sendCollectionInvoice } = useSendInvoice();
  const [menuEntry, setMenuEntry] = useState<MonthEntry | null>(null);
  const sendable = canSend(customer.phoneNumber);

  const collectSheet = useCollectSheet({
    onCollected: (collection) => void grid.collected([collection]),
  });

  const grid = useCustomerMonthGrid({
    customer,
    refreshToken,
    canSend: sendable,
    openCollect: (items, single) =>
      single
        ? collectSheet.openOne(customer.name, items[0])
        : collectSheet.open(customer.id, customer.name, items),
    sendReceipt: async (collection: Collection) => {
      if (!sendable) return;
      await sendCollectionInvoice({
        phone: customer.phoneNumber,
        customerName: customer.name,
        collection,
      });
    },
    quickPayLink: {
      requested: quickPay === "1",
      consume: () => router.setParams({ quickPay: undefined }),
      schedule: afterInteractions,
    },
  });
  const { selection, selectedLine, lines, year } = grid;

  useSelectionBackHandler(selection.active, selection.clear);

  const yearSwipe = useHorizontalSwipe({
    onNext: () => grid.stepYear(1),
    onPrev: () => grid.stepYear(-1),
  });

  const menuActions: ActionMenuItem[] = menuEntry
    ? toActionMenuItems(grid.menuItems(menuEntry), t, {
        icons: MENU_ICONS,
        renderIcons: { "quick-pay-whatsapp": payAndSendIcon },
        run: (key) => grid.runMenu(key, menuEntry),
      })
    : [];

  const selectionActions: SelectionAction[] = toSelectionActions(
    selection.items,
    t,
    {
      icons: SELECTION_ICONS,
      renderIcons: { "pay-whatsapp": payAndSendIcon },
      disabled: selection.busy,
      run: (key) => selection.run(key),
    },
  );

  const error =
    grid.paymentsError ??
    (collectSheet.sheet || grid.voidRequest ? null : grid.ledgerError);
  const banner = grid.unpaidBanner;
  const bill = grid.bill;
  const voidRequest = grid.voidRequest;

  if (lines.length === 0) {
    return (
      <View className={`${CARD_SURFACE} mx-4 mt-4 px-4 py-8 items-center`}>
        <Ionicons name="albums-outline" size={28} color={COLORS.gray400} />
        <Text className="text-sm text-gray-500 mt-2 text-center">
          {t("subscriptions.empty")}
        </Text>
      </View>
    );
  }

  return (
    <>
      {error ? (
        <View className="px-4 mt-4">
          <ErrorBanner message={error} onDismiss={grid.clearErrors} />
        </View>
      ) : null}

      {lines.length > 1 && (
        <View className="mx-4 mt-4">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
          >
            {lines.map((line) => {
              const isSel = line.id === selectedLine?.id;
              const dot = grid.indicatorOf(line.id);
              return (
                <View key={line.id} className={line.active ? "" : "opacity-50"}>
                  <FilterChip
                    active={isSel}
                    onPress={() => grid.selectLine(line.id)}
                    leading={
                      dot ? (
                        <View
                          className={`w-2 h-2 rounded-full ${INDICATOR_DOT[dot]}`}
                        />
                      ) : undefined
                    }
                    label={`${lineLabel(line, t("common.no_plan"))}${
                      line.active ? "" : ` · ${t("subscriptions.cancelled")}`
                    }`}
                  />
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      <GestureDetector gesture={yearSwipe}>
        <View className={`${CARD_SURFACE} mx-4 mt-3 overflow-hidden`}>
          <View className="relative">
            <View className="px-4 pt-4 pb-2">
              {selectedLine ? (
                <View className="mb-1 flex-row items-baseline">
                  <Text
                    fontWeight="SemiBold"
                    className="text-sm text-gray-700 shrink"
                    numberOfLines={1}
                  >
                    {lineLabel(selectedLine, t("common.no_plan"))}
                    {selectedLine.active
                      ? ""
                      : ` · ${t("subscriptions.cancelled")}`}
                  </Text>
                  {grid.priceLabel ? (
                    <Text
                      className="text-xs text-gray-400 ms-2"
                      numberOfLines={1}
                    >
                      · {grid.priceLabel}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <View className="flex-row items-center justify-between">
                <Text fontWeight="Bold" className="text-2xl text-gray-900">
                  {year}
                </Text>
                <View className="flex-row gap-2">
                  <PressableOpacity
                    onPress={() => grid.stepYear(-1)}
                    disabled={year <= grid.minYear}
                    containerClassName={`rounded-full bg-primary-container ${
                      year <= grid.minYear ? "opacity-40" : ""
                    }`}
                    className="w-10 h-10 items-center justify-center"
                  >
                    <DirectionalIcon
                      name="chevron-back"
                      size={20}
                      color={COLORS.primary}
                    />
                  </PressableOpacity>
                  <PressableOpacity
                    onPress={() => grid.stepYear(1)}
                    containerClassName="rounded-full bg-primary-container"
                    className="w-10 h-10 items-center justify-center"
                  >
                    <DirectionalIcon
                      name="chevron-forward"
                      size={20}
                      color={COLORS.primary}
                    />
                  </PressableOpacity>
                </View>
              </View>
              <View className="flex-row items-center flex-wrap mt-1.5 gap-1.5">
                <SummaryChip
                  value={String(grid.summary.paid)}
                  label={t("customers.year_paid")}
                />
                <SummaryChip
                  value={String(grid.summary.unpaid)}
                  label={t("customers.year_unpaid")}
                />
                {grid.summary.skipped > 0 ? (
                  <SummaryChip
                    value={String(grid.summary.skipped)}
                    label={t("payments.skip.skipped_label")}
                  />
                ) : null}
                <SummaryChip
                  value={grid.collectedLabel}
                  label={t("customers.year_collected")}
                />
              </View>
            </View>
            {selection.active ? (
              <View className="absolute inset-0 bg-white px-2 justify-center border-b border-gray-100">
                <InlineSelectionToolbar
                  count={selection.count}
                  actions={selectionActions}
                  onClose={selection.clear}
                />
              </View>
            ) : null}
          </View>

          {grid.gridPending ? (
            <View className="h-40 items-center justify-center">
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : (
            <MonthGrid
              months={grid.grid}
              block={grid.block}
              onCellPress={grid.tap}
              onCellMenu={setMenuEntry}
              loadingBillingMonth={grid.busyMonth}
              isRegular={grid.isRegular}
              selectionMode={selection.active}
              isSelected={selection.isSelected}
              onCellToggle={selection.toggle}
              onCellLongPress={selection.start}
            />
          )}
        </View>
      </GestureDetector>

      {banner ? (
        <View className="mx-4 mt-3 bg-red-50 rounded-2xl ps-4 pe-3 py-3 flex-row items-center">
          <Ionicons name="alert-circle" size={22} color={COLORS.danger} />
          <View className="flex-1 ms-3">
            <Text fontWeight="SemiBold" className="text-sm text-red-700">
              {billingMonthLabel(banner.billingMonth)} {t("dashboard.unpaid")}
            </Text>
            <Text className="text-xs text-gray-600 mt-0.5">
              {t("payments.amount_due")}
            </Text>
          </View>
          <PressableOpacity
            onPress={() => void grid.quickPay(banner)}
            disabled={grid.busyMonth === banner.billingMonth}
            rippleColor={COLORS.rippleOnDark}
            containerClassName="bg-red-600 rounded-full ms-2"
            className="min-h-10 px-4 py-2 items-center justify-center"
          >
            {grid.busyMonth === banner.billingMonth ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text fontWeight="SemiBold" className="text-white text-sm">
                {t("payments.collect")}
              </Text>
            )}
          </PressableOpacity>
        </View>
      ) : null}

      {collectSheet.sheet}

      {bill?.charge && (
        <BillSheet
          visible
          charge={bill.charge}
          label={grid.monthLabelOf(bill)}
          recipient={customerRecipient(customer)}
          onCollect={grid.collectFromBill}
          onVoidBill={async () => grid.voidFromBill()}
          onWriteOff={grid.writeOffFromBill}
          onRevertWriteOff={grid.revertWriteOff}
          onDismiss={grid.closeBill}
        />
      )}

      {voidRequest?.charge && (
        <VoidConfirmDialog
          chargeIds={[voidRequest.charge.id]}
          title={t("ledger.void_month_title")}
          message={t("ledger.void_month_message", {
            month: grid.monthLabelOf(voidRequest),
          })}
          confirmLabel={t("ledger.void_month")}
          error={grid.ledgerError}
          onClearError={grid.clearErrors}
          onConfirm={grid.confirmVoid}
          onDismiss={grid.closeVoid}
        />
      )}

      {grid.history && (
        <BillHistorySheet
          targets={grid.history.targets}
          chargeId={grid.history.chargeId}
          subtitle={grid.history.subtitle}
          onDismiss={grid.closeHistory}
        />
      )}

      {grid.skipRequest && selectedLine && (
        <SkipMonthSheet
          entries={grid.skipRequest.entries}
          mode={grid.skipRequest.mode}
          customerId={customer.id}
          line={selectedLine}
          onDone={grid.skipDone}
          onDismiss={grid.closeSkip}
        />
      )}

      <ActionMenu
        visible={menuEntry !== null}
        title={
          menuEntry
            ? `${t(`months.${menuEntry.label}`)} ${menuEntry.year}`
            : undefined
        }
        actions={menuActions}
        onDismiss={() => setMenuEntry(null)}
      />
    </>
  );
}

function SummaryChip({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-row items-center bg-gray-100 rounded-full px-2 py-0.5">
      <Text fontWeight="SemiBold" className="text-xs text-gray-900">
        {value}
      </Text>
      <Text className="text-xs text-gray-500 ms-1">{label.toLowerCase()}</Text>
    </View>
  );
}
