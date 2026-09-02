# Money unit tests — QA scenarios

The automated safety net under every rule that touches money. It runs on a laptop in ~3 seconds and asserts the things a manual pass cannot practically re-check on every release: the waterfall's ordering, the month-status ladder, the customer badge, the collect/void/write-off refusals, and the money-conservation invariants.

**It is not a replacement for the manual files.** These tests exercise services and pure functions with mocked repositories — they never open a screen, never touch Supabase and never touch SQLite. [ledger-collections.md](ledger-collections.md), [monthly-grid.md](monthly-grid.md), [sales.md](sales.md) and [shared-handover-void.md](shared-handover-void.md) still own the on-device behaviour.

**Reference code:**
- Runner + config: [tests/](../tests/) — `jest.config.js`, `tsconfig.json`, `babel.config.js`, `stubs/`, `helpers/`
- Suites: `tests/suites/*.test.ts` (one file per area, every case numbered `TC-XX-nn`)
- Under test: `waterfall.ts`, `openItems.ts`, `PaymentService.ts`, `payOrder.ts`, `monthDueRules.ts`, `linePrice.ts`, `ChargeService.ts`, `CollectionService.ts`, `LedgerService.ts`, `SaleService.ts`, `saleLines.ts`, `saleListPatch.ts`, `sharedBills.ts`, `mergeCollection.ts`, `custody.ts`, `currency.ts`, `date.ts`, `monthTotals.ts`

---

## 0. Why it lives outside `SubsTrack/`

`SubsTrack/package.json` → `scripts` and its dependency tree **feed the OTA fingerprint** (gotcha #53). A devDependency or a `"test"` script added there changes the runtime version, and every installed app silently stops receiving OTA updates until a new native build ships. So the tests are their own npm package at the repo root with their own `node_modules`, importing the app's source through a path alias. **Never move them into `SubsTrack/`.**

---

## 1. Running them

1.1 `cd tests && npm install --ignore-scripts` (the `--ignore-scripts` flag is required on the dev laptop — see 1.5).

1.2 `npm test` → all suites, all green, in a few seconds.

1.3 `npm test -- suites/waterfall.test.ts` runs one suite; `npm run test:watch` re-runs on save; `npm run test:coverage` reports coverage over the money modules only.

1.4 `npm run typecheck` type-checks the suites against the app's **real** types (Jest swaps in stubs, tsc does not). It must be clean before a money change is called done — a green test run proves the rules, not the shapes.

1.5 **AV note:** this machine's script control blocks spawning vendored tool binaries, so `npx`, `esbuild` and anything built on them fail with *Access is denied*. Jest + Babel is pure JavaScript and is unaffected. If `npm test` reports `Access is denied`, run `node node_modules/jest/bin/jest.js` directly.

1.6 A new native module in the app usually needs a matching one-file stub under `tests/stubs/` plus a line in `jest.config.js` → `moduleNameMapper`. Nothing in a stub may implement a money rule — only the platform under one.

---

## 2. What each suite guards

| Suite | Cases | The rule it protects |
|---|---|---|
| `waterfall.test.ts` | TC-WF-* | Oldest **due date** first, each bill filled completely, never proportionally; a total order so the preview and the save can never disagree; float dust never leaves a bill a millionth short |
| `monthGrid.test.ts` | TC-MG-* | The status ladder (`before_start` → money → skip → future → not-due-yet → unpaid); a partial payment reads "paid"; an **empty** bill reads exactly like an untouched month; multi-month coverage across a year end; the `customer_start_day` rule and its 31st-of-the-month clamp |
| `payOrder.test.ts` | TC-PO-* | Pay oldest-first / void newest-first, months inside one write never blocking each other, a previous year's backlog still blocking, prepaying out of order refused |
| `customerStatus.test.ts` | TC-CS-* | The five badge rules — chiefly that "✓ Paid" and "Overdue" can never appear together, and that an absent status renders **no** pill |
| `collect.test.ts` | TC-CL-* | Every refusal on the one write that takes money; a virtual month materialising its bill; two devices converging on one bill; revive + re-price before cash lands; the open-amount month |
| `chargeEdits.test.ts` | TC-CH-* | Raising / voiding / writing off a bill, and the two edit locks (below-collected, voided-or-written-off) |
| `owed.test.ts` | TC-OW-* | "What does this customer owe?" — the stored-vs-virtual dedupe, and the Debts view's parts adding to its total exactly |
| `sale.test.ts` | TC-SL-* | Sale validation, stock, the bill it raises, cash at the till, editing (including the currency lock), voiding with its cash |
| `invariants.test.ts` | TC-IV-* | End-to-end money conservation — see section 3 |
| `mergeCollection.test.ts` | TC-MC-* | The month grid's patch-from-the-write, including a re-priced bill |
| `salePatchAndShared.test.ts` | TC-SP-*, TC-SS-* | The sales-list patches, the product-vs-service line split, and naming the other bills a shared void un-pays |
| `selectionAndCustody.test.ts` | TC-MS-*, TC-WA-* | Which cells select together on a multi-month plan; who may take whose cash |
| `linePrice.test.ts` | TC-LP-* | A special price replaces the plan's for the **same span** — "100 per 3 months", never 100 a month |
| `currencyAndDates.test.ts` | TC-CU-*, TC-DT-* | USD always via the row's **frozen** rate; a hand-over bucketed into its **local** month |

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

5.2 **The SQLite mirror.** The offline repositories' SQL is not executed here; the fake ledger reproduces their documented *contract*, not their SQL. Offline behaviour stays [sync-engine.md](sync-engine.md)'s job.

5.3 **Screens.** No component renders. The pay/void order gates are asserted at the service, but the panel re-asserts them for its popups and that copy is manual (`monthly-grid.md`).

5.4 **The audit trail.** Repository-level, so it is not exercised — see [audit-log.md](audit-log.md).
