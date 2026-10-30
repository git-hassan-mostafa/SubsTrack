import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config.js";
import { InvalidKeyError } from "./errors.js";

let client = null;

// Service role client (bypasses RLS), built from the pasted key only.
export function connectAdmin(serviceKey) {
  client = createClient(SUPABASE_URL, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export function disconnectAdmin() {
  client = null;
}

export function adminClient() {
  if (!client) throw new InvalidKeyError("Paste the service role key to continue.");
  return client;
}
