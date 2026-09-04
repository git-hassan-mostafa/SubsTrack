# SubsTrack — Core Context

Read this file first, every session. **Do not re-explore the codebase at start** —
this is the source of truth. Deeper detail lives in `docs/`, read **on demand only**
(see Doc Map §2). When architecture/context changes, update this file **and** the
matching `docs/` file. Dev phase: architecture + DB schema are open to change.

---

## 1. HARD RULES (never violate)

### 1.1 Comments — ZERO tolerance

- **NEVER a comment on a changed/added line of code.** No trailing `//`, no `//`
  above a statement, no `/* */` inline, no comment inside a function body. Not one
  word. Not for "tricky" lines. An edit of any size adds **zero** inline comments.
  If a line needs explaining → rename the variable or extract a named helper.
- **The ONLY allowed comment: ONE line directly above a function / component /
  method / class / type / interface declaration.** Must still be one line after
  Prettier (~80 chars). No JSDoc blocks, no `@param`/`@returns`, no `*` spacer
  lines, no paragraphs, no examples.
- That line says **why** it exists or the non-obvious gotcha — never what the
  signature already says. **One fact.** Two facts → it belongs in `docs/`.
- A long rule is a `docs/` job and the inline copy is **DELETED**, replaced by a
  pointer only: `// oldest-first — see gotcha #81`, and only above a declaration.
- **This OVERRIDES the Consistency rule (§3).** ~2,783 inline comments already
  exist in `SubsTrack/src` across 239 files — they are ALL wrong. **Do not match
  them.** In any block you touch: delete every inline comment, trim every
  over-long declaration comment.
- Never `// eslint-disable … react-hooks/*` — `experiments.reactCompiler` is on;
  one such comment kills React Compiler for the whole file. See gotcha #52.

### 1.2 Non-negotiable architecture rules

1. Month status logic lives ONLY in `PaymentService.buildMonthGrid()`.
2. `tenant_id` always from the Supabase JWT — never client input.
3. DB row types (snake_case) never escape the repository layer.
4. No business logic in components or stores.
5. No Supabase calls outside the repository layer. Sole exception: the sync engine
   `src/core/offline/sync/`.
   5b. Native repos are a platform switch (`Platform.OS === 'web' ? Supabase :
   Offline`). Never `new XxxRepository()` in a service/slice — import the default.
   Both impls `implements IXxxRepository`; changing one's method surface must
   change the interface, and therefore the other.
6. RLS enforces multi-tenancy; app-level filtering is secondary.
7. **No hard deletes** — `voided_at` (charges, collections), `active=false` /
   `cancelled_at` (customers), `active=false` (branches, currencies, products).
