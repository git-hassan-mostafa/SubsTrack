export interface PageAccess {
  role?: "admin" | "tenantWideAdmin";
  whatsapp?: boolean;
}

export interface Viewer {
  isAdmin: boolean;
  isTenantWideAdmin: boolean;
  whatsappEnabled: boolean;
}

export type PageKey =
  | "dashboard"
  | "customers"
  | "sales"
  | "debts"
  | "money_received"
  | "expenses"
  | "reports"
  | "users"
  | "wallets"
  | "plans"
  | "products"
  | "services"
  | "currencies"
  | "branches"
  | "organization"
  | "audit"
  | "whatsapp"
  | "whatsapp_history"
  | "my_wallet";

const ADMIN: PageAccess = { role: "admin" };
const ANY_ROLE: PageAccess = {};

// The one role table both apps guard their pages with.
export const PAGE_ACCESS: Record<PageKey, PageAccess> = {
  dashboard: ADMIN,
  customers: ANY_ROLE,
  sales: ANY_ROLE,
  debts: ANY_ROLE,
  money_received: ANY_ROLE,
  expenses: ADMIN,
  reports: ADMIN,
  users: ADMIN,
  wallets: ADMIN,
  plans: ADMIN,
  products: ADMIN,
  services: ADMIN,
  currencies: ADMIN,
  branches: ADMIN,
  organization: { role: "tenantWideAdmin" },
  audit: ADMIN,
  whatsapp: { role: "tenantWideAdmin", whatsapp: true },
  whatsapp_history: { role: "admin", whatsapp: true },
  my_wallet: ANY_ROLE,
};

// `useAuth()` returns a Viewer as-is.
export function canOpen(viewer: Viewer, access: PageAccess): boolean {
  if (access.whatsapp && !viewer.whatsappEnabled) return false;
  if (access.role === "admin") return viewer.isAdmin;
  if (access.role === "tenantWideAdmin") return viewer.isTenantWideAdmin;
  return true;
}

export function canOpenPage(viewer: Viewer, page: PageKey): boolean {
  return canOpen(viewer, PAGE_ACCESS[page]);
}

export type LandingPage = Extract<PageKey, "dashboard" | "customers">;

export function landingPage(viewer: Pick<Viewer, "isAdmin">): LandingPage {
  return viewer.isAdmin ? "dashboard" : "customers";
}
