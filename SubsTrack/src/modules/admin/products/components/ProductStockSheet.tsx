import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { Input } from "@/src/shared/components/Input";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { COLORS } from "@/src/shared/constants";
import { formatDateTime } from "@/src/core/utils/date";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import type { Product, StockMovement, StockReason } from "@/src/core/types";
import { useAuth } from "@/src/modules/authentication/auth";
import { useProductSlice } from "@/src/state/hooks/useProductSlice";
import { useUserSlice } from "@/src/state/hooks/useUserSlice";
import { useDirtyForm } from "@/src/shared/hooks/useDirtyForm";
import productService from "../services/ProductService";

interface Props {
  product: Product;
  onDismiss: () => void;
}

type Mode = "add" | "remove";

// Icon per ledger reason; the tint comes from the direction, not the reason,
// because an 'adjustment' can go either way.
const REASON_ICON: Record<StockReason, keyof typeof Ionicons.glyphMap> = {
  initial: "flag-outline",
  restock: "add-circle-outline",
  adjustment: "create-outline",
  sale: "cart-outline",
};

/**
 * Adds or removes stock for one product, and shows the recent history. Stock is
 * never typed as a total — each save appends one ledger movement, so who
 * changed what stays on the record.
 */
export function ProductStockSheet({ product, onDismiss }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";
  const users = useUserSlice((s) => s.items);
  const getUsers = useUserSlice((s) => s.getUsers);
  const adjustStock = useProductSlice((s) => s.adjustStock);
  const loading = useProductSlice((s) => s.loading);
  const error = useProductSlice((s) => s.error);
  const clearError = useProductSlice((s) => s.clearError);
  // Read the live value from the list so it reflects the save without a refetch.
  const onHand = useProductSlice(
    (s) => s.items.find((p) => p.id === product.id)?.stockOnHand ?? product.stockOnHand,
  );

  const [mode, setMode] = useState<Mode>("add");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [history, setHistory] = useState<StockMovement[]>([]);

  // `history` is background-loaded, so it stays out of the dirty check.
  const dirty = useDirtyForm({ mode, quantity, note });

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

  async function handleSubmit() {
    if (!user || !validQuantity) return;
    const ok = await adjustStock(
      product.id,
      user.tenantId,
      mode === "add" ? parsed : -parsed,
      mode === "add" ? "restock" : "adjustment",
      note,
      user.id,
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

      {/* Add / remove */}
      <View className="flex-row gap-2 mb-4">
        {(["add", "remove"] as Mode[]).map((m) => {
          const selected = mode === m;
          return (
            <PressableOpacity
              key={m}
              onPress={() => setMode(m)}
              className={`flex-1 flex-row items-center justify-center rounded-xl border py-3 ${
                selected ? "border-primary bg-indigo-50" : "border-gray-200 bg-white"
              }`}
            >
              <Ionicons
                name={m === "add" ? "add" : "remove"}
                size={16}
                color={selected ? COLORS.primary : COLORS.gray500}
              />
              <Text
                fontWeight="SemiBold"
                className={`ms-1 text-sm ${selected ? "text-primary" : "text-gray-500"}`}
              >
                {t(m === "add" ? "products.add_stock" : "products.remove_stock")}
              </Text>
            </PressableOpacity>
          );
        })}
      </View>

      <Input
        label={t("products.stock_quantity_label") + " *"}
        value={quantity}
        onChangeText={(v) => setQuantity(v.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
        placeholder="0"
        onFocus={clearError}
      />

      <Input
        label={t("products.stock_note_label")}
        value={note}
        onChangeText={setNote}
        placeholder={t("products.stock_note_placeholder")}
      />

      <Button
        label={t("products.save_stock")}
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
            const byName =
              users.find((u) => u.id === m.recordedByUserId)?.fullName ?? null;
            return (
              <View
                key={m.id}
                className={`flex-row px-3 py-3 ${i > 0 ? "border-t border-gray-100" : ""} ${
                  voided ? "bg-gray-50" : "bg-white"
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
                  </View>

                  <Text className="text-xs text-gray-500 mt-0.5">
                    {formatDateTime(m.occurredAt, locale)}
                  </Text>

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
    </FormSheet>
  );
}
