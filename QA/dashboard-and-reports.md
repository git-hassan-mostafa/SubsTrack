# Dashboard and reports

## Revenue (money that came in)

1. Revenue counts cash on the day it was received, never the bill amount: collect an old month's debt today → it counts in today's month.
2. Dashboard Subscriptions + Sales + Custom = the revenue headline, to the cent.
3. Reports "Collected" for this month = dashboard revenue, to the cent.
4. Void a payment → revenue drops by exactly that amount.
5. Collect a debt → revenue goes up and "Total to collect" goes down by the same amount.
6. "Debts" tile on the dashboard = the Debts page total.
6a. A customer 4 months behind who paid nothing → "Total to collect" includes all 4 months; "Debts" does not move.
6b. "Total to collect" = the sum of what the collect sheet asks every active regular customer, plus the Debts of everyone else (inactive, non-regular, walk-in).
6c. Skip a month, cancel a plan, or change the "when a month becomes unpaid" setting → "Total to collect" follows, like the month grid.
6d. The line under "Total to collect" (Subscriptions · Sales · Manual charges) → adds up to the total exactly.
6e. A plan with no set price → adds nothing; the note says how many plans were left out.
7. Pick a branch → every figure is for that branch; all branches added up = the All branches total.

## Expenses and net

8. Add a $400 expense → Expenses +400; Net = revenue − expenses; the revenue headline does not move.
9. Add an expense in LBP → its $ value stays fixed when the rate changes.
10. Remove an expense → the totals go back. There is no edit (remove and add again).
11. Restock 100 units at $0.35 → an Expenses "Stock" row of $35 in that month. Restock with no cost → no expense.
12. Sell or void a sale → Expenses do not change.
13. Edit the cost of a restock entry → that entry's own month changes. Revert the entry → its cost leaves that month.
14. A company-wide expense, or a restock of a shared product → shows only in All branches, never inside a branch.
15. Expenses list: pick one category or search → the total is only the rows shown, each at its own rate; the Stock / Other split hides.
16. Collector → sees no expenses, net or reports.

## Reports — debts

17. Change the report period → "Still owed" does not change; only "Collected on debts" moves.
18. "Behind on payments" → counts unpaid months to today; a customer behind on 2 plans for the same month counts 1 month.
19. Skipped, not-due-yet, prepaid-ahead gaps and non-regular customers → never counted as behind.
20. Tap any figure → the listed rows add up to the figure tapped. CSV export → adds up to Net.

## Collection progress (dashboard)

21. Skipped, not-due-yet, not-yet-started and non-regular customers → left out of "N of M customers paid".
22. The unpaid count in the progress caption (M − N) = the Unpaid tile.

## Reports — web analysis (filters, group by, records)

23. Any filter or group (collector, customer, plan, currency, category, item…) → the groups add up to the headline above them, and "Show records" adds up to the group's number.
24. More than 1000 payments in the period → Collected still counts every one (same as Money received for that period).
25. Filter by one collector → "Collected" and its "vs previous" both count only that person's cash.
26. Pick one day (⋮ on a date row → "Only …, grouped by customer") → the "vs previous" line disappears.
27. Sales: a sale with a discount → "Sold" shows the typed receipt total; by item, line values can add up to more (note shown).
28. Debts: filter "Owed for: Sales" → "Still owed" and "Collected on debts" both count only sales.
29. Customers: "Expected per month" → a 3-month plan at $30 counts $10; a cancelled customer or a line with no set price counts nothing.
30. Staff: one person's "Cash taken" = Money received filtered to that collector for the same days.
