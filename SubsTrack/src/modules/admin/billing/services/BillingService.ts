import i18n from '@/src/core/i18n';
import type { CustomerRequest, Tenant } from '@/src/core/types';
import repository from '../repository/CustomerRequestRepository';
import allowanceRepository from '../repository/AllowanceRepository';
import {
  mapDbCustomerRequestToCustomerRequest,
  mapDbTenantToTenant,
} from '../utils/mapper';
import { QuotaExceededError } from '../utils/quotaError';
import { AllowanceFloorError } from '../utils/allowanceFloorError';
import {
  ALLOWANCE_FLOOR_CODES,
  MIN_CUSTOMER_ALLOWANCE,
  MIN_CUSTOMER_REQUEST,
  QUOTA_KINDS,
  type QuotaPair,
} from '../utils/types';

class BillingService {
  // Counted on the ALLOWED service lines, never the active ones, so this reads
  // the same figure SuperAdmin bills — gotchas #145, #149.
  monthlyAmountUsd(planAllowance: number, pricePerPlanUsd: number): number {
    return Math.round(planAllowance * pricePerPlanUsd * 100) / 100;
  }

  // The one quota gate in the product. Only a quota the write GROWS can refuse
  // it, so a tenant the owner cut below its usage can still shrink — #149.
  assertQuotas(limits: QuotaPair, before: QuotaPair, after: QuotaPair): void {
    for (const kind of QUOTA_KINDS) {
      if (after[kind] > before[kind] && after[kind] > limits[kind]) {
        throw new QuotaExceededError(kind, limits[kind], before[kind]);
      }
    }
  }

  totalAsked(extra: QuotaPair): number {
    return extra.customers + extra.plans;
  }

  validateRequest(extra: QuotaPair): void {
    const whole = QUOTA_KINDS.every(
      (kind) => Number.isInteger(extra[kind]) && extra[kind] >= 0,
    );
    if (!whole || this.totalAsked(extra) < MIN_CUSTOMER_REQUEST) {
      throw new Error(
        i18n.t('billing.request_min_error', { min: MIN_CUSTOMER_REQUEST }),
      );
    }
  }

  validateDecrease(next: QuotaPair, current: QuotaPair, active: QuotaPair): void {
    if (!QUOTA_KINDS.every((kind) => Number.isInteger(next[kind]))) {
      throw new Error(
        i18n.t('billing.decrease_min_error', { min: MIN_CUSTOMER_ALLOWANCE }),
      );
    }
    if (next.customers < MIN_CUSTOMER_ALLOWANCE) {
      throw new Error(
        i18n.t('billing.decrease_min_error', { min: MIN_CUSTOMER_ALLOWANCE }),
      );
    }
    if (next.plans < next.customers) {
      throw new Error(i18n.t('billing.plans_below_customers_error'));
    }
    const raises = QUOTA_KINDS.some((kind) => next[kind] > current[kind]);
    const moves = QUOTA_KINDS.some((kind) => next[kind] < current[kind]);
    if (raises || !moves) {
      throw new Error(i18n.t('billing.decrease_not_lower_error'));
    }
    for (const kind of QUOTA_KINDS) {
      if (next[kind] < active[kind]) {
        throw new AllowanceFloorError(kind, next[kind], active[kind]);
      }
    }
  }

  // Lowering applies at once — it only ever saves the tenant money, so there
  // is nothing for the owner to approve. Both limits move in ONE call because
  // plan_allowance >= customer_allowance leaves no safe order for two.
  async lowerAllowances(
    next: QuotaPair,
    current: QuotaPair,
    active: QuotaPair,
  ): Promise<Tenant> {
    this.validateDecrease(next, current, active);
    try {
      return mapDbTenantToTenant(await allowanceRepository.lowerAllowances(next));
    } catch (e) {
      throw this.asFloorError(e, next);
    }
  }

  // The server re-counts and wins; it reports each floor as a coded message
  // rather than prose so nothing here parses a sentence.
  private asFloorError(e: unknown, next: QuotaPair): unknown {
    const message = e instanceof Error ? e.message : '';
    for (const kind of QUOTA_KINDS) {
      const at = message.indexOf(ALLOWANCE_FLOOR_CODES[kind]);
      if (at < 0) continue;
      const [activeCount] = message
        .slice(at + ALLOWANCE_FLOOR_CODES[kind].length)
        .split(':');
      return new AllowanceFloorError(kind, next[kind], Number(activeCount));
    }
    return e;
  }

  async getLatestRequest(tenantId: string): Promise<CustomerRequest | null> {
    const row = await repository.findLatest(tenantId);
    return row ? mapDbCustomerRequestToCustomerRequest(row) : null;
  }

  async requestMore(
    tenantId: string,
    extra: QuotaPair,
    requestedBy: string | null,
  ): Promise<CustomerRequest> {
    this.validateRequest(extra);
    const row = await repository.create({
      tenant_id: tenantId,
      requested_count: extra.customers,
      requested_plans: extra.plans,
      requested_by: requestedBy,
    });
    return mapDbCustomerRequestToCustomerRequest(row);
  }

  async editRequest(id: string, extra: QuotaPair): Promise<CustomerRequest> {
    this.validateRequest(extra);
    const row = await repository.updateCounts(id, extra);
    return mapDbCustomerRequestToCustomerRequest(row);
  }

  async cancelRequest(id: string): Promise<CustomerRequest> {
    const row = await repository.cancel(id);
    return mapDbCustomerRequestToCustomerRequest(row);
  }
}

export default new BillingService();
