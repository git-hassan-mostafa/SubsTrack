import { Product } from "@/src/core/types";

export type ProductInput = Pick<
    Product,
    'name' | 'description' | 'price' | 'currencyId' | 'costPrice' | 'costCurrencyId' | 'branchId'
> & {
    initialStock?: number;
    initialStockUnitCost?: number | null;
};

// One line of a batch restock: how many units arrived for a product, and what
// each cost (in the delivery's single currency). A null cost records no expense.
export type RestockEntry = { productId: string; quantity: number; unitCost?: number | null };
