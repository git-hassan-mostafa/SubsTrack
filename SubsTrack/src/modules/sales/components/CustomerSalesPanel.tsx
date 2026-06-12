import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { COLORS } from "@/src/shared/constants";
import type { Customer, Sale } from "@/src/core/types";
import saleService from "../services/SaleService";
import { SaleCard } from "./SaleCard";
import { SaleFormSheet } from "./SaleFormSheet";
import { SaleDetailSheet } from "./SaleDetailSheet";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
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
  // Void via the canonical global slice action so the voided sale also drops
  // out of the Sales tab's cached list, not just this preview.
  const voidSaleGlobal = useSaleSlice((s) => s.voidSale);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [activeSale, setActiveSale] = useState<Sale | null>(null);
  const [voidLoading, setVoidLoading] = useState(false);
  // Discards out-of-order responses if focus fires refresh while one is in flight.
  const tokenRef = useRef(0);

  const refresh = useCallback(async () => {
    const token = ++tokenRef.current;
    setLoading(true);
    try {
      // Fetch one past the preview limit so we know whether to show "Show all".
      const items = await saleService.getSalesForCustomer(
        customer.id,
        PREVIEW_LIMIT + 1,
      );
      if (tokenRef.current !== token) return;
      setSales(items);
    } finally {
      if (tokenRef.current === token) setLoading(false);
    }
  }, [customer.id]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id]);

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

  function openAll() {
    // Cast: the nested /customers/[id]/sales route is not yet in the (stale)
    // generated router types; Expo regenerates them on the next dev-server run.
    // Matches the existing `"..." as Href` convention used for newer routes.
    router.push(`/(app)/(tabs)/customers/${customer.id}/sales` as Href);
  }

  const preview = sales.slice(0, PREVIEW_LIMIT);
  const hasMore = sales.length > PREVIEW_LIMIT;

  return (
    <View className="px-4 mt-4">
      <View className="flex-row items-center justify-between mb-3">
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
            <SaleCard key={sale.id} sale={sale} onPress={setActiveSale} />
          ))}
          {hasMore ? (
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
          onCreated={refresh}
        />
      )}

      <SaleDetailSheet
        sale={activeSale}
        onDismiss={() => setActiveSale(null)}
        onVoid={handleVoid}
        voidLoading={voidLoading}
      />
    </View>
  );
}
