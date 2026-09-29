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
import type { RouteAccess } from "./access";

export type NavSection = "main" | "admin";

export interface AppPage {
  path: string;
  titleKey: string;
  access: RouteAccess;
  icon: SvgIconComponent;
  nav?: NavSection;
}

const ADMIN: RouteAccess = { role: "admin" };
const ANY_ROLE: RouteAccess = {};

// The one page list: the router guards it, the left nav shows it.
export const APP_PAGES: readonly AppPage[] = [
  {
    path: "dashboard",
    titleKey: "dashboard.title",
    access: ADMIN,
    icon: HomeOutlined,
    nav: "main",
  },
  {
    path: "customers",
    titleKey: "customers.title",
    access: ANY_ROLE,
    icon: PeopleOutlined,
    nav: "main",
  },
  {
    path: "sales",
    titleKey: "sales.title",
    access: ANY_ROLE,
    icon: ReceiptLongOutlined,
    nav: "main",
  },
  {
    path: "debts",
    titleKey: "transactions.tab_debts",
    access: ANY_ROLE,
    icon: RequestQuoteOutlined,
    nav: "main",
  },
  {
    path: "money-received",
    titleKey: "ledger.history_title",
    access: ANY_ROLE,
    icon: PaymentsOutlined,
    nav: "main",
  },
  {
    path: "expenses",
    titleKey: "expenses.title",
    access: ADMIN,
    icon: TrendingDownOutlined,
    nav: "main",
  },
  {
    path: "reports",
    titleKey: "reports.title",
    access: ADMIN,
    icon: BarChartOutlined,
    nav: "main",
  },
  {
    path: "admin/users",
    titleKey: "users.title",
    access: ADMIN,
    icon: GroupOutlined,
    nav: "admin",
  },
  {
    path: "admin/wallets",
    titleKey: "wallet.title",
    access: ADMIN,
    icon: AccountBalanceWalletOutlined,
    nav: "admin",
  },
  {
    path: "admin/plans",
    titleKey: "plans.title",
    access: ADMIN,
    icon: SellOutlined,
    nav: "admin",
  },
  {
    path: "admin/products",
    titleKey: "products.title",
    access: ADMIN,
    icon: Inventory2Outlined,
    nav: "admin",
  },
  {
    path: "admin/services",
    titleKey: "services.title",
    access: ADMIN,
    icon: BuildOutlined,
    nav: "admin",
  },
  {
    path: "admin/currencies",
    titleKey: "tenant_settings.currencies_section_title",
    access: ADMIN,
    icon: CurrencyExchangeOutlined,
    nav: "admin",
  },
  {
    path: "admin/branches",
    titleKey: "branches.section_title",
    access: ADMIN,
    icon: StoreOutlined,
    nav: "admin",
  },
  {
    path: "admin/organization",
    titleKey: "tenant_settings.title",
    access: { role: "tenantWideAdmin" },
    icon: SettingsOutlined,
    nav: "admin",
  },
  {
    path: "admin/audit",
    titleKey: "audit.title",
    access: ADMIN,
    icon: HistoryOutlined,
    nav: "admin",
  },
  {
    path: "admin/whatsapp",
    titleKey: "whatsapp.title",
    access: { role: "tenantWideAdmin", whatsapp: true },
    icon: WhatsApp,
    nav: "admin",
  },
  {
    path: "admin/whatsapp-history",
    titleKey: "whatsapp.history_title",
    access: { role: "admin", whatsapp: true },
    icon: ForumOutlined,
    nav: "admin",
  },
  {
    path: "my-wallet",
    titleKey: "wallet.my_title",
    access: ANY_ROLE,
    icon: AccountBalanceWalletOutlined,
  },
];
