import AsyncStorage from "@react-native-async-storage/async-storage";
import { configureShared } from "@shared/core/runtime/runtime";
import { supabase } from "@/src/shared/lib/supabase";
import { logException } from "@/src/core/errorLog/errorLogger";
import { getStore } from "@/src/state/globalStore";
import { phoneIds } from "./phoneIds";

export function configurePhone(): void {
  configureShared({
    supabase,
    ids: phoneIds,
    storage: AsyncStorage,
    actor: () => getStore().getState().auth.user,
    logException,
  });
}
