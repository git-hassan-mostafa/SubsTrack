import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { COLORS } from "@/src/shared/constants";
import type { Customer, Sale } from "@/src/core/types";
import saleService from "../services/SaleService";
import { SaleCard } from "./SaleCard";
import { SaleFormSheet } from "./SaleFormSheet";
import { SaleDetailSheet } from "./SaleDetailSheet";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";

interface Props {
  customer: Customer;
}

// Renders below CustomerPaymentPanel on the customer detail screen.
// Lists the most recent sales for this customer, with a button to record a new one.
// Reads independently from saleSlice so the customer-scoped view never collides
// with the global Sales tab's list state.
export function CustomerSalesPanel({ customer }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [activeSale, setActiveSale] = useState<Sale | null>(null);
  const [voidLoading, setVoidLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const items = await saleService.getSalesForCustomer(customer.id);
      setSales(items);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id]);

  async function handleVoid(reason: string) {
    if (!activeSale || !user) return;
    setVoidLoading(true);
    try {
      await saleService.voidSale(activeSale.id, user.id, reason);
      setActiveSale(null);
      await refresh();
    } finally {
      setVoidLoading(false);
    }
  }

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
        sales.map((sale) => (
          <SaleCard key={sale.id} sale={sale} onPress={setActiveSale} />
        ))
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
