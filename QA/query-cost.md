# Query Cost of the Write Paths — QA Scenarios

Cross-cutting. Covers the rewrite of **how** the money reads and writes talk to the local SQLite mirror. **Nothing here is a new feature and no number on any screen should change.** What is being tested is that every figure is *still* correct now that:

- "what is still owed" comes from **one** query (`ChargeRepository.findOpenWithPaid`) instead of "read every bill, then ask a second query what has been paid on each",
- the month grid's bills arrive **with** what has reached them (`DbChargeWithPaid`) instead of a second balances read,
- a **write returns what it wrote** instead of reading the row back, so a bill patch, a hand-over, a voided payment and a new sale are all assembled in memory,
- the mirror runs `synchronous = NORMAL` and has four new indexes.

The risk is not "is it faster" — it is **"did a number quietly change"**. Run every section against a tenant that already has real history: several months, some partial payments, at least one voided collection, one written-off bill and one voided bill.

**Reference code:**

- One-query owed read: [ChargeRepository.offline.ts](SubsTrack/src/modules/ledger/repository/ChargeRepository.offline.ts) (`findOpenWithPaid`, `monthChargesWithPaid`, `PAID_SUM`)
- Web twin: [ChargeRepository.ts](SubsTrack/src/modules/ledger/repository/ChargeRepository.ts)
- Assembled write returns: [CollectionRepository.offline.ts](SubsTrack/src/modules/ledger/repository/CollectionRepository.offline.ts)
- A sale's own bill: [SaleService.ts](SubsTrack/src/modules/transaction/sales/services/SaleService.ts) (`chargeFromPayload`)
- Mirror pragmas + indexes: [sqlite.ts](SubsTrack/src/core/offline/db/sqlite.ts), [schema.ts](SubsTrack/src/core/offline/db/schema.ts)
- The `charge_balances` view (web): `sql scripts/script.sql`
- Gotchas #118, #119, #120

> **The web half needs a database change.** `charge_balances` gained the bill's scoping columns so the server can decide which bills still owe. Run `sql scripts/script.sql` before testing or shipping the web build — see section 8.

---

## 1. Debts screen — same numbers, one query

