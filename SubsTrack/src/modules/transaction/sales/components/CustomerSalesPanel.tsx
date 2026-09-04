import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { InlineSelectionToolbar } from "@/src/shared/components/InlineSelectionToolbar";
import {
  useSelection,
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelection";
import { COLORS } from "@/src/shared/constants";
import type { Customer, Sale } from "@/src/core/types";
import saleService from "../services/SaleService";
import { useSaleActions } from "../hooks/useSaleActions";
import { saleListPatches } from "../utils/saleListPatch";
import { useSaleInvoiceAction } from "../hooks/useSaleInvoiceAction";
import { SaleCard } from "./SaleCard";
import { SaleFormSheet } from "./SaleFormSheet";
import { SaleDetailSheet } from "./SaleDetailSheet";
import { useAuth } from "@/src/modules/authentication/auth";
import { useSaleSlice } from "@/src/state/hooks/useSaleSlice";

const PREVIEW_LIMIT = 5;

interface Props {
  customer: Customer;
}

// Renders at the bottom of the customer detail screen. Shows a short preview
// (PREVIEW_LIMIT) of the customer's most recent sales with a "Show all" link to
// the full customer-scoped sales page. Reads independently from saleSlice so the
// customer-scoped view never collides with the global Sales tab's list state.
export function CustomerSalesPanel({ customer }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const voidSaleGlobal = useSaleSlice((s) => s.voidSale);
  const [sales, setSales] = useState<Sale[]>([]);
  const [serverHasMore, setServerHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [activeSale, setActiveSale] = useState<Sale | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [voidLoading, setVoidLoading] = useState(false);
  const selection = useSelection();
  const {
    active: selectionActive,
    selectedIds,
    toggle: toggleSelect,
    enterWith: enterSelection,
    clear: clearSelection,
  } = selection;
  useSelectionBackHandler(selectionActive, clearSelection);
  const tokenRef = useRef(0);

  const refresh = useCallback(async () => {
    const token = ++tokenRef.current;
    setLoading(true);
    clearSelection();
    try {
      const items = await saleService.getSalesForCustomer(
        customer.id,
        PREVIEW_LIMIT + 1,
      );
      if (tokenRef.current !== token) return;
      setSales(items);
      setServerHasMore(items.length > PREVIEW_LIMIT);
    } finally {
      if (tokenRef.current === token) setLoading(false);
    }
  }, [customer.id, clearSelection]);

  const patch = useMemo(() => saleListPatches(setSales, customer.id), [customer.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleVoid(reason: string) {
    if (!activeSale || !user) return;
    setVoidLoading(true);
    try {
      await voidSaleGlobal(activeSale.id, user.id, reason);
      setActiveSale(null);
      await refresh();
    } finally {
      setVoidLoading(false);
    }
  }

  // The receipt closes as the form opens — two stacked full sheets are a maze.
  function openEdit(sale: Sale) {
    setActiveSale(null);
    setEditingSale(sale);
  }

  function openAll() {
    router.push(`/(app)/(tabs)/customers/${customer.id}/sales` as Href);
  }

  const preview = sales.slice(0, PREVIEW_LIMIT);
  const hasMore = serverHasMore || sales.length > PREVIEW_LIMIT;
  const selectedSales = preview.filter((s) => selectedIds.has(s.id));
  const invoiceAction = useSaleInvoiceAction(selectedSales, clearSelection);
  const saleActions = useSaleActions({
    onView: setActiveSale,
    onEdit: openEdit,
    onVoided: () => void refresh(),
    onCollected: patch.collected,
  });

  return (
    <View className="px-4 mt-4">
      {/* Fixed height in both states so entering selection never shifts the
          cards under the finger that long-pressed one. `-mx-2` cancels the
          toolbar's own padding, lining it up with the cards below. */}
      <View className="h-9 justify-center mb-3">
        {selectionActive ? (
          <View className="-mx-2">
            <InlineSelectionToolbar
              count={selection.count}
              actions={invoiceAction ? [invoiceAction] : []}
              onClose={clearSelection}
            />
          </View>
        ) : (
          <View className="flex-row items-center justify-between">
            <Text fontWeight="Bold" className="text-base text-gray-900">
              {t("sales.customer_panel_title")}
            </Text>
            <PressableOpacity
              onPress={() => setFormOpen(true)}
              className="flex-row items-center bg-emerald-50 rounded-full px-3 py-1.5"
            >
              <Ionicons name="add" size={14} color={COLORS.success} />
              <Text className="text-xs font-semibold text-emerald-700 ms-1">
                {t("sales.record_button")}
              </Text>
            </PressableOpacity>
          </View>
        )}
      </View>

      {loading ? (
        <View className="py-6 items-center">
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : sales.length === 0 ? (
        <View className="py-6 items-center">
          <Text className="text-sm text-gray-400">
            {t("sales.no_sales_for_customer")}
          </Text>
        </View>
      ) : (
        <>
          {preview.map((sale) => (
            <SaleCard
              key={sale.id}
              sale={sale}
              onPress={setActiveSale}
              onMenu={saleActions.openMenu}
              selectionMode={selectionActive}
              selected={selectedIds.has(sale.id)}
              onToggleSelect={(s) => toggleSelect(s.id)}
              onEnterSelection={(s) => enterSelection(s.id)}
            />
          ))}
          {hasMore && !selectionActive ? (
            <PressableOpacity
              onPress={openAll}
              className="flex-row items-center justify-center py-3"
            >
              <Text className="text-sm font-semibold text-primary me-1">
                {t("sales.show_all")}
              </Text>
              <DirectionalIcon
                name="chevron-forward"
                size={16}
                color={COLORS.primary}
              />
            </PressableOpacity>
          ) : null}
        </>
      )}

      {formOpen && (
        <SaleFormSheet
          initialCustomer={customer}
          onDismiss={() => setFormOpen(false)}
          onCreated={patch.created}
        />
      )}

      {editingSale && (
        <SaleFormSheet
          sale={editingSale}
          onDismiss={() => setEditingSale(null)}
          onUpdated={patch.updated}
        />
      )}

      <SaleDetailSheet
        sale={activeSale}
        onDismiss={() => setActiveSale(null)}
        onVoid={handleVoid}
        onEdit={openEdit}
        voidLoading={voidLoading}
        onChanged={patch.paymentVoided}
      />

      {saleActions.sheets}
    </View>
  );
}
