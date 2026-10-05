# Money unit tests — QA scenarios

The automated safety net under every rule that touches money. It runs on a laptop in ~3 seconds and asserts the things a manual pass cannot practically re-check on every release: the waterfall's ordering, the month-status ladder, the customer badge, the collect/void/write-off refusals, and the money-conservation invariants.

**It is not a replacement for the manual files.** These tests exercise services and pure functions with mocked repositories — they never open a screen, never touch Supabase and never touch SQLite. [ledger-collections.md](ledger-collections.md), [monthly-grid.md](monthly-grid.md), [sales.md](sales.md) and [shared-handover-void.md](shared-handover-void.md) still own the on-device behaviour.

**Reference code:**

- Runner + config: [tests/](../tests/) — `jest.config.js`, `tsconfig.json`, `babel.config.js`, `stubs/`, `helpers/`
- Suites: `tests/suites/*.test.ts` (one file per area, every case numbered `TC-XX-nn`)
- Under test: `waterfall.ts`, `openItems.ts`, `BillingService.ts`, `PaymentService.ts`, `payOrder.ts`, `monthDueRules.ts`, `linePrice.ts`, `ChargeService.ts`, `CollectionService.ts`, `LedgerService.ts`, `SaleService.ts`, `saleLines.ts`, `saleListPatch.ts`, `sharedBills.ts`, `mergeCollection.ts`, `custody.ts`, `userPermissions.ts`, `currency.ts`, `date.ts`, `monthTotals.ts`, `billView.ts`, `collectionView.ts`, `correction.ts`, `collectionFilters.ts`, `BaseRepository.readEveryRow`

---

## 0. Why it lives outside `SubsTrack/`

