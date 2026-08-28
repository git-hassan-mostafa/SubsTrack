import { BranchFilter } from "@/src/core/constants";
import { Currency, Product, Service } from "@/src/core/types";

export interface FindSalesOptions {
    page?: number;
    searchQuery?: string;
    customerId?: string | null;
    productId?: string | null;
    // Calendar-day bounds (YYYY-MM-DD), both inclusive. The repository converts
    // them to sold_at timestamp bounds (end-of-day handled via next-day exclusive).
    fromDate?: string | null;
    toDate?: string | null;
    branchFilter?: BranchFilter;
    includeVoided?: boolean;
}

// One line in the form's cart. `unitAmount` is already expressed in the sale's
// currency (the form auto-converts the catalog price into it) on both variants.
//
// Discriminated on purpose: only a PRODUCT line moves stock, so every stock path
// narrows through `productLines()` (utils/saleLines.ts) instead of guessing from
// a nullable field. A `service` line with `service: null` is the ONE-OFF job —
// `name` is then the whole record of what was sold, and no catalog row exists.
//
// Only a product line carries a `quantity`. Labour is one job at one price, so a
// service line has no unit count to multiply — it always stores 1. Ask
// `lineQuantity()` for a line's count instead of reaching for the field.
export type CreateSaleItemInput =
    | { kind: 'product'; product: Product; quantity: number; unitAmount: number }
    | { kind: 'service'; service: Service | null; name: string; unitAmount: number };

// Input shape from the form. A sale holds one or more lines — products, services,
// or both — all in a single `currency` (chosen non-USD Currency or null for USD —
// we snapshot ratePerUsd from it). The total is the sum of every line's
// unitAmount × lineQuantity (which is 1 on a service line).
export interface CreateSaleInput {
    items: CreateSaleItemInput[];
    customerId: string | null;
    branchId: string | null;
    // How much was collected at sale time (in `currency`). Must be 0..total.
    // A value below the total leaves a "Sales" debt.
    amountPaid: number;
    currency: Currency | null;
    recordedByUserId: string | null;
    tenantId: string;
    notes: string | null;
}

// Input shape for correcting an existing sale. NO amount: an edit re-prices the
// bill and leaves every collection against it exactly as recorded — correcting
// money means voiding a payment, in the place that owns it.
// Everything else the form owns can
// change (including swapping a product line for a service one); what identifies
// the sale cannot — id, tenant, `sold_at` and the original `recorded_by_user_id`
// all stay as recorded. `actorUserId` is who is making the correction (the audit
// actor, and the recorder of any replacement stock movements).
export interface UpdateSaleInput {
    items: CreateSaleItemInput[];
    customerId: string | null;
    branchId: string | null;
    currency: Currency | null;
    notes: string | null;
    actorUserId: string | null;
}