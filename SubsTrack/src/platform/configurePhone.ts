import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { configureShared } from "@shared/core/runtime/runtime";
import { createSupabaseRepositories } from "@shared/core/runtime/supabaseRepositories";
import { AUTH_STORAGE_KEY, supabase } from "@/src/shared/lib/supabase";
import { logException } from "@/src/core/errorLog/errorLogger";
import { getStore } from "@/src/state/globalStore";
import { createOfflineRepositories } from "./offlineRepositories";
import { phoneIds } from "./phoneIds";

// The web check keeps Expo web alive until the new web app takes over (H2).
export function configurePhone(): void {
  configureShared({
    supabase,
    authStorageKey: AUTH_STORAGE_KEY,
    repositories:
      Platform.OS === "web"
        ? createSupabaseRepositories()
        : createOfflineRepositories(),
    ids: phoneIds,
    storage: AsyncStorage,
    actor: () => getStore().getState().auth.user,
    logException,
  });
}
