import { Redirect, Slot } from "expo-router";
import { useAuthStore } from "@/src/modules/auth/store/authStore";
import { TenantInactiveScreen } from "@/src/modules/auth/screens/TenantInactiveScreen";
import { LoadingScreen } from "@/src/shared/components/LoadingScreen";

export default function AppLayout() {
  const { user, tenantActive, loading } = useAuthStore();
  if (loading) return <LoadingScreen />;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (!tenantActive) return <TenantInactiveScreen />;
  return <Slot />;
}
