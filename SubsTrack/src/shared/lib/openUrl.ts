import { Linking } from "react-native";

// false when nothing on the phone can open the link
export async function openUrl(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
