# SubsTrack — Core Context

One rules file for every AI agent (Claude Code loads it via `CLAUDE.md` = `@AGENTS.md`; Antigravity directly). Read first, every session; **don't re-explore the codebase at start** — `docs/` on demand only (§2). Context change → update this file **and** the matching `docs/` file. **Keep < 24,000 bytes** (Antigravity truncates past 24 KB) — detail goes to `docs/`, here only rule + pointer. Dev phase: architecture + DB schema open to change.

## 1. HARD RULES

### 1.1 Comments — ZERO tolerance
- **NEVER a comment on a changed/added line.** No trailing `//`, no `//` above a statement, no inline `/* */`, nothing inside a function body — not one word, not for "tricky" lines. Needs explaining → rename the variable or extract a named helper.
- **ONLY allowed: ONE line directly above a function/component/method/class/type/interface declaration**, still one line after Prettier (~80 chars). No JSDoc, `@param`/`@returns`, `*` spacer lines, paragraphs, examples.
- It says **why** / the non-obvious gotcha, never what the signature says. **One fact**; two → `docs/`, inline copy **DELETED**, replaced by a pointer above a declaration: `// oldest-first — see gotcha #81`.
- **OVERRIDES Consistency (§3).** ~2,783 existing inline comments in `SubsTrack/src` (239 files) are ALL wrong — **don't match them**. In any block you touch: delete every inline comment, trim every over-long declaration comment.
- Never `// eslint-disable … react-hooks/*` — `experiments.reactCompiler` is on; one kills React Compiler for the whole file (gotcha #52).

### 1.2 Architecture rules
1. Month status lives ONLY in `Shared/src/modules/customer/customer-payments/utils/monthStatus.ts` (`buildMonthGrid()`, pure, no i18n — portal + edge functions run it). `PaymentService` keeps only the pay/void/unskip ORDER gates.
2. `tenant_id` always from the Supabase JWT, never client input.
3. DB row types (snake_case) never escape the repository layer.
4. No business logic in components or stores.
5. No Supabase calls outside repositories. Sole exception: sync engine `SubsTrack/src/core/offline/sync/`.
   5b. Services reach a repository ONLY via `repositories().x` (`Shared/src/core/runtime/repositories.ts`), inside a method, never at module load; never `new XxxRepository()` in a service/slice. Each app hands its set to `configureShared()`: Supabase classes (`createSupabaseRepositories()`), phone = offline twins (`SubsTrack/src/platform/offlineRepositories.ts`). Both `implements IXxxRepository` → change one's surface, change the interface and the other.
6. RLS enforces multi-tenancy; app-level filtering secondary.
7. **No hard deletes** — `voided_at` (charges, collections), `active=false`/`cancelled_at` (customers), `active=false` (branches, currencies, products).
8. A bill's amount is a **snapshot** — never recompute from `plan.price` after a raise.
   8b. **Money is a hand-over, never a number on what it paid for.** Balance = `charge.amount − SUM(collection_items)`, computed; no `paid` counter anywhere. Correcting cash = void the collection, never edit an amount (Correct amount = void + re-record, #171).
   8c. **Everything keys off MONEY, never off a row existing** (#106).
9. Cross-module state → global Zustand store (`Shared/src/state/slices/`). Slices import peer-slice **types** only, never creators/hooks; cross-slice reads via `get().<otherSlice>` inside actions. Caller data (allowance, counts, currency) = params from the component. Single-module state → **module store** in `Shared/src/modules/<module>/state/`, outside `GlobalState`.
10. All errors caught and stored in state — never surface raw Supabase messages.
11. Exactly **two quantity limits**, on `tenants`: `customer_allowance` (active customers), `plan_allowance` (active service lines = bill count, at `price_per_plan_usd`); `plan_allowance >= customer_allowance`. ONE service-layer gate `billingService.assertQuotas(limits, before, after)`, refusing only a quota the write **grows** (`createCustomer` counts drafted lines first; `syncLines` nets removals vs additions). `QuotaExceededError` → billing slice `quotaError`; never parse error strings. All else uncapped. #149.

### 1.3 QA / tests
- New/changed MONEY rule → one line in the matching `QA/` area file: `action → what to check`. No CRUD/UI/layout scenarios in `QA/`.
- **Anything touching money → unit test in `tests/`**; run `npm test` there before claiming it works.
- `tests/` is a separate npm package, **never move into `SubsTrack/`** — its `package.json` would feed the OTA fingerprint and cut every installed app off updates (#53).
- A stub may fake a platform, never a rule.
- `tests/suites/sharedBoundary.test.ts` fails when a `Shared/src` file imports `react-native`, `expo-*`, `@react-native*` or app code — fix the import, never the guard.

### 1.4 Reporting
End every task with `## Changes Made`: **3–5 bullets**, one short sentence each, results only. No "I updated/changed/completed", process, reasoning, progress, intro, conclusion, filler, self-reference. No implementation detail unless asked.

### 1.5 Docs are agent-only
`AGENTS.md` + `docs/*.md` (except `docs/whatsapp-setup-guide.md`) + `tests/README.md` + `Portal/README.md` are read only by AI agents: terse/telegraphic — no filler, history, link markup (`` `path` `` not `[x](../path)`), table padding or hard wrapping; keep every rule, reason, identifier, path, number, gotcha #. Human-facing, plain English: `QA/`, `fix-prompts.md`, `prerequisites.md`, `docs/whatsapp-setup-guide.md`. `CLAUDE.md` holds ONLY `@AGENTS.md`, never rules.

### 1.6 Environment (laptop AV blocks spawned tools)
- `npm install --ignore-scripts` (plain `npm i` dies at a postinstall, half-empty `node_modules`).
- `npx`/`.cmd`/vendored binaries → _Access is denied_: run the JS entry with `node` (`node node_modules/jest/bin/jest.js`; `node node_modules/oxlint/bin/oxlint`, silent exit 0 = clean). esbuild.exe blocked; Vite 8 fine. `expo export -p android` → `--no-bytecode`.
- Files UTF-8 **without BOM** (PowerShell 5.1 `Set-Content -Encoding utf8` adds one).
- User is not a native English speaker: chat answers short, plain English.

## 2. Doc Map — read ON DEMAND, never all up front
|File|Read before…|
|-|-|
|`docs/domain-notes.md`|any feature work; full text of every §6 rule (Core model)|
|`docs/gotchas.md`|ledger/payments/currency/branches/sales/revenue/expenses/reports/signup/audit/invoice code (numbered traps, index at top)|
|`docs/features.md`|editing a feature's behavior (exhaustive)|
|`docs/db-schema.md`|any DB column/constraint question|
|`docs/month-grid.md`|month grid, badges, customer filters, pay/void order, skips|
|`docs/architecture.md`|`Shared/` wiring, slice vs module store, write-patch rules|
|`docs/web-app.md`|any `Web/` work|
|`docs/ui-patterns.md`|sheets, cards, `PageHeader`, `ActionMenu`, text fields, styling, web tables, navigation|
|`docs/offline.md`|touching ANY repository or the sync engine|
|`docs/build-and-release.md`|running the apps, `tests/`, OTA/EAS publishing|
|`docs/ota-fingerprint-mismatch.md`|an OTA update never reaches the installed app|
|`docs/edge-functions.md`|auth / user / tenant creation|
|`docs/whatsapp.md`|WhatsApp Cloud API, `whatsapp_*` tables, send queue, webhooks (#161–170)|
|`docs/project-structure.md`|directory trees (can go stale — prefer a file search)|

## 3. Code Quality
- Clean, readable, maintainable; clarity > cleverness; a clean scalable change over a band-aid, even if big.
- **SOLID strictly**: S one responsibility per file/class/function · O extend without modifying working code · L subtypes substitutable · I small focused interfaces · D depend on abstractions.
- **Simplicity**: simplest correct solution, no premature abstraction. Feels complex → stop, rethink.
- **Dependencies**: only when it meaningfully cuts complexity/risk; maintained, widely adopted, good TS. **Check what's installed first.**
- **Consistency**: match surrounding patterns, naming, structure; flag an anti-pattern, never silently diverge. **Except comments (§1.1).**
- **Reuse — look both ways.** Before adding, search for an existing function/component/hook/util. After adding/changing one, refactor call sites that should now use it in the same change — never two ways to do one thing. **List every refactored file in `## Changes Made`**; one too risky → name it, say why.
- **Design**: minimal, professional, for non-technical staff on phones; clarity → speed → correctness → completeness. **Project rules beat the `ux-designer` skill**: no animations/transitions/decoration/toast/shimmer, errors inline via `ErrorBanner` (never toast/alert), plainest option wins. Must still look like a native Android (Material 3) app, never a web page: Android ripple = allowed press feedback, not an animation; flat top bar, `AppTabBar`, elevated cards, sentence-case labels — `docs/ui-patterns.md` → Native Android look.
- **Text fields**: the field owns the typed text via `useTextField`; never a controlled `TextInput` wired to form/store state (#134). Component always `AppTextInput`, never RN `TextInput`. Detail: `docs/ui-patterns.md` → Text fields.
- **Errors**: async store actions try/catch → `error: string | null`; screens show `<ErrorBanner>` inline; `clearError()` on input or form unmount. Repositories map raw Supabase errors to friendly messages. `"account_not_configured"` → specific UI. Edge-function errors via `BaseRepository.handleFunctionsError`, never raw `handleError` (#40).

## 4. Project Shape
**SubsTrack** — multi-tenant subscription management for small businesses (ISPs, gyms, delivery) collecting monthly fees. Staff manage customers, assign plans, record monthly payments. Paid vs overdue = **dynamically generated month grid — months never stored, only payments.**
- `SubsTrack/` Expo, tenant-facing (admin + user roles). `SuperAdmin/` Expo, internal for the SaaS owner.
- `Portal/` — READ-ONLY customer portal, React + Vite + Tailwind (NOT Expo). Writes nothing, no Supabase client; same pure `Shared/` logic via `@shared/*`, no stubs. One read: public `customer-portal` edge function, the ONLY thing that can scope a read to one customer.
- `Web/` — staff desktop app (React + Vite + React Router + MUI v9 + MUI X), own package; Shared services/stores + `createSupabaseRepositories()` (no offline layer). **Read `docs/web-app.md` first.** Musts: module folders = SubsTrack layout; pages + roles = ONE list `appPages.ts`; logout only via `endWebSession()`; every list = `DataTable` (fixed `viewKey`) over a `createPagedStore()` store on `I*Repository.findPage()`; writes go through the Shared slice, then patch the row or mark stale — never a reload per door; every door = the SAME Shared hook the phone runs.
- Every row/selection menu = ONE pure Shared fn returning `MenuItem<K>[]`; apps add icons + handlers only. Page roles = Shared `pageAccess.ts`; data → colour = Shared fn returning a `Tone`; admin forms = Shared `<module>Form.ts`.
- Also: `sql scripts/`, `new-features.md` (backlog), `Design/`, `QA/`, `tests/` (Jest, money rules).

**`Shared/`** = every layer below screens, imported as `@shared/*`. **Source-only folder, NOT an npm workspace** (hoists native packages → OTA fingerprint, #53). Libraries are `peerDependencies`; each app resolves ONE copy. Detail: `docs/architecture.md`.
- Shared **never imports** `react-native`, `expo-*`, `@react-native*`, `@/…` or any app file (guard test). Platform pieces arrive once via `configureShared()`; read `runtime()` only inside a function, never at module load.
- **No barrels in Shared** — deep imports only. SubsTrack module `index.ts` barrels export **UI only**; logic always from its `@shared/…` file.
- `@edge/*` → `SubsTrack/supabase/functions/_shared/*`, **zero-import** files only. SubsTrack keeps the UI + whole **offline layer**.

**Nothing may be added to `SubsTrack/package.json`** for the portal or `Web/` — its `scripts` + dependency tree feed the OTA fingerprint (#53).

**Stack**: RN 0.86.3 + Expo SDK 57 (React 19.2, Hermes v1, New Architecture only) · Expo Router 57 (never import `@react-navigation/*` — use `expo-router/react-navigation`) · Zustand 5 + immer · NativeWind 4 · Supabase · TS 6 strict · i18next (en/ar, RTL) · sheets via `@expo/ui` (#45). `react-native-gesture-handler` intentionally **3.x** (#140). tsconfig `paths` pins `i18next` + `@supabase/supabase-js` (#188). SuperAdmin still SDK 54.

Commands (`docs/build-and-release.md`): `npx expo run:android` — **dev client required, Expo Go redboxes**. OTA: `npm run ota-prod`. Rebuild only when something **native** changed. `.env` = local dev only; EAS reads its environment's variables (#187).

## 5. Architecture (MANDATORY)
Layers, dependencies **downward only**: Presentation → State → Business Logic → Repository → Database; Core imported by all.
- **L1 Presentation** — screens, components, UI-only hooks; zero business logic, zero Supabase. Only layer in the apps; L2–L5 in `Shared/src/`.
- **L2 State** — Zustand slices + immer; data + `loading`/`error`/`quotaError`; async actions call **services, never repositories**.
- **L3 Services** — pure TS classes, no React/Supabase; all validation, transformation, decision logic; domain models or typed errors out.
- **L4 Repository** — **only** layer importing Supabase; snake_case ↔ camelCase; extends `BaseRepository`.
- **L5 Core** — types, interfaces, constants, utils; imports from none.

**Offline-first (native only; web talks to Supabase directly).** All in SubsTrack (`*.offline.ts` twins + `core/offline/`); services, slices, UI untouched; platform switch = ONE place (`configurePhone.ts`). Mirror returns the **same `Db*` row shapes**. Writes set `_dirty = 1`; sync pushes, then pulls — **latest `updated_at` wins**. An un-pushed row is the only copy of that money → every trigger pushes. Online-only ops throw `RequiresConnectionError` offline. **Read `docs/offline.md` before touching any repository or the sync engine.**

**State rules** (detail `docs/architecture.md`):
- Slice arrays named `items`. **Always pass a selector** — subscribing to a whole slice is banned. Global store via `getStore()`.
- **Global only if something OUTSIDE the module reads it** — (a) another slice via `get().<slice>`, or (b) 2+ modules' screens. Else module store. **ONE-WAY**: module store may read global, never the reverse. Imported by its own path, never a barrel.
- A module store MUST register in **both** `storeReset.ts` and `refreshActiveData.ts` — missing the first leaks the previous tenant's data to the next login; the second leaves stale pre-sync rows.
- **A write PATCHES the store from what it returned — never re-fetches.** Full `fetchX` only on arrival (mount, focus, pull-to-refresh, post-sync); **changing a VIEW over held data is not an arrival** (#121). Deliberate re-reads: voiding a **month bill** or a **sale**, any filtered/searched list. What a write can't patch it **announces** — bump `ledger.owedVersion` (`useOwedChanged(reload)`). Never subscribe a screen that writes in a loop.
- **"Ensure loaded" guards on a `loaded` flag, never `items.length`.**
- Persist only in `uiPrefStore.ts` + `languageStore.ts`. **Display currency is NOT there** — `tenant_settings` (`useDisplayCurrencyId`).

## 6. Data Models
Domain types (camelCase) `Shared/src/core/types/index.ts`; DB rows (snake_case) `Shared/src/core/types/db.ts`, **never leave repositories**. Short forms below — full text: `docs/domain-notes.md` → Core model.

**Ledger**
- **`charges`** = what is OWED (kind `month`|`sale`|`manual`), amount frozen; paid = `SUM(collection_items)`, never a column.
- **`collections`** = ONE cash hand-over in **one currency** (#108); collect shows each owed currency in its OWN units, **never converted** (#108b). Only custody in the schema (`held_by_user_id`). **`collection_items`** = which bill each slice paid.
- **Waterfall**: bills **oldest `due_date` first, each completely**, never proportionally; fixed 4-level sort → preview = save; overpay refused; order is **shown**.
- **A month has no bill until money reaches it.** `getOwed` merges stored charges + virtual months: PAID bill wins, EMPTY bill loses to the virtual month at THAT month's price (#106b, #185). Collecting uses `deterministicId(line, month)`.
- **OWED vs DEBT**: debt = `kind !== 'month' || paid > 0`; **a fully unpaid month is OWED, NOT a debt**. To collect page, Total to collect, every per-customer figure = owed (#184, #193). Debt-only: Debts tile, Reports Debts, Write off all (#106c).
- **Void vs write-off** exclusive: void = MISTAKE, write-off = REAL but lost; a dead bill still owns its month (#115) → money arriving **revives it first**. Never-paid month written off = bill raised ALREADY written off (#186). Written-off stays reachable + undoable (#152), never in a total.
- Owed = **ONE query** `findOpenWithPaid` (#118). A write **returns what it WROTE** (#119).
- **Two void doors** (#109): void a **payment** → bill stays owed; void the **bill** → its cash goes too (confirm names other bills it un-pays, #125). Month bill void NEWEST-FIRST. Hand-overs voided in ONE write.
- **Correct amount** = void + re-record in ONE `replace`, keeping date, collector, currency, rate, **custody** (#171); never a fresh `create`.
- Line with **no set price** → OPEN item, typed amount IS the bill (#112).

**Easy to get wrong**
- **Dashboard revenue = CASH COLLECTED, never billed value** — one row per BILL SETTLED (#107).
- **Stock computed** = `SUM(stock_movements.quantity_delta)`, never a counter; manual entry only ADDS (#94/#96); oversell block advisory.
- **Sale holds no money** (owes via `charges`, paid via `collections`). Service line: no stock/cost/quantity, never its own money stream (#97). Edit = three tables, three rules (#90); lowering collected rebuilds cash (#111).
- **A sale's total is TYPED** (#142): `SaleService.totalOf()` decides money; nothing writing money calls `lineSumOf`; zero lines OK; total ≠ line sum → confirm, never refuse.
- **Sale identity = receipt number** `receiptId()`; **no sequence column, must not be one** (offline).
- **PostgREST `or()` names only the queried table's columns** — pre-query ids, **never `customers!inner`** (drops walk-ins); typed terms → `sanitizeSearchTerm()`.
- **Expenses = stored rows + DERIVED stock purchases**; restock never writes an expense (#88/#89).
- **A line's price = `resolveLinePrice(line)`, NEVER `plan.price`** (#85). **A MONTH's price = `linePriceAt(line, month, history)`**, never today's (#185).
- **Custody** from non-voided `held_by_user_id`; cash moves **UP** only; rules in `wallet/utils/custody.ts` — **never derive a wallet permission from `role` alone**.
- **Audit trail written by the APP, never a Postgres trigger**; append-only.
- **Reports** aggregate in memory, re-implement no rule; **no charts, no chart library**; period scopes CASH, never debt (#91).

## 7. Month Grid (critical)
`monthStatus.buildMonthGrid(customerPlan, bills, skips, year, unpaidRule)` = **single source of truth** for month status; no other file may reimplement it. Pure, no I/O. One grid per **service line** (`CustomerPlan`). Full rules: **`docs/month-grid.md`**.
```
1. month < line.startDate                  → "before_start" (gray, non-tappable)
2. MONEY reached the month (collected > 0) → "paid" (INCLUDING partial)
2b. bill written off, no money             → "written_off" (owes nothing; #186)
3. active skip covers the month            → "skipped" (money outranks a skip)
4. month in the future                     → "future"
5. CURRENT month + 'customer_start_day' rule
   + today < line's start day-of-month     → "future" ("not due yet", still payable)
6. otherwise                               → "unpaid"
```
- Months **never stored**; **keys off MONEY, not row existence**. Partial → `"paid"`, **no `"partial"` MonthStatus**. **No grace period.**
- **Read NOT year-scoped** — year arrows re-derive, never re-query (#121); never build a grid inside a write.
- Unpaid rule decides two things (#83): `isNotDueYet()` (colour) vs `isNotLateYet()` ("Overdue") — only in `monthDueRules.ts`.
- **Pay OLDEST FIRST; "earlier" = UNCOVERED, not merely overdue** — never feed the gate `unpaidBillingMonths` (#81b). **Void NEWEST FIRST**; paid line's start date + plan FROZEN; **unskip follows the VOID rule** (#84).
- Service line owns the ONLY start date (`customers` has none).
- `buildCustomerStatus(...)` = only place a list badge is decided; **"Paid" = owes nothing**, never with "Overdue"; unknown → no pill. Every list filter = ONE helper `customerFilters.ts`, phone AND server.
- Month rules read "today" ONLY via `currentDate()` — server clock is UTC (#173).

## 8. Database Changes
`sql scripts/script.sql` = **full schema**, every statement idempotent, only ever **ADDS**. `sql scripts/migration.sql` = **one-time** statements a fresh DB must never run — growing log (append under a dated `-- ----` header, never rewrite, every entry guarded), runs **BEFORE** `script.sql`. No SQL in chat, no new `.sql` files. Full rules: `docs/db-schema.md` → Changing the schema.
- **Fresh-DB-safe → `script.sql` only**: new table, column, index, policy, trigger, function.
- **One-time → `migration.sql` only**: drop constraint/column/index/policy, update rows, backfill, drop an old function signature.
- **Non-additive → BOTH** (rename column, change type, edit a multi-column constraint): `script.sql` = NEW shape, `migration.sql` = one-off `ALTER`/`DROP`.
- Every table: `CREATE TABLE IF NOT EXISTS <t> ();` then one `ALTER TABLE <t> ADD COLUMN IF NOT EXISTS …;` per column — **no column list**. `NOT NULL` needs a `DEFAULT`. Multi-column constraint → guarded `DO $$` block; to change one, NEW name in `script.sql`, drop the old in `migration.sql`.
- **Mirror every column change in `SubsTrack/src/core/offline/db/tables.ts`**. Non-additive is NOT reconciled on the device — say so, give the one-off statement.
- Tell the user: run `migration.sql` **first**, then `script.sql`; nothing appended → `script.sql` alone.

## 9. Before you write code
**§1.1 — zero inline comments.** The codebase is full of them and is wrong. Don't copy it.
