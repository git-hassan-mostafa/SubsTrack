import * as Crypto from "expo-crypto";
import type { RuntimeIds } from "@shared/core/runtime/runtime";

export const phoneIds: RuntimeIds = {
  randomUUID: () => Crypto.randomUUID(),
  randomBytes: (length) => Crypto.getRandomValues(new Uint8Array(length)),
  sha1Hex: (text) =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA1, text),
};
