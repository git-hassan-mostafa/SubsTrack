import type { AppUser, CustomerStatus, StockMovement } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import { onCalendarDay } from "@shared/core/utils/date";
import {
  splitManageable,
  userRowActions,
  userSelectionActions,
} from "@shared/modules/admin/users/utils/userMenu";
import { stockEntryActions, stockEntryCost } from "@shared/modules/admin/products/utils/stockText";
import {
  canOpenPage,
  landingPage,
  type Viewer,
} from "@shared/modules/authentication/auth/utils/pageAccess";
import {
  customerMenuItems,
  customerSelectionItems,
  customerStatusItems,
} from "@shared/modules/customer/customers/utils/customerMenu";
import { billFacts, billMenuItems } from "@shared/modules/ledger/utils/billView";
import {
  paymentMenuItems,
  paymentSelectionItems,
  voidablePayments,
} from "@shared/modules/ledger/utils/collectionView";
import { debtorActions } from "@shared/modules/transaction/debts/utils/debtorView";
import {
  saleReceiptActions,
  saleReceiptFacts,
  saleSelectionItems,
} from "@shared/modules/transaction/sales/utils/saleView";
import { catalogRowActions, catalogSelectionActions } from "@shared/shared/lib/catalogMenu";
import type { MenuItem } from "@shared/shared/lib/menuItem";
import { quickActionItems } from "@shared/shared/lib/quickActions";
import { charge, collection, customer, line, openItem, plan, sale } from "../helpers/factories";

// TC-RM-* — every row menu both apps draw: which rows show, for whom, in which state.
const keysOf = <K extends string>(items: MenuItem<K>[]) => items.map((item) => item.key);
const AT = "2026-02-01T10:00:00.000Z";
const TODAY = "2026-03-10";
const on = <T>(rule: () => T): T => onCalendarDay(TODAY, rule);

describe("billMenuItems", () => {
  const all = { revertWriteOff: true, writeOff: true, void: true };

  it("TC-RM-01 a live part-paid bill offers write-off and void; history is admin-only", () => {
    const facts = billFacts(charge({ amount: 30 }), 10);
    expect(keysOf(billMenuItems(facts, { isAdmin: true }, all))).toEqual(["history", "write_off", "void"]);
    expect(keysOf(billMenuItems(facts, { isAdmin: false }, all))).toEqual(["write_off", "void"]);
  });

  it("TC-RM-02 a written-off bill offers the undo, never a second write-off", () => {
    const facts = billFacts(charge({ amount: 30, writtenOffAt: AT }), 0);
    expect(keysOf(billMenuItems(facts, { isAdmin: false }, all))).toEqual(["revert_write_off", "void"]);
  });

  it("TC-RM-03 a voided bill offers no money door at all", () => {
    const facts = billFacts(charge({ amount: 30, voidedAt: AT }), 0);
    expect(keysOf(billMenuItems(facts, { isAdmin: false }, all))).toEqual([]);
  });

  it("TC-RM-04 a door the surface did not open stays out of the menu", () => {
    const facts = billFacts(charge({ amount: 30 }), 0);
    const doors = { revertWriteOff: false, writeOff: false, void: true };
    expect(keysOf(billMenuItems(facts, { isAdmin: false }, doors))).toEqual(["void"]);
  });
});

describe("paymentMenuItems", () => {
  it("TC-RM-05 a live payment opens, sends (with a phone), corrects and voids", () => {
    const live = collection();
    expect(keysOf(paymentMenuItems(live, { sendable: true }))).toEqual(["details", "invoice", "correct", "void"]);
    expect(keysOf(paymentMenuItems(live, { sendable: false }))).toEqual(["details", "correct", "void"]);
  });

  it("TC-RM-06 a voided payment, or one on a voided bill, only opens (#109)", () => {
    expect(keysOf(paymentMenuItems(collection({ voidedAt: AT }), { sendable: true }))).toEqual(["details"]);
    expect(keysOf(paymentMenuItems(collection(), { sendable: true, billVoided: true }))).toEqual(["details"]);
  });

  it("TC-RM-07 a bulk void takes only the live hand-overs of a pick", () => {
    const rows = [collection({ id: "a" }), collection({ id: "b", voidedAt: AT })];
    expect(voidablePayments(rows).map((row) => row.id)).toEqual(["a"]);
    expect(keysOf(paymentSelectionItems(rows))).toEqual(["void"]);
    expect(paymentSelectionItems([collection({ voidedAt: AT })])).toEqual([]);
  });
});

