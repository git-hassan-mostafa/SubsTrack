import { configureShared } from "@shared/core/runtime/runtime";
import { supabase } from "@/src/shared/lib/supabase";
import { phoneIds } from "@/src/platform/phoneIds";
import { fakeRepositories } from "./fakeRepositories";

const memory = new Map<string, string>();

// The phone's own ids adapter runs here over the node-crypto expo-crypto stub.
configureShared({
  supabase,
  authStorageKey: "test-auth-token",
  repositories: fakeRepositories,
  ids: phoneIds,
  storage: {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => void memory.set(key, value),
    removeItem: (key) => void memory.delete(key),
  },
  actor: () => null,
});
