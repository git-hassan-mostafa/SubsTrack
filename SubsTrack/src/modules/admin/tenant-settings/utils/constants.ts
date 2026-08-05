// Well-known per-tenant setting keys (the `tenant_settings` table). The
// tenant-scoped twin of OPTION_KEYS — add new keys here so call sites reference
// a constant, not a magic string.
export const TENANT_SETTING_KEYS = {
  // When an unbilled month turns "unpaid" — see UnpaidStartRule.
  unpaidStartRule: 'UnpaidStartRule',
  // Currency every amount is displayed in. Empty/unset = USD (the base).
  displayCurrencyId: 'DisplayCurrencyId',
} as const;
