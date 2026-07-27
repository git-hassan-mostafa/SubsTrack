import { useEffect, useState } from "react";
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
import { formatDate } from "@/src/core/utils/date";
import type { Product, StockMovement } from "@/src/core/types";
import { useAuth } from "@/src/modules/authentication/auth";
import { useProductSlice } from "@/src/state/hooks/useProductSlice";
import productService from "../services/ProductService";

interface Props {
  product: Product;
  onDismiss: () => void;
}

type Mode = "add" | "remove";

/**
 * Adds or removes stock for one product, and shows the recent history. Stock is
 * never typed as a total — each save appends one ledger movement, so who
 * changed what stays on the record.
 */
export function ProductStockSheet({ product, onDismiss }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
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

  async function loadHistory() {
    try {
      setHistory(await productService.getMovements(product.id));
    } catch {
      // History is supporting detail — a failure here must not block adjusting.
    }
  }

  useEffect(() => {
    clearError();
    void loadHistory();
    // Clear on the way out too — the product form may still be open underneath
    // and shares this slice's error, so a stock failure must not linger there.
    return clearError;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setQuantity("");
    setNote("");
    void loadHistory();
  }

  return (
    <FormSheet
      onDismiss={onDismiss}
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
      <Text fontWeight="SemiBold" className="text-base text-gray-900 mt-8 mb-2">
        {t("products.stock_history")}
      </Text>
      {history.length === 0 ? (
        <Text className="text-sm text-gray-400">
          {t("products.stock_history_empty")}
        </Text>
      ) : (
        history.map((m) => (
          <View
            key={m.id}
            className="flex-row items-center justify-between border-b border-gray-50 py-3"
          >
            <View className="flex-1 pe-3">
              <Text
                className={`text-sm ${m.voidedAt ? "text-gray-400 line-through" : "text-gray-900"}`}
              >
                {t(`products.stock_reason_${m.reason}`)}
              </Text>
              <Text className="text-xs text-gray-400 mt-0.5">
                {formatDate(m.occurredAt)}
                {m.note ? ` · ${m.note}` : ""}
              </Text>
            </View>
            <Text
              fontWeight="SemiBold"
              className={`text-sm ${
                m.voidedAt
                  ? "text-gray-300 line-through"
                  : m.quantityDelta > 0
                    ? "text-success"
                    : "text-danger"
              }`}
            >
              {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
            </Text>
          </View>
        ))
      )}

      <View className="h-24" />
    </FormSheet>
  );
}
