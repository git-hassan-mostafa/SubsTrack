import "react-native-url-polyfill/auto";
import { AppState, Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";
import { supabaseStorage } from "./storage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars. Ensure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set in .env and that `expo export` is run from the SubsTrack/ directory."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: supabaseStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// `autoRefreshToken` is a foreground-only timer in React Native, so a token that
// expires while the app is backgrounded is never renewed and the next edge
// function call goes up dead ("Auth session missing!"). Drive it from AppState —
// see gotcha #123. The browser keeps its own timer alive, hence native-only.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
  // The listener only fires on a CHANGE, so start the timer for this launch.
  if (AppState.currentState === "active") void supabase.auth.startAutoRefresh();
}
