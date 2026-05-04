import { useAuthStore } from '@/src/modules/auth/store/authStore';
import { useCustomerStore } from '@/src/modules/customers/store/customerStore';
import { useDashboardStore } from '@/src/modules/dashboard/store/dashboardStore';
import { usePaymentStore } from '@/src/modules/payments/store/paymentStore';
import { usePlanStore } from '@/src/modules/plans/store/planStore';
import { useUserStore } from '@/src/modules/users/store/userStore';
import { ErrorBoundary } from '@/src/shared/components/ErrorBoundary';
import { LoadingScreen } from '@/src/shared/components/LoadingScreen';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import '../global.css';

export default function RootLayout() {
  const { user, loading, restoreSession } = useAuthStore();
  const resetPlans = usePlanStore((s) => s.reset);
  const resetUsers = useUserStore((s) => s.reset);
  const resetCustomers = useCustomerStore((s) => s.reset);
  const resetPayments = usePaymentStore((s) => s.reset);
  const resetDashboard = useDashboardStore((s) => s.reset);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    restoreSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) return;
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
  }, [user, loading, segments, router, resetPlans, resetUsers, resetCustomers, resetPayments, resetDashboard]);

  if (loading) return <LoadingScreen />;

  return (
    <GestureHandlerRootView className="flex-1">
      <ErrorBoundary>
        <Slot />
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
