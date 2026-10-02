# Fix Prompts — SubsTrack for Lebanon

Ready-to-copy prompts for Claude, one per issue from the Lebanon market review
(generator owners and internet distributors, 2026-10-01). They are sorted from
the most critical change to the least. Each prompt only describes the problem
and how the app should behave — Claude finds the code itself.

## How to use

- Open a **new chat** for each prompt. Copy the whole grey box.
- Go **in order**. Tier 1 fixes wrong money numbers, so do it first.
- Big prompts ask Claude to **plan first and wait for your OK**. Read the plan,
  answer its questions, then say "go".
- Some prompts **depend** on an earlier one (see the table). Do the earlier one
  first.
- After each fix: check that the tests pass, try it in the app, then commit.

## Priority list

| #   | Prompt                                   | Why it matters                                           | Size | Needs  |
| --- | ---------------------------------------- | -------------------------------------------------------- | ---- | ------ |
|     | **Tier 1 — money numbers are wrong**     |                                                          |      |        |
| 1   | Total owed must include unpaid months    | The owner's main number is far too low today             | M    | —      |
| 2   | Each month keeps its own price           | A price raise rewrites every old unpaid month            | L    | —      |
| 3   | Write off a customer who never paid      | Lost money never shows as a loss                         | M    | (2)    |
|     | **Tier 2 — blocks the two markets**      |                                                          |      |        |
| 4   | Generator meter billing                  | Generator owners must bill by meter by law               | XL   | (2)    |
| 5   | Import customers from Excel              | Nobody will type 300–1,000 customers by hand             | M    | —      |
| 6   | Prepaid "paid until" for ISPs            | ISPs are prepaid: no pay = cut = nothing owed            | XL   | —      |
| 7   | Disconnect / reconnect + "who to cut"    | Both businesses cut non-payers every month               | L    | —      |
| 8   | Printed receipts and bills               | Paper receipts are the norm; inspectors check them       | L    | (4)    |
|     | **Tier 3 — important**                   |                                                          |      |        |
| 9   | Automatic WhatsApp reminders             | Today staff must press send every time                   | L    | (1)    |
| 10  | WhatsApp "one by one" without Meta setup | Most small owners cannot finish the Meta setup           | M    | —      |
| 11  | Customer credit (keep extra money)       | "Keep the rest for next month" is refused today          | L    | —      |
| 12  | Meter-reading round for collectors       | Fast, offline readings with photo proof                  | L    | 4      |
| 13  | Deposit (تأمين)                          | Allowed by law for generators; ISPs hold router deposits | M    | (11)   |
| 14  | Export customers to Excel                | Backups + regulator reports for licensed ISPs            | S    | (1)    |
| 15  | "Disputed" month that does not block     | A customer can pay this month while arguing an old one   | M    | —      |
| 16  | Cheaper pricing for big tenants          | 2–5× more than local tools for 300+ subscribers          | M    | —      |
| 17  | "Partly paid" instead of green "Paid"    | "Paid" next to money still owed misleads staff           | S    | —      |
|     | **Tier 4 — later**                       |                                                          |      |        |
| 18  | Sub-distributor tree (design only)       | Main internet distributors serve sub-distributors        | XL   | —      |
| 19  | Equipment per customer (serials)         | Routers, antennas, meters lent out                       | M    | —      |
| 20  | Complaints and technician visits         | Simple support list                                      | M    | —      |
| 21  | Whish / OMT payments + VAT (research)    | Pay by reference number; invoices for licensed ISPs      | S    | —      |
| 22  | MikroTik link (research)                 | Automatic cut and reconnect on the router                | S    | 7, (6) |

Size: S = hours, M = a day or two, L = several days, XL = a project in phases.
"Needs": a number in brackets means it is better after that prompt, but not required.

---

## Tier 1 — money numbers are wrong

### 1. Total owed must include unpaid months

