# Months

What a month shows after money moves. A month is Paid as soon as **any** money reaches it.

## After a void

1. Pay a month, then void its payment → month reads Unpaid exactly like a month never touched; it is NOT in Debts; it is still collectable.
2. Void this month, then collect the same month again at the same price → Paid, and still Paid after refresh and app restart; only one bill exists; "Billed on" is the new day, "Due" is unchanged.

## Price changes

3. Void a month's payment, then edit the plan price from $50 to $30 with the new price starting from that month → the month now collects $30 from every door (cell, quick pay, Collect money); Debts does not show it twice.
4. Same as 3, but the new price starts from a LATER month → the voided month still collects $50.
4a. Void the line's only payment, then move the line from a $50 plan to a $30 plan → no "New price starts from" question; every unpaid month now collects $30.
4b. A line with any payment that is not voided → its plan cannot be changed (the plan box is locked, saying to add a new plan instead).
5. Pay a month at $50 (fully or partly), then change the plan price to $40 → the month stays $50; the remainder is counted from $50.
6. Void the only payment of a line billed in LBP, move the line to a USD plan → the month now collects in USD at the USD rate.
7. Void the only payment of a 1-month line, move the line to a 3-month plan → collecting it again covers 3 months as one bill.
8. Customer owes Jan–Apr unpaid on a $20 plan; raise the plan to $25 starting from April → Jan–Mar still ask $20, April asks $25 — in the grid, the collect form, Collect money, the dashboard "Total to collect", WhatsApp reminders and the customer portal.
9. Same customer; raise the plan to $25 starting from February → Jan asks $20, Feb–Apr ask $25.
10. Change the plan price twice (first from March, then from February) → the second change wins for every month it reaches; January keeps the original price.
10a. Move a price's start month → unpaid months from the new month show the new price; paid months keep their bill amount.
11. Give one customer a special price of $18 from March (it was $15) → that customer's Feb asks $15, March asks $18; other customers on the plan do not change.
11a. Remove that customer's special price starting from April → months before April still ask the special price; April onward asks the plan's price (and follows the plan's own price changes).
12. Move a customer with no payments from plan A to plan B → every unpaid month, old ones too, asks plan B's price.
13. Customer with no price change ever → every unpaid month asks today's price (same as before this feature).
14. Collect an old month whose price was different then (cell, Collect money, quick pay) → a note says "The plan price for <month> was <old price>. This price will be used."; quick pay asks before paying; a month at today's price shows no note.
14a. Customer with no plan and no payments owes Aug–Sep; give them a plan (monthly or 3-month) → August and September now ask the new plan's price; Pay now never offers to record $0.00.

## Written-off months

15. Pay $20 of a $60 month, then write it off → month still reads Paid with the ring (20/60); not in Debts.
16. Collect the remaining $40 on that written-off month → the write-off is undone; the month is 60/60; Reports no longer counts it as written off.
17. A written-off month with $0 paid → the cell reads "Written off" (grey); tapping opens the bill (with Undo write-off), never the collect form.
17a. Write off one red month nobody paid (month ⋮ → Write off) → the cell reads "Written off"; the month is no longer counted as unpaid or overdue anywhere (customer pill, dashboard "Total to collect", collect form, WhatsApp reminder); Reports counts that month's price as lost.
17b. The written-off month was priced $20 and today's price is $25 → it is written off at $20 (its own month's price).
17c. Write off January, then pay February → allowed; January does not block it.
17d. Undo the write-off on that month → it is red again and asks its own price; Reports no longer counts it as lost; only one bill exists for that month.
17e. A month on a line with no set price → Write off says there is nothing to write off.

## Skipped months

18. Skip an unpaid month → Skipped; not counted as unpaid or overdue anywhere (customer pill, dashboard Unpaid, reports).
19. Skip Jan, then pay Feb → Jan can no longer be unskipped; tapping Jan opens the collect form; paying it turns Jan Paid.
20. Pay a 3-month bundle that covers a skipped month → refused, the skipped month is named (unskip first).
21. Every plan line skipped this month → customer pill reads Skipped, not Unpaid.

## Unpaid rule and customer status

22. Unpaid rule = "customer start day", line starts on the 15th, today is the 11th → this month is grey "not due yet" but can still be paid; last month is red.
23. Non-regular customer with an unpaid month → grey, never Overdue, not in the dashboard Unpaid count.
24. Customer who owes nothing → pill reads Paid and never also Overdue.
25. Customer with a partly paid month → month counts as paid (not Unpaid / Overdue), and the customer has the debt pill.
26. Pay any month on a line → that line's start date can no longer be changed.
26b. Remove a paid plan and pick an earlier "Stopped on" date → months after that month can no longer be paid; months up to it still can. The picker never goes earlier than the plan's last paid month (that month is allowed). A plan paid ahead can only stop in its last paid month.

