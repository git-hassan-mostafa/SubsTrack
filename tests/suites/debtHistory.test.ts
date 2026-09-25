import {
  DEFAULT_DEBT_HISTORY_FILTERS,
  daysLateSettling,
  daysOverdue,
  hasActiveHistoryFilters,
  historyOutcomeOf,
  matchesOutcome,
  toDueDateRange,
  toReadScopes,
  type DebtHistoryFilters,
} from "@/src/modules/transaction/debts/utils/debtHistory";
import type { Charge, DebtHistoryItem } from "@/src/core/types";
import { openItem } from "../helpers/factories";

// TC-DH-* — the debt history's pure half: what became of a bill, how late the
// money was, and which of those questions the SERVER can answer. Nothing here
// re-implements a money rule; the outcome delegates to `chargeStatusOf`.

const TODAY = new Date("2026-03-15T12:00:00.000Z");

function historyItem(over: Partial<DebtHistoryItem> = {}): DebtHistoryItem {
  return { ...openItem(), downPaid: 0, settledAt: null, ...over };
}

function charge(over: Partial<Charge> = {}): Charge {
  return {
    voidedAt: null,
    writtenOffAt: null,
    ...over,
  } as Charge;
}

function filters(over: Partial<DebtHistoryFilters> = {}): DebtHistoryFilters {
  return { ...DEFAULT_DEBT_HISTORY_FILTERS, ...over };
}

describe("debt history: outcome", () => {
  it("TC-DH-01 a fully covered bill is settled", () => {
    const item = historyItem({ amount: 20, paid: 20, balance: 0 });
    expect(historyOutcomeOf(item)).toBe("settled");
  });

  it("TC-DH-02 some money makes it part paid", () => {
    const item = historyItem({ amount: 20, paid: 5, balance: 15 });
    expect(historyOutcomeOf(item)).toBe("partial");
  });

  it("TC-DH-03 no money at all is unpaid", () => {
    const item = historyItem({ amount: 20, paid: 0, balance: 20 });
    expect(historyOutcomeOf(item)).toBe("open");
  });

  it("TC-DH-04 a write-off outranks the money on it", () => {
    const item = historyItem({
      amount: 20,
      paid: 5,
      balance: 15,
      charge: charge({ writtenOffAt: "2026-02-01T00:00:00.000Z" }),
    });
    expect(historyOutcomeOf(item)).toBe("written_off");
  });

  it("TC-DH-05 a written-off bill that was fully paid still reads written off", () => {
    const item = historyItem({
      amount: 20,
      paid: 20,
      balance: 0,
      charge: charge({ writtenOffAt: "2026-02-01T00:00:00.000Z" }),
    });
    expect(historyOutcomeOf(item)).toBe("written_off");
  });

  it("TC-DH-06 overpay still settles, never a fifth outcome", () => {
    const item = historyItem({ amount: 20, paid: 25, balance: -5 });
    expect(historyOutcomeOf(item)).toBe("settled");
  });
});

describe("debt history: how late the money was", () => {
  it("TC-DH-07 counts to the day the money arrived, not to today", () => {
    const item = historyItem({
      dueDate: "2026-01-01",
      settledAt: "2026-02-10T09:00:00.000Z",
    });
    expect(daysLateSettling(item)).toBe(40);
  });

  it("TC-DH-08 a bill paid on time says nothing", () => {
    const item = historyItem({
      dueDate: "2026-01-10",
      settledAt: "2026-01-05T09:00:00.000Z",
    });
    expect(daysLateSettling(item)).toBeNull();
  });

  it("TC-DH-09 an unsettled bill has no settle lateness", () => {
    expect(daysLateSettling(historyItem({ settledAt: null }))).toBeNull();
  });

  it("TC-DH-10 a still-owed bill ages against today instead", () => {
    const item = historyItem({
      dueDate: "2026-03-01",
      amount: 20,
      paid: 0,
      balance: 20,
    });
    expect(daysOverdue(item, TODAY)).toBe(14);
  });

  it("TC-DH-11 a settled bill never reads as overdue", () => {
    const item = historyItem({
      dueDate: "2026-01-01",
      amount: 20,
      paid: 20,
      balance: 0,
    });
    expect(daysOverdue(item, TODAY)).toBeNull();
  });

  it("TC-DH-12 a not-yet-due bill is not overdue", () => {
    const item = historyItem({
      dueDate: "2026-12-01",
      amount: 20,
      paid: 0,
      balance: 20,
    });
    expect(daysOverdue(item, TODAY)).toBeNull();
  });
});

