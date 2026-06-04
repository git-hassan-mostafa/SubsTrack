import { useAuthSlice } from "@/src/state/hooks/useAuthSlice";
import { useCustomerSlice } from "@/src/state/hooks/useCustomerSlice";
import { useDashboardSlice } from "@/src/state/hooks/useDashboardSlice";
import { initI18n } from "@/src/core/i18n";
import { usePaymentSlice } from "@/src/state/hooks/usePaymentSlice";
import { usePlanSlice } from "@/src/state/hooks/usePlanSlice";
import { useUserSlice } from "@/src/state/hooks/useUserSlice";
import { ErrorBoundary } from "@/src/shared/components/ErrorBoundary";
import { LoadingScreen } from "@/src/shared/components/LoadingScreen";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Font from "expo-font";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "../global.css";
import { enableMapSet } from "immer";

export default function RootLayout() {
  const [i18nReady, setI18nReady] = useState(false);
  const [fontsLoaded, fontsError] = Font.useFonts({
    Cairo: require("../assets/fonts/Cairo-Regular.ttf"),
    "Cairo-Medium": require("../assets/fonts/Cairo-Medium.ttf"),
    "Cairo-SemiBold": require("../assets/fonts/Cairo-SemiBold.ttf"),
    "Cairo-Bold": require("../assets/fonts/Cairo-Bold.ttf"),
  });
  const fontsReady = fontsLoaded || !!fontsError;

  const user = useAuthSlice((s) => s.user);
  const loading = useAuthSlice((s) => s.loading);
  const restoreSession = useAuthSlice((s) => s.restoreSession);
  const resetPlans = usePlanSlice((s) => s.reset);
  const resetUsers = useUserSlice((s) => s.reset);
  const resetCustomers = useCustomerSlice((s) => s.reset);
  const resetPayments = usePaymentSlice((s) => s.reset);
  const resetDashboard = useDashboardSlice((s) => s.reset);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    enableMapSet(); /* enable map set for immer */
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
      <StatusBar style="dark" backgroundColor="white" />
      <ErrorBoundary>
        <Slot />
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