`SubsTrack/package.json` → `scripts` and its dependency tree **feed the OTA fingerprint** (gotcha #53). A devDependency or a `"test"` script added there changes the runtime version, and every installed app silently stops receiving OTA updates until a new native build ships. So the tests are their own npm package at the repo root with their own `node_modules`, importing the app's source through a path alias. **Never move them into `SubsTrack/`.**

---

## 1. Running them

1.1 `cd tests && npm install --ignore-scripts` (the `--ignore-scripts` flag is required on the dev laptop — see 1.5).

1.2 `npm test` → all suites, all green, in a few seconds.

1.3 `npm test -- suites/waterfall.test.ts` runs one suite; `npm run test:watch` re-runs on save; `npm run test:coverage` reports coverage over the money modules only.

1.4 `npm run typecheck` type-checks the suites against the app's **real** types (Jest swaps in stubs, tsc does not). It must be clean before a money change is called done — a green test run proves the rules, not the shapes.

1.5 **AV note:** this machine's script control blocks spawning vendored tool binaries, so `npx`, `esbuild` and anything built on them fail with _Access is denied_. Jest + Babel is pure JavaScript and is unaffected. If `npm test` reports `Access is denied`, run `node node_modules/jest/bin/jest.js` directly.

1.6 A new native module in the app usually needs a matching one-file stub under `tests/stubs/` plus a line in `jest.config.js` → `moduleNameMapper`. Nothing in a stub may implement a money rule — only the platform under one.

---

## 2. What each suite guards

| Suite                         | Cases                     | The rule it protects                                                                                                                                                                                                                                                              |
| ----------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `waterfall.test.ts`           | TC-WF-*                   | Oldest **due date** first, each bill filled completely, never proportionally; a total order so the preview and the save can never disagree; float dust never leaves a bill a millionth short                                                                                      |
| `monthGrid.test.ts`           | TC-MG-*                   | The status ladder (`before_start` → money → skip → future → not-due-yet → unpaid); a partial payment reads "paid"; an **empty** bill reads exactly like an untouched month; multi-month coverage across a year end; the `customer_start_day` rule and its 31st-of-the-month clamp |
| `monthActions.test.ts`        | TC-MA-*                   | The month doors both apps run: a click (before start / unskip / bill / stopped line / pay order / collect), the ⋮ rows per month state, written-off months open the bill, locked skips are collected, selection groups and toolbar rows, a ticked checkbox brings its whole bundle, `?quickPay=1`, the newest-first void of a bundle, cell joins + badges, the year summary in USD at each bill's rate |
| `customerPanels.test.ts`      | TC-CP-*                   | The customer page's debts and sales rules both apps run: owed in USD at each bill's own rate, a debt row's chips (days late, part paid, written off) and ⋮ rows (collect / undo / edit / write off / remove — a written-off bill only undo, gotcha #182), a sale's owed + collect door (never voided, walk-in or bill-less; float dust settles), the map link |
| `payOrder.test.ts`            | TC-PO-*                   | Pay oldest-first / void newest-first, months inside one write never blocking each other, a previous year's backlog still blocking, prepaying out of order refused                                                                                                                 |
| `customerStatus.test.ts`      | TC-CS-*                   | The five badge rules — chiefly that "✓ Paid" and "Overdue" can never appear together, and that an absent status renders **no** pill                                                                                                                                               |
| `collect.test.ts`             | TC-CL-*                   | Every refusal on the one write that takes money; a virtual month materialising its bill; two devices converging on one bill; revive + re-price before cash lands; the open-amount month; one item per bill (a bill listed twice, a month hash naming a bill in the same hand-over)                                                                                           |
| `correction.test.ts`          | TC-CR-*                   | Correct amount (gotcha #171): lowering takes money off the NEWEST bill, raising only fills the same bills, 0 / same / too much refused; date, collector, currency, rate, notes and CUSTODY survive; the replacement id is deterministic so two devices converge; the form both apps share (TC-CR-26…30) re-spreads over the same bills, names why it cannot save, and writes "Corrected from … to …" as the void reason |
| `billView.test.ts`            | TC-BV-*                   | What one bill is and allows, both apps: void outranks write-off outranks money; Collect and Write off only while live and not settled, Undo only when written off, Void unless voided; float dust never leaves a paid bill short; the headline figure and the detail rows (month name, custody while live, none once voided) The big number (`figure`): what is still owed while live, the whole amount once settled or voided — the web summary and the phone headline read it. |
| `moneyReceived.test.ts`       | TC-MR-*                   | Money received on both apps: a total over a whole filter reads every row past PostgREST's 1000-row cap (and a smaller server cap), one read when it fits, a failed page throws instead of a short total (gotcha #175); the one filter shape → find options (default view, status live / voided, branch / collector / type / search); what counts as filtered; a page holds its window while its total counts the whole filter; a voided payment stays listed but leaves the period total; "voided only" has no total `periodTotalUsd`: the total adds every month, and a voided-only view has no total (never $0) on both apps. |
| `chargeEdits.test.ts`         | TC-CH-*                   | Raising / voiding / writing off a bill, writing off a whole debtor in one call (TC-CH-35…39b, gotcha #143), the two edit locks (below-collected, voided-or-written-off), and the frozen unit: a currency OR rate move is refused once money landed (TC-CH-45, TC-CH-48…48c, gotcha #181)                                                                                                       |
| `owed.test.ts`                | TC-OW-*                   | "What does this customer owe?" — the stored-vs-virtual dedupe, and the Debts view's parts adding to its total exactly                                                                                                                                                             |
| `sale.test.ts`                | TC-SL-*                   | Sale validation, stock, the bill it raises, cash at the till, the **typed total** and itemless sales (TC-SL-50…58, gotcha #142), editing (including the currency lock and re-pricing to a typed total), voiding with its cash                                                     |
| `invariants.test.ts`          | TC-IV-*                   | End-to-end money conservation — see section 3                                                                                                                                                                                                                                     |
| `mergeCollection.test.ts`     | TC-MC-*                   | The month grid's patch-from-the-write, including a re-priced bill                                                                                                                                                                                                                 |
| `salePatchAndShared.test.ts`  | TC-SP-_, TC-SS-_          | The sales-list patches, the product-vs-service line split, and naming the other bills a shared void un-pays                                                                                                                                                                       |
| `salesPage.test.ts`          | TC-SG-*                   | The Sales page rules both apps run: one filter shape → find options (live / voided / all, trimmed search), what counts as filtered, the void target (live sales + their bills only), the sale ⋮ rows (History admin-only, no collect on a paid / walk-in / voided sale, invoice disabled with its reason), the receipt's detail rows, one invoice per customer, a page carrying each sale's live paid amount + the full count, and a period total that never counts a voided sale `saleCollectItem`: "collect the rest" is the sale's bill paid what the sale says, or what a receipt just read. |
| `debtsPage.test.ts`          | TC-DP-*, TC-CDF-*         | The Debts page and custom debt form rules both apps run: collecting everything pours over debts and part-paid months, the debtor search, every history filter reaching the read with its branch, a history page keeping the whole filter's total, the settle day = the last LIVE payment, the custom debt draft / customer lock / currency lock / below-collected floor / Save rule / branch fallback, a new debt freezing the picked currency's rate, and an edit in the same currency never re-freezing the rate (a part-paid LBP fee keeps its rate) A written-off custom debt is not editable (one `isEditableCustomDebt` for the menu and Remove). |
| `saleForm.test.ts`           | TC-SF-*                   | The sale form rules both apps run: a cart line is ready only when named and priced, an empty cart is ready, a service counts once, one stock pool per product across rows (plus the edited sale's own units), inactive items only on the sale that sold them, quantity capped at the stock left, catalog prices converted and rounded, the dirty signature never reads the catalog, the two save confirms (no items / typed total), Full / Partial / Pay later amounts, a walk-in always paid in full, when an edit rebuilds the cash, when Save is allowed, and which branch the sale goes to |
| `selectionAndCustody.test.ts` | TC-MS-_, TC-WA-_          | Which cells select together on a multi-month plan; who may take whose cash                                                                                                                                                                                                        |
| `userPermissions.test.ts`     | TC-UP-*                   | Who may edit or deactivate whom now that every branch can **read** the tenant-wide admins — writing a user stays branch-owned, exactly as `users_update` says                                                                                                                     |
| `stockCost.test.ts`           | TC-SC-*                   | The stock cost fields that decide what a restock adds to Expenses: unit × quantity = total at 8 decimals (100 over 3 units saves 100, not 99.99), no cost = no expense, a batch row starts at the catalog cost in the delivery currency |
| `sharedChecks.test.ts`        | TC-SK-*                   | Small checks both apps share: Full / Partial / Pay later choices and the partial outcome, the bill payments header (counted vs voided, a voided bill takes all), the refused-Save reasons, who a receipt can go to (a number needs a digit, walk-in has nobody), plan span labels, which currencies a picker offers, the void warning counting every bill the payment paid, and a bulk void taking its money off the bills it paid |
| `userRules.test.ts`           | TC-UR-*                   | The username / password rules the staff forms and signup share, the role filter (Admins includes the owner), the role pill label. Not money Only staff must belong to a branch (`mayBeTenantWide`). |
| `allowanceDraft.test.ts`      | TC-AD-*                   | The "update your limits" form both apps share: no change is invalid, a raise asks for 10+ across both limits, no raise-and-lower, no cut below active or under 30 customers, editing a request only raises, plans ride up with customers, the − floors |
| `auditFilter.test.ts`         | TC-AF-*, TC-WL-*          | The Audit Log filter both apps send (whole UTC days, branch always passed), the wa.me link (digits only, encoded text, no link without a number), the signed change box. Not money |
| `customerStatusPage.test.ts`  | TC-CT-*                   | The server's exact customer tabs give the phone list's answer on the same data (every tab, statuses, debt at the frozen rate, a fully unpaid month is not debt), paging, name-then-id order, search on four fields, counts that follow the search, the caller's day pinned and released, the request checks |
| `customerForm.test.ts`        | TC-CF-*                   | The customer form both apps share: a new customer starts with one line dated today, a special price keeps its currency and a zero or empty one sends none, cancelled lines are not saved, a plan owned by another branch is cleared without counting as a change, the pills (inactive / non-regular replace, debt rides along), the plan summary, the line period label, the 10-letter portal password |
| `collectForm.test.ts`         | TC-CX-*                   | The collect form both apps share: one bill is capped at what it still owes (part pay leaves the rest, more is an overpay that books nothing), an OPEN month's typed amount becomes its bill in the picked currency, one group per funded currency at the live rate, a two-currency Save is two hand-overs (never a converted total) that the service accepts, the branch comes off the bill, an untouched date means the exact moment of saving |
| `quickPay.test.ts`            | TC-QP-*                   | Quick pay from the customer list, both apps: only started, active lines that are due this month (not paid, not skipped, no older unpaid month), an unpriced line is an OPEN item and is never charged without asking, bulk counts skipped typed lines and multi-month lines per line, one hand-over per customer per currency paying each month in full |
| `linePrice.test.ts`           | TC-LP-*                   | A special price replaces the plan's for the **same span** — "100 per 3 months", never 100 a month                                                                                                                                                                                 |
| `currencyAndDates.test.ts`    | TC-CU-_, TC-DT-_          | USD always via the row's **frozen** rate; a hand-over bucketed into its **local** month                                                                                                                                                                                           |
| `customerAllowance.test.ts`   | TC-CA-_, TC-CD-_, TC-CS-* | What the tenant is billed, whether they may add a customer, and the two floors under a lowered limit — see section 2b                                                                                                                                                             |
| `translations.test.ts`        | TC-TR-*                   | en/ar stay the same SHAPE — same keys, same `{{placeholders}}`, nothing blank. Not money, but a missing placeholder renders raw braces to the user                                                                                                                                |
| `syncMerge.test.ts`           | TC-SY-01…18               | The merge rule: an un-pushed local row beats the server's copy; a natural-key duplicate is cleared rather than stalling the table's pull forever; hard deletes are logged once                                                                                                    |
| `syncPush.test.ts`            | TC-SY-20…41               | What goes up, in what order, on which conflict key — a month bill on its natural key, a sale bill on its id; `updated_at` never sent; append-only ignores duplicates; a refused row stays dirty; a failed delete batch retries row by row                                       |
| `syncPull.test.ts`            | TC-SY-50…68               | The shared cursor advances ONLY on a complete cycle; a dirty row is never overwritten; an empty server list never wipes a table; pruning keeps an un-pushed row whatever its age                                                                                                  |
| `syncEngine.test.ts`          | TC-SY-70…85               | The 24h gate skips the PULL but never the PUSH; no cycle while signed out or offline; push before pull; a partial cycle is not stamped and reports `sync_incomplete`                                                                                                             |
| `openItems.test.ts`           | TC-OI-*                   | OWED vs DEBT — a fully unpaid month is owed but is NOT a debt until money part-pays it; an EMPTY bill reads identically to a month never touched and is re-priced from the line (gotcha #106); the open-amount month                                                            |
| `monthDueRules.test.ts`       | TC-DR-*                   | The two halves of the per-tenant unpaid rule that are easy to swap (gotcha #83): `isNotDueYet` is the CURRENT month's colour, `isNotLateYet` is LAST month's "Overdue" flag; the 31st-of-a-short-month clamp                                                                    |
| `receiptId.test.ts`           | TC-RI-*                   | A sale's only identity on the ledger path — the id tail, the `#A1B2C3 · items` title, and when a typed term is a receipt number rather than a name; the characters stripped before a term reaches a PostgREST `or()`                                                          |
| `reportAggregate.test.ts`     | TC-AG-*                   | The report arithmetic no one reads twice: growth against a ZERO previous period gives `null`, never `Infinity`; shares of an all-zero total are 0, never `NaN`; a smaller loss reads as an improvement                                                                          |

---

## 2b. The customer allowance (`customerAllowance.test.ts`)

The tenant's own bill and the one quantity limit left in the product. There are **no tiers**: branches, users, plans, products and currencies are unlimited, and only the number of **active customers** is capped. The on-device behaviour — the settings card, the request flow, the block modal and the owner-side accept / decline — is [customer-allowance.md](customer-allowance.md).

| Case     | What it asserts                                                                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-CA-01 | `monthlyAmountUsd(100, 0.15)` = **15** — the amount is active customers × price per customer, **always in USD**, never the tenant's display currency                   |
| TC-CA-02 | **Rounds to cents.** `7 × 0.15` must read **1.05**, not `1.0499999999999998`; `3 × 0.3333` reads `1`                                                                   |
| TC-CA-03 | A tenant with no customers owes **0**                                                                                                                                  |
| TC-CA-04 | A **zero price** owes 0 however many customers — a tenant the owner does not charge                                                                                    |
| TC-CA-05 | A create **below** the allowance is allowed (30 allowed, 29 active)                                                                                                    |
| TC-CA-06 | **Blocks AT the allowance, not one past it** — 30 active against 30 allowed throws `CustomerLimitError`, and the error carries both numbers so the modal can name them |
| TC-CA-07 | Still blocks when the tenant is already **over** cap, i.e. after the owner lowered the allowance under the live count                                                  |
| TC-CA-08 | A **zero allowance** blocks everything, including the very first customer. Unreachable in the product since the floor became 30, but the cap must not depend on that   |
| TC-CA-09 | A request **below 10** is refused (9, 0 and a negative)                                                                                                                |
| TC-CA-10 | 10 and above are accepted — the minimum is inclusive                                                                                                                   |
| TC-CA-11 | A **fraction** of a customer (10.5) is refused                                                                                                                         |

These are pure-function assertions on `BillingService`. The server-side half of the same rules — the partial unique index behind "one pending request", the missing UPDATE policy on `tenants`, the billing-column trigger, and the `REVOKE` on `accept_customer_request` — is **not** reachable from here and stays a manual check: [customer-allowance.md](customer-allowance.md) §9, a release blocker.

---

## 3. The invariants (`invariants.test.ts`)

Run these mentally against any manual scenario too — if one of them can be broken by hand, the suite has a hole.

3.1 A voided hand-over leaves the world exactly as it was: the month reads `unpaid`, the Debts screen is empty, and the cash is out of every revenue read. The bill row survives (it owns the month's unique key) but reads like no bill at all.

3.2 Every `collections` header equals the sum of its own `collection_items`, after every write.

3.3 No bill's balance can go negative through any service path.

3.4 One hand-over settling three bills produces **three** settled rows summing to it, and counts as **one** physical collection — this is what makes `subscription + sales + manual = total` exactly (gotcha #107).

3.5 An overpay is refused, so unapplied cash can never exist.

3.6 A part payment settles the month visually and leaves a real debt; the remainder enters revenue in the month it is **collected**, not the month it was billed.

3.7 Voiding a bill takes its cash with it — and where the hand-over was shared, the other bill loses its money too while its own bill stays live and owed. That is the documented cost the confirm has to warn about.

3.8 A multi-month bundle is one bill covering three months, and its money is counted **once**.

3.9 Two devices collecting the same month land on **one** bill via the deterministic id.

---

## 4. Regression cases (do not delete these)

Each one failed before it was fixed. If one starts failing again, the bug is back.

4.1 `TC-CH-42` — `updateManualCharge` must refuse an amount below what has already been collected. Before the fix, a $50 fee with $50 collected could be edited to $20, leaving a −$30 balance that every "still owed" read silently drops while the $50 stays in revenue.

4.2 `TC-CH-43` — `updateManualCharge` must refuse a voided or written-off bill.

4.3 `TC-SL-38` — a sale's **currency** may not move once money has been collected. Before the fix, the bill re-froze in the new currency while the hand-over stayed in the old one, so the balance could never close at zero. The currency dropdown is now also disabled in the form (manual check: edit a partly-paid sale → the currency picker is greyed with a caption).

4.4 `TC-MC-08` — `mergeCollection` must take the re-priced bill from the row the write returned. Before the fix, collecting an empty bill whose price had **dropped** left the cell reading "PARTIAL 25/30" on a fully settled month until the next reload.

4.5 `TC-LP-08` — `resolveLinePrice` must treat an `undefined` custom price as "no special price". Defensive: reachable only from a row that never carried the column.

---

## 5. Known gaps (still manual only)

5.1 **The Supabase query layer.** PostgREST filter semantics, `charge_balances`, RLS and branch scoping are asserted only by the manual files — which is why two web-only bugs in this sweep (the money-in **search** returning everything, and walk-in cash missing from the **section-header totals**) survived until someone read the query. Their fix is verifiable only by hand: [ledger-collections.md](ledger-collections.md) §18.

5.2 **The offline repositories' SQL.** The four `sync*.test.ts` suites now cover the sync ENGINE — the merge, the push order and conflict keys, the pull cursor, the delete reconcile and the 24h gate — against `helpers/fakeSqlite.ts`, which enforces the same primary key and natural-key UNIQUE index Postgres does. What is still manual is the **repositories'** own SQL: the `Db*` row shapes and nested joins each offline repository builds are not executed, and neither is real SQLite. A statement shape the fake cannot parse is a fake bug, not a passing test — see [sync-engine.md](sync-engine.md).

5.3 **Screens.** No component renders. The pay/void order gates are asserted at the service, but the panel re-asserts them for its popups and that copy is manual (`monthly-grid.md`).

5.4 **The audit trail.** Repository-level, so it is not exercised — see [audit-log.md](audit-log.md).

---

## 2c. Lowering the allowance (`customerAllowance.test.ts`)

`validateDecrease(newAllowance, current, activeCount)` guards the one door a tenant admin may push without the owner. Two floors apply and **the higher one binds**.

| Case        | What it asserts                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| TC-CD-01    | A cut down to **exactly** the active count is allowed                                                                          |
| TC-CD-02    | One **below** the active count throws `AllowanceFloorError`, carrying both numbers so the sheet can say how many to deactivate |
| TC-CD-03    | A **raise** through the lowering door is refused, equal-to-current included — the request flow is the only way up              |
| TC-CD-04    | A fraction (40.5) or a negative is refused                                                                                     |
| TC-CD-05    | **Never below 30**, even with 0 active customers — the product floor, not just the active count                                |
| TC-CD-05b   | A cut to **exactly** 30 is allowed                                                                                             |
| TC-CD-05c   | With 45 active, 30 is still refused — the **active count outranks** the product floor when it is higher                        |
| TC-CD-06    | When both the raise check and the floor would fire, the **floor** is what throws                                               |
| TC-CD-07    | A tenant already over cap can still cut down to its own active count                                                           |
| TC-CD-08    | The floor is read from `MIN_CUSTOMER_ALLOWANCE`, not a literal 30 sprinkled around                                             |
| TC-CS-01…03 | The signed change field: `+20` keeps its plus, `-20` its minus, and **no change renders empty**, never `+0`                    |
