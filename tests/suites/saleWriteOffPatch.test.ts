import { applyWriteOffToSales } from "@shared/modules/transaction/sales/utils/saleListPatch";
import { charge, sale as baseSale } from "../helpers/factories";

const sale = () =>
  baseSale({ chargeId: "c1", charge: charge({ id: "c1" }), totalAmount: 50 });

describe("applyWriteOffToSales", () => {
  it("stamps the write-off on the sale owning that charge", () => {
    const out = applyWriteOffToSales([sale()], "c1", "2026-09-01T00:00:00Z");
    expect(out[0].charge!.writtenOffAt).toBe("2026-09-01T00:00:00Z");
  });
  it("clears it on a revert", () => {
    const on = applyWriteOffToSales([sale()], "c1", "2026-09-01T00:00:00Z");
    expect(
      applyWriteOffToSales(on, "c1", null)[0].charge!.writtenOffAt,
    ).toBeNull();
  });
  it("leaves other sales untouched", () => {
    const out = applyWriteOffToSales([sale()], "other", "2026-09-01T00:00:00Z");
    expect(out[0].charge!.writtenOffAt).toBeNull();
  });
});
