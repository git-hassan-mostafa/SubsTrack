// Only what the money graph touches: the repository platform switch reads
// Platform.OS. 'web' keeps the Supabase repositories in play; every service
// test mocks the repository module anyway, so the choice never decides a result.
export const Platform = { OS: 'web' as const, select: (o: Record<string, unknown>) => o.web ?? o.default };
export const I18nManager = { isRTL: false, forceRTL: () => {}, allowRTL: () => {} };
export const NativeModules: Record<string, unknown> = {};
export const DevSettings = { reload: () => {} };
export const AppState = { addEventListener: () => ({ remove: () => {} }), currentState: 'active' };
export default { Platform, I18nManager, NativeModules, DevSettings, AppState };
