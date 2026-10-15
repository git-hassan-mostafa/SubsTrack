import type { CreateStockMovementPayload } from "@shared/modules/admin/products/repository/IProductRepository";
import productService from "@shared/modules/admin/products/services/ProductService";
import { pickedInstantIso } from "@shared/core/utils/date";

const written: CreateStockMovementPayload[] = [];

jest.mock("@shared/core/runtime/repositories", () => ({
  repositories: () => ({
    product: {
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

describe("restock date", () => {
  it("TC-RD-01 a single restock is stored at the picked local minute", async () => {
    const picked = pickedInstantIso("2026-03-13 08:45", true);
    await productService.addStock("p1", "t1", 5, null, "u1", null, picked);
    expect(written).toHaveLength(1);
    expect(written[0].occurred_at).toBe(new Date("2026-03-13T08:45:00").toISOString());
  });

  it("TC-RD-02 every product of a batch restock carries the one picked instant", async () => {
    const picked = pickedInstantIso("2026-02-28 17:10", true);
    await productService.restockMany(
      [
        { productId: "p1", quantity: 2, unitCost: 3 },
        { productId: "p2", quantity: 4, unitCost: null },
      ],
      "t1",
      null,
      "u1",
      null,
      picked,
    );
    expect(written.map((row) => row.occurred_at)).toEqual([picked, picked]);
  });

  it("TC-RD-03 an untouched date field, or none at all, records the restock at the moment of saving", async () => {
    const before = Date.now();
    await productService.addStock("p1", "t1", 1, null, "u1", null, pickedInstantIso("2020-01-01 09:00", false));
    await productService.addStock("p1", "t1", 1);
    for (const row of written) {
      expect(new Date(row.occurred_at).getTime()).toBeGreaterThanOrEqual(before);
      expect(new Date(row.occurred_at).getTime()).toBeLessThanOrEqual(Date.now());
    }
  });
});
