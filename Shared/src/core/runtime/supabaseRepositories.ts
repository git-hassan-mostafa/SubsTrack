import type { Repositories } from "./repositories";
import { AuditRepository } from "@shared/modules/admin/audit/repository/AuditRepository";
import { AllowanceRepository } from "@shared/modules/admin/billing/repository/AllowanceRepository";
import { CustomerRequestRepository } from "@shared/modules/admin/billing/repository/CustomerRequestRepository";
import { BranchRepository } from "@shared/modules/admin/branches/repository/BranchRepository";
import { CurrencyRepository } from "@shared/modules/admin/currencies/repository/CurrencyRepository";
import { PlanRepository } from "@shared/modules/admin/plans/repository/PlanRepository";
import { ProductRepository } from "@shared/modules/admin/products/repository/ProductRepository";
import { ServiceRepository } from "@shared/modules/admin/service-catalog/repository/ServiceRepository";
import { TenantSettingRepository } from "@shared/modules/admin/tenant-settings/repository/TenantSettingRepository";
import { UserRepository } from "@shared/modules/admin/users/repository/UserRepository";
import { AuthRepository } from "@shared/modules/authentication/auth/repository/AuthRepository";
import { SignupRepository } from "@shared/modules/authentication/signup/repository/SignupRepository";
import { SkippedMonthRepository } from "@shared/modules/customer/customer-payments/repository/SkippedMonthRepository";
import { CustomerPlanRepository } from "@shared/modules/customer/customer-plans/repository/CustomerPlanRepository";
import { PriceHistoryRepository } from "@shared/modules/customer/customer-plans/repository/PriceHistoryRepository";
import { CustomerRepository } from "@shared/modules/customer/customers/repository/CustomerRepository";
import { CustomerStatusRepository } from "@shared/modules/customer/customers/repository/CustomerStatusRepository";
import { ChargeRepository } from "@shared/modules/ledger/repository/ChargeRepository";
import { CollectionRepository } from "@shared/modules/ledger/repository/CollectionRepository";
import { OptionRepository } from "@shared/modules/options/repository/OptionRepository";
import { ExpenseRepository } from "@shared/modules/transaction/expenses/repository/ExpenseRepository";
import { SaleRepository } from "@shared/modules/transaction/sales/repository/SaleRepository";
import { WhatsAppRepository } from "@shared/modules/whatsapp/repository/WhatsAppRepository";

// Web talks to Supabase directly; the phone wraps these in its offline mirror.
export function createSupabaseRepositories(): Repositories {
  return {
    audit: new AuditRepository(),
    allowance: new AllowanceRepository(),
    customerRequest: new CustomerRequestRepository(),
    branch: new BranchRepository(),
    currency: new CurrencyRepository(),
    plan: new PlanRepository(),
    product: new ProductRepository(),
    service: new ServiceRepository(),
    tenantSetting: new TenantSettingRepository(),
    user: new UserRepository(),
    auth: new AuthRepository(),
    signup: new SignupRepository(),
    skippedMonth: new SkippedMonthRepository(),
    customerPlan: new CustomerPlanRepository(),
    priceHistory: new PriceHistoryRepository(),
    customer: new CustomerRepository(),
    customerStatus: new CustomerStatusRepository(),
    charge: new ChargeRepository(),
    collection: new CollectionRepository(),
    option: new OptionRepository(),
    expense: new ExpenseRepository(),
    sale: new SaleRepository(),
    whatsApp: new WhatsAppRepository(),
  };
}
