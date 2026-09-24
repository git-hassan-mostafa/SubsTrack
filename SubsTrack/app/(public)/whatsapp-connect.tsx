import { Platform } from "react-native";
import { Redirect } from "expo-router";
import { WhatsAppConnectPage } from "@/src/modules/whatsapp/screens/WhatsAppConnectPage";

export default function WhatsAppConnectRoute() {
  if (Platform.OS !== "web") return <Redirect href="/" />;
  return <WhatsAppConnectPage />;
}
