jest.mock("@shared/modules/admin/products/services/ProductService", () => ({
  __esModule: true,
  default: require("../helpers/fakeSales").fakeProductService,
}));

import saleService from "@shared/modules/transaction/sales/services/SaleService";
import {
  defaultSaleFilters,
  hasSaleFilter,
  saleFindOptions,
} from "@shared/modules/transaction/sales/utils/saleFilters";
import {
  saleCollectItem,
  saleInfoRows,
  saleMenuItems,
  saleVoidTarget,
  type SaleMenuViewer,
} from "@shared/modules/transaction/sales/utils/saleView";
import {
  resolveInvoiceRecipient,
  saleRecipientRows,
} from "@shared/modules/invoicing/utils/invoiceRecipient";
import type { CreateSaleInput } from "@shared/modules/transaction/sales/utils/types";
import { store } from "../helpers/fakeLedger";
import { saleStore, stockOnHand } from "../helpers/fakeSales";
import { ADMIN_ONLY } from "@shared/shared/lib/menuItem";
import { charge, customer, product, sale } from "../helpers/factories";
import { enabledKeys, greyed, keysOf } from "../helpers/menus";

// TC-SG-* — the Sales page rules both apps run: filters, menus, void target, receipt.
const AT = "2026-02-01T10:00:00.000Z";
const t = (key: string) => key;
const ADMIN: SaleMenuViewer = { isAdmin: true };
const STAFF: SaleMenuViewer = { isAdmin: false };
const ali = customer({ id: "cust-1", name: "Ali", phoneNumber: "+96170000000" });

describe("saleFindOptions", () => {
  it("TC-SG-01 the default reads live sales only, every branch filter passed through", () => {
    expect(saleFindOptions(defaultSaleFilters(), "branch-1", "")).toEqual({
      searchQuery: undefined,
      branchFilter: "branch-1",
      customerId: null,
      productIds: [],
      fromDate: null,
      toDate: null,
      includeVoided: false,
      voidedOnly: false,
    });
  });

  it("TC-SG-02 'voided' reads only voided rows; 'all' reads both", () => {
    const voided = saleFindOptions({ ...defaultSaleFilters(), status: "voided" }, null, "");
    const all = saleFindOptions({ ...defaultSaleFilters(), status: "all" }, null, "");
    expect(voided).toMatchObject({ includeVoided: true, voidedOnly: true });
    expect(all).toMatchObject({ includeVoided: true, voidedOnly: false });
  });

  it("TC-SG-03 the search is trimmed and a blank one is no search", () => {
    expect(saleFindOptions(defaultSaleFilters(), null, "  router ").searchQuery).toBe("router");
    expect(saleFindOptions(defaultSaleFilters(), null, "   ").searchQuery).toBeUndefined();
  });

  it("TC-SG-21 passes productIds through to options", () => {
    const opts = saleFindOptions(
      { ...defaultSaleFilters(), productIds: ["prod-1", "prod-2"] },
      null,
      "",
    );
    expect(opts.productIds).toEqual(["prod-1", "prod-2"]);
  });
});

describe("hasSaleFilter", () => {
  it("TC-SG-04 the default is unfiltered; any one field makes it filtered", () => {
    const base = defaultSaleFilters();
    expect(hasSaleFilter(base)).toBe(false);
    expect(hasSaleFilter({ ...base, customerId: "c" })).toBe(true);
    expect(hasSaleFilter({ ...base, productIds: ["p"] })).toBe(true);
    expect(hasSaleFilter({ ...base, fromDate: "2026-01-01" })).toBe(true);
    expect(hasSaleFilter({ ...base, toDate: "2026-01-31" })).toBe(true);
    expect(hasSaleFilter({ ...base, status: "all" })).toBe(true);
  });
});

describe("saleVoidTarget", () => {
  it("TC-SG-05 names only the live sales and the bills they have", () => {
    const target = saleVoidTarget([
      sale({ id: "s1", chargeId: "c1" }),
      sale({ id: "s2", chargeId: "c2", voidedAt: AT }),
      sale({ id: "s3", chargeId: null }),
    ]);
    expect(target).toEqual({ saleIds: ["s1", "s3"], chargeIds: ["c1"] });
  });
});

