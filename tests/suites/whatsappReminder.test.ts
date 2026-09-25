jest.mock("@/src/modules/ledger/repository/ChargeRepository", () => ({
  __esModule: true,
  default: require("../helpers/fakeLedger").fakeChargeRepository,
}));
jest.mock("@/src/modules/ledger/repository/CollectionRepository", () => ({
  __esModule: true,
  default: require("../helpers/fakeLedger").fakeCollectionRepository,
}));
jest.mock("@/src/modules/customer/customer-payments/services/SkippedMonthService", () => ({
  __esModule: true,
  default: { getActiveSkips: async () => [] },
}));

import { ledgerService } from "@/src/modules/ledger/services/LedgerService";
import { whatsAppService } from "@/src/modules/whatsapp/services/WhatsAppService";
import { reminderFacts } from "@/src/modules/whatsapp/utils/reminderFacts";
import {
  defaultChoices,
  messageLanguage,
  missingCustomText,
  needsOwedFacts,
  paramMaxLength,
  previewText,
  resolveValues,
} from "@/src/modules/whatsapp/utils/templateValues";
import { DEFAULT_PARAM_MAX_LENGTH } from "@/supabase/functions/_shared/whatsapp/rules";
import { sijilTemplateByPurpose } from "@/supabase/functions/_shared/whatsapp/sijilTemplates";
import { store } from "../helpers/fakeLedger";
import { customer, line, openItem, plan, LBP } from "../helpers/factories";
import { freezeToday, unfreeze } from "../helpers/clock";

// TC-WA-M-* — a reminder shows per-currency balances, never converted.
const t = (key: string, opts?: Record<string, unknown>) =>
  opts ? `${key} ${JSON.stringify(opts)}` : key;

const reminder = sijilTemplateByPurpose("payment_reminder");

beforeEach(() => {
  store.reset();
  freezeToday(2026, 3, 15);
});
afterEach(unfreeze);

