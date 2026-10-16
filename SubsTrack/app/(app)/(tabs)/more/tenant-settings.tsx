import { Redirect } from "expo-router";
import { TenantSettingsScreen } from "@/src/modules/admin/tenant-settings";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { canOpenPage } from "@shared/modules/authentication/auth/utils/pageAccess";

export default function Index() {
  const viewer = useAuth();

  if (!canOpenPage(viewer, "organization")) return <Redirect href="/(app)/(tabs)/admin" />;

  return <TenantSettingsScreen />;
}
