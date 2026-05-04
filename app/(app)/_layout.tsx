import { Redirect, Slot } from 'expo-router';
import { useAuthStore } from '@/src/modules/auth/store/authStore';
import { LoadingScreen } from '@/src/shared/components/LoadingScreen';

export default function AppLayout() {
  const { user, loading } = useAuthStore();
  if (loading) return <LoadingScreen />;
  if (!user) return <Redirect href="/(auth)/login" />;
  return <Slot />;
}
