import type { Customer, CustomerPlan } from '@/src/core/types';

// The lines a customer is billed and capped on — a cancelled line owes nothing.
export function activeLines(customer: Pick<Customer, 'customerPlans'>): CustomerPlan[] {
  return (customer.customerPlans ?? []).filter((l) => l.active);
}
