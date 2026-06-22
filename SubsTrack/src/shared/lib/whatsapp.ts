import { Linking } from 'react-native';

// Opens a WhatsApp chat with the given number, optionally pre-filling a
// message. Uses the wa.me deep-link, which works on web and native (opening
// the installed app when present, otherwise the browser). The number is
// reduced to digits so stored values may include spaces, dashes, or a '+'.
export async function openWhatsApp(
  phone: string | null | undefined,
  message?: string,
): Promise<boolean> {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return false;

  const url = `https://wa.me/${digits}${
    message ? `?text=${encodeURIComponent(message)}` : ''
  }`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
