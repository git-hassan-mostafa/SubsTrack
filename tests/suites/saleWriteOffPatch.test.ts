import { applyWriteOffToSales } from "@/src/modules/transaction/sales/utils/saleListPatch";
import type { Sale } from "@/src/core/types";

const sale = (over: Partial<Sale> = {}) =>
  ({
    id: "s1",
    chargeId: "c1",
    charge: { id: "c1", writtenOffAt: null },
    amountPaid: 0,
    totalAmount: 50,
  }) as unknown as Sale;

describe("applyWriteOffToSales", () => {
  it("stamps the write-off on the sale owning that charge", () => {
    const out = applyWriteOffToSales([sale()], "c1", "2026-09-01T00:00:00Z");
    expect(out[0].charge!.writtenOffAt).toBe("2026-09-01T00:00:00Z");
  });
  it("clears it on a revert", () => {
    const on = applyWriteOffToSales([sale()], "c1", "2026-09-01T00:00:00Z");
    expect(applyWriteOffToSales(on, "c1", null)[0].charge!.writtenOffAt).toBeNull();
  });
  it("leaves other sales untouched", () => {
    const out = applyWriteOffToSales([sale()], "other", "2026-09-01T00:00:00Z");
    expect(out[0].charge!.writtenOffAt).toBeNull();
  });
});
