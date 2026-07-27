import { Product } from "@/src/core/types";

export type ProductInput = Pick<Product, 'name' | 'description' | 'price' | 'currencyId' | 'branchId'> & {
    // Opening stock, only read on create — it becomes the first 'initial' ledger
    // movement. Editing a product never touches stock (use the stock sheet).
    initialStock?: number;
};

// Manual stock change from the product's stock sheet. Sales write their own
// movements ('sale' / 'sale_void') and never go through this.
export type StockAdjustReason = 'restock' | 'adjustment';