```text
The problem: the "Owed by customers" figure on the dashboard, and "Still owed" on Reports → Debts, leave out every month where the customer paid nothing at all. They only count months that were partly paid, plus sales and manual bills. So a customer who is 4 months behind and paid nothing adds $0. For a generator owner or an internet distributor this is the most important number in the app, and today it is far too low.

How it should work: the owner sees the real total still to collect — part-paid months, open sales and manual bills, plus every unpaid month that nothing was paid on yet. This total must match exactly what the app would ask each customer to pay when collecting. It follows the same rules as the rest of the app: the branch filter, the organization's "when does a month become unpaid" setting, skipped months, cancelled plans, inactive and non-regular customers. A plan with no set price cannot be counted, so say how many were left out instead of guessing.

Keep the Debts screen meaning what it means today. Show the two figures with clearly different labels so nobody mixes them up (for example "Total to collect" and "Debts"). The same figure must appear on the phone, on the web and in the reports export.

Show me your plan and the label text (English and Arabic) before you change anything.
```

### 2. Each month keeps its own price

```text
The problem: when a month has not been paid, the app prices it at the plan's price TODAY. If I raise a plan from $20 to $25, every old unpaid month now shows $25 — even months from last year. The same happens to a month whose only payment was voided. This is wrong: a customer who owed January at $20 still owes $20 for January. Generator prices change every month, so for generator owners every old month would be wrong.

How it should work: each month is priced at the price that applied in that month — the plan price, or the customer's own special price, together with its currency and how many months it covers. A price change only affects months from the change onward. A month that already got money keeps its amount, as today. When someone edits a price, the screen says from which month the new price applies. Existing customers start with today's prices as their price history.

The project docs describe the current behavior on purpose, so update them too. Plan first and wait for my OK.
```

### 3. Write off a customer who never paid

```text
The problem: "Write off all their debts" only works on months that got some money before. If a customer left owing 4 months and never paid anything, the app says there is nothing to write off. So this lost money never shows as a loss in Reports.

How it should work: I can write off a customer's unpaid months — all of them, or one month from the month grid — even if they never paid anything. Each month is written off at its correct price (if "each month keeps its own price" is done, use that). Two phones working offline must never end up with two copies of the same month. After a write-off, that month no longer counts as money owed anywhere (dashboard, debts, reminders, collect), it shows as a loss in Reports, the history says who did it, and I can undo it.

A question to ask me before you build: how should the month grid and the customer's badge show a written-off month that was never paid? Today they would still say "unpaid" and "Overdue". My preference: it stops counting as unpaid or overdue, but looks clearly "Written off".

Plan first and wait for my OK.
```

---

## Tier 2 — blocks the two markets

### 4. Generator meter billing

```text
Background: our clients are in Lebanon only. Neighborhood generator owners ("moteur", اشتراك مولد) must bill by meter by law. Every month:
  bill = fixed fee for the amperage + (kWh used × the official kWh price), where kWh used = this month's meter reading − last month's reading.
Facts for 2026:
- Fixed fee: 5A = LL385,000, 10A = LL685,000, plus LL300,000 for each extra 5A.
- There are two kWh prices: one below 700 m altitude, and one above 700 m (about 10% more). Three-phase meters have their own fee rule.
- The Ministry of Energy publishes the kWh price at the END of each month, for that month. It moves a lot: Jan LL28,355, Apr LL49,395, Jul LL40,746, Aug LL48,241.
- Bills must be in Lebanese pounds, with no VAT. A one-time deposit is allowed. Inspectors check that receipts match the formula.
Sources: https://www.annahar.com/lebanon/342933/ and https://www.lbcgroup.tv/news/news-bulletin-reports/955731/title/en?src=rss

The problem: the app cannot do this. The only way today is a plan with no set price, where staff type an amount every month. No reading is saved, nobody can see how the amount was calculated, and because the amount is unknown until someone types it, the app does not know what these customers owe — the dashboard, the reminders and the debts all miss them.

How it should work:
1. A monthly price table: an admin types the ministry's kWh price for each zone (below / above 700 m) when it comes out, in Lebanese pounds by default. The organization also sets the fixed fee for each amperage, and the three-phase rule.
2. A metered subscription on a customer: amperage, zone, meter number, single or three phase. If the amperage changes, the app remembers from which month the new one applies.
3. A meter reading each month for each subscriber. The previous reading comes from last month; the first one is taken at installation. The app saves who read it and when, and warns when a reading is lower than last time or jumps a lot.
4. "Create bills" for a month: once the readings and the price are in, the app creates all the bills at once. Each bill shows the readings, kWh, price, fixed fee and total. Running it again only adds the missing ones. A bill that got money never changes. A wrong unpaid bill can be corrected, and the history shows who changed it. Two phones working offline must never create the same bill twice.
5. From then on the bill behaves like any other monthly bill: part payments, debts, reminders, receipts, the customer portal and reports.

Be careful about:
- A created bill with nothing paid yet must count as owed. (Today a month with nothing paid is treated as if it was never touched.)
- The price comes out after the month ends, so a month is not due until its bill is created. September must not show as unpaid or overdue on September 1st, and "pay the oldest month first" must not block on a month that has no bill yet.
- It must work offline (readings and creating bills), on the phone and on the web.
- Customers on a fixed monthly price must keep working exactly as today.

This is a big change. Plan first: the data you need, the screens on the phone and the web, and the steps to build it in. Wait for my OK, then build one step at a time.
```

