import type { SQLiteDatabase } from 'expo-sqlite';


export async function initOfflineDb(): Promise<void> {
}

export function getDb(): SQLiteDatabase {
  throw new Error('[offline] getDb() is not available on web');
}

export function isOfflineDbReady(): boolean {
  return false;
}

export async function wipeOfflineData(): Promise<void> {
}
