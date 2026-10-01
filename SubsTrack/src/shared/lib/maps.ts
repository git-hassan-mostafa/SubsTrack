import { Linking } from "react-native";
import { locationHref } from "@shared/core/utils/locationLink";

// Staff drop a pin there and paste its share link back into the customer form.
export async function openMapsApp(): Promise<boolean> {
  try {
    await Linking.openURL("https://www.google.com/maps");
    return true;
  } catch {
    return false;
  }
}

// Re-opens the share link staff pasted; the Maps app resolves short links too.
export async function openLocation(
  url: string | null | undefined,
): Promise<boolean> {
  const target = locationHref(url);
  if (!target) return false;
  try {
    await Linking.openURL(target);
    return true;
  } catch {
    return false;
  }
}
