import type { IAuditRepository } from "@shared/modules/admin/audit/repository/IAuditRepository";
import type { IAllowanceRepository } from "@shared/modules/admin/billing/repository/IAllowanceRepository";
import type { ICustomerRequestRepository } from "@shared/modules/admin/billing/repository/ICustomerRequestRepository";
import type { IBranchRepository } from "@shared/modules/admin/branches/repository/IBranchRepository";
import type { ICurrencyRepository } from "@shared/modules/admin/currencies/repository/ICurrencyRepository";
import type { IPlanRepository } from "@shared/modules/admin/plans/repository/IPlanRepository";
import type { IProductRepository } from "@shared/modules/admin/products/repository/IProductRepository";
import type { IServiceRepository } from "@shared/modules/admin/service-catalog/repository/IServiceRepository";
import type { ITenantSettingRepository } from "@shared/modules/admin/tenant-settings/repository/ITenantSettingRepository";
import type { IUserRepository } from "@shared/modules/admin/users/repository/IUserRepository";
import type { IAuthRepository } from "@shared/modules/authentication/auth/repository/IAuthRepository";
import type { ISignupRepository } from "@shared/modules/authentication/signup/repository/ISignupRepository";
import type { ISkippedMonthRepository } from "@shared/modules/customer/customer-payments/repository/ISkippedMonthRepository";
import type { ICustomerPlanRepository } from "@shared/modules/customer/customer-plans/repository/ICustomerPlanRepository";
import type { IPriceHistoryRepository } from "@shared/modules/customer/customer-plans/repository/IPriceHistoryRepository";
import type { ICustomerRepository } from "@shared/modules/customer/customers/repository/ICustomerRepository";
import type { ICustomerStatusRepository } from "@shared/modules/customer/customers/repository/ICustomerStatusRepository";
import type { IChargeRepository } from "@shared/modules/ledger/repository/IChargeRepository";
import type { ICollectionRepository } from "@shared/modules/ledger/repository/ICollectionRepository";
import type { IOptionRepository } from "@shared/modules/options/repository/IOptionRepository";
import type { IExpenseRepository } from "@shared/modules/transaction/expenses/repository/IExpenseRepository";
import type { ISaleRepository } from "@shared/modules/transaction/sales/repository/ISaleRepository";
import type { IWhatsAppRepository } from "@shared/modules/whatsapp/repository/IWhatsAppRepository";
import { runtime } from "./runtime";

// One implementation per table; the app picks Supabase or its offline mirror.
export interface Repositories {
  audit: IAuditRepository;
  allowance: IAllowanceRepository;
  customerRequest: ICustomerRequestRepository;
  branch: IBranchRepository;
  currency: ICurrencyRepository;
  plan: IPlanRepository;
  product: IProductRepository;
  service: IServiceRepository;
  tenantSetting: ITenantSettingRepository;
  user: IUserRepository;
  auth: IAuthRepository;
  signup: ISignupRepository;
  skippedMonth: ISkippedMonthRepository;
  customerPlan: ICustomerPlanRepository;
  priceHistory: IPriceHistoryRepository;
  customer: ICustomerRepository;
  customerStatus: ICustomerStatusRepository;
  charge: IChargeRepository;
  collection: ICollectionRepository;
  option: IOptionRepository;
  expense: IExpenseRepository;
  sale: ISaleRepository;
  whatsApp: IWhatsAppRepository;
}

// Call inside a method, never at module load: the runtime is set at startup.
export function repositories(): Repositories {
  return runtime().repositories;
}
