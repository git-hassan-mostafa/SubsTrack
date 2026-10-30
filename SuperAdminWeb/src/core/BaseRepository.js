import { adminClient } from "./supabaseAdmin.js";
import { AppError, GENERIC_ERROR, InvalidKeyError, SECRET_KEY_BLOCKED } from "./errors.js";

const KEY_REJECTED = "Supabase did not accept this key. Paste the service role key again.";
const OFFLINE = "Cannot reach Supabase. Check your internet connection and try again.";
const KEY_ERROR_CODES = new Set(["PGRST301", "bad_jwt", "not_admin", "no_authorization"]);

const DEFAULT_MESSAGES = {
  23505: "This already exists.",
  23503: "This is still linked to other records.",
  23514: "The database refused one of these values.",
  weak_password: "This password is too weak. Use a longer one.",
};

export class BaseRepository {
  get db() {
    return adminClient();
  }

  // `messages` maps a Postgres/Auth error code to this call's own text.
  fail(error, status, messages = {}) {
    const code = String(error?.code ?? "");
    const raw = String(error?.message ?? "");
    if (messages[code]) throw new AppError(messages[code]);
    if (/secret api key/i.test(raw)) throw new InvalidKeyError(SECRET_KEY_BLOCKED);
    if (status === 401 || KEY_ERROR_CODES.has(code)) throw new InvalidKeyError(KEY_REJECTED);
    if (!status) throw new AppError(OFFLINE);
    throw new AppError(DEFAULT_MESSAGES[code] ?? GENERIC_ERROR);
  }
}
