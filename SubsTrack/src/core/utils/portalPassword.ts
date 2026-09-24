import * as Crypto from "expo-crypto";

// No I, l, 1, O or 0: staff read this password down a phone line or write it on
// paper, so a character the customer can mistype is worse than a shorter one.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const LENGTH = 10;

// Crypto.getRandomValues, not Math.random: this is the only thing standing
// between a stranger with a customer id and that customer's whole history.
export function generatePortalPassword(): string {
  const bytes = Crypto.getRandomValues(new Uint8Array(LENGTH));
  let password = "";
  for (const byte of bytes) password += ALPHABET[byte % ALPHABET.length];
  return password;
}
