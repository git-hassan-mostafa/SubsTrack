import i18n from '@/src/core/i18n';
import type { CustomerRequest, Tenant } from '@/src/core/types';
import repository from '../repository/CustomerRequestRepository';
import allowanceRepository from '../repository/AllowanceRepository';
import {
  mapDbCustomerRequestToCustomerRequest,
  mapDbTenantToTenant,
} from '../utils/mapper';
import { CustomerLimitError } from '../utils/customerLimitError';
import { AllowanceFloorError } from '../utils/allowanceFloorError';
import {
  ALLOWANCE_FLOOR_CODE,
  MIN_CUSTOMER_ALLOWANCE,
  MIN_CUSTOMER_REQUEST,
} from '../utils/types';

class BillingService {
  // Always USD — never the tenant's display currency, see gotcha #143.
  monthlyAmountUsd(activeCustomers: number, pricePerCustomerUsd: number): number {
    return Math.round(activeCustomers * pricePerCustomerUsd * 100) / 100;
  }

  assertCanCreateCustomer(allowance: number, activeCount: number): void {
    if (activeCount >= allowance) {
      throw new CustomerLimitError(allowance, activeCount);
    }
  }

  validateRequest(extraCustomers: number): void {
    if (!Number.isInteger(extraCustomers) || extraCustomers < MIN_CUSTOMER_REQUEST) {
      throw new Error(
        i18n.t('billing.request_min_error', { min: MIN_CUSTOMER_REQUEST }),
      );
    }
  }

  validateDecrease(newAllowance: number, current: number, activeCount: number): void {
    if (!Number.isInteger(newAllowance) || newAllowance < MIN_CUSTOMER_ALLOWANCE) {
      throw new Error(
        i18n.t('billing.decrease_min_error', { min: MIN_CUSTOMER_ALLOWANCE }),
      );
    }
    if (newAllowance >= current) {
      throw new Error(i18n.t('billing.decrease_not_lower_error', { current }));
    }
    if (newAllowance < activeCount) {
      throw new AllowanceFloorError(newAllowance, activeCount);
    }
  }

  // Lowering applies at once — it only ever saves the tenant money, so there
  // is nothing for the owner to approve.
  async lowerAllowance(
    newAllowance: number,
    current: number,
    activeCount: number,
  ): Promise<Tenant> {
    this.validateDecrease(newAllowance, current, activeCount);
    try {
      return mapDbTenantToTenant(await allowanceRepository.lowerAllowance(newAllowance));
    } catch (e) {
      throw this.asFloorError(e, newAllowance);
    }
  }

  // The server re-counts and wins; it reports the floor as a coded message
  // rather than prose so nothing here parses a sentence.
  private asFloorError(e: unknown, requested: number): unknown {
    const message = e instanceof Error ? e.message : '';
    const at = message.indexOf(ALLOWANCE_FLOOR_CODE);
    if (at < 0) return e;
    const [active] = message.slice(at + ALLOWANCE_FLOOR_CODE.length).split(':');
    return new AllowanceFloorError(requested, Number(active));
  }

  async getLatestRequest(tenantId: string): Promise<CustomerRequest | null> {
    const row = await repository.findLatest(tenantId);
    return row ? mapDbCustomerRequestToCustomerRequest(row) : null;
  }

  async requestMore(
    tenantId: string,
    extraCustomers: number,
    requestedBy: string | null,
  ): Promise<CustomerRequest> {
    this.validateRequest(extraCustomers);
    const row = await repository.create({
      tenant_id: tenantId,
      requested_count: extraCustomers,
      requested_by: requestedBy,
    });
    return mapDbCustomerRequestToCustomerRequest(row);
  }

  async editRequest(id: string, extraCustomers: number): Promise<CustomerRequest> {
    this.validateRequest(extraCustomers);
    const row = await repository.updateCount(id, extraCustomers);
    return mapDbCustomerRequestToCustomerRequest(row);
  }

  async cancelRequest(id: string): Promise<CustomerRequest> {
    const row = await repository.cancel(id);
    return mapDbCustomerRequestToCustomerRequest(row);
  }
}

export default new BillingService();
