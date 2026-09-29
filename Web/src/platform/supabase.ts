import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars. Copy Web/.env.example to Web/.env.local and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
  );
}

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

// Spelled out, not defaulted, so sign-out can clear it by hand (#158).
export const AUTH_STORAGE_KEY = `sb-${projectRef}-auth-token`;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: window.localStorage,
    storageKey: AUTH_STORAGE_KEY,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
