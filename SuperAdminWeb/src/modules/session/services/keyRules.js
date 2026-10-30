import { SECRET_KEY_BLOCKED } from "../../../core/errors.js";

function jwtRole(key) {
  try {
    const payload = key.split(".")[1].replaceAll("-", "+").replaceAll("_", "/");
    return JSON.parse(atob(payload)).role ?? null;
  } catch {
    return null;
  }
}

// Checked first: an anon key would quietly read through RLS as empty lists.
export function keyProblem(key) {
  if (!key) return "Paste the service role key.";
  if (key.startsWith("sb_secret_")) return SECRET_KEY_BLOCKED;
  if (key.startsWith("sb_publishable_")) return "This is the public key. Paste the service role key.";
  const role = jwtRole(key);
  if (role === "anon") return "This is the anon key. Paste the service role key.";
  if (role !== "service_role") return "This does not look like a service role key.";
  return null;
}
