import { Redirect } from "expo-router";
import { useAuth } from "@/src/modules/authentication/auth";
import { WhatsAppHistoryScreen } from "@/src/modules/whatsapp/screens/WhatsAppHistoryScreen";

export default function WhatsAppHistoryRoute() {
  const { user, isAdmin } = useAuth();
  if (!isAdmin || !user?.tenant.whatsappEnabled) {
    return <Redirect href="/(app)/(tabs)/admin" />;
  }
  return <WhatsAppHistoryScreen />;
}
