import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import {
  FormSheet,
  type SheetScrollTo,
} from "@/src/shared/components/FormSheet";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { Input } from "@/src/shared/components/Input";
import { digitsOnly } from "@shared/core/utils/inputText";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { confirm } from "@shared/shared/lib/confirm";
import { useHistoryDoor } from "@/src/modules/admin/audit";
import { COLORS } from "@/src/shared/constants";
import { formatDateTime } from "@shared/core/utils/date";
import type { Product, StockMovement, StockReason } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useProductSlice } from "@shared/state/hooks/useProductSlice";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useUserNames } from "@shared/shared/hooks/useUserNames";
import { useStockEntryForm } from "@shared/modules/admin/products/hooks/useStockEntryForm";
import {
  signedQuantity,
  stockEntryActions,
  stockEntryCost,
  stockEntryLabel,
  type StockEntryActionKey,
} from "@shared/modules/admin/products/utils/stockText";
import { toActionMenuItems, type Glyph } from "@/src/shared/lib/menuActions";
import { useStockMovements } from "@shared/modules/admin/products/hooks/useStockMovements";

interface Props {
  product: Product;
  onDismiss: () => void;
}

const REASON_ICON: Record<StockReason, keyof typeof Ionicons.glyphMap> = {
  initial: "flag-outline",
  restock: "add-circle-outline",
  adjustment: "create-outline",
  sale: "cart-outline",
};

const STOCK_ENTRY_ICONS: Record<StockEntryActionKey, Glyph> = {
  edit: "create-outline",
  history: "time-outline",
  revert: "arrow-undo-outline",
};

