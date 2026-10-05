import type { ComponentType } from "react";
import type { SvgIconComponent } from "@mui/icons-material";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import BarChartOutlined from "@mui/icons-material/BarChartOutlined";
import BuildOutlined from "@mui/icons-material/BuildOutlined";
import CurrencyExchangeOutlined from "@mui/icons-material/CurrencyExchangeOutlined";
import ForumOutlined from "@mui/icons-material/ForumOutlined";
import GroupOutlined from "@mui/icons-material/GroupOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import HomeOutlined from "@mui/icons-material/HomeOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import PeopleOutlined from "@mui/icons-material/PeopleOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import RequestQuoteOutlined from "@mui/icons-material/RequestQuoteOutlined";
import SellOutlined from "@mui/icons-material/SellOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import StoreOutlined from "@mui/icons-material/StoreOutlined";
import TrendingDownOutlined from "@mui/icons-material/TrendingDownOutlined";
import WhatsApp from "@mui/icons-material/WhatsApp";
import { AuditLogPage } from "@/modules/admin/audit/AuditLogPage";
import { BranchesPage } from "@/modules/admin/branches/BranchesPage";
import { CurrenciesPage } from "@/modules/admin/currencies/CurrenciesPage";
import { PlansPage } from "@/modules/admin/plans/PlansPage";
import { ProductsPage } from "@/modules/admin/products/ProductsPage";
import { ServicesPage } from "@/modules/admin/services/ServicesPage";
import { OrganizationPage } from "@/modules/admin/tenant-settings/OrganizationPage";
import { UsersPage } from "@/modules/admin/users/UsersPage";
import { CustomerDetailPage } from "@/modules/customer/customer-detail/CustomerDetailPage";
import { CustomersPage } from "@/modules/customer/customers/CustomersPage";
import { MoneyReceivedPage } from "@/modules/ledger/received/MoneyReceivedPage";
import { DebtsPage } from "@/modules/transaction/debts/DebtsPage";
import { ExpensesPage } from "@/modules/transaction/expenses/ExpensesPage";
import { CustomerSalesPage } from "@/modules/transaction/sales/CustomerSalesPage";
import { SalesPage } from "@/modules/transaction/sales/SalesPage";
import { PAGE_ACCESS, type PageAccess } from "@shared/modules/authentication/auth/utils/pageAccess";

export type NavSection = "main" | "admin";

export interface AppPage {
  path: string;
  titleKey: string;
  access: PageAccess;
  icon: SvgIconComponent;
  nav?: NavSection;
  component?: ComponentType;
}

// The one page list: the router guards it, the left nav shows it.
export const APP_PAGES: readonly AppPage[] = [
  {
    path: "dashboard",
    titleKey: "dashboard.title",
    access: PAGE_ACCESS.dashboard,
    icon: HomeOutlined,
    nav: "main",
  },
  {
    path: "customers",
    titleKey: "customers.title",
    access: PAGE_ACCESS.customers,
    icon: PeopleOutlined,
    nav: "main",
    component: CustomersPage,
  },
  {
    path: "customers/:id",
    titleKey: "customers.title",
    access: PAGE_ACCESS.customers,
    icon: PeopleOutlined,
    component: CustomerDetailPage,
  },
  {
    path: "customers/:id/sales",
    titleKey: "sales.title",
    access: PAGE_ACCESS.sales,
    icon: ReceiptLongOutlined,
    component: CustomerSalesPage,
  },
  {
    path: "sales",
    titleKey: "sales.title",
    access: PAGE_ACCESS.sales,
    icon: ReceiptLongOutlined,
    nav: "main",
    component: SalesPage,
  },
  {
    path: "debts",
    titleKey: "transactions.tab_debts",
    access: PAGE_ACCESS.debts,
    icon: RequestQuoteOutlined,
    nav: "main",
    component: DebtsPage,
  },
  {
    path: "money-received",
    titleKey: "ledger.history_title",
    access: PAGE_ACCESS.money_received,
    icon: PaymentsOutlined,
    nav: "main",
    component: MoneyReceivedPage,
  },
  {
    path: "expenses",
    titleKey: "expenses.title",
    access: PAGE_ACCESS.expenses,
    icon: TrendingDownOutlined,
    nav: "main",
    component: ExpensesPage,
  },
  {
    path: "reports",
    titleKey: "reports.title",
    access: PAGE_ACCESS.reports,
    icon: BarChartOutlined,
    nav: "main",
  },
  {
    path: "admin/users",
    titleKey: "users.title",
    access: PAGE_ACCESS.users,
    icon: GroupOutlined,
    nav: "admin",
    component: UsersPage,
  },
  {
    path: "admin/wallets",
    titleKey: "wallet.title",
    access: PAGE_ACCESS.wallets,
    icon: AccountBalanceWalletOutlined,
    nav: "admin",
  },
  {
    path: "admin/plans",
    titleKey: "plans.title",
    access: PAGE_ACCESS.plans,
    icon: SellOutlined,
    nav: "admin",
    component: PlansPage,
  },
  {
    path: "admin/products",
    titleKey: "products.title",
    access: PAGE_ACCESS.products,
    icon: Inventory2Outlined,
    nav: "admin",
    component: ProductsPage,
  },
  {
    path: "admin/services",
    titleKey: "services.title",
    access: PAGE_ACCESS.services,
    icon: BuildOutlined,
    nav: "admin",
    component: ServicesPage,
  },
  {
    path: "admin/currencies",
    titleKey: "tenant_settings.currencies_section_title",
    access: PAGE_ACCESS.currencies,
    icon: CurrencyExchangeOutlined,
    nav: "admin",
    component: CurrenciesPage,
  },
  {
    path: "admin/branches",
    titleKey: "branches.section_title",
    access: PAGE_ACCESS.branches,
    icon: StoreOutlined,
    nav: "admin",
    component: BranchesPage,
  },
  {
    path: "admin/organization",
    titleKey: "tenant_settings.title",
    access: PAGE_ACCESS.organization,
    icon: SettingsOutlined,
    nav: "admin",
    component: OrganizationPage,
  },
  {
    path: "admin/audit",
    titleKey: "audit.title",
    access: PAGE_ACCESS.audit,
    icon: HistoryOutlined,
    nav: "admin",
    component: AuditLogPage,
  },
  {
    path: "admin/whatsapp",
    titleKey: "whatsapp.title",
    access: PAGE_ACCESS.whatsapp,
    icon: WhatsApp,
    nav: "admin",
  },
  {
    path: "admin/whatsapp-history",
    titleKey: "whatsapp.history_title",
    access: PAGE_ACCESS.whatsapp_history,
    icon: ForumOutlined,
    nav: "admin",
  },
  {
    path: "my-wallet",
    titleKey: "wallet.my_title",
    access: PAGE_ACCESS.my_wallet,
    icon: AccountBalanceWalletOutlined,
  },
];
