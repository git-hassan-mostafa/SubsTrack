# Money QA

Only the money rules. No add / edit / delete screens, no layout checks.

Each line is one test: **what to do → what to check**. Check only the things named after the arrow — they are the ones that matter.

Run every line on the **phone** and on the **web** app, unless the line says (phone) or (web).

## Files

| File | What it covers |
| --- | --- |
| [collect-money.md](collect-money.md) | Collecting months, quick pay, partial payments, paying several bills at once, two currencies, pay order |
| [void-and-correct.md](void-and-correct.md) | Voiding a payment, voiding a month, correcting a wrong amount |
| [months.md](months.md) | What a month shows after money moves: re-pricing, skipped months, written-off months, unpaid rule |
| [debts.md](debts.md) | What is a debt, custom debts, write off, undo write off |
| [sales.md](sales.md) | Recording, collecting, editing and voiding a sale, and its stock |
| [wallet.md](wallet.md) | Who holds the cash, handing it up, closing it out |
| [dashboard-and-reports.md](dashboard-and-reports.md) | Revenue, expenses, net, reports, collection progress |
| [offline.md](offline.md) | (phone) Money written with no network and on two phones |
| [money-unit-tests.md](money-unit-tests.md) | The automated tests in `tests/` — run `cd tests && npm test` before the manual pass |

## Test data to prepare

- A customer on a **$20 / month** plan with a few unpaid months.
- A customer on a **3-month plan** ($60 for 3 months).
- A customer on a plan with **no set price** (amount typed each month).
- An **LBP** currency at 90,000 per $1.
- A product with **stock 5** and a cost price.
- Staff: a collector and a branch admin in branch A, a tenant-wide admin, and the owner.

## Words used

- **Bill** — what a customer owes for one thing (a month, a sale, a custom debt).
- **Payment** — one hand-over of cash. One payment can pay several bills.
- **Debt** — a bill with something still owed that is NOT a fully unpaid month (a partly paid month, an unpaid sale, a custom debt). A fully unpaid month is shown only in the month grid.
- **Void** — the record was a mistake; it stops counting. **Write off** — the money is real but lost.
