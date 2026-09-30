# Web — Customer Status on the Server — QA Scenarios

The `customer-status` edge function works out the customer list's **exact** status tabs (Active, Unpaid, Overdue, Partly paid, Paid, Not due yet, Has debts, All, Inactive) over **every** customer in scope, one page at a time. The web Customers page (phase D2) is its first user; until then it is checked with the scripts below. The month rules are the phone's own: [../customers.md](../customers.md) and [docs/month-grid.md](docs/month-grid.md).

**Reference code:**

- Function: [index.ts](SubsTrack/supabase/functions/customer-status/index.ts), its bundle script [build-edge.mjs](Web/scripts/build-edge.mjs)
- Pure logic (bundled into the function): [customerStatusPage.ts](Shared/src/modules/customer/customers/utils/customerStatusPage.ts), [customerStatusFacts.ts](Shared/src/modules/customer/customers/utils/customerStatusFacts.ts), [customerTabs.ts](Shared/src/modules/customer/customers/utils/customerTabs.ts), [monthStatus.ts](Shared/src/modules/customer/customer-payments/utils/monthStatus.ts) (unit tests: `tests/suites/customerStatusPage.test.ts`, TC-CT-*)
- SQL: `customer_status_facts()` in `sql scripts/script.sql`
- App side: [CustomerStatusRepository.ts](Shared/src/modules/customer/customers/repository/CustomerStatusRepository.ts), `CustomerService.getCustomerStatusPage`
- Speed test: [seed.mjs](Web/scripts/status-speed/seed.mjs), [measure.mjs](Web/scripts/status-speed/measure.mjs)

**Everything here runs against the TEST project only.** The scripts refuse the URL the phone app ships with.

---

## 0. Setup (once)

| #   | Step                  | How                                                                                                                                                                                     | Expected result                                                         |
| --- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 0.1 | Database              | Run `sql scripts/script.sql` on the test project (nothing new in `migration.sql`)                                                                                                        | `customer_status_facts` appears under Database → Functions              |
| 0.2 | Secrets               | Check the test project has the `ANON_KEY` edge-function secret (the WhatsApp functions already use it)                                                                                  | Listed under Edge Functions → Secrets                                   |
| 0.3 | Deploy                | `cd Web && npm run deploy-customer-status` on a machine with the Supabase CLI, linked to the test project — or run `npm run build-edge` and paste `SubsTrack/supabase/functions/customer-status/_generated/dashboard/index.ts` into Dashboard → Edge Functions → Deploy a new function → Via Editor | Function `customer-status` listed, "Verify JWT" ON                      |
| 0.4 | Speed-test login      | Sign up a NEW, empty organization on the test project (e.g. code `speedtest`). Create `Web/.env.speed.local` with `SPEED_SUPABASE_URL`, `SPEED_SUPABASE_ANON_KEY`, `SPEED_TENANT_CODE`, `SPEED_USERNAME`, `SPEED_PASSWORD` (the owner) | The file is git-ignored (`*.local`)                                     |

## 1. Speed (target: under ~1.5 s at 10k customers)

| #   | Scenario            | Steps                                                                                            | Expected result                                                                                                  |
| --- | ------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 1.1 | Guard: live project | Put the phone's `EXPO_PUBLIC_SUPABASE_URL` in `SPEED_SUPABASE_URL`, run `node scripts/status-speed/measure.mjs` | Refused: "SPEED_SUPABASE_URL is the project the apps ship with". Nothing is read or written                      |
| 1.2 | Guard: not empty    | Run the seed against an organization that already has customers                                   | Refused, names the count. Nothing written                                                                        |
| 1.3 | Seed 10k            | `node scripts/status-speed/seed.mjs --customers 10000 --yes-this-is-the-test-project`             | Progress per table; ~10k customers, ~11k lines, ~130k month bills with payments, some skips and custom fees      |
| 1.4 | Measure 10k         | `node scripts/status-speed/measure.mjs`                                                          | "Facts read alone" time + size, then six scenarios; **slowest median under 1500 ms → PASS**. Write the numbers in the plan notes |
| 1.5 | Server split        | Dashboard → Edge Functions → `customer-status` → Logs                                             | One `served` line per call with `readMs` / `computeMs` / `totalMs` — shows whether the SQL or the TypeScript is the slow part |
| 1.6 | Seed 50k            | Use a SECOND empty organization, seed `--customers 50000`, measure again                          | Record the numbers (no target at 50k — it decides whether the facts need trimming)                               |

## 2. Same answer as the phone

Use a small organization on the test project (20–30 customers, a few lines each) where you know the months. Compare the phone's Customers list (open every tab, scroll to the end) with the function's answer (the D2 web page, or `measure.mjs` scenarios).

| #   | Scenario                     | Steps                                                                                          | Expected result                                                                                           |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 2.1 | Every tab                    | Compare each tab's customers                                                                    | Same customers in every tab, same pills, same debt amount                                                  |
| 2.2 | Overdue hides Unpaid         | A customer with an old unpaid month                                                             | In Overdue, NOT in Unpaid (same as the phone card)                                                          |
| 2.3 | Partial payment              | Collect half of a month                                                                         | The month counts as paid (no Unpaid / Overdue for it), and the customer appears in Has debts                |
| 2.4 | Unpaid month is not a debt   | A customer whose only open bill is a never-paid month                                           | NOT in Has debts                                                                                           |
| 2.5 | LBP debt                     | A custom fee in LBP                                                                             | Debt shown in USD at the fee's frozen rate, same as the phone                                               |
| 2.6 | Skipped month                | Skip this month for a paid-up customer                                                          | Not in Unpaid / Overdue; the phone card shows the same                                                      |
| 2.7 | Inactive / walk-in           | An inactive customer and a non-regular one                                                      | No status pill; inactive only in All / Inactive (and Has debts if they owe)                                 |
| 2.8 | Branch scope                 | Pick a branch in the header (tenant-wide admin), then log in as a branch admin                  | Only that branch's customers; a branch admin never sees another branch's customers, whatever `branch` is sent |
| 2.9 | Search                       | Search part of a name, a phone number, an address, an area, in any case                         | Same customers as the phone search; the tab counts shrink to the search                                     |
| 2.10 | Paging                      | 25 per page, move to page 2                                                                     | No customer on two pages; the total does not change between pages                                          |

## 3. The caller's day (gotcha #173)

| #   | Scenario                        | Steps                                                                                                              | Expected result                                                                                  |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 3.1 | After local midnight            | Between 00:00 and 03:00 Beirut time on the 1st of a month, compare the phone and the function                      | Both already treat the new month as the current one (the server's UTC day is still the old one) |
| 3.2 | Billing-day rule                | Unpaid rule = "customer's start day"; a customer whose start day is TODAY; check just after local midnight          | Both read "Unpaid" for this month, not "Not due yet"                                             |
| 3.3 | Wrong device date               | Set the computer's date 3 days off and load                                                                        | "Your device date looks wrong. Check it and try again." — no list                                |

## 4. Refusals

| #   | Scenario                  | Steps                                                         | Expected result                                                                 |
| --- | ------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 4.1 | Not signed in             | Call the function with no `Authorization` header             | 401 from the gateway; nothing read                                               |
| 4.2 | Bad page size             | Send `limit: 500`                                             | 400 "A page holds 1 to 100 customers."                                           |
| 4.3 | Phone offline             | (When the phone uses it) call it with no connection          | The usual "needs a connection" banner, no crash                                  |
