import { Redirect } from "expo-router";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { WhatsAppHistoryScreen } from "@/src/modules/whatsapp/screens/WhatsAppHistoryScreen";

export default function WhatsAppHistoryRoute() {
  const { isAdmin, whatsappEnabled } = useAuth();
  if (!isAdmin || !whatsappEnabled) {
    return <Redirect href="/(app)/(tabs)/admin" />;
  }
  return <WhatsAppHistoryScreen />;
}