### 5. Import customers from Excel

```text
The problem: a new client with 300–1,000 subscribers must type every customer by hand. That alone stops owners from starting. There is no way to import customers today.

How it should work: an admin imports customers, with their plans, from a file saved from Excel or Google Sheets.
- The file has: name, phone, area, address, notes, branch name, plan name, start date, special price and its currency, regular yes/no, map link. Arabic text and both Arabic and Latin digits must work. Offer a template file to download, with the column titles in English and Arabic.
- Steps: pick the file → see a preview table where every row with a problem says what is wrong (missing name, unknown plan or branch, bad date, a phone repeated in the file or already in the app) → import only the good rows → see a summary of what was imported and what was skipped and why, and be able to download it.
- Every imported customer follows the same rules as a customer added by hand, including the customer and plan limits of the organization. Check the limits for the whole file before importing anything, and explain clearly if the file is too big. The history (audit log) shows who imported them.
- It must be fast for 1,000 rows, and if something fails halfway, the admin must see exactly which rows went in.
- Build it on the web app first, because the owner has the Excel file on a computer.

Check with me before adding any new library. Plan first and wait for my OK.
```

### 6. Prepaid "paid until" for ISPs

```text
Background: Lebanese neighborhood internet distributors mostly sell PREPAID access. The customer pays and gets 30 days (or one month) from that day. When the time ends, the router cuts them. No payment = no internet = nothing owed. (A survey of local ISPs by Splynx: "our client base is almost 95% prepaid".)

The problem: the app only knows calendar months that keep piling up as unpaid. After a cut, a prepaid customer looks like they owe months they never used, and staff must skip each month by hand.

How it should work: a second way to bill, chosen per plan — "prepaid / paid until".
- Each subscription has a "paid until" date. A payment for one or more periods moves it forward. Whether it moves forward from the old end date or from the payment day (when it had already expired) is a setting for the organization.
- A period is 30 days or one calendar month, chosen per plan.
- The customer is: active, "expires in X days", or "expired X days ago". Time after expiry is NOT owed and never becomes a debt.
- Lists for the collector and for WhatsApp reminders: expiring in the next 3 days, expired today, expired.
- Payments, receipts, the collector's wallet and the reports keep working for these customers.
- Customers on calendar months keep working exactly as today.
- The customer list badges and tabs, the customer page, the customer portal and the web show the prepaid status clearly.

This is a big change. Plan first, wait for my OK, then build it in steps.
```

### 7. Disconnect / reconnect + "who to cut"

```text
Background: generator owners and internet distributors both cut customers who do not pay, and reconnect them after they pay, often with a reconnection fee.

The problem: the app has no "disconnected" state. The only tools are "Skip month" (which says nothing was owed, so the debt disappears) or deactivating the whole customer.

How it should work:
1. A "who to cut" list: customers who are late by more than N days (a setting), by branch and area, with how much each owes. It uses the same "late" rules the rest of the app uses.
2. Disconnect a customer's subscription, saving when and who did it. While disconnected, the months during the cut are not owed, but what was owed before the cut stays owed (confirm this rule with me). The customer shows a clear "Disconnected" badge, and the customer list gets a tab for them.
3. Reconnect, saving when and who did it, with an optional reconnection fee added as a bill (the default amount is a setting and can be changed each time). Months are billed again from that day.
4. Check whether the existing WhatsApp messages "service outage" / "service back" fit "your service was cut / is back", or suggest new ones.
5. Keep it ready for an automatic cut on the router later (that is a separate task).

Check how this works with the other month rules: pay the oldest month first, void the newest first, the locked start date, skip and unskip, the customer status and tabs, the portal and the reports. Ask me whether a disconnected subscription still counts toward the organization's plan limit.

Plan first and wait for my OK. Phone and web.
```

