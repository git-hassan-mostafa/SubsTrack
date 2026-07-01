import { Platform } from 'react-native';

/**
 * Offline-first is NATIVE ONLY. On web the app talks to Supabase directly,
 * exactly as before — no SQLite, no outbox, no sync engine. Every offline
 * code path is gated on this flag so the web bundle never opens a local DB.
 */
export const IS_OFFLINE_CAPABLE = Platform.OS !== 'web';
