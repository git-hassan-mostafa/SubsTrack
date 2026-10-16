import { Linking } from "react-native";

export async function callPhone(phone: string | null | undefined): Promise<boolean> {
  const digits = phone?.replace(/[^\d+]/g, "") ?? "";
  if (!digits) return false;
  try {
    await Linking.openURL(`tel:${digits}`);
    return true;
  } catch {
    return false;
  }
}
