import { runtime } from "@shared/core/runtime/runtime";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
export const PORTAL_PASSWORD_LENGTH = 10;

// No I, l, 1, O or 0: staff read it down a phone line; bytes are crypto-random.
export function generatePortalPassword(): string {
  const bytes = runtime().ids.randomBytes(PORTAL_PASSWORD_LENGTH);
  let password = "";
  for (const byte of bytes) password += ALPHABET[byte % ALPHABET.length];
  return password;
}

// Switching the portal on fills an empty password; a typed one is kept.
export function portalPasswordOnEnable(current: string): string {
  return current.trim() ? current : generatePortalPassword();
}
