import { supabase } from "@/src/shared/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import i18n from "@/src/core/i18n";

export abstract class BaseRepository {
  protected readonly db: SupabaseClient = supabase;

  protected handleError(error: unknown): never {
    if (error && typeof error === "object" && "message" in error) {
      console.error("[Repository Error]", error.message);
      throw new Error((error as { message: string }).message);
    }
    console.error("[Repository Error]", error);
    throw new Error(i18n.t("errors.unexpected"));
  }
}
