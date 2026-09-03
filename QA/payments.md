# Payments (collecting a month) — QA Scenarios

Covers everything that happens when a user taps a month cell or uses Quick Pay: collecting a month in full or in part, installments, multi-month bundles, currency selection, the bill sheet (which lists every payment that reached a month) and undoing one.

The money model underneath — bills, hand-overs, the waterfall, void vs write-off — is in [ledger-collections.md](ledger-collections.md); **run that first**. The month-grid status logic is in [monthly-grid.md](monthly-grid.md). Currency CRUD and the display-currency preference are in [currencies.md](currencies.md). Sending the receipt over WhatsApp is in [whatsapp-invoices.md](whatsapp-invoices.md).

**Reference code:**
- The one collect form: [CollectSheet.tsx](../SubsTrack/src/modules/ledger/components/CollectSheet.tsx)
- One bill + its payments: [BillSheet.tsx](../SubsTrack/src/modules/ledger/components/BillSheet.tsx)
- Undo one hand-over: [VoidCollectionDialog.tsx](../SubsTrack/src/modules/ledger/components/VoidCollectionDialog.tsx)
- The grid panel: [CustomerPaymentPanel.tsx](../SubsTrack/src/modules/customer/customer-payments/components/CustomerPaymentPanel.tsx)
- Customer-list quick pay: [CustomerListScreen.tsx](../SubsTrack/src/modules/customer/customers/screens/CustomerListScreen.tsx)
- The month rules: [PaymentService.ts](../SubsTrack/src/modules/customer/customer-payments/services/PaymentService.ts) (`buildMonthGrid` — no CRUD)
- The money: [CollectionService.ts](../SubsTrack/src/modules/ledger/services/CollectionService.ts)
- Slices: `payments` (grid state only), `ledger` (the money)

---

## 0. Critical invariants

Re-verify these after any release:

1. **Collecting a month writes a `collections` row, and the month's bill is raised in the same write** if it did not exist. There is no "payment" table.
2. **A month has no bill until money reaches it.** An unpaid month is an absence, not a zero row.
3. **A partial payment resolves to `"paid"`** — there is no `"partial"` month status. Only the amber ring, the `PARTIAL` sublabel and the `20/50 $` fraction distinguish it.
4. **A month can take several payments.** The bill sheet lists each with its own date and collector.
5. **The amount of a recorded hand-over can never be edited** — undoing one is a void.
6. **Months are settled OLDEST FIRST**, where "earlier" means uncovered, not merely overdue.
6b. **Month BILLS are voided NEWEST FIRST** — July cannot be voided while August is paid, so a paid month can never end up on top of an unpaid one. Voiding one **hand-over** is not gated.
7. **Every amount freezes its currency's rate** at the moment it is written; a later rate change never moves a past figure.

---

## 1. Tapping a month cell — the router

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Unpaid month | Tap a red cell | The collect sheet opens with that month as its single item, amount pre-filled to the line's price |
| 1.2 | Paid month | Tap a green cell | **BillSheet** opens: the amount, the meta, and every payment that reached it |
| 1.3 | Partly-paid month | Tap an amber-ringed cell | BillSheet, with a `12/20 $` hero and a **Collect $8** button at the bottom |
| 1.4 | Future month | Tap a grey future cell | The collect sheet opens (prepay is allowed) — unless the customer or line is inactive, which blocks calendar-future months with a dialog |
| 1.5 | Before start | Tap a cell before the line's start date | "Not available" dialog; nothing opens |
| 1.6 | Skipped month | Tap a slate cell | The unskip sheet opens — not the collect sheet |
| 1.7 | Blocked by an older month | Tap March with January uncovered | "Not available", naming January |
| 1.8 | No price to collect | A custom-price line with no special price | The menu offers no quick pay, and tapping explains there is no set price |

---

