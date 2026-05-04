import { supabase } from '@/src/shared/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

export abstract class BaseRepository {
  protected readonly db: SupabaseClient = supabase;

  protected handleError(error: unknown): never {
    if (error && typeof error === 'object' && 'message' in error) {
      throw new Error((error as { message: string }).message);
    }
    throw new Error('An unexpected error occurred');
  }
}
