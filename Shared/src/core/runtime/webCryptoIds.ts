import type { RuntimeIds } from "./runtime";

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

// The browser half of the ids contract; the phone passes expo-crypto instead.
export const webCryptoIds: RuntimeIds = {
  randomUUID: () => globalThis.crypto.randomUUID(),
  sha1Hex: async (text) =>
    toHex(
      await globalThis.crypto.subtle.digest(
        "SHA-1",
        new TextEncoder().encode(text),
      ),
    ),
};
