import { Redirect } from "expo-router";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { canOpenPage } from "@shared/modules/authentication/auth/utils/pageAccess";
import { WhatsAppSettingsScreen } from "@/src/modules/whatsapp/screens/WhatsAppSettingsScreen";

export default function WhatsAppRoute() {
  const viewer = useAuth();
  if (!canOpenPage(viewer, "whatsapp")) {
    return <Redirect href="/(app)/(tabs)/admin" />;
  }
  return <WhatsAppSettingsScreen />;
}