### 8. Printed receipts and bills

```text
Background: in Lebanon most customers still expect a paper receipt, and inspectors check generator receipts. Collectors carry small Bluetooth receipt printers (58 mm or 80 mm, ESC/POS).

The problem: staff can only send a text receipt on WhatsApp. Only the customer portal can print. The staff apps cannot print anything.

How it should work:
1. Staff can print a RECEIPT (after a payment) and a BILL (before payment). It shows: business name, customer, area, which months, the amount in its own currency (and the display currency), the bills it paid, what is still owed, the collector, the date and a short receipt number. For metered generator customers (when meter billing exists) it also shows the readings, kWh, price and fixed fee. Arabic must print correctly, right to left.
2. On the phone: print to a Bluetooth receipt printer, and "Share as PDF". On the web: a clean browser print.
3. Print all the bills of an area for the month at once, for door-to-door rounds.
4. The printed receipt, the PDF and the WhatsApp text must always say the same thing.

A printer library needs a new app build — it cannot reach phones as an over-the-air update. Suggest a well-maintained library (many receipt printer libraries print Arabic as boxes; printing the receipt as an image is a common fix) and ask me before adding it. Plan first and wait for my OK.
```

---

## Tier 3 — important

### 9. Automatic WhatsApp reminders

```text
The problem: WhatsApp reminders only go out when staff pick customers and press send. Owners want them to go out by themselves.

How it should work: in the WhatsApp admin screen, the organization sets a schedule — for example "3 days before due", "on the due day", "5 days after due" — the time of day (Lebanon time), which customers (unpaid, overdue, by branch), and an on/off switch. Each day the app sends the reminders by itself, following all the rules manual sending already follows (customers who said STOP, the daily limit, never twice in 24 hours, retries).

Important: the amount in an automatic reminder must be exactly the amount the app shows for that customer. Today these amounts are worked out inside the app, so find a safe way to get the same numbers when no one has the app open.

Also: a history of what was sent automatically, a pause button, and a "send me a test" to the admin's own number. Meta charges for each message, so show an estimate of how many messages the schedule will send each month.

Plan first and wait for my OK.
```

### 10. WhatsApp "one by one" without the Meta setup

```text
The problem: sending WhatsApp to many customers needs the WhatsApp Cloud API. Each owner must create a Meta business account, finish Meta's setup and add a payment card. Many small Lebanese owners will not manage this. Without it, staff can only remind one customer at a time.

How it should work: a "Send one by one" mode for organizations with no connected WhatsApp number. Staff pick customers (from the customer list, or "all unpaid in this area"). A list then shows each customer with the message already written (the same wording as the automatic reminder) and a big "Open WhatsApp" button. When staff come back to the app, that customer is marked as sent and the next one is ready. The list is kept if the app is closed. The owner can see what was sent, by whom and when.

Phone first (WhatsApp lives there), then the web (it opens WhatsApp Web or Desktop). Show the Meta connection as an optional upgrade, not a requirement. Plan first and wait for my OK.
```

### 11. Customer credit (keep extra money)

```text
The problem: the app refuses money above what the customer owes. In real life a customer hands over $50 for a $45 bill and says "keep the rest for next month", or pays a round number for a generator bill. Staff must then give change or invent a split.

How it should work: the extra money is kept as the customer's CREDIT, and used by itself on the next bill(s), oldest first.
- Credit is not a number someone types. It is the part of a real payment that has not paid any bill yet, in that payment's currency.
- Using credit later is not new cash: it does not count as new income, and it does not move money in the collector's wallet.
- Show the credit on the customer page, in the collect screen ("Credit $5 will be used"), on receipts, in the customer portal, and in the totals of what is owed.
- If the original payment is voided, its credit goes too, and whatever the credit paid becomes unpaid again — and the warning must name those bills.
- Giving credit back in cash must be recorded.

Ask me whether credit counts as income in the month it was received. This is about money, so plan carefully, test it well, and wait for my OK before building.
```

