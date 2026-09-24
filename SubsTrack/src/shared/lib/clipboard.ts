import * as Clipboard from "expo-clipboard";

// First use of expo-clipboard in the app. It was already a dependency, so this
// adds no native module and still ships over the air.
export async function copyText(value: string): Promise<boolean> {
  if (!value) return false;
  try {
    await Clipboard.setStringAsync(value);
    return true;
  } catch {
    return false;
  }
}
