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
  // The slices with an "ensure loaded" action carry a `loaded` flag, so an
  // empty-but-visited screen still refreshes; the rest have no such flag and
  // fall back to `items.length`.
  if (s.customers.loaded) void s.customers.fetchCustomers();
  if (s.plans.loaded) void s.plans.fetchPlans();
  if (s.currencies.loaded) void s.currencies.fetchCurrencies();
  if (s.branches.loaded) void s.branches.fetchBranches();
  if (s.products.loaded) void s.products.fetchProducts();
  if (s.services.loaded) void s.services.fetchServices();
  if (s.users.loaded) void s.users.fetchUsers();
  if (s.sales.items.length) void s.sales.fetchSales();
  if (s.paymentsList.items.length) void s.paymentsList.fetchPayments();
  if (s.wallet.items.length) void s.wallet.fetchWallets();
  if (s.debts.items.length) void s.debts.fetchDebts();
  if (s.expenses.items.length) void s.expenses.fetchExpenses();
  // A pull brings other devices' audit entries into the local window.
  if (s.audit.items.length) void s.audit.fetchEntries();

  // The customer-list badges (month status + overdue, net debt) are derived from
  // the customer set, so refresh them whenever the customer list is loaded. The
  // status map is built from the customers already in the store — the list
  // screen rebuilds it again on focus once its own fetch lands.
  if (s.customers.loaded) {
    void s.payments.fetchCustomerStatuses(s.customers.items);
    void s.debts.fetchNetByCustomer();
  }

  // Tier usage counts (drives limit gating) — cheap and always relevant.
  void s.subscription.refreshUsage();
}
