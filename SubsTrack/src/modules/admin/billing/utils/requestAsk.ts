import type { TFunction } from 'i18next';
import type { CustomerRequest } from '@/src/core/types';
import type { QuotaPair } from './types';

// A stored request read back as the pair every screen and validator works in.
export function requestedPair(request: CustomerRequest): QuotaPair {
  return { customers: request.requestedCount, plans: request.requestedPlans };
}

// One sentence for an ask that may move either limit or both, so no screen has
// to spell out the empty half.
export function askText(t: TFunction, extra: QuotaPair): string {
  const parts: string[] = [];
  if (extra.customers > 0)
    parts.push(t('billing.ask_customers', { count: extra.customers }));
  if (extra.plans > 0)
    parts.push(t('billing.ask_plans', { count: extra.plans }));
  return parts.join(t('billing.ask_join'));
}
