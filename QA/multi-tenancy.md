# Multi-tenancy (each organization sees only its own data)

Many organizations share one database. Staff of one organization must never see, change or count anything from another one.

## Test data to prepare

Make two organizations in SuperAdminWeb: **A** (code `orga`) and **B** (code `orgb`). In **each** one add:

- A collector with the **same username** in both, e.g. `ali`, with a different password in each.
- A customer with the **same name** in both, e.g. "Test Customer", on a $20 plan, with one paid month.
- A plan, a product, a branch and a currency with the **same names / code** in both.

## Logging in

1. Code `orga` + `ali` + A's password → logs into A; every page shows A's data only.
2. Code `orgb` + `ali` + **A's** password → refused as a wrong password (same name, different person).
3. Code typed as ` OrgA ` (capitals, spaces) → logs into A.
4. A code that does not exist → the same message as a wrong password; nothing tells the person the code is unknown.

## What each organization sees

5. Logged into A, open every page (dashboard, customers, plans, To collect, Money received, sales, products, expenses, wallets, users, branches, currencies, reports, history) → no row from B anywhere; every total is A's only.
6. In A, search for a customer name that exists only in B → no results.
7. Collect $20 in B, then refresh A → A's revenue, To collect, wallets and reports do not move.
8. (web) Logged into A, open `customers/<id of a B customer>` in the address bar → no customer is shown; nothing from B appears.
9. Add customers and plan lines in B → A's limits card ("x of y used") does not move; A can still add up to its own limit.

## Same names in two organizations

10. The same username, branch name, plan name, product name and currency code in A and B → all allowed.
11. Inside A, add a second user, branch, plan, product or currency with a name already used in A → refused with "already exists".
12. (SuperAdminWeb) Create a new organization with A's name or A's code → refused.

## Settings stay inside their organization

13. In A, change "when a month becomes unpaid", the display currency and "Track stock" → B keeps its own settings; B's month grid and totals do not change.
14. In A, change the LBP rate → B's LBP rate and B's amounts do not change.
15. (SuperAdminWeb) Raise A's limits or change A's price → only A changes; B's limits card and monthly bill stay the same.

## Switching organization on the same device

16. (web) Log out of A and log into B in the same browser tab → no A data on any page, not even for a moment; the branch picked in A is not kept.
17. (phone) Log out of A (online), log into B → only B's data on every screen.
18. (phone) Log out of A, then log back into A → A's data is all there.
19. (phone) Turn on airplane mode, collect a payment in A, log out, turn the network back on, log into B → refused: "You have unsynced changes from the previous organization…". Log into A → the payment reaches the server. Then log into B → works, no A data.
20. (phone) Make a backup file in A, then log into B and import it → refused as another organization's file; B's data is untouched.

## Organization turned off

21. (SuperAdminWeb) Turn A off → A's staff see the "organization inactive" screen when they log in, on phone and web; B's staff keep working normally.
21a. (web) A's staff have the web app open when A is turned off → when they come back to the tab, it shows "organization inactive". Before that, nothing new can be saved.
21b. (phone) A's collector has the app open when A is turned off → within 5 minutes it shows "organization inactive".
21c. (phone) Turn on airplane mode, collect a payment in A, turn A off, turn the network back on → the payment is NOT lost: it stays on the phone. Turn A back on → it reaches the server once.
21d. While A is off, an A admin tries to add a user, delete a user or change a password (from an app that was already open) → refused with "This organization is not active."
22. While A is off, open the customer portal of an A customer with the right password → the same message as a wrong password; B's customer portal still works.
23. Turn A back on → A's staff see all their data unchanged (phone: within 5 minutes or after reopening; web: after coming back to the tab or reloading).
23a. (phone) Change a customer on the web just before A is turned off, then turn A back on → after the phone syncs, it shows that change.

## New organization

24. (SuperAdminWeb) Create a new organization → it starts empty: one "Default Branch", the LBP currency and the owner only; no customers, plans or money from any other organization.
25. A's admin adds a new user → the user can log in only with code `orga`, never with `orgb`.

## Customer portal and WhatsApp

26. Open an A customer's portal link with that customer's password → only that customer's own bills; nothing from other A customers or from B.
27. Open an A customer's portal link with a B customer's password → refused.
28. WhatsApp on for A and off for B (SuperAdminWeb) → B's admins cannot send WhatsApp messages; messages sent in A appear only in A's message list.

## Direct database checks (technical)

These skip the app and talk to the database the way a hacker would. Take A's login token from the browser (web app logged into A: local storage key `sb-<project>-auth-token`, the `access_token` value) and call the Supabase REST API with it.

29. Read a B customer by its id (`GET /rest/v1/customers?id=eq.<B id>`) → empty list `[]`.
30. Add a customer with B's `tenant_id` → refused by row-level security; B gets no new customer.
31. Change or void a B payment by its id → nothing changes in B.
32. Change A's own `customer_allowance`, `plan_allowance` or price on the `tenants` row → refused; only the SaaS owner can change them.
33. Turn A off, then use the token you took while A was on: read A's customers → empty list `[]`; add a customer → refused. Reading A's own `tenants` row still works and shows `active: false`.
