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

// Input shape from the form. `product` is the resolved Product (we use it to
// snapshot the name + product_id). `currency` is the chosen non-USD Currency
// or null for USD — we snapshot ratePerUsd from this.
export interface CreateSaleInput {
    product: Product;
    customerId: string | null;
    branchId: string | null;
    quantity: number;
    unitAmount: number;
    currency: Currency | null;
    recordedByUserId: string | null;
    tenantId: string;
    notes: string | null;
}