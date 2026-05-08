import { useAuthStore } from "@/src/modules/auth/store/authStore";
import { useCustomerStore } from "@/src/modules/customers/store/customerStore";
import { useDashboardStore } from "@/src/modules/dashboard/store/dashboardStore";
import { initI18n } from "@/src/core/i18n";
import { usePaymentStore } from "@/src/modules/payments/store/paymentStore";
import { usePlanStore } from "@/src/modules/plans/store/planStore";
import { useUserStore } from "@/src/modules/users/store/userStore";
import { ErrorBoundary } from "@/src/shared/components/ErrorBoundary";
import { LoadingScreen } from "@/src/shared/components/LoadingScreen";
import { Slot, useRouter, useSegments } from "expo-router";
import * as Font from "expo-font";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "../global.css";

export default function RootLayout() {
  const [i18nReady, setI18nReady] = useState(false);
  const [fontsLoaded, fontsError] = Font.useFonts({
    Cairo: require("../assets/fonts/Cairo-Regular.ttf"),
    "Cairo-Medium": require("../assets/fonts/Cairo-Medium.ttf"),
    "Cairo-SemiBold": require("../assets/fonts/Cairo-SemiBold.ttf"),
    "Cairo-Bold": require("../assets/fonts/Cairo-Bold.ttf"),
  });
  const fontsReady = fontsLoaded || !!fontsError;

  const { user, loading, restoreSession } = useAuthStore();
  const resetPlans = usePlanStore((s) => s.reset);
  const resetUsers = useUserStore((s) => s.reset);
  const resetCustomers = useCustomerStore((s) => s.reset);
  const resetPayments = usePaymentStore((s) => s.reset);
  const resetDashboard = useDashboardStore((s) => s.reset);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    initI18n()
      .then(() => {
        setI18nReady(true);
        restoreSession();
      })
      .catch((error) => {
        console.error("[RootLayout] Failed to initialize i18n:", error);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!i18nReady || loading) return;
    const inAuth = segments[0] === "(auth)";
    if (!user && !inAuth) {
      resetPlans();
      resetUsers();
      resetCustomers();
      resetPayments();
      resetDashboard();
      router.replace("/(auth)/login");
    } else if (user && inAuth) {
      router.replace("/(app)/(tabs)/customers");
    }
  }, [
    user,
    loading,
    segments,
    router,
    i18nReady,
    resetPlans,
    resetUsers,
    resetCustomers,
    resetPayments,
    resetDashboard,
  ]);

  if (!i18nReady || loading || !fontsReady) return <LoadingScreen />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <Slot />
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
