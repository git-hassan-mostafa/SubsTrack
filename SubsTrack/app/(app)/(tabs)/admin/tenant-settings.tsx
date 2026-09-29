import { Redirect } from "expo-router";
import { TenantSettingsScreen } from "@/src/modules/admin/tenant-settings";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";

export default function Index() {
  const { isTenantWideAdmin } = useAuth();

  if (!isTenantWideAdmin) return <Redirect href="/(app)/(tabs)/admin" />;

  return <TenantSettingsScreen />;
}