## Meter plans

28. Meter month with no reading, or no price set for that month → reads "Waiting"; not owed, not unpaid, not overdue, and does not stop paying a later month.
29. Reading 1120 on a line that started at 1000, month price 40,000 per kWh + 685,000 fixed fee → bill is 685,000 + 120 × 40,000 = 5,485,000.
30. Next month reading 1250 → that month bills 130 kWh (counts from last month's reading).
31. A month price applies to that month only; the next month waits until it gets its own price.
32. Meter replaced (old meter ended at 1200, new meter starts at 0, reads 50; last reading 1120) → 80 + 50 = 130 kWh.
33. Reading lower than last month's (and no meter change) → month stays "Waiting", no bill.
34. Unpaid meter bill → turns Overdue one month after the later of: the day the reading was saved, the day that month's price was FIRST saved. The tenant's unpaid rule does not change this.
35. Money on a month, or on the month after it → that month's meter reading can no longer be changed. Typed-units plans: only money on the same month locks it.
36. Month prices screen: change a month's price that was already set → that month's unpaid meter bills use the new price; Overdue still counts from the day the price was FIRST saved.
37. Month prices screen: type only one of the two prices for a plan, or a price per unit of 0 → Save stays off; nothing is saved for any plan.
38. Customer form, meter line with no start reading → its first month stays "Waiting"; type the start reading and save → the first month gets its bill.
39. Money on the line's first month → the start reading can no longer be changed (field locked, save refused). Money only on later months → it can still be fixed.
40. Customer months, tap a "Waiting" meter month → reading form opens; type the reading → it shows the units used and the bill (fixed fee + units × unit price) before saving; save → the month turns Unpaid with no reload.
41. Reading form on a month whose price is not set → it says the price is not set yet; after saving, the month stays "Waiting".
42. Reading form, reading lower than last month's → red message, Save greyed (the server refuses it too). Reading higher than next month's saved reading → same. Tick "Meter replaced this month" and type both meter readings → units = old meter's tail + new meter's head.
43. Reading form on a month that has money, or (meter plans) whose next month has money → read only, no Save, no Remove; the menu row "Change reading" is greyed with the reason.
44. Remove a reading → the month goes back to "Waiting".
45. Collect an unpaid meter month (tap, Pay now, or To collect) → the amount is the worked-out bill in the plan's currency, not a typed amount; the saved bill shows the readings and "fee + units × unit price = total".
46. Change bill amount on an unpaid meter month (⋮) → the month owes the typed amount; changing the reading later does not change it. Type the worked-out amount again → the month follows the reading again.
47. Month with money on it, or written off → no Change bill amount; the save is refused.
48. Payment on a meter month voided, then the reading changed → the month owes the new worked-out amount; reading removed → the month is "Waiting" and owes nothing.
49. Write off an unpaid meter month → the written-off bill keeps its readings and worked-out sum.
50. Meter customer whose months only wait for a reading or a price → the customer list (phone and web) does not show them as unpaid or overdue, and the dashboard "Unpaid this month" does not count them.
51. Enter this month's reading and price for a meter customer → the dashboard "Unpaid this month" counts them until money reaches the month.
52. Meter month with a worked-out bill left unpaid for more than one month after the reading and price were saved → the customer shows "Overdue" on the phone list, the web list and the customer portal.
53. Meter line, a future month or a "Waiting" month → tap, Pay now, select-and-collect and the quick-pay link all refuse it with "This month has no bill yet"; nothing is collected.
54. Change bill amount on a meter month, then remove its reading → the month still owes the typed amount; once its month ended more than a month ago, the customer shows "Overdue".
55. Edit a saved meter plan → "Meter reading / Typed usage" cannot be changed; the save is refused if forced.
56. Change a meter plan's currency, then open Month prices on a month already priced in the old currency → the fields are empty with a note showing the old price; Save does not re-save it in the new currency unless both prices are typed.
57. Save or remove a reading → To collect, the dashboard and the web customers list show the new amount owed without a manual refresh.

## Customer portal

27. Open the customer portal link → the months, bills, payments and amount owed match what the app shows for that customer.
28. Portal of a meter customer → months waiting for a reading show "Waiting" and the amount owed is the worked-out bills, same as the app.
