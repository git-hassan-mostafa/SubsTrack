# Collect money

## One month

1. Tap an unpaid month on a $20 plan and save the full amount → month turns Paid; one payment appears in Money received; the $20 counts in **this** month's revenue even if the month paid is an old one.
2. Collect $10 of a $20 month → month shows Paid with an amber ring and "PARTIAL"; the bill shows 10/20; the customer appears in Debts with $10.
3. Collect the remaining $10 in two steps ($5, then $5) → ring disappears; customer leaves Debts; the bill lists 3 payments, each with its own date and collector.
4. Type $25 on a $20 month → refused with the maximum named; Save disabled.
5. Leave the amount at 0 → Save disabled; nothing is written.

## Quick pay

6. Quick pay one month on a fixed-price plan → month Paid at the full price with no form; one payment.
7. Select Jan, Feb, Mar in the grid and pay → all 3 Paid; **one** payment in Money received listing the 3 months; the receipt lists all 3.
8. Quick pay from the customer card for a customer with 2 plans in the same currency → current month Paid on both plans; **one** payment.
9. Same, but one plan in USD and one in LBP → **two** payments, one per currency.
10. Bulk quick pay several customers from the customer list → each eligible customer's current month is paid; customers with no set price or with an older unpaid month are skipped, and the confirm says how many.
11. Quick pay a 3-month plan → confirm names the months and the bundle price; one bill for the 3 months; months 2–3 read "Included".
12. Pay part of a 3-month bundle → all 3 months read Paid; only the first one has the amber ring; Debts shows the rest.
13. Pay & send on WhatsApp → the message amount equals the payment amount and lists every month it paid.

## Pay order (oldest month first)

14. Jan unpaid, try to pay Mar → refused, naming January.
15. Select Jan + Feb + Mar together and pay → allowed.
16. Nothing owed, prepay next month → allowed. With Sep still unpaid, prepay Oct → refused, naming September.
17. Dec of last year unpaid, pay Jan of this year → refused, naming December of last year.
18. An older month that is skipped or partly paid → does not block a newer month.
19. Plan A has an unpaid Jan, pay Plan B's Feb → allowed (the order is per plan).
20. Inactive customer or cancelled plan → past and current months can still be collected; future months are refused.

## Several bills at once

Setup: one customer owes Jan $20, Feb $20, a pay-later sale $40 (5 Mar), a custom debt $20 (10 Mar). Total $100.

21. Collect money → bills are listed oldest due date first: Jan, Feb, sale, custom debt.
22. Type 55 → preview: Jan paid, Feb paid, sale gets 15 (25 still owed), custom debt not covered; save → **one** payment of 55; Jan + Feb Paid; Debts shows sale 25 + custom 20 = 45.
23. Type 55 and untick Feb → Jan 20, sale 35, custom untouched, Feb stays unpaid; what is saved matches the preview exactly.
24. Type 150 → refused, maximum 100.
25. Open Collect money from the customer card, the quick action, the Debts page and the debtor dialog → the same order everywhere.
26. Customer owes 9 months of $50, collect $350 → the oldest 7 months are paid, the other 2 stay unpaid; each month is listed only once in the payment.

## Two currencies

27. Customer owes $50 and 2,000,000 LBP → Collect money shows one box per currency, each in its own units, never converted; fill both and save → **two** payments (50 USD and 2,000,000 LBP); both bills end at exactly 0.
28. Fill only the USD box → one payment; the LBP debt is unchanged.
29. Type more than owed in the USD box → only the USD box warns; Save disabled.
30. (web) Block the second request in DevTools and save both → the USD payment is saved, a message says part was not saved; reopening Collect money offers only the LBP debt (USD is never collected twice).

## Plan with no set price

31. On a no-set-price month, type 50 as the month amount and collect 20 → bill 50, payment 20, ring on the month, Debts shows 30.
32. Pick LBP for the month amount → bill and payment are both in LBP with today's LBP rate.
33. Select two no-set-price months and collect → refused: each month needs its own amount.

## Prices and rates

34. Collect 90,000 LBP at a rate of 90,000, then change the LBP rate to 100,000 → that payment still reads ≈ $1 in the bill, Money received, dashboard and reports.
35. Collect a month on a plan priced in LBP → bill and payment saved in LBP at the LBP rate (never at the USD rate of 1).
36. Give a $10 plan line a special price of $7 → quick pay collects 7; then change it to $9 → the paid month stays 7, the next month collects 9.
37. Special price $100 on a 3-month plan → every way of paying charges 100 for the 3 months (not 100 per month, not the plan's 60).
38. Change the display currency → every total is shown in the new currency; stored amounts and receipts do not change.
