import { IS_OFFLINE_CAPABLE } from '../offline/platform';
import { logException } from './errorLogger';

let installed = false;

/**
 * Hook React Native's global JS-thread error handler so uncaught errors (the
 * ones that never reach a React ErrorBoundary, e.g. thrown from a timer or a
 * promise callback outside render) still get logged. Chains to whatever
 * handler was previously installed (Expo's own dev/prod error overlay) so
 * this only adds logging, never changes the app's crash behavior.
 */
export function installGlobalErrorHandler(): void {
  if (!IS_OFFLINE_CAPABLE || installed) return;
  installed = true;

  const previousHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    void logException({
      source: 'global_handler',
      message: error.message,
      stack: error.stack,
    });
    previousHandler?.(error, isFatal);
  });
}
