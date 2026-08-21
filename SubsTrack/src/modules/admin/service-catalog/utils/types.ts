import { Service } from "@/src/core/types";

// The whole form. No stock and no cost: labour is not bought, so a service never
// produces an expense — its only money is the price it sells for.
export type ServiceInput = Pick<
    Service,
    'name' | 'description' | 'price' | 'currencyId' | 'branchId'
>;
