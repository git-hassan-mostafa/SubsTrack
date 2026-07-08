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

/**
 * Thrown at login when a DIFFERENT tenant signs in while the current tenant still
 * has un-pushed local writes. We can't safely wipe (money data would be lost) and
 * can't push the old tenant's rows under the new session (RLS), so we refuse the
 * switch and tell the user to sign back into the previous workspace and sync first.
 */
export class WorkspaceSwitchBlockedError extends Error {
  readonly code = 'WORKSPACE_SWITCH_BLOCKED';

  constructor(message?: string) {
    super(message ?? i18n.t('errors.workspace_switch_blocked'));
    this.name = 'WorkspaceSwitchBlockedError';
  }
}
