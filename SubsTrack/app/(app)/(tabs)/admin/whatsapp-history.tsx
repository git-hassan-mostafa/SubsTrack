import { Redirect } from "expo-router";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { canOpenPage } from "@shared/modules/authentication/auth/utils/pageAccess";
import { WhatsAppHistoryScreen } from "@/src/modules/whatsapp/screens/WhatsAppHistoryScreen";

export default function WhatsAppHistoryRoute() {
  const viewer = useAuth();
  if (!canOpenPage(viewer, "whatsapp_history")) {
    return <Redirect href="/(app)/(tabs)/admin" />;
  }
  return <WhatsAppHistoryScreen />;
}
