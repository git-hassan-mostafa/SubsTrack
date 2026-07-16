import { Redirect, Slot } from "expo-router";
import { useAuthSlice } from "@/src/state/hooks/useAuthSlice";
import { TenantInactiveScreen } from "@/src/modules/authentication/auth";
import { LoadingScreen } from "@/src/shared/components/LoadingScreen";
import GlobalConfirmDialog from "@/src/shared/components/GlobalConfirmDialog";
import { SyncIndicator } from "@/src/shared/components/SyncIndicator";
export default function AppLayout() {
  const user = useAuthSlice((s) => s.user);
  const tenantActive = useAuthSlice((s) => s.tenantActive);
  const loading = useAuthSlice((s) => s.loading);
  if (loading) return <LoadingScreen />;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (!tenantActive) return <TenantInactiveScreen />;
  return (
    <>
      <Slot />
      <SyncIndicator />
      <GlobalConfirmDialog />
    </>
  );
}