// A manual change only ADDS; a wrong entry is fixed on itself — see gotcha #94.
export function ProductStockSheet({ product, onDismiss }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userName = useUserNames();
  const addStock = useProductSlice((s) => s.addStock);
  const updateStockMovement = useProductSlice((s) => s.updateStockMovement);
  const revertStockMovement = useProductSlice((s) => s.revertStockMovement);
  const loading = useProductSlice((s) => s.loading);
  const error = useProductSlice((s) => s.error);
  const clearError = useProductSlice((s) => s.clearError);
  const onHand = useProductSlice(
    (s) =>
      s.items.find((p) => p.id === product.id)?.stockOnHand ??
      product.stockOnHand,
  );

  const currencies = useCurrencySlice((s) => s.items);
  const form = useStockEntryForm(product, currencies);
  const { editing, adding, costEffect, costCurrency } = form;

  const { history, reload: loadHistory } = useStockMovements(product.id);
  const [menuFor, setMenuFor] = useState<StockMovement | null>(null);
  const recordHistory = useHistoryDoor("stock_movements");
  const scrollBody = useRef<SheetScrollTo | null>(null);

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  const projected = form.projectedStock(onHand);

  function startEdit(m: StockMovement) {
    form.startEdit(m);
    clearError();
    scrollBody.current?.(0);
  }

  async function handleRevert(m: StockMovement) {
    await confirm({
      title: t("products.revert_stock_title"),
      message: t("products.revert_stock_message", {
        entry: stockEntryLabel(t, m),
      }),
      confirmLabel: t("products.revert_stock_confirm"),
      destructive: true,
      onConfirm: async () => {
        if ((await revertStockMovement(m.id, user?.id ?? null)) === null)
          return;
        if (editing?.id === m.id) form.reset();
        await loadHistory();
      },
    });
  }

  function buildMenuActions(m: StockMovement | null): ActionMenuItem[] {
    if (!m) return [];
    return toActionMenuItems(stockEntryActions(m), t, {
      icons: STOCK_ENTRY_ICONS,
      run: {
        edit: () => startEdit(m),
        history: () => recordHistory.open(m.id, product.name),
        revert: () => void handleRevert(m),
      },
    });
  }

  async function handleSubmit() {
    if (!user || !form.validQuantity) return;
    const cost = { unitCost: form.unitCost, currency: costCurrency };
    if (editing) {
      const saved = await updateStockMovement(editing.id, {
        quantity: form.parsed,
        note: form.note,
        cost,
      });
      if (saved === null) return;
      form.reset();
      await loadHistory();
      return;
    }
    const saved = await addStock(
      product.id,
      user.tenantId,
      form.parsed,
      form.note,
      user.id,
      cost,
    );
    if (saved === null) return;
    onDismiss();
  }

  return (
    <FormSheet
      onDismiss={onDismiss}
      dirty={form.dirty}
      title={t("products.adjust_stock_title")}
      scrollRef={scrollBody}
    >
      {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

      <View className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 mb-5">
        <Text className="text-xs text-gray-400">{product.name}</Text>
        <Text
          fontWeight="Bold"
          className={`text-3xl mt-1 ${onHand > 0 ? "text-gray-900" : "text-danger"}`}
        >
          {onHand}
        </Text>
        <Text className="text-xs text-gray-400 mt-0.5">
          {t("products.stock_on_hand")}
        </Text>
      </View>

      {editing ? (
        <View className="mb-4 flex-row rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <Ionicons name="create-outline" size={16} color={COLORS.primary} />
          <View className="flex-1 ms-2">
            <Text fontWeight="SemiBold" className="text-sm text-primary">
              {t("products.editing_entry")}
            </Text>
            <Text className="text-xs text-gray-600 mt-0.5">
              {`${t(`products.stock_reason_${editing.reason}`)} · ${signedQuantity(
                editing.quantityDelta,
              )} · ${formatDateTime(editing.occurredAt)}`}
            </Text>
            <Text className="text-xs text-gray-500 mt-1">
              {t("products.editing_entry_hint")}
            </Text>
          </View>
          <PressableOpacity onPress={form.reset} hitSlop={8} className="ms-1">
            <Ionicons name="close" size={18} color={COLORS.gray500} />
          </PressableOpacity>
        </View>
      ) : null}

      <Input
        label={t("products.stock_quantity_label") + " *"}
        value={form.quantity}
        onChangeText={form.changeQuantity}
        sanitize={digitsOnly}
        keyboardType="number-pad"
        placeholder="0"
        onFocus={clearError}
      />

      <View className="flex-row items-end gap-3">
        <View className="flex-1">
          <CurrencyInput
            label={t("products.cost_per_unit_label")}
            amount={form.unitCost}
            currencyId={form.costCurrencyId}
            onChange={form.changeUnitCost}
            currencies={currencies}
            placeholder="0.00"
            onFocus={clearError}
          />
        </View>
        <View className="flex-1">
          <CurrencyInput
            label={t("products.total_cost_label")}
            amount={form.totalCost}
            currencyId={form.costCurrencyId}
            onChange={form.changeTotalCost}
            currencies={currencies}
            placeholder="0.00"
            lockCurrency
            onFocus={clearError}
          />
        </View>
      </View>
      {costEffect != null ? (
        <Text
          className={`-mt-2 mb-4 text-xs ${adding ? "text-amber-700" : "text-green-700"}`}
        >
          {t(
            adding
              ? "products.total_cost_adds_note"
              : "products.total_cost_back_note",
            { amount: formatMoney(costEffect, costCurrency, costCurrency) },
          )}
        </Text>
      ) : null}

      <Input
        label={t("products.stock_note_label")}
        value={form.note}
        onChangeText={form.setNote}
        placeholder={t("products.stock_note_placeholder")}
      />

      {projected != null && projected < 0 ? (
        <View className="mb-4 flex-row rounded-xl bg-amber-50 px-3 py-2">
          <Ionicons
            name="alert-circle-outline"
            size={15}
            color={COLORS.warning}
          />
          <Text className="flex-1 ms-2 text-xs text-amber-800">
            {t("products.stock_goes_negative", { value: projected })}
          </Text>
        </View>
      ) : null}

      <Button
        label={t(
          editing ? "products.save_stock_changes" : "products.save_stock",
        )}
        onPress={handleSubmit}
        loading={loading}
        disabled={!form.validQuantity || loading}
        fullWidth
      />

      <View className="flex-row items-center justify-between mt-8 mb-2">
        <Text fontWeight="SemiBold" className="text-base text-gray-900">
          {t("products.stock_history")}
        </Text>
        {history.length > 0 ? (
          <Text className="text-xs text-gray-400">
            {t("products.stock_history_count", { count: history.length })}
          </Text>
        ) : null}
      </View>

      {history.length === 0 ? (
        <View className="rounded-2xl border border-dashed border-gray-200 px-4 py-6 items-center">
          <Ionicons name="time-outline" size={22} color={COLORS.gray300} />
          <Text className="text-sm text-gray-400 mt-2 text-center">
            {t("products.stock_history_empty")}
          </Text>
        </View>
      ) : (
        <View className="rounded-2xl border border-gray-100 overflow-hidden">
          {history.map((m, i) => {
            const added = m.quantityDelta > 0;
            const voided = m.voidedAt !== null;
            const cost = stockEntryCost(m, currencies);
            const hasMenu = stockEntryActions(m).length > 0;
            const byName = userName(m.recordedByUserId);
            return (
              <View
                key={m.id}
                className={`flex-row px-3 py-3 ${i > 0 ? "border-t border-gray-100" : ""} ${
                  editing?.id === m.id
                    ? "bg-indigo-50"
                    : voided
                      ? "bg-gray-50"
                      : "bg-white"
                }`}
              >
                <View
                  className={`w-8 h-8 rounded-xl items-center justify-center me-3 ${
                    voided ? "bg-gray-100" : added ? "bg-green-50" : "bg-red-50"
                  }`}
                >
                  <Ionicons
                    name={REASON_ICON[m.reason]}
                    size={15}
                    color={
                      voided
                        ? COLORS.gray400
                        : added
                          ? COLORS.success
                          : COLORS.danger
                    }
                  />
                </View>

                <View className="flex-1">
                  <View className="flex-row items-center justify-between">
                    <Text
                      fontWeight="SemiBold"
                      numberOfLines={1}
                      className={`flex-1 pe-2 text-sm ${
                        voided ? "text-gray-400 line-through" : "text-gray-900"
                      }`}
                    >
                      {t(`products.stock_reason_${m.reason}`)}
                    </Text>
                    <Text
                      fontWeight="Bold"
                      className={`text-sm ${
                        voided
                          ? "text-gray-300 line-through"
                          : added
                            ? "text-success"
                            : "text-danger"
                      }`}
                    >
                      {signedQuantity(m.quantityDelta)}
                    </Text>
                    {hasMenu ? (
                      <PressableOpacity
                        onPress={() => setMenuFor(m)}
                        hitSlop={8}
                        className="ps-2"
                      >
                        <Ionicons
                          name="ellipsis-vertical"
                          size={15}
                          color={COLORS.gray400}
                        />
                      </PressableOpacity>
                    ) : null}
                  </View>

                  <Text className="text-xs text-gray-500 mt-0.5">
                    {formatDateTime(m.occurredAt)}
                  </Text>

                  {cost ? (
                    <Text
                      className={`text-xs mt-0.5 ${cost.refund ? "text-green-700" : "text-gray-500"}`}
                    >
                      {t(
                        cost.refund
                          ? "products.stock_cost_back_line"
                          : "products.stock_cost_line",
                        { amount: cost.amount },
                      )}
                    </Text>
                  ) : null}

                  {byName ? (
                    <View className="flex-row items-center mt-1">
                      <Ionicons
                        name="person-outline"
                        size={11}
                        color={COLORS.gray400}
                      />
                      <Text
                        numberOfLines={1}
                        className="text-xs text-gray-400 ms-1 flex-1"
                      >
                        {byName}
                      </Text>
                    </View>
                  ) : null}

                  {m.note ? (
                    <Text
                      numberOfLines={2}
                      className="text-xs text-gray-500 mt-1"
                    >
                      {m.note}
                    </Text>
                  ) : null}

                  {voided ? (
                    <View className="flex-row mt-1.5">
                      <View className="rounded-md bg-gray-200 px-1.5 py-0.5">
                        <Text className="text-[10px] text-gray-600">
                          {t("products.stock_reversed")}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View className="h-24" />

      <ActionMenu
        visible={menuFor !== null}
        title={
          menuFor ? t(`products.stock_reason_${menuFor.reason}`) : undefined
        }
        actions={buildMenuActions(menuFor)}
        onDismiss={() => setMenuFor(null)}
      />
      {recordHistory.sheet}
    </FormSheet>
  );
}