describe("saleMenuItems", () => {
  const owing = sale({ customer: ali, charge: charge({ kind: "sale" }), totalAmount: 30, amountPaid: 10 });

  it("TC-SG-06 a live, part-paid sale offers every door to an admin", () => {
    expect(keysOf(saleMenuItems(owing, ADMIN))).toEqual(["view", "edit", "collect", "invoice", "history", "void"]);
  });

  it("TC-SG-07 History is admin-only: staff see it greyed", () => {
    expect(greyed(saleMenuItems(owing, STAFF))).toEqual({ history: ADMIN_ONLY });
  });

  it("TC-SG-08 a paid sale has nothing to collect", () => {
    expect(greyed(saleMenuItems({ ...owing, amountPaid: 30 }, ADMIN)).collect).toBe("why_disabled.fully_paid");
  });

  it("TC-SG-09 a voided sale only opens (and shows its history)", () => {
    const items = saleMenuItems({ ...owing, voidedAt: AT }, ADMIN);
    expect(enabledKeys(items)).toEqual(["view", "history"]);
    expect(greyed(items).edit).toBe("why_disabled.sale_voided");
  });

  it("TC-SG-10 the invoice row is disabled with the reason it cannot be sent", () => {
    const walkIn = saleMenuItems(sale({ customerId: null, customer: null }), ADMIN).find((i) => i.key === "invoice");
    const noPhone = saleMenuItems(sale({ customer: { ...ali, phoneNumber: null } }), ADMIN).find(
      (i) => i.key === "invoice",
    );
    expect(walkIn).toMatchObject({ disabled: true, captionKey: "invoice.no_customer" });
    expect(noPhone).toMatchObject({ disabled: true, captionKey: "invoice.no_phone" });
    expect(saleMenuItems(owing, ADMIN).find((i) => i.key === "invoice")?.disabled).toBeUndefined();
  });

  it("TC-SG-11 a walk-in sale is never collected later", () => {
    const walkIn = saleMenuItems({ ...owing, customerId: null, customer: null }, ADMIN);
    expect(greyed(walkIn).collect).toBe("why_disabled.walk_in");
  });
});

describe("saleCollectItem", () => {
  const bill = charge({ id: "chg-9", kind: "sale", amount: 30 });

  it("TC-SG-17 the item is the sale's bill, paid what the sale says", () => {
    const item = saleCollectItem(sale({ customer: ali, charge: bill, amountPaid: 10 }));
    expect(item).toMatchObject({ chargeId: "chg-9", amount: 30, paid: 10, balance: 20, customerName: "Ali" });
  });

  it("TC-SG-18 a receipt's freshly read cash wins over the sale's figure", () => {
    const item = saleCollectItem(sale({ customer: ali, charge: bill, amountPaid: 10 }), 25);
    expect(item).toMatchObject({ paid: 25, balance: 5 });
  });

  it("TC-SG-19 a sale whose bill is not loaded has nothing to collect", () => {
    expect(saleCollectItem(sale({ charge: null }))).toBeNull();
  });
});

describe("saleInfoRows", () => {
  const userName = (id: string | null) => (id === "user-1" ? "Sara" : null);

  it("TC-SG-12 prints the receipt number and who sold it", () => {
    const rows = saleInfoRows(sale({ id: "aaaaaaaa-0000-0000-0000-00000abc123f" }), t, userName);
    expect(rows.find((r) => r.key === "receipt_id")?.value).toBe("BC123F");
    expect(rows.find((r) => r.key === "recorded_by")?.value).toBe("Sara");
  });

  it("TC-SG-13 the void reason shows only on a voided sale", () => {
    const live = saleInfoRows(sale({ voidReason: "left over" }), t, userName);
    const voided = saleInfoRows(sale({ voidedAt: AT, voidReason: "typo" }), t, userName);
    expect(live.find((r) => r.key === "void_reason")?.value).toBeNull();
    expect(voided.find((r) => r.key === "void_reason")?.value).toBe("typo");
  });
});