describe("reminderFacts", () => {
  it("TC-WA-M-01 nothing owed means no reminder at all", () => {
    expect(reminderFacts([], [LBP], t)).toBeNull();
    expect(reminderFacts([openItem({ amount: 20, paid: 20 })], [LBP], t)).toBeNull();
  });

  it("TC-WA-M-02 a partly paid bill reminds for its BALANCE, not its price", () => {
    const facts = reminderFacts([openItem({ amount: 30, paid: 10 })], [LBP], t);
    expect(facts?.amount).toBe("$20.00");
  });

  it("TC-WA-M-03 each currency is summed in its own units and never converted", () => {
    const facts = reminderFacts(
      [
        openItem({ amount: 20, billingMonth: "2026-01-01", dueDate: "2026-01-01" }),
        openItem({ amount: 900000, currencyId: LBP.id, ratePerUsdSnapshot: 90000, billingMonth: "2026-02-01", dueDate: "2026-02-01" }),
        openItem({ amount: 900000, currencyId: LBP.id, ratePerUsdSnapshot: 90000, billingMonth: "2026-03-01", dueDate: "2026-03-01" }),
      ],
      [LBP],
      t,
    );
    expect(facts?.amount).toBe("$20.00 + 1,800,000 L.L.");
  });

  it("TC-WA-M-04 the due date is the OLDEST unpaid bill's", () => {
    const facts = reminderFacts(
      [
        openItem({ billingMonth: "2026-03-01", dueDate: "2026-03-01" }),
        openItem({ billingMonth: "2026-01-01", dueDate: "2026-01-01" }),
      ],
      [LBP],
      t,
    );
    expect(facts?.dueDate).toBe(
      'whatsapp.due_date_value {"day":1,"month":"months.jan","year":2026}',
    );
  });

  it("TC-WA-M-05 an open-amount line (no price yet) never adds to a reminder", () => {
    const facts = reminderFacts(
      [openItem({ amount: 0, openAmount: true }), openItem({ amount: 15 })],
      [LBP],
      t,
    );
    expect(facts?.amount).toBe("$15.00");
  });

  it("TC-WA-M-06 more than three periods are shortened, oldest first", () => {
    const months = ["2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01"];
    const facts = reminderFacts(
      months.map((m) => openItem({ billingMonth: m, dueDate: m })),
      [LBP],
      t,
    );
    expect(facts?.period).toContain("whatsapp.period_more");
    expect(facts?.period).toContain('"count":2');
    expect(facts?.period).toContain("months.nov 2025");
  });

  it("TC-WA-M-13 a balance that is not due yet is never put in a reminder", () => {
    const facts = reminderFacts(
      [
        openItem({ amount: 20, billingMonth: "2026-02-01", dueDate: "2026-02-01" }),
        openItem({ amount: 20, paid: 5, billingMonth: "2026-04-01", dueDate: "2026-04-01" }),
        openItem({ kind: "manual", amount: 50, billingMonth: null, dueDate: "2026-03-20", label: "Router" }),
      ],
      [LBP],
      t,
    );
    expect(facts?.amount).toBe("$20.00");
    expect(facts?.period).toBe("months.feb 2026");
    expect(
      reminderFacts([openItem({ amount: 20, paid: 5, billingMonth: "2026-04-01", dueDate: "2026-04-01" })], [LBP], t),
    ).toBeNull();
  });

  it("TC-WA-M-14 a bill due today is due, and the due date is read as written", () => {
    const today = openItem({ kind: "manual", amount: 10, billingMonth: null, dueDate: "2026-03-15", label: "Fee" });
    const facts = reminderFacts([today], [LBP], t, "2026-03-15");
    expect(facts?.amount).toBe("$10.00");
    expect(facts?.dueDate).toContain('"day":15');
    expect(facts?.dueDate).toContain('"month":"months.mar"');
  });

  it("TC-WA-M-15 the due date's month is in the message language", () => {
    const arabic = (key: string, opts?: Record<string, unknown>) =>
      key === "months.sep"
        ? "أيلول"
        : key === "whatsapp.due_date_value"
          ? `${opts?.day} ${opts?.month} ${opts?.year}`
          : key;
    const facts = reminderFacts(
      [openItem({ billingMonth: "2025-09-01", dueDate: "2025-09-01" })],
      [LBP],
      arabic,
    );
    expect(facts?.dueDate).toBe("1 أيلول 2025");
  });
});

describe("placeholder values", () => {
  it("TC-WA-M-07 the Sijil reminder fills every value by itself", () => {
    const choices = defaultChoices({ params: reminder.params });
    expect(needsOwedFacts(choices)).toBe(true);
    expect(missingCustomText(choices)).toEqual([]);
    const values = resolveValues(choices, {
      customerName: "Rami",
      businessName: "City Net",
      facts: { amount: "$20.00", period: "Jan 2026", dueDate: "Jan 1 2026" },
    });
    expect(values).toEqual({
      customer_name: "Rami",
      business_name: "City Net",
      amount: "$20.00",
      period: "Jan 2026",
      due_date: "Jan 1 2026",
    });
  });

  it("TC-WA-M-08 a reminder is refused when there is no amount to put in it", () => {
    const choices = defaultChoices({ params: reminder.params });
    expect(resolveValues(choices, { customerName: "Rami", businessName: "X", facts: null })).toBeNull();
  });

  it("TC-WA-M-09 an unknown placeholder must be typed before sending", () => {
    const choices = defaultChoices({ params: ["1", "details"] });
    expect(missingCustomText(choices)).toEqual(["1", "details"]);
    expect(previewText({ bodyText: "Hi {{1}}: {{details}}", name: "own" }, choices, (s) => s)).toBe(
      "Hi [custom]: [custom]",
    );
  });

  it("TC-WA-M-16 the preview shows typed text exactly as Meta will get it", () => {
    const outage = sijilTemplateByPurpose("service_outage");
    const choices = defaultChoices({ params: outage.params });
    choices.details = { source: "custom", text: `line one\n\nline two ${"x".repeat(500)}` };
    const preview = previewText({ bodyText: "Details: {{details}}.", name: outage.name }, choices, (s) => s);
    expect(preview).not.toContain("\n");
    expect(preview.length).toBe("Details: ".length + outage.maxLength.details + 1);
  });

  it("TC-WA-M-17 each field is capped where whatsapp-send would cut it", () => {
    const outage = sijilTemplateByPurpose("service_outage");
    expect(paramMaxLength({ name: outage.name }, "details")).toBe(outage.maxLength.details);
    expect(paramMaxLength({ name: "own_template" }, "1")).toBe(DEFAULT_PARAM_MAX_LENGTH);
  });

  it("TC-WA-M-18 values are built in the template's own language when Sijil speaks it", () => {
    expect(messageLanguage({ language: "ar" }, "en")).toBe("ar");
    expect(messageLanguage({ language: "en_US" }, "ar")).toBe("en");
    expect(messageLanguage({ language: "fr" }, "ar")).toBe("ar");
  });
});

