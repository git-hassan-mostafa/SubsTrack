import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import {
  FormSheet,
  type SheetScrollTo,
} from "@/src/shared/components/FormSheet";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { Input } from "@/src/shared/components/Input";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { confirm } from "@/src/shared/lib/confirm";
import { useRecordHistoryAction } from "@/src/modules/admin/audit";
import { COLORS } from "@/src/shared/constants";
import { formatDateTime } from "@/src/core/utils/date";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import type { Product, StockMovement, StockReason } from "@/src/core/types";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useAuth } from "@/src/modules/authentication/auth";
import { useProductSlice } from "@/src/state/hooks/useProductSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUserSlice } from "@/src/state/hooks/useUserSlice";
import { useDirtyForm } from "@/src/shared/hooks/useDirtyForm";
import productService from "../services/ProductService";

interface Props {
  product: Product;
  onDismiss: () => void;
}

// Icon per ledger reason; the tint comes from the direction, not the reason —
// older 'adjustment' rows (and every sale) go the other way.
const REASON_ICON: Record<StockReason, keyof typeof Ionicons.glyphMap> = {
  initial: "flag-outline",
  restock: "add-circle-outline",
  adjustment: "create-outline",
  sale: "cart-outline",
};

// The two cost fields fill each other at the 8 decimals `stock_movements.unit_cost`
// stores. Rounding a divided unit cost any shorter would make the saved expense
// disagree with the total that was typed (100 over 3 units -> 33.33 x 3 = 99.99).
const round8 = (n: number) => Number(n.toFixed(8));

type CostChange = { amount: number | null; currencyId: string | null };

/**
 * Adds stock to one product, and shows the recent history. Stock is never typed
 * as a total — each save appends one ledger movement, so who changed what stays
 * on the record. A manual change can only ADD: stock that never arrived, or went
 * back, is corrected on the entry itself (Edit / Revert in the history menu), so
 * the fix lands in the month the mistake was made.
 */
