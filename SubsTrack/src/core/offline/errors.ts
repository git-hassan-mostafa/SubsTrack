import i18n from '@/src/core/i18n';

/**
 * Thrown by offline repository methods that cannot work without the network
 * (auth, user-management + signup edge functions, tenant upgrade). Its
 * `.message` is a localized string so it flows through the services' existing
 * `catch (e) { state.error = e.message }` and renders in the normal ErrorBanner
 * — no service/UI change needed.
 */
export class RequiresConnectionError extends Error {
  readonly code = 'REQUIRES_CONNECTION';

  constructor(message?: string) {
    super(message ?? i18n.t('errors.requires_connection'));
    this.name = 'RequiresConnectionError';
  }
}
