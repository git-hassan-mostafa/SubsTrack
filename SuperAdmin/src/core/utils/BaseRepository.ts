import { supabaseAdmin } from '@/src/shared/lib/supabaseAdmin';
import type { SupabaseClient } from '@supabase/supabase-js';

export abstract class BaseRepository {
  protected readonly db: SupabaseClient = supabaseAdmin;

  protected handleError(error: unknown): never {
    if (error && typeof error === 'object' && 'message' in error) {
      throw new Error((error as { message: string }).message);
    }
    throw new Error('An unexpected error occurred');
  }
}
