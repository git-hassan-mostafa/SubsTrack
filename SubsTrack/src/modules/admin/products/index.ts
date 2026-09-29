export { default as productService } from "@shared/modules/admin/products/services/ProductService";
export { mapDbProductToProduct } from "@shared/modules/admin/products/utils/mapper";
export type { ProductInput, RestockEntry } from "@shared/modules/admin/products/utils/types";
export type {
  CreateStockMovementPayload,
  StockCostRow,
} from "@shared/modules/admin/products/repository/IProductRepository";
export { ProductCard } from "./components/ProductCard";
export { ProductFormSheet } from "./components/ProductFormSheet";
export { ProductStockSheet } from "./components/ProductStockSheet";
export { ProductBatchRestockSheet } from "./components/ProductBatchRestockSheet";
export { ProductListScreen } from "./screens/ProductListScreen";
