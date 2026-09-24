import { Redirect } from "expo-router";
import { useAuth } from "@/src/modules/authentication/auth";
import { WhatsAppSettingsScreen } from "@/src/modules/whatsapp/screens/WhatsAppSettingsScreen";

export default function WhatsAppRoute() {
  const { user, isTenantWideAdmin } = useAuth();
  if (!isTenantWideAdmin || !user?.tenant.whatsappEnabled) {
    return <Redirect href="/(app)/(tabs)/admin" />;
  }
  return <WhatsAppSettingsScreen />;
}
