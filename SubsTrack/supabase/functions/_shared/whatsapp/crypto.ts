// @ts-nocheck — Deno runtime file.

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const KEY_VERSION = 1;

export const CURRENT_KEY_VERSION = KEY_VERSION;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

let cachedKey: Promise<CryptoKey> | null = null;

// 32 random bytes, base64. Losing it means every tenant must reconnect.
function tokenKey(): Promise<CryptoKey> {
  if (!cachedKey) {
    const raw = Deno.env.get("WHATSAPP_TOKEN_KEY");
    if (!raw) throw new Error("WHATSAPP_TOKEN_KEY is not set");
    const bytes = fromBase64(raw);
    if (bytes.length !== 32) throw new Error("WHATSAPP_TOKEN_KEY must be 32 bytes");
    cachedKey = crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
  }
  return cachedKey;
}

export async function encryptSecret(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await tokenKey(),
    encoder.encode(plain),
  );
  return `v${KEY_VERSION}:${toBase64(iv)}:${toBase64(new Uint8Array(cipher))}`;
}

export async function decryptSecret(packed: string): Promise<string> {
  const [, iv, cipher] = packed.split(":");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    await tokenKey(),
    fromBase64(cipher),
  );
  return decoder.decode(plain);
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

export function timingSafeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

export function randomToken(byteCount = 32): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(byteCount)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function randomPin(): string {
  const [value] = crypto.getRandomValues(new Uint32Array(1));
  return String(value % 1_000_000).padStart(6, "0");
}