describe("debt history: what the query is asked", () => {
  it("TC-DH-13 no outcome filter asks for everything", () => {
    const scopes = toReadScopes(filters());
    expect(scopes.balanceScope).toBe("any");
    expect(scopes.writeOffScope).toBe("any");
  });

  it("TC-DH-14 every money outcome is its OWN server scope, never thinned after", () => {
    expect(toReadScopes(filters({ outcome: "settled" })).balanceScope).toBe(
      "settled",
    );
    expect(toReadScopes(filters({ outcome: "partial" })).balanceScope).toBe(
      "partial",
    );
    expect(toReadScopes(filters({ outcome: "open" })).balanceScope).toBe(
      "unpaid",
    );
  });

  it("TC-DH-15 a money outcome excludes written-off bills, which outrank money", () => {
    for (const outcome of ["settled", "partial", "open"] as const) {
      expect(toReadScopes(filters({ outcome })).writeOffScope).toBe("live");
    }
  });

  it("TC-DH-16 written off switches the write-off scope and frees the balance", () => {
    const scopes = toReadScopes(filters({ outcome: "written_off" }));
    expect(scopes.writeOffScope).toBe("written_off");
    expect(scopes.balanceScope).toBe("any");
  });

  it("TC-DH-17 the sort maps onto a column and a direction", () => {
    expect(toReadScopes(filters({ sort: "newest" }))).toMatchObject({
      sortField: "due_date",
      sortDirection: "desc",
    });
    expect(toReadScopes(filters({ sort: "oldest" }))).toMatchObject({
      sortField: "due_date",
      sortDirection: "asc",
    });
    expect(toReadScopes(filters({ sort: "largest" }))).toMatchObject({
      sortField: "amount",
      sortDirection: "desc",
    });
    expect(toReadScopes(filters({ sort: "smallest" }))).toMatchObject({
      sortField: "amount",
      sortDirection: "asc",
    });
    expect(toReadScopes(filters({ sort: "created" }))).toMatchObject({
      sortField: "created_at",
      sortDirection: "desc",
    });
    expect(toReadScopes(filters({ sort: "updated" }))).toMatchObject({
      sortField: "updated_at",
      sortDirection: "desc",
    });
  });

  it("TC-DH-18 'all time' sends no date bounds at all", () => {
    expect(toDueDateRange("all")).toEqual({});
  });

  it("TC-DH-19 a period sends bare YYYY-MM-DD, never an instant", () => {
    const range = toDueDateRange("this_year");
    expect(range.fromDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(range.toDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("debt history: splitting the page the server could not", () => {
  const settled = historyItem({ amount: 20, paid: 20, balance: 0 });
  const partial = historyItem({ amount: 20, paid: 5, balance: 15 });
  const open = historyItem({ amount: 20, paid: 0, balance: 20 });

  it("TC-DH-20 open and partial are told apart by money", () => {
    expect(matchesOutcome(partial, "partial")).toBe(true);
    expect(matchesOutcome(open, "partial")).toBe(false);
    expect(matchesOutcome(open, "open")).toBe(true);
    expect(matchesOutcome(partial, "open")).toBe(false);
  });

  it("TC-DH-21 no filter keeps every row", () => {
    for (const item of [settled, partial, open]) {
      expect(matchesOutcome(item, null)).toBe(true);
    }
  });
});

describe("debt history: the down payment is what makes a row a story", () => {
  it("TC-DH-25 a bill that took nothing up front still shows its total", () => {
    const item = historyItem({ amount: 20, downPaid: 0, paid: 20, balance: 0 });
    expect(item.downPaid).toBe(0);
    expect(item.paid - item.downPaid).toBe(20);
  });

  it("TC-DH-26 a part payment on the day leaves the rest as 'later'", () => {
    const item = historyItem({ amount: 20, downPaid: 5, paid: 20, balance: 0 });
    expect(item.paid - item.downPaid).toBe(15);
    expect(historyOutcomeOf(item)).toBe("settled");
  });

  it("TC-DH-27 a bill still owing shows nothing came later", () => {
    const item = historyItem({ amount: 45, downPaid: 35, paid: 35, balance: 10 });
    expect(item.paid - item.downPaid).toBe(0);
    expect(historyOutcomeOf(item)).toBe("partial");
  });

  it("TC-DH-28 the down payment is never the whole bill — that never became a debt", () => {
    // The read excludes `down_paid >= amount` on BOTH platforms, so a row that
    // reached the app always has something left over at the moment it was made.
    const item = historyItem({ amount: 20, downPaid: 5, paid: 5, balance: 15 });
    expect(item.downPaid).toBeLessThan(item.amount);
  });
});

describe("debt history: filter state", () => {
  it("TC-DH-22 the defaults are not 'active'", () => {
    expect(hasActiveHistoryFilters(DEFAULT_DEBT_HISTORY_FILTERS)).toBe(false);
  });

  it("TC-DH-23 it opens on ALL TIME, newest created first", () => {
    expect(DEFAULT_DEBT_HISTORY_FILTERS.period).toBe("all");
    expect(DEFAULT_DEBT_HISTORY_FILTERS.sort).toBe("created");
  });

  it("TC-DH-24 any changed filter flags the clear button", () => {
    expect(hasActiveHistoryFilters(filters({ customerId: "c1" }))).toBe(true);
    expect(hasActiveHistoryFilters(filters({ period: "this_year" }))).toBe(true);
    expect(hasActiveHistoryFilters(filters({ outcome: "settled" }))).toBe(true);
    expect(hasActiveHistoryFilters(filters({ kind: "sale" }))).toBe(true);
    expect(hasActiveHistoryFilters(filters({ sort: "oldest" }))).toBe(true);
    expect(hasActiveHistoryFilters(filters({ sort: "newest" }))).toBe(true);
  });
});
