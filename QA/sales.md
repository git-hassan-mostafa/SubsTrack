# Sales

## Record

1. Sale $60, paid in full → no debt; one payment in Money received; sales revenue +60; collector wallet +60.
2. Sale $100, collect $30 → debt 70; revenue +30 (not 100).
3. Sale $100, pay later → debt 100; revenue unchanged; sales count +1.
4. Collect the rest ($70) of that sale next month → revenue next month +70, counted under Sales; total counted over both months = 100.
5. Walk-in sale (no customer) → must be fully paid; it cannot be left owing.
6. Items add up to 60, type a total of 45 → a confirm names both figures; the bill is 45; a walk-in must pay 45; collecting is capped at 45.
7. Sale with no items and a typed total → saved after a confirm; no stock change.
8. Sale in LBP → bill and payment in LBP at today's rate; changing the rate later does not move it.

## Stock

9. Product with stock 5, sell 2 → stock 3.
10. Try to sell 6 of a product with stock 5 (also the same product on two lines) → refused "Only 5 left"; nothing is saved.
11. Sale with only a service line → no stock change and no expense.
12. Void a sale of 2 units → stock goes back up by 2, exactly once (also when voiding several sales at once).

## Collect what a sale still owes

13. Sale owing $25 → "Collect $25" from the sale menu; collect it all → the sale leaves Debts; revenue counts on the day collected.
14. Collect part of it → the sale stays in Debts with the rest.

## Edit

15. Raise the total above what was collected → the debt grows by the difference; the payment is untouched; revenue does not change.
16. Lower the total below what was collected → a confirm; the old payment is voided and a new one saved at the original date and collector; the old one shows as voided.
17. Lower only the collected amount to 0 → a confirm; the whole sale is owed.
18. Change the currency of a paid sale → a confirm; bill and payment both move to the new currency.
19. Collect the rest while editing → a new payment dated today, by the person editing, in their wallet.
20. Edit a sale whose cash was already handed to the branch admin → the rebuilt payment stays with the branch admin.
21. Change quantity 2 → 3 → stock drops by 1 more. Change only the price → stock history unchanged.
22. Move the sale to another customer → its debt moves too.
23. Clear the customer off a sale that still owes → refused.

## Void

24. Void an unpaid sale → the sale and its debt are gone; stock comes back.
25. Void a paid sale → its payments are voided too; revenue and wallet drop; stock comes back.
26. Void a sale whose payment also paid a month → the warning names the month; after confirming, the month is Unpaid again.
27. Sales page "Total sold" → counts live sales only; a voided sale never counts.