describe("customer menus", () => {
  const usd = plan({ id: "plan-usd", name: "Internet", price: 20 });
  const typed = plan({ id: "plan-typed", name: "Custom", price: null, isCustomPrice: true });
  const unpaid: CustomerStatus = {
    status: "unpaid",
    overdue: false,
    planCount: { paid: 0, total: 1 },
    notDueLineIds: [],
    uncoveredLineIds: [],
    unpaidMonths: 1,
  };
  const paid: CustomerStatus = { ...unpaid, status: "paid", notDueLineIds: ["l-usd"], unpaidMonths: 0 };
  const admin = { isAdmin: true };
  const staff = { isAdmin: false };
  const ali = customer({ customerPlans: [line({ id: "l-usd", plan: usd, planId: usd.id })] });
  const aliNoPhone = { ...ali, phoneNumber: "-" };

  it("TC-RM-08 an unpaid customer gets quick pay, pay-and-send, collect and write-off", () =>
    on(() => {
      const keys = keysOf(customerMenuItems(ali, { status: unpaid, debtUsd: 0, currencies: [] }, admin));
      expect(keys).toEqual([
        "quick_pay",
        "quick_pay_whatsapp",
        "record_sale",
        "add_custom_debt",
        "collect",
        "write_off_all",
        "whatsapp_chat",
        "edit",
        "history",
        "deactivate",
        "delete",
      ]);
    }));

  it("TC-RM-09 a paid customer with no debt owes nothing: no quick pay, collect or write-off", () =>
    on(() => {
      const keys = keysOf(customerMenuItems(aliNoPhone, { status: paid, debtUsd: 0, currencies: [] }, staff));
      expect(keys).toEqual(["record_sale", "add_custom_debt", "edit", "history"]);
    }));

  it("TC-RM-10 without a phone, pay-and-send stays visible but disabled with a reason", () =>
    on(() => {
      const items = customerMenuItems(aliNoPhone, { status: unpaid, debtUsd: 0, currencies: [] }, staff);
      expect(items.find((item) => item.key === "quick_pay_whatsapp")).toMatchObject({
        disabled: true,
        captionKey: "invoice.no_phone",
      });
      expect(keysOf(items)).not.toContain("whatsapp_chat");
    }));

  it("TC-RM-11 a typed-price line has nothing priced to send, so no pay-and-send", () =>
    on(() => {
      const typedOnly = customer({ customerPlans: [line({ id: "l-typed", plan: typed, planId: typed.id })] });
      const keys = keysOf(customerMenuItems(typedOnly, { status: unpaid, debtUsd: 0, currencies: [] }, admin));
      expect(keys).toContain("quick_pay");
      expect(keys).not.toContain("quick_pay_whatsapp");
    }));

  it("TC-RM-12 pausing and deleting are admin-only; a paused customer resumes", () => {
    expect(customerStatusItems(ali, { isAdmin: false })).toEqual([]);
    expect(keysOf(customerStatusItems(ali, { isAdmin: true }))).toEqual(["deactivate", "delete"]);
    expect(keysOf(customerStatusItems({ ...ali, active: false }, { isAdmin: true }))).toEqual(["reactivate", "delete"]);
  });

  it("TC-RM-13 a pick of one edits and toggles; a pick of many only pays and deletes", () => {
    expect(keysOf(customerSelectionItems([ali], { isAdmin: true }))).toEqual(["edit", "quick_pay", "deactivate", "delete"]);
    expect(keysOf(customerSelectionItems([ali, ali], { isAdmin: true }))).toEqual(["quick_pay", "delete"]);
    expect(keysOf(customerSelectionItems([ali, ali], { isAdmin: false }))).toEqual(["quick_pay"]);
    expect(customerSelectionItems([], { isAdmin: true })).toEqual([]);
  });
});