1.1 Note the Debts tab's **total outstanding**, the customer count and the top three debtors. Reload the app and compare: identical.
1.2 A customer with a **partly paid** month appears with the remaining balance only, not the full month price.
1.3 A customer whose only unpaid months were never touched does **not** appear (a plain unpaid month is not a debt).
1.4 A month that was paid and then had its collection voided does **not** appear (gotcha #106c).
1.5 A **written-off** bill still shows as still owed, and the written-off figure in Reports is unchanged.
1.6 A **voided** bill does not appear anywhere on the screen.
1.7 A bill paid to **exactly** zero balance disappears: no 0.00 row, no rounding leftover.
1.8 Switch the branch chip. Each branch's total still adds up to the all-branches total.
1.9 Open a debtor's detail sheet. Every row's balance matches what the card summarised.

## 2. The month grid — bills and what has reached them

2.1 Open a customer with a long history. Every cell keeps the colour it had before: paid, partial (amber ring), unpaid, skipped, before-start, future.
2.2 A partially paid month opens its bill sheet showing collected out of owed, the same two numbers as before.
2.3 A month whose only collection was voided reads **unpaid**, identical to a month never touched.
2.4 A multi-month bundle still merges its cells and shows "Included" on months 2+.
2.5 The customer list badges (Paid / Unpaid / Overdue / N of M plans / Not due yet / Skipped) are unchanged across a spread of customers.
2.6 A tenant with many customers and years of history opens the customer list with no error. This read previously bound one query parameter per month bill in the whole tenant.

## 3. Collecting a month

3.1 Collect one unpaid month. The cell turns green immediately, with no reload and no flash.
3.2 Collect a partial amount. The cell shows the amber partial ring and the bill sheet's collected/owed is right.
3.3 Collect an amount covering several months in one hand-over. Every covered cell repaints in the same pass, and the debts panel below updates itself.
3.4 Collect a month whose bill had been **voided** (a dead bill). It revives, the cell turns green, and the amount billed is the line's current price.
3.5 Collect a month with an **empty** bill left by a voided collection. It is re-priced from the line (gotcha #106b).
3.6 Collect on a line with **no set price** (open item). Typing the amount creates the bill in the currency chosen.
3.7 Send the WhatsApp receipt straight after collecting. The message lists every bill the hand-over settled, oldest first.
3.8 Right after collecting, open the money-in history. The hand-over is listed with the right customer name, split and labels.
3.9 Kill and reopen the app. Everything from 3.1 to 3.8 is still there.

## 4. Voiding

4.1 Void one hand-over from a bill sheet. Only that bill loses its money, the row shows as voided, and the wallet drops by that amount.
4.2 Void a hand-over that settled three bills. All three go back to owing, in one repaint.
4.3 Void a whole **month bill** (cell menu, Void this month). The bill and every payment on it go, and the cell turns red.
4.4 Void a month while a **later** month is paid. Still refused, with the popup naming the month to void first.
4.5 After 4.3, open Admin, Audit Log. There is one entry per voided hand-over and one for the bill, each showing the **customer's name**, not a blank.
4.6 Void a **paid sale**. Its payments are voided with it, stock comes back, and the audit entries carry the customer name.
4.7 Write off a bill. It stays still owed, is reported as a loss, and the audit entry reads as an update, not a void.
4.8 Edit a hand-typed debt's amount. The Debts screen shows the new figure and the audit entry lists only the columns that moved.

## 5. Recording a sale

5.1 Record a sale paid in full at the till. The row appears as **Paid**, not owing the whole amount.
5.2 Record a **pay-later** sale (no cash). It appears owing the full total, and the customer's debts panel picks it up.
5.3 Record a **partly paid** sale. The row shows collected out of owed, and the 3-dot **Collect** action is offered.
5.4 On that partly-paid sale, tap **Collect** straight away, without leaving the screen or refreshing. The sheet opens with the right bill, the right remaining balance and the right currency.
5.5 Record a **walk-in** (no customer) sale. It must be paid in full, shows as Paid, and offers no Collect action.
5.6 Record a sale in a non-USD currency. The receipt, the month header total and the wallet all use the sale's own frozen rate.
5.7 Record a **service-only** sale. No stock moves; the bill and any till payment behave exactly as for a product sale.
5.8 Record a sale of 3 units. Admin, Products on-hand drops by 3.
5.9 Open the sale's receipt right after recording. The lines, the summary and any payment taken are all listed.
5.10 Reopen the app and check the sale from 5.3 again: collected out of owed unchanged.
5.11 Edit that sale's price upward, then collect the difference from the edit form. The new hand-over is dated today and the earlier payment is untouched.

## 6. A bill's payments list

6.1 Open a month bill that took four hand-overs. All four are listed **oldest first**, each with its date and collector.
6.2 Same for a **sale receipt** paid in installments.
6.3 Void one of them from the list. Only that row is stamped voided, and the hero's collected/owed updates.

## 7. Durability and the mirror

7.1 Record a payment, then force-quit the app from the task switcher. Reopen: the payment is there.
7.2 Record a payment while offline, force-quit, reopen, go online and sync. The payment reaches the server exactly once.
7.3 Clear the app's data (or reinstall), log in and let the first sync finish. The Sales tab, a sale receipt and the payment panel all open normally.
7.4 On an existing install taking the update over the air, open the Sales tab. The new indexes are added on start, with no prompt and no data loss.

## 8. Web — run `sql scripts/script.sql` FIRST

The web build reads `charge_balances` with filters on columns the view only gained in this change. **Run `script.sql` before testing web, and before shipping it.** Until it is run, the Debts tab and the month grid will error on the web.

8.1 Run `script.sql` against the database. It is idempotent — re-running it is the whole migration.
8.2 In Supabase, `select * from charge_balances limit 1` returns `branch_id`, `customer_id`, `customer_plan_id`, `kind`, `due_date` and `written_off_at` alongside `id`, `tenant_id`, `amount`, `paid`, `balance` — in that order.
8.3 Open the web build's Debts tab. The total, the customer count and the debtor list match the native app for the same tenant.
8.4 Open a customer's month grid on web. Every cell colour matches native.
8.5 Repeat sections 3, 4 and 5 on web. Every number matches native.
8.6 As a **branch-scoped** (non-admin) user on web, the Debts tab shows only that branch's debtors — the branch filter now runs on the view, so this is what proves it still scopes.
8.7 As a **tenant-wide admin** on web, switch the branch chip through every branch and then All. Each branch's total still adds up to the all-branches total.
8.8 A **walk-in sale** debt (no customer) appears under the branch it was sold in, not under every branch.
