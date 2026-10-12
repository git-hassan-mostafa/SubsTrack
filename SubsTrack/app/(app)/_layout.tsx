import { Redirect, Slot } from "expo-router";
import { useAuthSlice } from "@shared/state/hooks/useAuthSlice";
import { TenantInactiveScreen } from "@/src/modules/authentication/auth";
import { LoadingScreen } from "@/src/shared/components/LoadingScreen";
import GlobalConfirmDialog from "@/src/shared/components/GlobalConfirmDialog";
import { UpdateBanner } from "@/src/shared/components/UpdateBanner";
import { QuickActionSheets } from "@/src/modules/quick-actions";
import { useDismissKeyboardOnNavigate } from "@/src/shared/hooks/useDismissKeyboardOnNavigate";
export default function AppLayout() {
  useDismissKeyboardOnNavigate();
  const user = useAuthSlice((s) => s.user);
  const tenantActive = useAuthSlice((s) => s.tenantActive);
  const loading = useAuthSlice((s) => s.loading);
  if (loading) return <LoadingScreen />;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (!tenantActive) return <TenantInactiveScreen />;
  return (
    <>
      <Slot />
      <UpdateBanner />
      <GlobalConfirmDialog />
      <QuickActionSheets />
    </>
  );
}
