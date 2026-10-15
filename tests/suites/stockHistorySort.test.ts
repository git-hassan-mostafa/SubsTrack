import type { StockMovement } from "@shared/core/types";
import { sortStockHistory } from "@shared/modules/admin/products/utils/stockHistorySort";

function movement(id: string, occurredAt: string, createdAt: string): StockMovement {
  return {
    id,
    tenantId: "t1",
    productId: "p1",
    quantityDelta: 1,
    reason: "restock",
    saleId: null,
    unitCost: null,
    currencyId: null,
    ratePerUsdSnapshot: null,
    note: null,
    recordedByUserId: null,
    occurredAt,
    voidedAt: null,
    voidedBy: null,
    createdAt,
  };
}

const backDated = movement("a", "2026-03-01T10:00:00.000Z", "2026-03-10T09:00:00.000Z");
const onTime = movement("b", "2026-03-05T10:00:00.000Z", "2026-03-05T10:00:00+00:00");
const sameTime = movement("c", "2026-03-05T10:00:00.000Z", "2026-03-04T08:00:00.000Z");
const ids = (rows: StockMovement[]) => rows.map((row) => row.id);

describe("stock history sort", () => {
  it("TC-SH-01 by date: newest or oldest first; equal dates fall back to when they were entered", () => {
    expect(ids(sortStockHistory([backDated, onTime, sameTime], "occurred_at", "desc"))).toEqual(["b", "c", "a"]);
    expect(ids(sortStockHistory([backDated, onTime, sameTime], "occurred_at", "asc"))).toEqual(["a", "c", "b"]);
  });

  it("TC-SH-02 by entered at: a back-dated entry typed last comes first, whatever the time format", () => {
    expect(ids(sortStockHistory([onTime, sameTime, backDated], "created_at", "desc"))).toEqual(["a", "b", "c"]);
  });
});
