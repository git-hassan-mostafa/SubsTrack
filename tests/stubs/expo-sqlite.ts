// The offline repositories import this at module load. No test drives a real
// SQLite connection — offline behaviour is asserted through mocked repositories.
export const openDatabaseAsync = async () => {
  throw new Error('expo-sqlite is not available in unit tests');
};
export const openDatabaseSync = () => {
  throw new Error('expo-sqlite is not available in unit tests');
};
export type SQLiteDatabase = unknown;
export default { openDatabaseAsync, openDatabaseSync };
