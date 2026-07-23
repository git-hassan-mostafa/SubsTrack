import { BranchFilter } from "@/src/core/constants";
import { Currency, Product } from "@/src/core/types";

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

// One product line in the form's cart. `product` is the resolved Product (we
// snapshot its name + id). `unitAmount` is already expressed in the sale's
// currency (the form auto-converts the catalog price into it).
export interface CreateSaleItemInput {
    product: Product;
    quantity: number;
    unitAmount: number;
}

// Input shape from the form. A sale holds one or more product lines, all in a
// single `currency` (chosen non-USD Currency or null for USD — we snapshot
// ratePerUsd from it). The total is the sum of every line's unitAmount*quantity.
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