import { enableMapSet } from "immer";
import { configureShared } from "@shared/core/runtime/runtime";
import { createSupabaseRepositories } from "@shared/core/runtime/supabaseRepositories";
import { webCryptoIds } from "@shared/core/runtime/webCryptoIds";
import { getStore } from "@shared/state/globalStore";
import { AUTH_STORAGE_KEY, supabase } from "./supabase";

// The web has no offline mirror, so it always talks to Supabase directly.
export function configureWeb(): void {
  enableMapSet();
  configureShared({
    supabase,
    authStorageKey: AUTH_STORAGE_KEY,
    repositories: createSupabaseRepositories(),
    ids: webCryptoIds,
    storage: window.localStorage,
    actor: () => getStore().getState().auth.user,
    logException: async (input) => {
      console.error(`[${input.source}] ${input.message}`, input.context ?? "");
    },
  });
}
