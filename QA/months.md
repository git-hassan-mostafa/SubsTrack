# Months

What a month shows after money moves. A month is Paid as soon as **any** money reaches it.

## After a void

1. Pay a month, then void its payment → month reads Unpaid exactly like a month never touched; it is NOT in Debts; it is still collectable.
2. Void this month, then collect the same month again at the same price → Paid, and still Paid after refresh and app restart; only one bill exists; "Billed on" is the new day, "Due" is unchanged.

## Price changes

3. Void a month's payment, then move the line from a $50 plan to a $30 plan (or edit the plan price to $30) → the month now collects $30 from every door (cell, quick pay, Collect money); Debts does not show it twice.
4. Pay a month at $50 (fully or partly), then change the plan price to $40 → the month stays $50; the remainder is counted from $50.
5. Void a month billed in LBP, move the line to a USD plan → the month now collects in USD at the USD rate.
6. Void a 1-month bill, move the line to a 3-month plan → collecting it again covers 3 months as one bill.

## Written-off months

7. Pay $20 of a $60 month, then write it off → month still reads Paid with the ring (20/60); not in Debts.
8. Collect the remaining $40 on that written-off month → the write-off is undone; the month is 60/60; Reports no longer counts it as written off.
9. A written-off month with $0 paid → the cell is Unpaid, but tapping opens the bill (with Undo write-off), never the collect form.

## Skipped months

10. Skip an unpaid month → Skipped; not counted as unpaid or overdue anywhere (customer pill, dashboard Unpaid, reports).
11. Skip Jan, then pay Feb → Jan can no longer be unskipped; tapping Jan opens the collect form; paying it turns Jan Paid.
12. Pay a 3-month bundle that covers a skipped month → refused, the skipped month is named (unskip first).
13. Every plan line skipped this month → customer pill reads Skipped, not Unpaid.

## Unpaid rule and customer status

14. Unpaid rule = "customer start day", line starts on the 15th, today is the 11th → this month is grey "not due yet" but can still be paid; last month is red.
15. Non-regular customer with an unpaid month → grey, never Overdue, not in the dashboard Unpaid count.
16. Customer who owes nothing → pill reads Paid and never also Overdue.
17. Customer with a partly paid month → month counts as paid (not Unpaid / Overdue), and the customer has the debt pill.
18. Pay any month on a line → that line's start date can no longer be changed.

## Customer portal

19. Open the customer portal link → the months, bills, payments and amount owed match what the app shows for that customer.
