// Re-fetch the loaded stores after a sync brought fresh data down.
//
// The offline sync engine (core layer) pulls new rows into SQLite, but the
// Zustand stores were already filled from the OLD local data when each screen
// first loaded — nothing tells them to reload. This function is that signal.
//
// It is registered once at bootstrap via `setSyncRefreshHandler` and fired only
// after a fully-successful pull on a **cold-start** or **manual** sync (never on
// the calm 5-minute background ticks). Keeping it in the state layer means the
// core sync engine never imports state — the dependency is inverted through the
// registered callback.
//
// Scope: "only what's on screen". A slice is only populated once its screen was
// opened, so re-fetching only the slices that already hold data refreshes exactly
// the screens the user has visited. The dashboard always refreshes because home
// is the landing screen. List fetches reset to page 1 (fresh, from the top).

import { getStore } from './globalStore';

/** Re-fetch the dashboard plus every list store that already holds data. */
export function refreshActiveData(): void {
  const s = getStore().getState();

  // Home is the landing screen — always refresh its metrics + revenue trend.
  void s.dashboard.fetchMetrics();

  // Each list refreshes only if it was ever loaded (its screen was opened).
  if (s.customers.items.length) void s.customers.fetchCustomers();
  if (s.plans.items.length) void s.plans.fetchPlans();
  if (s.currencies.items.length) void s.currencies.fetchCurrencies();
  if (s.branches.items.length) void s.branches.fetchBranches();
  if (s.products.items.length) void s.products.fetchProducts();
  if (s.sales.items.length) void s.sales.fetchSales();
  if (s.users.items.length) void s.users.fetchUsers();
  if (s.paymentsList.items.length) void s.paymentsList.fetchPayments();
  if (s.wallet.items.length) void s.wallet.fetchWallets();
  if (s.debts.items.length) void s.debts.fetchDebts();

  // The customer-list payment flags (current-month status, net debt) are derived
  // from the customer set, so refresh them whenever the customer list is loaded.
  if (s.customers.items.length) {
    void s.payments.fetchCurrentMonthPaymentStatus();
    void s.debts.fetchNetByCustomer();
  }

  // Tier usage counts (drives limit gating) — cheap and always relevant.
  void s.subscription.refreshUsage();
}