### 12. Meter-reading round for collectors

```text
This needs "Generator meter billing" to be done first.

The problem: reading 300 meters a month must be fast for the collector, and it happens outside, often with no signal.

How it should work, on the phone:
- A list of the meters not read yet this month, grouped by area, in a route order the collector sets once and reuses every month.
- One screen per meter: the customer, meter number, last reading, a big box for the new reading, and the kWh shown at once. A warning if the reading is lower than last time or jumps a lot. A "Next" button.
- An optional photo of the meter as proof. It can be seen later on the bill and in the customer portal if there is a dispute.
- Progress, for example "120 of 300 read".
- Works fully offline and syncs later, including the photos.
- The admin sees who read which meters and when.

The camera may need a new library and a new app build — ask me before adding one. Plan first and wait for my OK.
```

### 13. Deposit (تأمين)

```text
Background: Lebanese generator rules allow a one-time deposit (تأمين) when a subscriber joins. The owner may take an unpaid bill out of it, and must return the rest when the subscription ends. Some internet distributors hold a deposit for a router.

How it should work: staff record a deposit for a customer (amount, currency, date, who took it). The owner sees the deposits held for each customer and in total. Part of a deposit can be used to pay unpaid bills (oldest first), and the rest is paid back at the end (recorded as cash given back). A deposit is NOT income when it is taken — it is the customer's money held by the business — so it must not show as revenue until it pays a bill. The collector's wallet must still show the cash the collector really holds.

If "customer credit" is already built, see whether a deposit can work the same way. Ask me before choosing. This is about money: plan carefully, test it well, and wait for my OK.
```

### 14. Export customers to Excel

```text
The problem: owners cannot get their customer list out of the app. They need it for backups, and licensed internet companies must now report subscriber names and locations to the regulator (TRA Decision 4/2026).

How it should work: an admin exports the customer list to a file that opens correctly in Excel, Arabic included. It has: name, phone, area, address, map link, branch, each plan (name, start date, price, status), active or not, regular or not, current status (paid / unpaid / overdue), total owed, and notes. It follows the branch filter, the selected tab and the search on screen. It must include every customer even when there are thousands. Phone and web. Reuse the way the Reports page already exports files.
```

### 15. "Disputed" month that does not block

```text
The problem: the app makes customers pay the oldest month first. If a customer refuses to pay one old month (for example a month with a long outage) but wants to pay this month to keep the service, staff cannot record it. The only way out is "Skip month", which says nothing was owed, so the money disappears from the books.

How it should work: staff can mark an unpaid month as "Disputed / on hold", with a required note. The month stays owed — it still counts in what is owed and in reports — but it no longer blocks paying later months, and quick pay and collect pass over it until the mark is removed. The history shows who set it and when. It looks clearly different in the month grid and in the customer portal.

Ask me: who can set it (admins only?), and whether a disputed month should still make the customer show as "Overdue". This changes a core rule of the app, so plan carefully and wait for my OK.
```

### 16. Cheaper pricing for big tenants

```text
The problem: we charge an organization $0.15 per active plan per month. That is $45/month for 300 subscribers and $150/month for 1,000. Local tools cost much less: Hassil $19–25/month (Lebanon), SAS4 $250–350 per YEAR for 500–1,000 users, Moalidaty (Iraq) about $12/month. Owners will compare.

How it should work: support volume pricing. Ask me for the numbers before building. Options to offer me: (a) a price per plan that drops in steps (the first 100 at one price, the next 400 cheaper, the rest cheaper again); (b) fixed monthly packages by size (up to 100 / 300 / 1,000); (c) a monthly minimum and a maximum. I (the owner, in SuperAdmin) must still be able to give one organization a special deal. Only I can change what an organization pays. The amount is always shown in US dollars. The organization's settings screen and the "update your limits" screen (phone and web) must show the new price clearly. Rounding must be exact (7 × 0.15 must show 1.05).
```

### 17. "Partly paid" instead of green "Paid"