describe("sale receipt", () => {
  it("TC-RM-14 a live receipt edits and voids; history is admin-only; a voided one only reads history", () => {
    expect(keysOf(saleReceiptActions(sale(), { isAdmin: true }))).toEqual(["edit", "history", "void"]);
    expect(keysOf(saleReceiptActions(sale(), { isAdmin: false }))).toEqual(["edit", "void"]);
    expect(keysOf(saleReceiptActions(sale({ voidedAt: AT }), { isAdmin: true }))).toEqual(["history"]);
  });

  it("TC-RM-15 the receipt judges the LIVE cash: part-paid is collectable only with a customer and a bill", () => {
    const billed = sale({ totalAmount: 30, charge: charge({ amount: 30 }) });
    expect(saleReceiptFacts(billed, 10)).toMatchObject({ partlyPaid: true, canCollect: true, balance: 20 });
    expect(saleReceiptFacts({ ...billed, customerId: null }, 10).canCollect).toBe(false);
    expect(saleReceiptFacts(billed, 30)).toMatchObject({ partlyPaid: false, canCollect: false });
  });

  it("TC-RM-32 a pick with any live sale sends and voids; an all-voided pick offers nothing", () => {
    expect(keysOf(saleSelectionItems([sale(), sale({ voidedAt: AT })]))).toEqual(["invoice", "void"]);
    expect(saleSelectionItems([sale({ voidedAt: AT })])).toEqual([]);
  });

  it("TC-RM-16 a written-off or voided sale is never collectable", () => {
    const writtenOff = sale({ totalAmount: 30, charge: charge({ amount: 30, writtenOffAt: AT }) });
    expect(saleReceiptFacts(writtenOff, 0)).toMatchObject({ writtenOff: true, canCollect: false });
    expect(saleReceiptFacts(sale({ voidedAt: AT, charge: charge() }), 0)).toMatchObject({
      voided: true,
      partlyPaid: false,
      canCollect: false,
    });
  });
});

describe("debtorActions", () => {
  it("TC-RM-17 billed debts collect and write off together", () => {
    expect(keysOf(debtorActions([openItem({ kind: "manual" })]))).toEqual(["collect_all", "write_off_all"]);
  });

  it("TC-RM-18 a virtual month has no bill, so it collects but never writes off", () => {
    expect(keysOf(debtorActions([openItem({ chargeId: null })]))).toEqual(["collect_all"]);
  });

  it("TC-RM-19 nothing owed, nothing offered", () => {
    expect(debtorActions([])).toEqual([]);
  });
});

describe("catalog menus", () => {
  it("TC-RM-20 a branch or currency pauses and resumes, and deletes either way", () => {
    expect(keysOf(catalogRowActions("branch", { active: true }))).toEqual(["edit", "history", "deactivate", "delete"]);
    expect(keysOf(catalogRowActions("currency", { active: false }))).toEqual(["edit", "history", "reactivate", "delete"]);
  });

  it("TC-RM-21 a product's delete IS its pause: a deleted one only comes back", () => {
    expect(keysOf(catalogRowActions("product", { active: true }))).toEqual(["edit", "stock", "history", "delete"]);
    expect(keysOf(catalogRowActions("product", { active: false }))).toEqual(["edit", "history", "reactivate"]);
    expect(keysOf(catalogRowActions("service", { active: true }))).toEqual(["edit", "history", "delete"]);
  });

  it("TC-RM-22 a plan has no active flag: edit, history, delete", () => {
    expect(keysOf(catalogRowActions("plan", plan()))).toEqual(["edit", "history", "delete"]);
  });

  it("TC-RM-23 a pick of many only deletes; a pick of one also edits and changes status", () => {
    expect(keysOf(catalogSelectionActions("branch", [{ active: true }, { active: false }]))).toEqual(["delete"]);
    expect(keysOf(catalogSelectionActions("product", [{ active: true }]))).toEqual(["edit", "stock", "delete"]);
    expect(keysOf(catalogSelectionActions("service", [{ active: false }]))).toEqual(["edit", "reactivate", "delete"]);
    expect(catalogSelectionActions("plan", [])).toEqual([]);
  });

  it("TC-RM-24 status labels follow the catalog", () => {
    const pause = catalogRowActions("currency", { active: true }).find((item) => item.key === "deactivate");
    const resume = catalogRowActions("product", { active: false }).find((item) => item.key === "reactivate");
    expect(pause).toMatchObject({ labelKey: "tenant_settings.deactivate", destructive: true });
    expect(resume?.labelKey).toBe("common.reactivate");
  });
});