8. A bill's amount is a **snapshot** — never recompute from `plan.price` after it
   is raised.
   8b. **Money is a hand-over, never a number on the thing it paid for.** Balance
   = `charge.amount − SUM(collection_items)`, computed. Nothing anywhere stores a
   `paid` counter. Correcting cash = void the collection, never edit an amount.
   8c. **Everything keys off MONEY, never off a row existing** (gotcha #106).
9. Cross-module state → global Zustand store (`src/state/slices/`). Slices import
   peer-slice **types** only, never their creators/hooks; cross-slice reads via
   `get().<otherSlice>` inside actions. Caller-supplied data (tier, usage,
   currency) flows in as parameters from the component. Single-module state →
   **module store** under `src/modules/<module>/state/`, kept out of `GlobalState`.
10. All errors caught and stored in state — never surface raw Supabase messages.
11. Tier limits enforced at the **service** layer: every `Service.createX()` calls
    `tierService.assertCanCreate(tier, usage, resource)` after `validate()`.
    `TierLimitError` flows through stores as a structured `tierLimitError` field;
    never parse error strings.

### 1.3 QA / tests

- New scenario → add test-plan scenarios under `QA/`.
- **Anything touching money → a unit test in `tests/`.** Run `npm test` there
  before claiming a money change works. (`cd tests && npm install --ignore-scripts`;
  if it says *Access is denied*: `node node_modules/jest/bin/jest.js`.)
- `tests/` is a separate npm package **and must never move into `SubsTrack/`** —
  its `package.json` would feed the OTA fingerprint and silently cut every
  installed app off from updates (gotcha #53).
- A stub may fake a platform, never a rule.

### 1.4 Reporting completed work

End every task with a `## Changes Made` section: **3–5 bullets max**, one short
sentence each, results only. No "I updated/changed/completed", no process,
reasoning, progress updates, intros, conclusions, filler, or self-reference. No
implementation detail unless explicitly requested.

---

## 2. Doc Map — read ON DEMAND, never all up front

| File | Read before… |
| --- | --- |
| `docs/domain-notes.md` | any feature work — ledger, sales/services, stock, expenses, reports, wallet, invoices, audit trail, money-in history, dashboard revenue |
| `docs/gotchas.md` | ledger / payments / currency / branches / sales / revenue / expenses / reports / signup / audit / invoice code (130+ numbered traps, area index at top) |
| `docs/features.md` | editing a feature's behavior (exhaustive) |
| `docs/db-schema.md` | any DB column or constraint question |
| `docs/month-grid.md` | month grid, customer badges, pay/void order, skipped months |
| `docs/architecture.md` | slice vs module-store decisions, offline seam detail, write-patch rules |
| `docs/ui-patterns.md` | bottom sheets, list cards, `PageHeader`, `ActionMenu`, styling, navigation |
| `docs/offline.md` | touching ANY repository or the sync engine |
| `docs/build-and-release.md` | running the apps, `tests/`, OTA/EAS publishing |
| `docs/ota-fingerprint-mismatch.md` | an OTA update never reaches the installed app |
| `docs/edge-functions.md` | auth / user / tenant creation |
| `docs/project-structure.md` | directory trees (can go stale — prefer a file search) |

---

## 3. Code Quality

- Clean, readable, maintainable — clarity beats cleverness. Prefer the clean
  scalable change over a band-aid fix, even if it is big.
- **SOLID strictly**: S one responsibility per file/class/function · O extend
  without modifying working code · L subtypes substitutable for base types ·
  I small focused interfaces · D depend on abstractions, not concretions.
- **Simplicity**: simplest solution that correctly solves the problem; no
  over-engineering, no premature abstraction. If logic feels complex, stop and
  rethink — there is almost always a simpler path.
- **Dependencies**: add a library only when it meaningfully reduces complexity or
  risk; well-maintained, widely adopted, good TS support. **Check what is already
  installed first.**
- **Consistency**: scan the surrounding codebase for patterns, naming and
  structure and match them. Prefer consistency over personal preference. If an
  existing pattern is an anti-pattern, flag it rather than silently diverging.
  **Except comments — §1.1 overrides this.**
- **Reuse — look both ways before writing.** Before adding anything, search for an
  existing function / component / hook / util that already does it and use that
  instead. After adding or changing one, search for existing code that should now
  use it — duplicated logic, a hand-rolled copy, a near-identical component — and
  refactor those call sites onto it in the same change. Do not leave two ways to
  do one thing. **Then say so**: list every file you refactored in the
  `## Changes Made` bullets (§1.4). If a call site is too risky to touch in this
  change, name it and say why instead of silently skipping it.
- **Design philosophy**: minimal, clean, professional. Used daily by
  non-technical staff on phones; every screen immediately understandable. No
  animations, no decorative elements, no unnecessary complexity.
  Priority: clarity → speed → correctness → completeness.
- **Error handling**: async store actions wrap try/catch → `error: string | null`.
  Screens show `<ErrorBanner>` inline, **never** toast/alert. `clearError()` on
  user input or form unmount. Repositories convert raw Supabase errors to friendly
  messages. `"account_not_configured"` from AuthService triggers specific UI.
  Edge-function errors go through `BaseRepository.handleFunctionsError`, never raw
  `handleError` (gotcha #40).

---

## 4. Project Shape

**SubsTrack** — multi-tenant subscription management for small businesses (ISPs,
gyms, delivery services) that collect monthly fees. Staff log in, manage customer
lists, assign plans, record monthly payments. Paid vs overdue is shown through a
**dynamically generated month grid — months are never stored in the DB, only
payments are.**

Two Expo apps: `SubsTrack/` (tenant-facing; admin + user roles) and `SuperAdmin/`
(internal, for the SaaS owner: tenants + tier plans). Also in the workspace:
`sql scripts/` (`script.sql` schema+RLS, `reset.sql` teardown), `new-features.md`
(backlog), `Design/`, `QA/`, `tests/` (Jest, money rules).

**Stack**: RN 0.81.5 + Expo SDK 54 · Expo Router 6 (file-based, typed routes) ·
Zustand 5.0.12 + immer · NativeWind 4.2.3 · Supabase (PostgreSQL + RLS + Auth) ·
TypeScript strict · i18next (en/ar, RTL) · @gorhom/bottom-sheet · import alias
`@/*` → repo root.

Quick commands (full detail in `docs/build-and-release.md`): `npm install` then
`npx expo run:android` — **a dev client is required, Expo Go redboxes** (native
keyboard-controller module). OTA publish: `npm run ota-prod`. Rebuild only when
something **native** changed. Each app needs its own `.env` with
`EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

---

## 5. Architecture (MANDATORY)

Strict layered clean architecture. Dependencies flow **downward only**:

```
Presentation → State → Business Logic → Repository → Database
                                          ↑
                        Core (types/constants/utils — imported by all)
```

- **L1 Presentation** — screens, UI components, UI-only hooks. Read store state,
  dispatch store actions. Zero business logic, zero direct Supabase calls.
- **L2 State** — Zustand slices (`src/state/slices/`) + immer. Hold data +
  `loading`/`error`/`tierLimitError`. Async actions call **services, never
  repositories**. Components read via per-slice hooks **always with a selector**.
- **L3 Services** — pure TS classes. No React, no Supabase. All validation,
  transformation, decision/algorithm logic. Domain models in, domain models or
  typed errors out.
- **L4 Repository** — the **only** layer importing Supabase. All DB calls +
  bidirectional snake_case ↔ camelCase mapping. ~one repository per table.
  Extends `BaseRepository` (supabase client + `handleError()` /
  `handleFunctionsError()`).
- **L5 Core** — shared types, interfaces, constants, utils. Imported by all layers,
  imports from none.

**Offline-first (native only; web unchanged, talks to Supabase directly).**
Contained entirely in the repository layer + `src/core/offline/`; services, slices
and UI are untouched. Platform switch per repository file. The SQLite mirror
returns the **same `Db*` row shapes** (incl. nested joins) the mappers consume.
Writes mutate the mirror and set `_dirty = 1`; hard deletes are logged in
`pending_deletes`. Sync pushes dirty rows + logged deletes, then pulls rows changed
since one `last_pulled_at` — **latest `updated_at` wins**. Bidirectional,
multi-device, no outbox/cursors/tombstones. A cycle runs **at most once every 24h**
via `runSyncIfDue()` (only manual sync ignores it); "not due" still pushes
(`flushPendingWrites`) because an un-pushed row is the only copy of that money.
**Network-parallel, DB-sequential**: the pull fetches every table at once, the push
goes up the dependency waves of `PUSH_WAVES`, and every SQLite write queues behind
`withDbLock` (expo-sqlite gives the app one connection). **Online-only** (throw
`RequiresConnectionError` offline, delegate online): auth `signIn` /
`getTenantByCode`, `User.create`/`delete`/`updatePassword`, `Signup.*`,
`Subscription.upgradeTenant`. Auth `getSession`/`getUserProfile`/`getTenant` are a
read-through cache so the app boots offline after the first online login.
**Read `docs/offline.md` before touching any repository or the sync engine.**

**State key rules** (full detail `docs/architecture.md`):

- Slice arrays are named `items`; other fields keep semantic names.
- **Always pass a selector**; subscribing to a whole slice is **banned**.
- The global store is stashed on `globalThis` via `getStore()` (survives Fast
  Refresh).
- **Global only if something OUTSIDE the module reads it** — either (a) another
  slice reads it via `get().<slice>`, or (b) 2+ modules' screens/components use it.
  Otherwise it is a module store. **The dependency is ONE-WAY**: a module store may
  read the global store, the global store may never read a module store. Module
  stores read across via `getStore().getState()`.
- A module store MUST register in **both** `storeReset.ts`
  (`resetAllDomainStores`) and `refreshActiveData.ts`. Missing the first leaks the
  previous tenant's data to the next login on the same device; missing the second
  leaves stale pre-sync rows on screen.
- A module store is imported by its own path, **never** re-exported through the
  module barrel (import cycle).
- **A write PATCHES the store from what it returned — it never re-fetches.**
  Create/edit/delete/collect hand back the saved row; `onCreated`/`onUpdated`
  carry the row, not a `fetchX`. Keep a full `fetchX` for arrival paths only
  (mount, focus, pull-to-refresh, post-sync). **Changing a VIEW over data already
  held is not an arrival** (gotcha #121). Two deliberate re-read exceptions:
  voiding a **month bill** and voiding a **sale**; plus any filtered/searched list.
  What a write cannot patch it **announces** — bump `ledger.owedVersion`, watched
  via `useOwedChanged(reload)`. Never subscribe a screen that writes in a loop.
- **"Ensure loaded" actions guard on a `loaded` flag, never `items.length`.**
- Two intentional persist-middleware exceptions kept out of the global store:
  `shared/lib/uiPrefStore.ts` (last-used currency, `currentBranchId`) and
  `core/i18n/languageStore.ts` (en/ar). The **display currency is NOT here** — it
  belongs to the organization, so it lives in `tenant_settings`
  (`useDisplayCurrencyId`). `confirm` and `ui` are app-wide seams with no owning
  module and live in `src/shared/lib/`.

---

## 6. Data Models

Domain types (camelCase) → `src/core/types/index.ts`. DB row types (snake_case) →
`src/core/types/db.ts`, **never leave the repository layer**. The source files are
authoritative for exact shapes. Feature-level meaning of every model:
`docs/domain-notes.md`. Columns + constraints: `docs/db-schema.md`.

Core money model — **the Ledger** (replaced `payments` + `custom_debts` +
`debt_payments` outright, because `amount_paid` held one number and one date so a
second payment had nowhere to go):

- **`charges`** = what is OWED (kind `month` | `sale` | `manual`). Amount frozen.
  `paid` is never a column — it is `SUM(collection_items)`, exposed as the
  `charge_balances` view (same GROUP BY offline). That is what makes collecting
  offline-safe: a counter would be clobbered, additive item rows merge.
- **`collections`** = ONE physical hand-over of cash. **One currency per
  hand-over**, equal to every charge it pays — which is why `collection_items` has
  no currency of its own, and why "collect all due" can be two writes for one
  customer (gotcha #108). Carries the only custody in the schema
  (`held_by_user_id`, `remitted_at`/`remitted_by`).
- **`collection_items`** = which bill each slice of a hand-over paid.
- **Waterfall** (`ledger/utils/waterfall.ts`, pure): fills bills **oldest
  `due_date` first, each one completely** — never proportionally. Sorted on four
  levels (`dueDate → issuedAt → createdAt → key`) so preview and save can never
  disagree and two devices split identically. Leftover money = overpay → refused.
  That order is **shown**, not just applied.
- **A month has no bill until money reaches it.** `LedgerService.getOwed` merges
  stored charges with virtual unpaid months, deduped on
  `(customer_plan_id, billing_month)`: a PAID stored bill wins, an EMPTY bill loses
  to the virtual month and is re-priced from the line (gotcha #106b). Collecting
  materializes the bill with `deterministicId(line, month)` so two offline devices
  converge on ONE row.
- **OWED vs DEBT**: owed = everything with a balance (waterfall input, unpaid
  months included); debt = the Debts-screen subset,
  `isDebtItem(kind, paid) = kind !== 'month' || paid > 0`. **A fully unpaid month
  is OWED but is NOT a debt.** The Debts screen reads **stored bills only** — it
  runs no virtual-month pass and must not grow one (gotcha #106c).
- **Void vs write-off** are different statements, kept exclusive by
  `chk_charges_void_xor_write_off`: void = the bill was a MISTAKE; write-off = REAL
  but lost. **Either leaves a dead bill that still owns its month** (gotcha #115),
  so a write **revives before it collects** — `reviveTargetBill(s)` clears all six
  void/write-off columns unconditionally whenever money arrives.
- Reading what is owed is **ONE query**: `ChargeRepository.findOpenWithPaid`
  (gotcha #118). A write **returns what it WROTE** (gotcha #119).
- **Two void doors, saying different things** (gotcha #109): voiding a **payment**
  says that hand-over was wrong and leaves the bill owed (lives in
  `BillPaymentsList`, needs no order gate); voiding the **bill** says it should
  never have existed, so its cash goes too —
  `ChargeService.voidChargeWithPayments`. Payments are voided **first**. The
  confirm always says the money goes, and names the other bills it un-pays
  (gotcha #125). Plain `voidCharge` still refuses a paid bill. A **month** bill
  void is gated NEWEST-FIRST through `payments.voidMonthBill`. Hand-overs are
  voided in ONE write (`CollectionRepository.voidMany`), never a loop.
- A line with **no set price** is collected through an OPEN item (gotcha #112) —
  the collect sheet's "Amount for this month" field IS the bill and picks the
  currency; `OpenItem.openAmount` is the flag.

Type names to know: `Charge`, `Collection`, `CollectionItem`, `ChargeBalance`,
`MonthBill`, `OpenItem`, `AllocationLine`, `CustomerDebts`, `DebtSummary`,
`CollectionListItem`, `CollectedRow`/`CashRow`, `ReportPeriod`, `DashboardMetrics`,
`Customer`, `CustomerPlan`, `Plan`, `Product`, `Service`, `SaleItem`,
`StockMovement`, `Expense`/`ExpenseItem`/`ExpenseSummary`, `SkippedMonth`,
`MonthEntry`, `TenantSetting`, `UnpaidStartRule`, `Branch`, `Tenant`, `Currency`,
`TierPlan`/`TenantUsage`/`TierResource`, `AuthUser`/`AppUser`, `UserRole`,
`MonthStatus`, `ChargeKind`, `SaleLineType`, wallet types (`WalletItem`,
`UserWallet`, `UserWalletDetail`, `WalletSource`, `ReceiveBlock`).

Facts that change how you code and are easy to get wrong:

- **Dashboard revenue is CASH COLLECTED, never billed value** — one source only:
  `collection_items`, scoped by `collections.received_at`, summed in USD via the
  collection's frozen rate. The read returns one row per **BILL SETTLED**, not per
  hand-over (gotcha #107) — that is what makes the streams add up exactly. Never
  switch a revenue query back to `sales.total_amount` or `charges.amount`; count
  **distinct `collectionId`s** for `paymentsCollectedCount`.
- **Product stock is computed at runtime** — `SUM(stock_movements.quantity_delta)`
  over non-voided rows. Never a stored counter. A manual entry only ever ADDS;
  mistakes are fixed on the entry itself (**Edit entry** / **Revert entry**,
  gotchas #94/#96). A sale appends one negative `'sale'` movement per line inside
  the sale's own write; voiding a sale **soft-voids** those rows rather than
  inserting opposite ones. Oversell is blocked in `SaleService.createSale`
  (advisory only — two offline devices can still each sell the last unit).
- **A sale = header (`sales`) + lines (`sale_items`)** and holds **no money**: what
  it owes is its `charges` row, what was collected is a `collections` row — which
  is what lets one sale take installments. A line sells a **product OR a service**;
  a service is labour with **no stock, no cost, and no quantity** (always 1, read
  via `lineQuantity()`), and is **never a separate money stream**. Stock paths
  narrow through `productLines()` / `savedProductLines()` — never a nullable-id
  test (gotcha #97). Editing a sale touches three tables with three different rules
  (gotcha #90); what was already collected cannot change (gotcha #111).
- **A sale is identified by its RECEIPT NUMBER** — last 6 chars of `id`,
  uppercased, via `receiptId()` in `src/core/utils/receiptId.ts`. There is **no
  sequence column and must not be one** (an offline device raises a sale with no
  server round trip). It is the sale card's **title** (items summary drops to a
  subtitle), the receipt's "Receipt ID" row, the History sheet header (both entry
  points pass `saleTitle()`), and — via `chargeLabel` — every place a sale bill is
  named: money-received card + split sheet, debts, collect preview, WhatsApp. On
  that ledger path it is the ONLY identity (`charges(*)` never joins `sales`, so
  the label was the bare word "Sale"). The Audit Log card's chip stays the
  **customer** — that is the subject, not the record's name.
  **Searching it is the one place the platforms differ**: native matches the id's
  tail in the mirror (SQLite stores `id` as TEXT), web filters `receipt_id(sales)`,
  a PostgREST **computed field** storing nothing — Postgres has no `ILIKE` for
  `uuid` and PostgREST refuses to cast a filter's left side, so neither
  `id.ilike` nor `id::text.ilike` can ever work. A term counts as a receipt number
  only when short and hex (`isReceiptIdTerm`), and the clause is **OR'd onto** the
  item/customer search, never replacing it. One search helper per repository,
  shared by `findAll` + `monthlyTotals`, so a page and its total cannot disagree.
- **A PostgREST `or()` may only name columns of the table being queried.** A
  dotted embed path (`customers.name.ilike…`) is a 400 — *"failed to parse logic
  tree"* — so sales search resolves matching customers in a **pre-query** and ORs
  `customer_id.in.(…)`, the shape the product filter already used. **Never reach
  for `customers!inner`**: it makes the embed filterable but INNER-joins away
  every WALK-IN sale. Offline needs none of this — SQL ORs `c.name` over its LEFT
  JOIN directly. Every typed term goes through `sanitizeSearchTerm()`
  (`core/utils/searchTerm.ts`), which strips `, ( ) % * \` — one unescaped `%`
  also breaks the logic tree, and it 400s the whole list rather than just missing.
- **Expenses = stored `expenses` rows + DERIVED stock purchases** (computed at read
  time from `stock_movements.unit_cost × quantity_delta`). A restock **never**
  writes an expense row, so a derived row cannot be voided — fix the movement.
  Cash basis, like revenue. Admin-only. Both halves are branch-`owned`, so branch
  views SUM to the tenant total (gotchas #88/#89).
- **A line's price is `resolveLinePrice(line)`, NEVER `plan.price`** — the amount,
  its currency and `durationMonths` must always travel together, or an LBP amount
  gets frozen at a USD rate of 1 (gotcha #85). Not frozen once billed.
- **Collector wallet + custody chain** is computed at runtime from non-voided
  `collections.held_by_user_id`. Cash moves **UP** the chain (collector → branch
  admin → tenant-wide admin → owner) and never sideways. Rules live in one pure
  file, `modules/wallet/utils/custody.ts` — **never re-derive a wallet permission
  from `role` alone** (role cannot tell a branch admin from a tenant-wide one).
- **The audit trail is written by the APP, never a Postgres trigger** (a trigger
  would stamp the sync moment and the syncing session). Append-only, admins-only
  reads, server-first with un-pushed local rows merged in. `stock_movements` is
  audited for **changes only**.
- **Reports** aggregate in memory from one read per window and **re-implement no
  rule**. There are **no charts** — do not reintroduce a charting library. The
  period scopes the CASH, never the debt (gotcha #91).

---

## 7. Month Grid (critical)

`PaymentService.buildMonthGrid(customerPlan, bills, skips, year, unpaidRule)` is
the **single source of truth** for month status — no other file may reimplement it.
Pure, no I/O. One grid per **service line** (`CustomerPlan`); the payment slice
keeps `monthGridsByLine`. Full rules, the badge contract and the order helpers:
**`docs/month-grid.md`**.

```
1. month < line.startDate                     → "before_start" (gray, non-tappable)
2. MONEY reached the month (collected > 0)    → "paid"  (INCLUDING partial payments)
3. an active skip covers the month            → "skipped"  (money outranks a skip)
4. month is in the future                     → "future"
5. CURRENT month + 'customer_start_day' rule
   + today < line's start day-of-month        → "future" ("not due yet", still payable)
6. otherwise                                  → "unpaid"
```

- Months are **never stored in the DB**; a month has no bill until money first
  reaches it.
- **The grid keys off MONEY, not row existence** — an empty bill (its only
  collection voided) reads *identically* to a month never touched.
- A partial payment resolves to `"paid"` — there is **no `"partial"` MonthStatus**.
  Only presentation differs (amber **ring**, not fill; sublabel `PARTIAL`; on a
  multi-month block only the first cell is ringed).
- **No grace period** — the current month is unpaid from its first day.
- **The read is NOT year-scoped** — year arrows re-derive from the store and never
  re-query (gotcha #121). Never put a grid build inside a write; never scope the
  fetch to a year (every pay/void gate is all-time).
- **Per-tenant unpaid rule** (`tenant_settings.UnpaidStartRule`) decides **two
  different things** and mixing them is gotcha #83: `isNotDueYet()` (the current
  month's colour) and `isNotLateYet()` (when the customer reads "Overdue"). Both
  live in `customer-payments/utils/monthDueRules.ts` — change them there, never in
  a caller.
- **Months settle OLDEST FIRST, and "earlier" means UNCOVERED, not merely
  overdue.** Prepaying is allowed; prepaying out of order is not. One pure helper
  `blockingUnpaidMonths()` fed by `PaymentService.uncoveredBillingMonths`. **Do not
  feed the gate `unpaidBillingMonths`** (overdue only) — that is gotcha #81b — and
  do not feed `buildCustomerStatus` the uncovered list. Months inside the same
  write never block each other.
- **Voids run NEWEST FIRST**, and a paid line's start date is FROZEN
  (`assertStartDatesUnlocked`). An **unskip** follows the VOID rule, not the pay
  rule (gotcha #84). Skipped months are never unpaid, never overdue, never payable.
- **Multiple plans per customer**: 1..N service lines, each its own grid and
  independent payments. **The service line owns the ONLY start date** — `customers`
  has no `start_date`.
- `PaymentService.buildCustomerStatus(...)` is the only place a list badge is
  decided, derived from `buildMonthGrid`. **"Paid" means owes nothing**, so it can
  never co-exist with "Overdue". Absence means unknown → **no pill**, never red.
  One query, one arrival. No SQL mirror. `customerFlags(status)` decides both the
  pills and the filter tabs — never duplicate the suppression rule in the filter.

---

## 8. Database Changes

`sql scripts/script.sql` is **both the full schema and the migration** — every
statement is idempotent, so re-running the whole file on a live database brings it
up to date. **There is no separate migration script**; do not write one in chat and
do not create new `.sql` files (`sql scripts/` holds only `script.sql` +
`reset.sql`).

0. **Every table is declared in two steps** — `CREATE TABLE IF NOT EXISTS <t> ();`
   then one `ALTER TABLE <t> ADD COLUMN IF NOT EXISTS …;` per column. There is **no
   `CREATE TABLE` column list anywhere**, so every column self-heals on re-run.
   Tables stay in dependency order (an inline `REFERENCES` needs its target first).
1. **New column → append ONE line** to that table's column block. `NOT NULL` needs
   a `DEFAULT`. A single-column `CHECK`/`UNIQUE`/`REFERENCES` rides the same line
   (prefix `CONSTRAINT <name>` when the name matters). A **multi-column**
   constraint cannot — it goes in that table's "Table-level constraints"
   `DO $$ … pg_constraint …` block; because that block is guarded, *editing* an
   existing constraint is **not** picked up on a live DB (rename it, or drop the
   old one by hand).
2. **New table / index / policy / trigger / function** → edit `script.sql` in
   place, keeping it re-runnable (`IF NOT EXISTS`, `CREATE OR REPLACE`,
   `DROP POLICY IF EXISTS` before `CREATE POLICY`).
3. **Mirror any column change in `SubsTrack/src/core/offline/db/tables.ts`** — the
   native app's local SQLite schema. `applySchema.ts` creates missing tables and
   `ALTER`s in missing columns on every app start, so editing the descriptor is the
   whole local change. **Non-additive changes** (drop/rename a column, change a type
   or table constraint) are NOT reconciled on either side — say so and give the
   one-off statement.
4. Tell the user to run `script.sql` after the change.

---

## 9. Before you write code

**§1.1 — zero inline comments.** The existing codebase is full of them and is
wrong. Do not copy it.
