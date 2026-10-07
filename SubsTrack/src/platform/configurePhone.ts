import AsyncStorage from "@react-native-async-storage/async-storage";
import { configureShared } from "@shared/core/runtime/runtime";
import { AUTH_STORAGE_KEY, supabase } from "@/src/shared/lib/supabase";
import { logException } from "@/src/core/errorLog/errorLogger";
import { getStore } from "@shared/state/globalStore";
import { createOfflineRepositories } from "./offlineRepositories";
import { phoneIds } from "./phoneIds";

export function configurePhone(): void {
  configureShared({
    supabase,
    authStorageKey: AUTH_STORAGE_KEY,
    repositories: createOfflineRepositories(),
    ids: phoneIds,
    storage: AsyncStorage,
    actor: () => getStore().getState().auth.user,
    logException,
  });
}