describe("user menus", () => {
  const user = (over: Partial<AppUser>): AppUser =>
    ({ id: "u", role: "user", branchId: "b1", active: true, fullName: "U", ...over }) as AppUser;
  const branchAdmin = user({ id: "admin-1", role: "admin", branchId: "b1" });
  const staff = user({ id: "staff-1" });
  const otherBranch = user({ id: "staff-2", branchId: "b2" });

  it("TC-RM-25 an admin manages staff in its branch, never itself or another branch", () => {
    expect(keysOf(userRowActions(branchAdmin, staff))).toEqual(["edit", "history", "deactivate", "delete"]);
    expect(keysOf(userRowActions(branchAdmin, branchAdmin))).toEqual(["edit", "history"]);
    expect(keysOf(userRowActions(branchAdmin, otherBranch))).toEqual(["history"]);
    expect(keysOf(userRowActions(branchAdmin, { ...staff, active: false }))).toContain("reactivate");
  });

  it("TC-RM-26 a bulk delete skips the rows the viewer cannot manage", () => {
    const { manageable, skipped } = splitManageable(branchAdmin, [staff, branchAdmin, otherBranch]);
    expect(manageable.map((u) => u.id)).toEqual(["staff-1"]);
    expect(skipped).toBe(2);
    expect(keysOf(userSelectionActions(branchAdmin, [staff, branchAdmin]))).toEqual(["delete"]);
    expect(userSelectionActions(branchAdmin, [branchAdmin, otherBranch])).toEqual([]);
  });
});

describe("stock entries", () => {
  const movement = (over: Partial<StockMovement>): StockMovement => ({
    id: "m1",
    tenantId: "t1",
    productId: "p1",
    quantityDelta: 3,
    reason: "restock",
    saleId: null,
    unitCost: 10,
    currencyId: null,
    ratePerUsdSnapshot: 1,
    note: null,
    recordedByUserId: null,
    occurredAt: AT,
    voidedAt: null,
    voidedBy: null,
    createdAt: AT,
    ...over,
  });

  it("TC-RM-27 a manual entry edits and reverts; a reverted one keeps history; a sale's has no menu", () => {
    expect(keysOf(stockEntryActions(movement({})))).toEqual(["edit", "history", "revert"]);
    expect(keysOf(stockEntryActions(movement({ voidedAt: AT })))).toEqual(["history"]);
    expect(stockEntryActions(movement({ reason: "sale", quantityDelta: -1 }))).toEqual([]);
  });

  it("TC-RM-28 a restock costs money, a removal gives it back, a reversed entry costs nothing", () => {
    expect(stockEntryCost(movement({}), [])).toEqual({ amount: formatMoney(30, null, null), refund: false });
    expect(stockEntryCost(movement({ quantityDelta: -2 }), [])).toEqual({ amount: formatMoney(20, null, null), refund: true });
    expect(stockEntryCost(movement({ voidedAt: AT }), [])).toBeNull();
    expect(stockEntryCost(movement({ unitCost: null }), [])).toBeNull();
  });
});

describe("quick actions and page access", () => {
  const viewer = (over: Partial<Viewer>): Viewer => ({
    isAdmin: false,
    isTenantWideAdmin: false,
    whatsappEnabled: false,
    ...over,
  });

  it("TC-RM-29 expense and restock shortcuts are admin-only", () => {
    expect(keysOf(quickActionItems({ isAdmin: false }))).toEqual(["collect", "customer", "sale", "customDebt", "moneyReceived"]);
    expect(keysOf(quickActionItems({ isAdmin: true }))).toContain("expense");
    expect(keysOf(quickActionItems({ isAdmin: true }))).toContain("batchRestock");
  });

  it("TC-RM-30 staff land on customers, admins on the dashboard", () => {
    expect(landingPage(viewer({}))).toBe("customers");
    expect(landingPage(viewer({ isAdmin: true }))).toBe("dashboard");
  });

  it("TC-RM-31 organization needs a tenant-wide admin; WhatsApp pages also need it switched on", () => {
    const branchAdmin = viewer({ isAdmin: true });
    const tenantAdmin = viewer({ isAdmin: true, isTenantWideAdmin: true });
    expect(canOpenPage(viewer({}), "customers")).toBe(true);
    expect(canOpenPage(viewer({}), "reports")).toBe(false);
    expect(canOpenPage(branchAdmin, "organization")).toBe(false);
    expect(canOpenPage(tenantAdmin, "organization")).toBe(true);
    expect(canOpenPage(tenantAdmin, "whatsapp")).toBe(false);
    expect(canOpenPage({ ...tenantAdmin, whatsappEnabled: true }, "whatsapp")).toBe(true);
    expect(canOpenPage({ ...branchAdmin, whatsappEnabled: true }, "whatsapp_history")).toBe(true);
  });
});