describe("sales invoice recipient", () => {
  it("TC-SG-14 one invoice goes to one customer's number", () => {
    const bob = customer({ id: "cust-2", name: "Bob", phoneNumber: "+96171111111" });
    const mixed = saleRecipientRows([sale({ customer: ali }), sale({ customerId: "cust-2", customer: bob })]);
    const walkIn = saleRecipientRows([sale({ customerId: null, customer: null })]);
    expect(resolveInvoiceRecipient(mixed)).toEqual({ ok: false, reason: "mixed" });
    expect(resolveInvoiceRecipient(walkIn)).toEqual({ ok: false, reason: "no_customer" });
    expect(resolveInvoiceRecipient(saleRecipientRows([sale({ customer: ali })]))).toEqual({
      ok: true,
      name: "Ali",
      phone: "+96170000000",
    });
  });
});

describe("getSalePage", () => {
  const input = (over: Partial<CreateSaleInput> = {}): CreateSaleInput => ({
    items: [{ kind: "service", service: null, name: "Installation", unitAmount: 30 }],
    customerId: "cust-1",
    branchId: null,
    amountPaid: 0,
    currency: null,
    recordedByUserId: "user-1",
    tenantId: "t1",
    notes: null,
    ...over,
  });

  beforeEach(() => {
    store.reset();
    saleStore.reset();
  });

  it("TC-SG-15 a page carries each sale's LIVE paid amount and the full count", async () => {
    await saleService.createSale(input({ amountPaid: 10 }));
    await saleService.createSale(input());
    await saleService.createSale(input());
    const page = await saleService.getSalePage({ offset: 0, limit: 2 });
    expect(page.total).toBe(3);
    expect(page.rows).toHaveLength(2);
    const all = await saleService.getSalePage({ offset: 0, limit: 10 });
    expect(all.rows.map((row) => row.amountPaid).sort()).toEqual([0, 0, 10]);
    expect(all.rows.every((row) => row.chargeId !== null)).toBe(true);
  });

  it("TC-SG-16 the period total never counts a voided sale", async () => {
    const kept = await saleService.createSale(input());
    const gone = await saleService.createSale(input({ items: [], totalAmount: 50 }));
    await saleService.voidSale(gone.id, "user-1", "mistake");
    const totals = await saleService.getMonthlyTotals(saleFindOptions({ ...defaultSaleFilters(), status: "all" }, null, ""));
    expect(Object.values(totals).reduce((sum, v) => sum + v, 0)).toBe(kept.totalAmount);
  });

  it("TC-SG-20 filters sales by multiple product IDs", async () => {
    const prodA = product({ id: "p-a", name: "Router", price: 50 });
    const prodB = product({ id: "p-b", name: "Modem", price: 40 });
    const prodC = product({ id: "p-c", name: "Cable", price: 10 });
    stockOnHand["p-a"] = 10;
    stockOnHand["p-b"] = 10;
    stockOnHand["p-c"] = 10;
    const saleA = await saleService.createSale(input({ items: [{ kind: "product", product: prodA, quantity: 1, unitAmount: 50 }] }));
    const saleB = await saleService.createSale(input({ items: [{ kind: "product", product: prodB, quantity: 1, unitAmount: 40 }] }));
    await saleService.createSale(input({ items: [{ kind: "product", product: prodC, quantity: 1, unitAmount: 10 }] }));
    const saleVoidLine = await saleService.createSale(
      input({
        items: [
          { kind: "product", product: prodC, quantity: 1, unitAmount: 10 },
          { kind: "product", product: prodA, quantity: 1, unitAmount: 50 },
        ],
      }),
    );
    await saleService.updateSale(saleVoidLine, {
      items: [{ kind: "product", product: prodC, quantity: 1, unitAmount: 10 }],
      customerId: "cust-1",
      branchId: null,
      currency: null,
      notes: null,
      actorUserId: "user-1",
    });
    const filtered = await saleService.getSalePage({
      offset: 0,
      limit: 10,
      productIds: ["p-a", "p-b"],
    });
    expect(filtered.total).toBe(2);
    expect(filtered.rows.map((r) => r.id).sort()).toEqual([saleA.id, saleB.id].sort());
  });
});
