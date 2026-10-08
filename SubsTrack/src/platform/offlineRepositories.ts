import type { Repositories } from "@shared/core/runtime/repositories";
import { OfflineAuditRepository } from "@/src/modules/admin/audit/repository/AuditRepository.offline";
import { OfflineAllowanceRepository } from "@/src/modules/admin/billing/repository/AllowanceRepository.offline";
import { OfflineCustomerRequestRepository } from "@/src/modules/admin/billing/repository/CustomerRequestRepository.offline";
import { OfflineBranchRepository } from "@/src/modules/admin/branches/repository/BranchRepository.offline";
import { OfflineCurrencyRepository } from "@/src/modules/admin/currencies/repository/CurrencyRepository.offline";
import { OfflinePlanRepository } from "@/src/modules/admin/plans/repository/PlanRepository.offline";
import { OfflineProductRepository } from "@/src/modules/admin/products/repository/ProductRepository.offline";
import { OfflineServiceRepository } from "@/src/modules/admin/service-catalog/repository/ServiceRepository.offline";
import { OfflineTenantSettingRepository } from "@/src/modules/admin/tenant-settings/repository/TenantSettingRepository.offline";
import { OfflineUserRepository } from "@/src/modules/admin/users/repository/UserRepository.offline";
import { OfflineAuthRepository } from "@/src/modules/authentication/auth/repository/AuthRepository.offline";
import { OfflineSignupRepository } from "@/src/modules/authentication/signup/repository/SignupRepository.offline";
import { OfflineSkippedMonthRepository } from "@/src/modules/customer/customer-payments/repository/SkippedMonthRepository.offline";
import { OfflineCustomerPlanRepository } from "@/src/modules/customer/customer-plans/repository/CustomerPlanRepository.offline";
import { OfflinePriceHistoryRepository } from "@/src/modules/customer/customer-plans/repository/PriceHistoryRepository.offline";
import { OfflineCustomerRepository } from "@/src/modules/customer/customers/repository/CustomerRepository.offline";
import { OfflineCustomerStatusRepository } from "@/src/modules/customer/customers/repository/CustomerStatusRepository.offline";
import { OfflineChargeRepository } from "@/src/modules/ledger/repository/ChargeRepository.offline";
import { OfflineCollectionRepository } from "@/src/modules/ledger/repository/CollectionRepository.offline";
import { OfflineOptionRepository } from "@/src/modules/options/repository/OptionRepository.offline";
import { OfflineExpenseRepository } from "@/src/modules/transaction/expenses/repository/ExpenseRepository.offline";
import { OfflineSaleRepository } from "@/src/modules/transaction/sales/repository/SaleRepository.offline";
import { OfflineWhatsAppRepository } from "@/src/modules/whatsapp/repository/WhatsAppRepository.offline";

export function createOfflineRepositories(): Repositories {
  return {
    audit: new OfflineAuditRepository(),
    allowance: new OfflineAllowanceRepository(),
    customerRequest: new OfflineCustomerRequestRepository(),
    branch: new OfflineBranchRepository(),
    currency: new OfflineCurrencyRepository(),
    plan: new OfflinePlanRepository(),
    product: new OfflineProductRepository(),
    service: new OfflineServiceRepository(),
    tenantSetting: new OfflineTenantSettingRepository(),
    user: new OfflineUserRepository(),
    auth: new OfflineAuthRepository(),
    signup: new OfflineSignupRepository(),
    skippedMonth: new OfflineSkippedMonthRepository(),
    customerPlan: new OfflineCustomerPlanRepository(),
    priceHistory: new OfflinePriceHistoryRepository(),
    customer: new OfflineCustomerRepository(),
    customerStatus: new OfflineCustomerStatusRepository(),
    charge: new OfflineChargeRepository(),
    collection: new OfflineCollectionRepository(),
    option: new OfflineOptionRepository(),
    expense: new OfflineExpenseRepository(),
    sale: new OfflineSaleRepository(),
    whatsApp: new OfflineWhatsAppRepository(),
  };
}
