# Void and correct

Two kinds of void: **void a payment** (the cash was wrong, the bill is still owed) and **void a month / bill** (the bill should never have existed, so its cash goes too).

## Void a payment

Use the 55 payment from collect-money.md #22 (Jan 20, Feb 20, sale 15).

1. Void the 55 payment → Jan and Feb go back to Unpaid and are NOT in Debts; the sale owes 40 again; Money received shows 55 greyed as Voided; revenue and the collector's wallet drop by 55.
2. The void confirm → a red warning lists the **other** bills this payment also paid (not the bill you opened it from).
3. Void a payment that paid only one bill → no red warning.
4. Jul and Aug paid, void Jul's **payment** from the bill → allowed (voiding a payment is never blocked by order); Jul goes back to Unpaid.
5. Collect Jan again after voiding its payment → the same bill is reused at the same price.

## Void a month (the bill and its money)

6. Jul and Aug paid, Void this month on Jul → refused, naming August. Void Aug, then Jul → both voided.
7. Void this month on a paid month → the bill and all its payments are voided; revenue and wallet drop by the paid amount; the reason is saved.
8. Void a month whose payment also paid a sale → the warning names the sale; after confirming, the sale owes again too.
9. A month that was never collected → no Void this month is offered.
10. Void any month of a 3-month bundle → the whole bundle is voided.

## Correct amount

11. $50 payment on a $50 month, correct to 40 → month shows 40/50 with the ring; the old payment is voided with reason "Corrected from $50 to $40"; the new one keeps the original date, collector and currency.
12. A $40 payment that paid Sep $20 + Oct $20, correct to 30 → Sep stays fully paid, Oct becomes 10/20. Correct to 15 instead → Sep 15/20, Oct back to Unpaid.
13. A $50 bill with a $5 payment, correct to 50 → bill fully paid. If the bill also has another $30 payment → the most allowed is 20.
14. Correct a payment → revenue stays in the original month and changes only by the difference.
15. Correct a payment the collector already handed to the branch admin → the new payment is still held by the branch admin; the collector's wallet does not grow. A banked payment stays banked.
16. Correct to 0 → refused, it says to void instead.
17. Correct a payment on a written-off bill → refused: undo the write-off first.

## Money received

18. Select 2 payments and void them with a reason → both stay listed, greyed; "Collected in this view" drops by both; the customers' debts go up.
19. Filter Voided only → "Collected in this view" is hidden; voided payments never count in any total.
20. (web) Choose a period with more than 1000 payments → "Collected in this view" equals the sum of all of them, not the first 1000.
21. Select 2 payments and void them, then open those customers' months and sales without refreshing → the voided money is already gone from them.
22. Void a payment that paid 3 bills, once from Money received and once from one of its bills → both warnings say it paid 3 bills.
