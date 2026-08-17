import { Product } from "@/src/core/types";

export type ProductInput = Pick<
    Product,
    'name' | 'description' | 'price' | 'currencyId' | 'costPrice' | 'costCurrencyId' | 'branchId'
> & {
    // Opening stock, only read on create — it becomes the first 'initial' ledger
    // movement. Editing a product never touches stock (use the stock sheet).
    initialStock?: number;
    // What that opening stock cost per unit, in costCurrencyId. Optional: with
    // no cost the movement records none and adds no expense.
    initialStockUnitCost?: number | null;
};

// Manual stock change from the product's stock sheet. Sales write their own
// movements ('sale' / 'sale_void') and never go through this.
export type StockAdjustReason = 'restock' | 'adjustment';

// One line of a batch restock: how many units arrived for a product, and what
// each cost (in the delivery's single currency). A null cost records no expense.
export type RestockEntry = { productId: string; quantity: number; unitCost?: number | null };
