import type { CreateStockMovementPayload } from "@shared/modules/admin/products/repository/IProductRepository";
import productService from "@shared/modules/admin/products/services/ProductService";
import {
  parseTrackStock,
  tracksStock,
} from "@shared/modules/admin/tenant-settings/utils/trackStock";
import {
  availableFor,
  resolveCart,
  type CartRow,
} from "@shared/modules/transaction/sales/utils/saleCart";
import type { Product, TenantSetting } from "@shared/core/types";

const written: CreateStockMovementPayload[] = [];

jest.mock("@shared/core/runtime/repositories", () => ({
  repositories: () => ({
    product: {
      create: async (row: object) => ({
        id: "p-new",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        ...row,
      }),
      addMovements: async (rows: CreateStockMovementPayload[]) => {
        written.push(...rows);
      },
      stockOnHand: async () => ({}),
    },
  }),
}));

beforeEach(() => {
  written.length = 0;
});

const setting = (value: string | null): TenantSetting =>
  ({ key: "TrackStock", value }) as TenantSetting;

const router: Product = {
  id: "prod-1",
  tenantId: "t1",
  branchId: null,
  name: "Router",
  description: null,
  price: 30,
  currencyId: null,
  costPrice: 20,
  costCurrencyId: null,
  active: true,
  stockOnHand: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const row = (quantity: number): CartRow => ({
  key: "row-0",
  lineType: "product",
  productId: router.id,
  serviceId: null,
  customName: "",
  quantity,
  unitAmount: 30,
});

describe("track stock setting", () => {
  it("TC-TS-01 no row, a blank value or anything but false means tracking is on", () => {
    expect(tracksStock([])).toBe(true);
    expect(tracksStock([setting(null)])).toBe(true);
    expect(tracksStock([setting("true")])).toBe(true);
    expect(parseTrackStock(" FALSE ")).toBe(false);
    expect(tracksStock([setting("false")])).toBe(false);
  });
});

describe("restock with untracked stock", () => {
  it("TC-TS-10 a restock keeps its quantity but carries no cost, so no expense", async () => {
    await productService.addStock(
      "p1",
      "t1",
      5,
      null,
      "u1",
      { unitCost: 4, currency: null },
      null,
      false,
    );
    expect(written[0]).toMatchObject({ quantity_delta: 5, unit_cost: null });
  });

  it("TC-TS-11 every row of a batch restock carries no cost", async () => {
    await productService.restockMany(
      [
        { productId: "p1", quantity: 2, unitCost: 3 },
        { productId: "p2", quantity: 4, unitCost: 7 },
      ],
      "t1",
      null,
      "u1",
      null,
      null,
      false,
    );
    expect(written.map((m) => m.unit_cost)).toEqual([null, null]);
  });

  it("TC-TS-12 opening stock of a new product carries no cost", async () => {
    await productService.createProduct(
      {
        name: "Router",
        description: null,
        price: 30,
        currencyId: null,
        costPrice: 20,
        costCurrencyId: null,
        branchId: null,
        initialStock: 3,
      },
      "t1",
      "u1",
      null,
      false,
    );
    expect(written[0]).toMatchObject({ quantity_delta: 3, unit_cost: null });
  });

  it("TC-TS-13 tracked stock still costs the restock", async () => {
    await productService.addStock("p1", "t1", 5, null, "u1", {
      unitCost: 4,
      currency: null,
    });
    expect(written[0].unit_cost).toBe(4);
  });
});

describe("sale cart with untracked stock", () => {
  it("TC-TS-20 an empty shelf never caps the quantity or blocks the cart", () => {
    const credit = new Map<string, number>();
    expect(availableFor([row(9)], "other", router, credit, false)).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(resolveCart([row(9)], [router], [], credit, false).ready).toBe(true);
    expect(resolveCart([row(9)], [router], [], credit).ready).toBe(false);
  });
});
