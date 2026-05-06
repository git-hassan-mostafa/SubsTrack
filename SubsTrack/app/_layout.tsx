import { useAuthStore } from '@/src/modules/auth/store/authStore';
import { useCustomerStore } from '@/src/modules/customers/store/customerStore';
import { useDashboardStore } from '@/src/modules/dashboard/store/dashboardStore';
import { initI18n } from '@/src/core/i18n';
import { useLanguageStore } from '@/src/core/i18n/languageStore';
import { usePaymentStore } from '@/src/modules/payments/store/paymentStore';
import { usePlanStore } from '@/src/modules/plans/store/planStore';
import { useUserStore } from '@/src/modules/users/store/userStore';
import { ErrorBoundary } from '@/src/shared/components/ErrorBoundary';
import { LoadingScreen } from '@/src/shared/components/LoadingScreen';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as Font from 'expo-font';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import '../global.css';

export default function RootLayout() {
  const [i18nReady, setI18nReady] = useState(false);
  const [fontsLoaded] = Font.useFonts({
    Cairo: require('../assets/fonts/Cairo-Regular.ttf'),
    'Cairo-Medium': require('../assets/fonts/Cairo-Medium.ttf'),
    'Cairo-SemiBold': require('../assets/fonts/Cairo-SemiBold.ttf'),
    'Cairo-Bold': require('../assets/fonts/Cairo-Bold.ttf'),
  });

  const { language } = useLanguageStore();
  const { user, loading, restoreSession } = useAuthStore();
  const resetPlans = usePlanStore((s) => s.reset);
  const resetUsers = useUserStore((s) => s.reset);
  const resetCustomers = useCustomerStore((s) => s.reset);
  const resetPayments = usePaymentStore((s) => s.reset);
  const resetDashboard = useDashboardStore((s) => s.reset);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    initI18n().then(() => {
      setI18nReady(true);
      restoreSession();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!i18nReady || loading) return;
    const inAuth = segments[0] === '(auth)';
    if (!user && !inAuth) {
      resetPlans();
      resetUsers();
      resetCustomers();
      resetPayments();
      resetDashboard();
      router.replace('/(auth)/login');
    } else if (user && inAuth) {
      router.replace('/(app)/(tabs)');
    }
  }, [user, loading, segments, router, i18nReady, resetPlans, resetUsers, resetCustomers, resetPayments, resetDashboard]);

  if (!i18nReady || loading || !fontsLoaded) return <LoadingScreen />;

  // Apply Cairo font globally for Arabic
  if (language === 'ar') {
    // @ts-ignore — defaultProps is the standard RN way to set global text style
    Text.defaultProps = { ...(Text.defaultProps ?? {}), style: [{ fontFamily: 'Cairo' }, Text.defaultProps?.style] };
  } else {
    // @ts-ignore
    Text.defaultProps = undefined;
  }

  return (
    <GestureHandlerRootView className="flex-1">
      <ErrorBoundary>
        <Slot />
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
