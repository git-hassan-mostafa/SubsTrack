import type { RouteAccess } from "./access";

export interface AppPage {
  path: string;
  titleKey: string;
  access: RouteAccess;
}

const ADMIN: RouteAccess = { role: "admin" };
const ANY_ROLE: RouteAccess = {};

// The one list of signed-in pages: the router guards it, the nav (B2) shows it.
export const APP_PAGES: readonly AppPage[] = [
  { path: "dashboard", titleKey: "dashboard.title", access: ADMIN },
  { path: "customers", titleKey: "customers.title", access: ANY_ROLE },
  { path: "sales", titleKey: "sales.title", access: ANY_ROLE },
  { path: "debts", titleKey: "transactions.tab_debts", access: ANY_ROLE },
  { path: "money-received", titleKey: "ledger.history_title", access: ANY_ROLE },
  { path: "expenses", titleKey: "expenses.title", access: ADMIN },
  { path: "reports", titleKey: "reports.title", access: ADMIN },
  { path: "admin/users", titleKey: "users.title", access: ADMIN },
  { path: "admin/wallets", titleKey: "wallet.title", access: ADMIN },
  { path: "admin/plans", titleKey: "plans.title", access: ADMIN },
  { path: "admin/products", titleKey: "products.title", access: ADMIN },
  { path: "admin/services", titleKey: "services.title", access: ADMIN },
  {
    path: "admin/currencies",
    titleKey: "tenant_settings.currencies_section_title",
    access: ADMIN,
  },
  { path: "admin/branches", titleKey: "branches.section_title", access: ADMIN },
  {
    path: "admin/organization",
    titleKey: "tenant_settings.title",
    access: { role: "tenantWideAdmin" },
  },
  { path: "admin/audit", titleKey: "audit.title", access: ADMIN },
  {
    path: "admin/whatsapp",
    titleKey: "whatsapp.title",
    access: { role: "tenantWideAdmin", whatsapp: true },
  },
  {
    path: "admin/whatsapp-history",
    titleKey: "whatsapp.history_title",
    access: { role: "admin", whatsapp: true },
  },
  { path: "my-wallet", titleKey: "wallet.my_title", access: ANY_ROLE },
];
