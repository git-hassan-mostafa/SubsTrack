import { Redirect, Slot } from "expo-router";
import { useAuthSlice } from "@/src/state/hooks/useAuthSlice";
import { TenantInactiveScreen } from "@/src/modules/auth/screens/TenantInactiveScreen";
import { LoadingScreen } from "@/src/shared/components/LoadingScreen";

export default function AppLayout() {
  const user = useAuthSlice((s) => s.user);
  const tenantActive = useAuthSlice((s) => s.tenantActive);
  const loading = useAuthSlice((s) => s.loading);
  if (loading) return <LoadingScreen />;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (!tenantActive) return <TenantInactiveScreen />;
  return <Slot />;
}
