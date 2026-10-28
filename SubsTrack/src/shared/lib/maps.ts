import { locationHref } from "@shared/core/utils/locationLink";
import { openUrl } from "./openUrl";

// Staff drop a pin there and paste its share link back into the customer form.
export async function openMapsApp(): Promise<boolean> {
  return openUrl("https://www.google.com/maps");
}

// Re-opens the share link staff pasted; the Maps app resolves short links too.
export async function openLocation(
  url: string | null | undefined,
): Promise<boolean> {
  const target = locationHref(url);
  return target ? openUrl(target) : false;
}
