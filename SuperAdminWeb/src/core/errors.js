export class AppError extends Error {}

export class InvalidKeyError extends AppError {}

export const GENERIC_ERROR = "Something went wrong. Please try again.";

export const SECRET_KEY_BLOCKED =
  "Supabase blocks new secret keys (sb_secret_…) in a browser. Paste the legacy service_role key (it starts with eyJ).";

let onInvalidKey = () => {};

export function setInvalidKeyHandler(handler) {
  onInvalidKey = handler;
}

// A dead key ends the session instead of a banner, so it returns null.
export function errorMessage(error) {
  if (error instanceof InvalidKeyError) {
    onInvalidKey(error.message);
    return null;
  }
  if (error instanceof AppError) return error.message;
  console.error(error);
  return GENERIC_ERROR;
}