```text
The problem: a customer who paid $5 of a $40 month gets a green "Paid" label on the customer list (with a separate debt label). For non-technical staff, "Paid" next to money still owed is confusing, and a collector could make a customer look paid by taking a small amount.

How it should work: when a customer only paid part, the label says "Partly paid · owes $35" (or similar — suggest the wording in English and Arabic). "Paid" stays only for customers who owe nothing at all. The tabs of the customer list must match the labels exactly, and the tab counts too. The month grid stays as it is. Phone and web.
```

---

## Tier 4 — later

### 18. Sub-distributor tree (design only)

```text
Background: Lebanese internet runs on two levels. A main distributor buys bandwidth from a licensed company and serves neighborhood sub-distributors. Each sub-distributor has its own subscribers and pays the main distributor per subscriber or for bandwidth. (NOW Lebanon: the licensed company gives each distributor "a page with subscriber information and monthly payments are added based on the number of subscribers".)

The problem: branches do not cover this. A branch is part of one company. A sub-distributor is a separate business that owes the main distributor money.

What I want: the main distributor sees each sub-distributor, how many active subscribers each has, what each owes this month (per subscriber or a fixed amount), what they paid, and what is left. Each sub-distributor uses the app for their own customers and sees only their own data.

Design only — do not build yet. Compare at least two ways to do it (for example: each sub-distributor is its own organization linked to a parent, or a sub-distributor is a special kind of branch with its own account), with the pros and cons for privacy, security, offline use and how we bill each organization. Give me a recommendation and wait for my choice.
```

### 19. Equipment per customer (serials)

```text
The problem: internet distributors and generator owners lend or sell equipment — routers, antennas, switches, meters — and lose track of which device is with which customer.

How it should work: record each device with its model and serial number, which customer has it, the date given and returned, and its state (with customer / returned / lost / sold). Show it on the customer page. Find a device by serial number. List all devices that are out. Remind staff to collect the devices when a customer leaves. A device taken from stock lowers the stock, and a device sold is part of a sale, using the products and stock the app already has. The backlog file has an early idea for this (new-features.md §5.1) — check whether it still fits.

Phone and web, working offline. Plan first and wait for my OK.
```

### 20. Complaints and technician visits

```text
The problem: complaints ("no internet", "no power", "my meter is wrong", "my bill is wrong") are handled by phone calls and memory. Nothing is tracked.

How it should work: a simple list of complaints and technician visits. Each one has: a customer (or "whole network"), a type (no service, slow, billing, meter, other), a note, a status (open / in progress / done), who it is assigned to, and the dates it was opened and closed. Staff can open one from the customer page in two taps. For an outage, staff can send the existing WhatsApp "service outage" and "service back" messages to all customers of an area. The owner sees the open complaints per area and how long they take to close.

Keep it small and plain — non-technical staff on phones. Phone and web, working offline. Plan first and wait for my OK.
```

### 21. Whish / OMT payments + VAT invoices (research)

```text
Research only — do not change anything.
1. Whish Money and OMT in Lebanon: can a small business take bill payments by a reference number (the customer pays at an agent or in the app, and we are told automatically)? Find their business / bill-payment / API options, their fees, and what a business needs to sign up. Then tell me how such a payment would appear in our app — like a real payment with its date and currency, received through Whish or OMT, never an amount someone types.
2. VAT invoices for licensed internet companies (11% VAT in Lebanon): what an invoice must show (tax number, VAT line, invoice numbering — note the app works offline, so invoice numbers cannot come from one central counter), and how we could offer it as an option per organization.
Give me a short report with sources and your recommendation.
```

### 22. MikroTik link (research)

```text
This needs "Disconnect / reconnect" to be done first (and "Prepaid paid until" for prepaid ISPs).

Research and plan only — do not change anything. I want the app to talk to an ISP's MikroTik routers: when staff disconnect a customer in the app, the router cuts them, and when they reconnect or pay, the router turns them back on. Maybe also show which customers are online. The routers are on the ISP's private network, and our server runs in the cloud. Compare the main ways to do this (for example the router's own API reached over a VPN, a small program the ISP runs on its own network that takes jobs from us, or a RADIUS server). Cover security (router passwords for each organization must be stored safely), what happens when the connection fails, and exactly what the ISP must set up. Give me a recommendation with sources.
```
