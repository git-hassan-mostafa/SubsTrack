# Debts

## What is a debt

1. Customer with only fully unpaid months → NOT in Debts (they live in the month grid).
2. Pay $10 of a $20 month → customer in Debts with $10.
3. Record a pay-later sale of $100 → debt of $100. A fully paid sale → no debt.
4. Add a custom debt of $20 → debt total rises by 20.
5. Debts total = months + sales + custom, exactly; the customer list debt column shows the same figure as the Debts page.
6. Pick a branch → only that branch's debts; all branches added up = the All branches total.

## Custom debts

7. Add a custom debt in LBP → its ≈ $ value uses today's rate and never moves when the rate changes later.
8. Add a custom debt with a back-dated due date → Collect money pays it before newer bills.
9. Edit a custom debt that has money on it → currency is locked; the amount cannot go below what was collected; its ≈ $ value does not move.
10. Remove a custom debt with no money on it → it disappears from Debts.
11. Remove a custom debt with money on it → refused (void the payment first, or write it off).

## Write off

12. Write off a $50 bill with $20 collected → it leaves "Owed now" and shows under "Written off"; debts total drops by 30; Reports counts 30 as lost; the $20 stays in revenue and in the wallet.
13. Undo that write-off → back under "Owed now" at 30; totals rise by 30; the $20 is untouched.
14. A written-off bill → only Undo write-off is offered (no Collect, no Edit, no Remove).
15. Write off all for a customer with 2 bills → both written off; the customer leaves the debtors list; collected money stays.
16. Write off all for a customer with only fully unpaid months → a message says there is nothing to write off.

## Collecting from Debts

17. Collect from the debtor dialog → the whole amount owed, oldest due date first; the dialog updates without closing and closes when nothing is owed.
18. Change the list sort (newest first etc.) → only the display changes; Collect money still pays the oldest due date first.
19. Collect one debt row → only that bill is paid.
