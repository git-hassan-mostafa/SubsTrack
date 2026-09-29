import * as Crypto from "expo-crypto";
import type { RuntimeIds } from "@shared/core/runtime/runtime";

export const phoneIds: RuntimeIds = {
  randomUUID: () => Crypto.randomUUID(),
  sha1Hex: (text) =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA1, text),
};