describe("owed for many customers at once", () => {
  const P = plan({ id: "p1", price: 20, currencyId: null, durationMonths: 1 });
  const lineA = line({ id: "line-a", customerId: "cust-a", startDate: "2026-01-01", planId: "p1", plan: P });
  const lineB = line({ id: "line-b", customerId: "cust-b", startDate: "2026-03-01", planId: "p1", plan: P });
  const A = customer({ id: "cust-a", name: "A", customerPlans: [lineA] });
  const B = customer({ id: "cust-b", name: "B", customerPlans: [lineB] });

  it("TC-WA-M-10 the batch read owes exactly what getOwed owes, customer by customer", async () => {
    store.seedCharge({
      id: "chg-a-jan",
      customer_id: "cust-a",
      customer_plan_id: "line-a",
      billing_month: "2026-01-01",
      due_date: "2026-01-01",
      amount: 30,
    });
    store.seedCollection("chg-a-jan", 10);
    const args = { skips: [], unpaidRule: "month_start" as const, currencies: [LBP] };
    const batch = await ledgerService.getOwedForCustomers({ customers: [A, B], ...args });
    for (const c of [A, B]) {
      const single = await ledgerService.getOwed({ customer: c, lines: c.customerPlans ?? [], ...args });
      const key = (items: typeof single) =>
        items.map((i) => `${i.billingMonth}:${i.balance}:${i.currencyId}`).sort();
      expect(key(batch.get(c.id) ?? [])).toEqual(key(single));
    }
  });

  it("TC-WA-M-11 recipients skip no-phone and opted-out customers before any money is read", async () => {
    const noPhone = customer({ id: "cust-c", phoneNumber: null, customerPlans: [] });
    const { recipients, skipped } = await whatsAppService.buildRecipients({
      customers: [A, B, noPhone],
      choices: defaultChoices({ params: reminder.params }),
      businessName: "City Net",
      optedOutCustomerIds: new Set(["cust-b"]),
      currencies: [LBP],
      unpaidRule: "month_start",
      t,
    });
    expect(recipients.map((r) => r.customerId)).toEqual(["cust-a"]);
    expect(recipients[0].values.amount).toBe("$60.00");
    expect(skipped).toEqual(
      expect.arrayContaining([
        { customerId: "cust-b", reason: "opted_out" },
        { customerId: "cust-c", reason: "no_phone" },
      ]),
    );
  });

  it("TC-WA-M-12 a customer who owes nothing is skipped, not sent an empty reminder", async () => {
    const paidUp = customer({ id: "cust-d", customerPlans: [] });
    const { recipients, skipped } = await whatsAppService.buildRecipients({
      customers: [paidUp],
      choices: defaultChoices({ params: reminder.params }),
      businessName: "City Net",
      optedOutCustomerIds: new Set(),
      currencies: [LBP],
      unpaidRule: "month_start",
      t,
    });
    expect(recipients).toEqual([]);
    expect(skipped).toEqual([{ customerId: "cust-d", reason: "nothing_owed" }]);
  });
});