## 2. Pay order — no gaps, including future months

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Older unpaid month blocks | Jan unpaid, tap Mar | Refused, naming January |
| 2.2 | Prepay in order is fine | Everything up to today paid, tap next month | Allowed |
| 2.3 | Prepay OUT of order is not | Jul+Aug paid in August, tap December | Refused, naming September |
| 2.4 | The whole selection is judged at once | Multi-select Jan+Feb+Mar and collect | Allowed. Selecting only Mar is refused |
| 2.5 | A previous year still blocks | A backlog in the previous year, viewing this year | Refused, naming the old month — even though the viewed grid cannot show it |
| 2.6 | Skipped / partly-paid / before-start are not holes | Any of the three sitting behind the target | Never blocks |
| 2.7 | Per service line | Line B's January while line A holds a paid February | Line B collects freely |

---

## 3. Collecting the full price (the common case)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Quick pay | Cell menu → **Pay now** | Collects the full price in one tap, no sheet. Cell turns green |
| 3.2 | From the card | Customer list → 3-dot → Quick pay | Collects every eligible line's current month |
| 3.3 | Multi-plan, one currency | A customer with two USD lines due | **ONE** hand-over covering both, and **one** receipt |
| 3.4 | Multi-plan, two currencies | One USD line and one LBP line | **TWO** hand-overs, one per currency, and two receipts (gotcha #108) |
| 3.5 | Unpaid banner | The current month unpaid on an active regular customer | The red banner's **Collect** button does the same thing |
| 3.6 | Custom-price line | Quick pay on a line with no remembered amount | Routes to the collect sheet / the detail screen instead of collecting silently |

---

## 4. Collecting part of it

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Type less | Cell menu → **Collect part** → 12 of 20 | The sheet shows "leaves 8 owing" under the row |
| 4.2 | Save | Confirm | Cell shows the paid fill under an amber ring, sublabel `PARTIAL` |
| 4.3 | It becomes a debt | Debts screen | The customer appears with a `month` row of 8, printed `12/20 $` |
| 4.4 | Collect the rest | Cell menu → **Collect the rest** | Pre-filled with 8; saving clears the ring |
| 4.5 | Three installments | 10, then 5, then 5 on a 20 month | Each is its own hand-over on its own date; the bill sheet lists all three |
| 4.6 | Cannot overpay one month | Type 25 on a 20 month | Refused with the maximum named |
| 4.7 | Zero is not a payment | Type 0 | Save stays disabled — a month nothing was collected for is simply left unpaid |

---

## 5. Multi-month bundles

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Quick pay a 3-month plan | Cell menu → Pay now | A confirm names the range and the bundle price; saving fills **three** cells |
| 5.2 | One bill, not three | Check the DB | ONE `charges` row with `duration_months = 3` |
| 5.3 | The block reads as one | The grid | Cells join into one pill; months 2–3 read `Included` |
| 5.4 | Partial bundle | Collect part of the bundle | All three cells still show as paid; only the first carries the amber ring |
| 5.5 | Multi-select collapses to blocks | Select 6 months of a 3-month plan and collect | **Two** items in the sheet, one per block, each billed from the block's first month — never six |
| 5.6 | Cross-year | A block spanning December→January | December shows a wrap chevron; January of the next year reads `Included` |

---

## 6. Multi-select in the grid

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Enter selection | Long-press a cell | The toolbar replaces the year summary |
| 6.2 | Collect a selection | Select 3 unpaid months → **Collect** | The collect sheet opens with all three and the waterfall preview |
| 6.3 | The split is honest | Type less than the total | The preview shows exactly which months it settles and which it does not |
| 6.4 | Pay & send | The WhatsApp action | One receipt for the hand-over, listing every month it settled |
| 6.5 | Skip / unskip | The skip actions | Unchanged |
| 6.6 | **There is no bulk Void** | Select paid months | No void action — undoing is per hand-over, in the bill sheet (gotcha #109) |

---

## 7. The bill sheet

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | Open | Tap a paid cell, or the menu's **View bill** | Hero, due/issued dates, then the payments list |
| 7.2 | Settled | A fully paid month | Hero shows the amount and a green **Settled** chip |
| 7.3 | Partial | A partly-paid month | Hero shows `12/20 $`, "Remaining $8", an amber **Part paid** chip, and a Collect button |
| 7.4 | Each payment | Several installments | One row each: amount put against **this** bill, its date, and who collected it |
| 7.5 | A payment that covered more | A month settled by a waterfall hand-over | Its row says "also paid other bills" |
| 7.6 | Void one | The row's 3-dot → Void payment | A reason box; the warning names how many bills it will un-settle |
| 7.7 | After voiding | Confirm | The sheet re-reads; the month goes back to unpaid; a voided row stays visible, dimmed |
| 7.8 | Send | The row's 3-dot → Send on WhatsApp | Re-sends that hand-over's receipt |
| 7.9 | No edit | Look for one | There is none — by design |

---

## 8. Void order — newest first

The rule is about voiding a **month bill** ("Void this month", from the cell's
3-dot menu or the bill sheet's header 3-dot menu). Voiding one **hand-over** from the
bill sheet's payment list is NOT gated — it leaves its bill where it was, owed.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 8.1 | A newer paid month blocks | July and August both paid; cell menu on July → **Void this month** | Refused with a "Not available" popup naming **August** ("… is paid on this plan. Newer months must be voided first."). The destructive confirm never appears |
| 8.2 | Newest first works | Void August, then July | Both succeed |
| 8.3 | Same from the bill sheet | Open July's bill sheet with August paid; tap the red **Void this month** | Same popup; the sheet stays open |
| 8.4 | A partly-paid later month blocks too | Aug has 5 of 20 | It still blocks July (it is real money) |
| 8.5 | An empty bill does not block | Aug's only payment was already voided | July voids freely |
| 8.6 | All years are checked | Dec 2026 blocked by a paid Jan 2027 | Refused, even though the 2027 grid is not on screen |
| 8.7 | A multi-month block voids whole | A Jul–Sep bundle paid, nothing later | Allowed — its own months never block each other |
| 8.8 | A block is blocked by what follows it | The Jul–Sep bundle with October paid | Refused, naming October |
| 8.9 | Another service line does not block | Line A's July unpaid-voidable, line B's August paid | Allowed — the rule is per service line |
| 8.10 | A payment void is never blocked | July + August paid; bill sheet on July → the payment row's **Void payment** | Allowed; July goes back to unpaid with August still paid |
| 8.11 | Unskip follows the same rule | July skipped, August paid; try **Unskip** on July | Unskip is not offered; the pay actions are offered instead (§ monthly-grid) |

---

## 9. Currency and snapshots

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 9.1 | The line's currency wins | An LBP-priced line | The bill and the hand-over both freeze the LBP rate — never USD's 1 |
| 9.2 | Immune to a rate change | Collect in LBP, then edit the tenant LBP rate | The year total, the dashboard and the receipt all keep the original USD value |
| 9.3 | Two rates, two meanings | A bill raised last month, collected today, with the rate changed between | The **debt** converts at the bill's rate; the **revenue** at the hand-over's. Both are correct and they may differ |
| 9.4 | Display currency | Change it in Tenant Settings | Every read-only figure re-renders; nothing stored changes |
| 9.5 | One currency per hand-over | A pool with two currencies | The picker appears; the pool narrows to the selected currency |

---

## 10. Inactive customer / cancelled plan

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 10.1 | Past + current months stay collectable | An inactive customer | Tapping a past month opens the collect sheet normally |
| 10.2 | Future months are blocked | The same customer, a future month | "Not available", naming the customer (inactive takes priority over a cancelled plan) |
| 10.3 | Cancelled plan | An active customer with a cancelled line | Same rule, with the cancelled-plan wording |
| 10.4 | Unskipping still works | Either case | Unskip is not a payment, so it is never blocked by this gate |

---

## 11. Permissions

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 11.1 | A collector can collect | Log in as `user` | Full access to collecting and to the bill sheet |
| 11.2 | A collector can void a hand-over | The bill sheet | Allowed — the same as before |
| 11.3 | History is admin-only | The record-history action | Hidden / empty for a non-admin (RLS) |
| 11.4 | Branch scoping | A branch admin | Only that branch's customers and money |

---

## 12. Things that must NOT be possible

12.1 Editing the amount of a recorded hand-over — there is no such control anywhere.
12.2 Voiding a month while a **later** month of the same service line is paid (§8).
12.3 A "Complete" action.
12.4 Collecting 0.
12.5 Collecting more than is owed.
12.6 Two bills for the same month of the same service line (even from two offline devices).
