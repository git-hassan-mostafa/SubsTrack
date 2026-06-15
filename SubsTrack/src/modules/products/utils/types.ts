import { Product } from "@/src/core/types";

export type ProductInput = Pick<Product, 'name' | 'description' | 'price' | 'currencyId' | 'branchId'>;
