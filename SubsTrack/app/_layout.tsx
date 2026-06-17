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
import { KeyboardProvider } from "react-native-keyboard-controller";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../global.css";

/**
 * On web there are no device safe-area insets, but the library falls back to
 * non-zero default insets which render as a phantom gap at the top and bottom
 * of every screen. Forcing zero metrics on web removes that gap; native passes
 * `undefined` so insets are measured for real.
 */
const webZeroMetrics = {
  frame: { x: 0, y: 0, width: 0, height: 0 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
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
      const isAdmin = user.role === "admin" || user.role === "superadmin";
      router.replace(isAdmin ? "/(app)/(tabs)/home" : "/(app)/(tabs)/customers");
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
      <SafeAreaProvider
        initialMetrics={Platform.OS === "web" ? webZeroMetrics : undefined}
      >
        <KeyboardProvider>
          <StatusBar style="dark" backgroundColor="white" />
          <ErrorBoundary>
            <Slot />
          </ErrorBoundary>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