export function ProductStockSheet({ product, onDismiss }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";
  const users = useUserSlice((s) => s.items);
  const getUsers = useUserSlice((s) => s.getUsers);
  const addStock = useProductSlice((s) => s.addStock);
  const updateStockMovement = useProductSlice((s) => s.updateStockMovement);
  const revertStockMovement = useProductSlice((s) => s.revertStockMovement);
  const loading = useProductSlice((s) => s.loading);
  const error = useProductSlice((s) => s.error);
  const clearError = useProductSlice((s) => s.clearError);
  // Read the live value from the list so it reflects the save without a refetch.
  const onHand = useProductSlice(
    (s) =>
      s.items.find((p) => p.id === product.id)?.stockOnHand ??
      product.stockOnHand,
  );

  const currencies = useCurrencySlice((s) => s.items);

  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  // Buying stock spends money — the cost is what turns a restock into an
  // expense. Pre-filled from the product's default cost, and optional: leaving
  // it empty records the stock with no cost and adds no expense.
  const [unitCost, setUnitCost] = useState<number | null>(product.costPrice);
  // The same money the other way round: a delivery is known either as "4.50
  // each" or "45 for the lot", so both are typeable and each fills the other
  // from the quantity. Only `unitCost` is ever saved.
  const [totalCost, setTotalCost] = useState<number | null>(null);
  const [costCurrencyId, setCostCurrencyId] = useState<string | null>(
    product.costCurrencyId,
  );
  const [history, setHistory] = useState<StockMovement[]>([]);
  // The row being corrected, if any — the form doubles as the edit form, so the
  // three fields staff may fix live in one place. null = recording a new change.
  const [editing, setEditing] = useState<StockMovement | null>(null);
  const [menuFor, setMenuFor] = useState<StockMovement | null>(null);
  const recordHistory = useRecordHistoryAction("stock_movements");
  // The sheet's own scroll, so picking Edit on a history row far down the body
  // can bring the form it fills back into view.
  const scrollBody = useRef<SheetScrollTo | null>(null);
  // Which cost field was typed last. It stays as typed when the quantity
  // changes and the other one is recomputed — re-deriving the number staff just
  // entered would fight them.
  const costAnchor = useRef<"unit" | "total">("unit");

  // `history` is background-loaded, so it stays out of the dirty check, and so
  // is `costCurrencyId` (CurrencyInput self-seeds it after mount).
  const dirty = useDirtyForm({ quantity, note, unitCost, totalCost });

  // Stable across renders so the mount effect below can depend on it.
  const loadHistory = useCallback(async () => {
    try {
      setHistory(await productService.getMovements(product.id));
    } catch {
      // History is supporting detail — a failure here must not block adjusting.
    }
  }, [product.id]);

  useEffect(() => {
    clearError();
    void loadHistory();
    // History names who changed the stock. `getUsers` self-guards on the slice's
    // `loaded` flag, so this is a no-op when the list is already in memory.
    void getUsers();
    // Clear on the way out too — the product form may still be open underneath
    // and shares this slice's error, so a stock failure must not linger there.
    return clearError;
  }, [clearError, getUsers, loadHistory]);

  const parsed = Number(quantity);
  const validQuantity = Number.isInteger(parsed) && parsed > 0;
  const costCurrency = findCurrency(currencies, costCurrencyId);
  // Which way the stock moves. A new manual change only ever ADDS — stock that
  // went out is corrected on the entry itself (edit / revert), never by a second
  // row. While correcting, the direction is the row's own, so an older negative
  // entry still reads as one.
  const adding = editing ? editing.quantityDelta > 0 : true;
  // What this change is worth in money — added to Expenses when adding, taken
  // back off when the edited row was a removal. Only real once there is a
  // quantity to price.
  const costEffect =
    validQuantity && totalCost != null && totalCost > 0 ? totalCost : null;
  // Where the stock lands. Correcting a row swaps its old units for the new ones;
  // a new change just adds them. Negative stock is allowed (two offline devices
  // can both sell the last unit), so this only ever warns.
  const projected = validQuantity
    ? (editing ? onHand - editing.quantityDelta : onHand) +
      (adding ? parsed : -parsed)
    : null;

  // Both cost fields always move together: the per-unit amount is what gets
  // saved, the total is only its product with the quantity. `qty` is passed in
  // because every caller changes the quantity in the same handler.
  function applyUnitCost(unit: number | null, qty: number) {
    costAnchor.current = "unit";
    setUnitCost(unit);
    setTotalCost(unit != null && qty > 0 ? round8(unit * qty) : null);
  }

  function changeQuantity(text: string) {
    const digits = text.replace(/[^0-9]/g, "");
    setQuantity(digits);
    const qty = Number(digits);
    if (qty <= 0) return;
    // The typed field stays put; the derived one follows the new quantity.
    if (costAnchor.current === "total") {
      if (totalCost != null) setUnitCost(round8(totalCost / qty));
    } else if (unitCost != null) {
      setTotalCost(round8(unitCost * qty));
    }
  }

  function changeUnitCost({ amount, currencyId }: CostChange) {
    setCostCurrencyId(currencyId);
    // Picking a currency is not a new amount — amounts are stored as typed.
    if (amount === unitCost) return;
    applyUnitCost(amount, parsed);
  }

  function changeTotalCost({ amount }: CostChange) {
    // Also skips CurrencyInput's mount-time seed, which re-reports the amount.
    if (amount === totalCost) return;
    costAnchor.current = "total";
    setTotalCost(amount);
    if (parsed > 0)
      setUnitCost(amount == null ? null : round8(amount / parsed));
  }

  // Back to "record a new change", which is also the sheet's first-render state —
  // so a saved or abandoned edit leaves nothing for the unsaved-changes guard.
  function resetForm() {
    setEditing(null);
    setQuantity("");
    setNote("");
    // The cost and its currency travel together — the pre-filled amount is the
    // product's, so leaving the edited row's currency behind would re-price it.
    // Quantity 0: with nothing to price there is no total either.
    applyUnitCost(product.costPrice, 0);
    setCostCurrencyId(product.costCurrencyId);
  }

  function startEdit(m: StockMovement) {
    const qty = Math.abs(m.quantityDelta);
    setEditing(m);
    setQuantity(String(qty));
    applyUnitCost(m.unitCost, qty);
    setCostCurrencyId(m.currencyId);
    setNote(m.note ?? "");
    clearError();
    // The tapped row is far below the form, so go back to the top of the body —
    // otherwise the filled fields and the "Editing this entry" banner stay
    // off-screen and the action looks like it did nothing.
    scrollBody.current?.(0);
  }

  // The other correction door: the entry should never have existed. It stops
  // counting in stock and in Expenses for its OWN month, and stays in the
  // history marked reversed — see docs/features.md → Reverting a stock entry.
  async function handleRevert(m: StockMovement) {
    const ok = await confirm({
      title: t("products.revert_stock_title"),
      message: t("products.revert_stock_message", {
        entry: `${t(`products.stock_reason_${m.reason}`)} ${
          m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta
        }`,
      }),
      confirmLabel: t("products.revert_stock_confirm"),
      destructive: true,
    });
    if (!ok) return;
    if (!(await revertStockMovement(m.id, user?.id ?? null))) return;
    // The form may be filled from the row that just stopped counting.
    if (editing?.id === m.id) resetForm();
    await loadHistory();
  }

  function buildMenuActions(m: StockMovement | null): ActionMenuItem[] {
    if (!m) return [];
    const history = recordHistory.action(m.id, product.name);
    // Nothing left to correct on a reverted row — only the trail of who did it.
    if (m.voidedAt) return [history];
    return [
      {
        key: "edit",
        label: t("products.edit_stock_entry"),
        icon: "create-outline",
        onPress: () => startEdit(m),
      },
      history,
      // Destructive last, like every other card menu.
      {
        key: "revert",
        label: t("products.revert_stock_entry"),
        icon: "arrow-undo-outline",
        destructive: true,
        onPress: () => void handleRevert(m),
      },
    ];
  }

  async function handleSubmit() {
    if (!user || !validQuantity) return;
    if (editing) {
      const ok = await updateStockMovement(editing.id, {
        quantity: parsed,
        note,
        cost: { unitCost, currency: costCurrency },
      });
      if (!ok) return;
      // Stay open: the correction is only believable next to the history it fixed.
      resetForm();
      await loadHistory();
      return;
    }
    const ok = await addStock(
      product.id,
      user.tenantId,
      parsed,
      note,
      user.id,
      // Buying the stock is what makes it an expense — no cost, no expense.
      { unitCost, currency: costCurrency },
    );
    if (!ok) return;
    onDismiss();
  }

  return (
    <FormSheet
      onDismiss={onDismiss}
      dirty={dirty}
      title={t("products.adjust_stock_title")}
      dismissLabel={t("common.close")}
      scrollRef={scrollBody}
    >
      {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

      {/* Current stock */}
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

      {/* The banner only shows while a row is being corrected; a new change needs
          no chrome, since adding is the only thing it can do. */}
      {editing ? (
        <View className="mb-4 flex-row rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <Ionicons name="create-outline" size={16} color={COLORS.primary} />
          <View className="flex-1 ms-2">
            <Text fontWeight="SemiBold" className="text-sm text-primary">
              {t("products.editing_entry")}
            </Text>
            <Text className="text-xs text-gray-600 mt-0.5">
              {`${t(`products.stock_reason_${editing.reason}`)} · ${
                adding ? `+${editing.quantityDelta}` : editing.quantityDelta
              } · ${formatDateTime(editing.occurredAt, locale)}`}
            </Text>
            <Text className="text-xs text-gray-500 mt-1">
              {t("products.editing_entry_hint")}
            </Text>
          </View>
          <PressableOpacity onPress={resetForm} hitSlop={8} className="ms-1">
            <Ionicons name="close" size={18} color={COLORS.gray500} />
          </PressableOpacity>
        </View>
      ) : null}

      <Input
        label={t("products.stock_quantity_label") + " *"}
        value={quantity}
        onChangeText={changeQuantity}
        keyboardType="number-pad"
        placeholder="0"
        onFocus={clearError}
      />

      {/* What the stock cost: an expense in the month of the buy, or none at all
          when left empty. Per unit or per delivery, whichever the invoice says —
          each fills the other from the quantity. */}
      <View className="flex-row items-end gap-3">
        <View className="flex-1">
          <CurrencyInput
            label={t("products.cost_per_unit_label")}
            amount={unitCost}
            currencyId={costCurrencyId}
            onChange={changeUnitCost}
            currencies={currencies}
            placeholder="0.00"
            onFocus={clearError}
          />
        </View>
        <View className="flex-1">
          <CurrencyInput
            label={t("products.total_cost_label")}
            amount={totalCost}
            currencyId={costCurrencyId}
            onChange={changeTotalCost}
            currencies={currencies}
            placeholder="0.00"
            // One cost, one currency — the picker lives on the per-unit field.
            lockCurrency
            onFocus={clearError}
          />
        </View>
      </View>
      {/* Names what the money does, since the amount is already in the field
          above — green for the credit an edited removal gives back. */}
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
        value={note}
        onChangeText={setNote}
        placeholder={t("products.stock_note_placeholder")}
      />

      {/* Not a blocker: the DB accepts negative stock on purpose, so staff are told
          what the correction does and decide. */}
      {projected != null && projected < 0 ? (
        <View className="mb-4 flex-row rounded-xl bg-amber-50 px-3 py-2">
          <Ionicons
            name="alert-circle-outline"
            size={15}
            color={COLORS.warning}
          />
          <Text className="flex-1 ms-2 text-xs text-amber-800">
            {/* `value`, not `count` — a negative count would go through i18next's
                plural rules and pick a form that doesn't exist. */}
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
        disabled={!validQuantity || loading}
        fullWidth
      />

      {/* History */}
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
            // A sale's rows belong to the sale (it swaps them when edited), so they
            // open no menu at all. A reverted row still does: its History is the
            // only place that now says who reverted it.
            const hasMenu = m.reason !== "sale";
            const byName =
              users.find((u) => u.id === m.recordedByUserId)?.fullName ?? null;
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
                      {added ? `+${m.quantityDelta}` : m.quantityDelta}
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
                    {formatDateTime(m.occurredAt, locale)}
                  </Text>

                  {/* The money side, so it's visible which rows moved Expenses
                      — a costed removal gives money back. */}
                  {m.unitCost != null && !voided ? (
                    <Text
                      className={`text-xs mt-0.5 ${added ? "text-gray-500" : "text-green-700"}`}
                    >
                      {t(
                        added
                          ? "products.stock_cost_line"
                          : "products.stock_cost_back_line",
                        {
                          amount: formatMoney(
                            Math.abs(m.quantityDelta * m.unitCost),
                            findCurrency(currencies, m.currencyId),
                            findCurrency(currencies, m.currencyId),
                          ),
                        },
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

      {/* One menu for the whole list, not one per row. Both sheets sit in the body
          like PaymentDetailSheet's history sheet — Gorhom portals them out, so the
          position in the tree costs nothing. */}
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
