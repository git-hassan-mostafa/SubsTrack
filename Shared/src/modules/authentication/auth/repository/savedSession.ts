import type { Session } from "@supabase/supabase-js";
import { runtime } from "@shared/core/runtime/runtime";

// Reads what supabase-js last saved, skipping its network refresh — gotcha #192
export async function readSavedSession(): Promise<Session | null> {
  const { storage, authStorageKey } = runtime();
  const raw = await storage.getItem(authStorageKey);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as Session | null;
    return session?.refresh_token && session.user?.id ? session : null;
  } catch {
    return null;
  }
}
