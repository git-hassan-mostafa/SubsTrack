import { Linking } from 'react-native';

// Opens the Google Maps app (or the browser when the app is not installed) so
// staff can find a place, drop a pin, and copy its share link to paste back
// into the customer form.
export async function openMapsApp(): Promise<boolean> {
  try {
    await Linking.openURL('https://www.google.com/maps');
    return true;
  } catch {
    return false;
  }
}

// Opens a previously-saved customer location. The value is the raw share link
// staff pasted; we just re-open it and let the Maps app resolve it (this works
// even for short `maps.app.goo.gl` links that carry no coordinates). A scheme
// is prepended when the pasted text lacks one so plain `maps.app.goo.gl/...`
// still opens.
export async function openLocation(
  url: string | null | undefined,
): Promise<boolean> {
  const raw = (url ?? '').trim();
  if (!raw) return false;
  const target = /^[a-z]+:\/\//i.test(raw) || raw.startsWith('geo:')
    ? raw
    : `https://${raw}`;
  try {
    await Linking.openURL(target);
    return true;
  } catch {
    return false;
  }
}
