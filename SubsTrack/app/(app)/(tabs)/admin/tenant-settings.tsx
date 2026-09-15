import { Redirect } from "expo-router";
import { TenantSettingsScreen } from "@/src/modules/admin/tenant-settings";
import { useAuth } from "@/src/modules/authentication/auth";

export default function Index() {
  const { isTenantWideAdmin } = useAuth();

  if (!isTenantWideAdmin) return <Redirect href="/(app)/(tabs)/admin" />;

  return <TenantSettingsScreen />;
}
