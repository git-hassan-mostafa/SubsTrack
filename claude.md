## Cluade aknowledgment instructions

- Do not re-explore the codebase at the start of new sessions. Treat CLAUDE.md as the source of truth for project context and start from it directly.
- Whenever any architecture or context changed in this project, update CLAUDE.md to reflect it — and the matching detail file under `docs/` (see **Detailed Reference Docs** below) when the change touches an area documented there. Keep this lean core authoritative for the big picture; push exhaustive detail into `docs/`.
- I am still in Development phase, so i am open to change architectures and DB schema if needed.

---

## Reporting Completed Work

After completing a task, end the response with a `## Changes Made` section that lists only the final results:

- 3–5 bullets maximum, each a single short sentence.
- Cover only meaningful changes and outcomes — what changed, not how it was done.
- Use direct result statements; no "I updated / changed / completed" phrasing, no process, reasoning, progress updates, or commentary.
- No introductions, conclusions, filler, or self-referential statements.
- Plain, scannable language; include only what helps the reader understand what changed.
- Omit implementation details unless explicitly requested.

---

## Database Changes

Whenever a change to the database is needed:

`sql scripts/script.sql` is **both the full schema and the migration**: every statement is idempotent, so re-running the whole file on a live database brings it up to date. There is **no separate migration script** — do not write one in the chat and do not create new `.sql` files (`sql scripts/` holds only `script.sql` and `reset.sql`).

1. **New column on an existing table → `ALTER TABLE <t> ADD COLUMN IF NOT EXISTS …`**, added to the "Columns added after the initial schema" block directly under that table. **Do NOT also add it to the table's `CREATE TABLE`** — one declaration only; a fresh DB gets it from the same `ALTER`. `NOT NULL` needs a `DEFAULT`. Multi-column constraints need a `DO $$ … pg_constraint …` guard; a UNIQUE rule is simpler as `CREATE UNIQUE INDEX IF NOT EXISTS`.
2. **New table / index / policy / trigger / function** → edit `script.sql` in place, keeping it re-runnable (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS` before `CREATE POLICY`).
3. **Mirror any column change in `SubsTrack/src/core/offline/db/tables.ts`** — the native app's local SQLite schema. It self-heals the same way: `applySchema.ts` creates missing tables and `ALTER`s in missing columns on every app start, so editing the descriptor is the whole local change. Non-additive changes (drop/rename a column, change a type or table constraint) are NOT reconciled on either side — say so and give the one-off statement.
4. Tell the user to run `script.sql` after the change.

---

## Detailed Reference Docs

This file is the lean core — always-needed context. Deeper detail lives in `docs/` and should be read and only read **on demand** when a task touches that area (don't read them all up front):

| File                                                   | Read it before…                                                        | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [docs/project-structure.md](docs/project-structure.md) | navigating to a specific file                                          | full directory trees for SubsTrack + SuperAdmin                                                                                                                                                                                                                                                                                                                                                                                                 |
| [docs/features.md](docs/features.md)                   | editing a feature's behavior                                           | multi-tenancy, branches, auth flow, multi-month, multi-currency, app options, tiers, products/sales (incl. the runtime-computed stock ledger), whatsapp invoices (wa.me receipt from the forms, quick pay, and the receipt sheets), transactions hub (Debts/Sales tabs; payments history moved to a quick-actions sheet), debts (runtime-computed customer ledger), collector wallet (runtime-computed per-collector cash-on-hand), regular customer, skipped months, payment scenarios, multiple plans per customer (service lines), audit trail (append-only, app-written) |
| [docs/gotchas.md](docs/gotchas.md)                     | editing payments / currency / branches / sales / revenue / signup / audit / invoice code | the 60+ non-obvious patterns & gotchas (with an area index at the top)                                                                                                                                                                                                                                                                                                                                                                           |
| [docs/edge-functions.md](docs/edge-functions.md)       | touching auth/user/tenant creation                                     | `create-user`, `update-user-password`, `create-tenant`                                                                                                                                                                                                                                                                                                                                                                                          |
| [docs/offline.md](docs/offline.md)                     | touching ANY repository, or the sync engine                            | offline-first (native): the platform-switch seam, SQLite mirror, `_dirty`-flag push / incremental pull sync (`sync.ts`), `pending_deletes`, latest-updated_at-wins conflict policy, the `pushOnly` / `appendOnly` / `pullDays` table flags                                                                                                                                                                                                                                                              |
| [docs/ota-fingerprint-mismatch.md](docs/ota-fingerprint-mismatch.md) | an OTA update never reaches the installed app            | the CRLF/LF fingerprint trap, the exact repair commands to run on the offending laptop, confirmed hash table, and the pre-publish routine                                                                                                                                                                                                                                                                                                                                                             |

When you need the exact current file layout, prefer a quick file search over trusting the tree in `docs/project-structure.md` — it can go stale.

---

**Stack:**

- React Native with Expo (latest SDK)
- Supabase (Auth + PostgreSQL + RLS)
- Zustand (state management)
- TypeScript (strict mode)
- NativeWind (Tailwind CSS for React Native — chosen for performance, zero runtime overhead, and excellent grid/layout support)

---

## Design Philosophy

Minimal, clean, and professional. The app is used daily by non-technical staff on mobile devices. Every screen must be immediately understandable. No animations, no decorative elements, no unnecessary complexity.

Priority order: clarity → speed → correctness → completeness.

---

## Project Overview

**SubsTrack** is a multi-tenant subscription management mobile application built for small businesses (ISPs, gyms, delivery services) that collect monthly fees from customers. Staff log in, manage customer lists, assign subscription plans, and record monthly payments. The system tracks which customers have paid and which are overdue using a dynamically generated monthly grid — months are never stored in the database, only payments are.

There are **two separate Expo React Native apps** in this workspace:

- `SubsTrack/` — The main tenant-facing app. Staff (admin + user roles) manage customers, payments, plans, and users.
- `SuperAdmin/` — A separate internal admin app for the SaaS owner to manage tenants and SaaS tiers (which configure user/customer limits, feature flags, prices).

Also in the workspace: `sql scripts/` (`script.sql` schema+RLS, `reset.sql` teardown), `new-features.md` (backlog), `Design/`, `QA/`. Full directory trees: [docs/project-structure.md](docs/project-structure.md).

---

## Running the Apps

Both apps share the same Supabase backend. Each has its own `.env` file with Supabase credentials.

```bash
# SubsTrack (main app)
cd SubsTrack
yarn install
yarn start          # Expo dev server (scan QR with Expo Go)
yarn android        # Android emulator
yarn ios            # iOS simulator
yarn deploy-create-user-edge-function    # Deploy Supabase Edge Function
yarn deploy-create-tenant-edge-function  # Deploy self-service tenant signup function (public, --no-verify-jwt)

# SuperAdmin
cd SuperAdmin
yarn install
yarn start
```

> **SubsTrack now requires a custom development build (dev client) — not Expo Go.** Since `react-native-keyboard-controller` (a native module) was added for keyboard handling, the app redboxes in Expo Go. For local dev use `npx expo run:android` / `npx expo run:ios` (or add `expo-dev-client` and build once); for distributables use the EAS profiles (`npm run build-preview` / `build-prod`). After pulling, run `npm install` first — the project actually uses `package-lock.json` (the `yarn` labels above are legacy; commands map 1:1 to `npm`).

**Environment variables** (create `.env` in each app folder):

```
EXPO_PUBLIC_SUPABASE_URL=<your-supabase-url>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

There is no automated test suite. Verification is manual via the running app.

### Releasing SubsTrack — OTA updates (EAS Update)

SubsTrack ships JS over the air. Default to an OTA publish; build only when something **native** changed.

```bash
npm run ota-prod                        # publish JS to the production channel (prompts for a message)
npm run ota-prod -- -m "fix debt tile"  # …or pass the message
npm run ota-preview                     # same, to the preview channel
npm run ota-fingerprint                 # print the local runtime fingerprint
npm run build-preview / build-prod      # full rebuild — only when the table below says so
```

| Ships over the air ✅                                                                 | Needs a rebuild + reinstall ❌                                     |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| anything in `src/` and `app/`, locale JSON, Tailwind styles, bundled `assets/`        | a new or upgraded **native** library or config plugin              |
| additive columns in the SQLite mirror `tables.ts` (`applySchema.ts` `ALTER`s them in) | Expo SDK / React Native upgrade                                    |
| new Supabase queries and edge-function call sites                                     | app icon, splash, permissions, `android.package`, `newArchEnabled` |

Postgres changes are server-side and unrelated — but run `script.sql` **before** publishing an update that reads a new column. Non-additive local-schema changes are still not reconciled on either side.

`runtimeVersion` is `{ policy: "fingerprint" }`: Expo derives the compatibility label itself and only matching builds receive an update, so a forgotten rebuild means "no update arrives", never a crash. **This is also the main trap** — `package.json` → `scripts` feeds the fingerprint, and so do the raw bytes of `eas.json` + `.gitignore`, which is why the repo root carries a `.gitattributes` (`* text=auto eol=lf`): EAS builds on Linux, so a CRLF checkout on Windows fingerprints differently and every OTA publish silently misses the installed build. Read gotchas #53 / #53b before changing scripts or native deps, or if an update never arrives. Channels live on the `eas.json` build profiles (`development` / `preview` / `production`); a build with no channel can never receive an update. Rollback with `eas update:rollback`, promote preview → production with `eas update:republish`.

In-app, `useAppUpdate` + `<UpdateBanner>` (mounted once in `app/(app)/_layout.tsx`) download in the background, re-check on every foreground, and show a "New version ready → Restart" pill. Both no-op on web and in dev builds.

---

## Tech Stack

| Layer         | Technology                                  |
| ------------- | ------------------------------------------- |
| Framework     | React Native 0.81.5 + Expo SDK 54           |
| Routing       | Expo Router 6 (file-based, typed routes)    |
| State         | Zustand 5.0.12                              |
| Styling       | NativeWind 4.2.3 (Tailwind CSS for RN)      |
| Database/Auth | Supabase (PostgreSQL + RLS + Auth)          |
| Language      | TypeScript strict mode                      |
| Localization  | i18next (English + Arabic, RTL support)     |
| Bottom sheets | @gorhom/bottom-sheet                        |
| Import alias  | `@/*` → repo root (e.g. `@/src/core/types`) |

---

## Architecture (MANDATORY)

Strict layered clean architecture. Dependencies flow **downward only** — no layer imports from a layer above it.

```
Presentation  →  State  →  Business Logic  →  Repository  →  Database
                                                              ↑
                                              Core (types/constants/utils — imported by all)
```

- **Layer 1 — Presentation.** Screens, UI components, UI-only hooks. Read store state, dispatch store actions. **Zero** business logic. **Zero** direct Supabase calls.
- **Layer 2 — State (Zustand slice pattern).** One global store assembled from per-feature slices in `src/state/slices/`, using `immer` middleware. Slices hold data + `loading`/`error`/`tierLimitError`. Async actions call **services, never repositories**. Components read through per-slice hooks (`useCustomerSlice`, …) **with a selector**. Cross-slice reads happen via `get().<otherSlice>` inside actions; slice files never import peer slices' creators or hooks (types only).
- **Layer 3 — Business Logic (Services).** Pure TypeScript classes. **No** React, **no** Supabase imports. All validation, transformation, decision/algorithm logic. Receives domain models, returns domain models or throws typed errors.
- **Layer 4 — Repository.** The **only** layer that imports Supabase. All DB calls + bidirectional mapping between DB row types (snake_case) and domain models (camelCase). Each repository ≈ one table. Extends `BaseRepository` (holds the supabase client + `handleError()` / `handleFunctionsError()`).
- **Layer 5 — Core.** Shared types, interfaces, constants, utils. Imported by all layers. Never imports from any other layer.

### Offline-First (native only) — the repository seam

The **native** app is offline-first; **web is unchanged** (talks to Supabase directly). This is contained entirely in the repository layer + `src/core/offline/`. Services, slices, and UI are untouched.

- Each repository file is a **platform switch**: `export default Platform.OS === 'web' ? new XxxRepository() : new OfflineXxxRepository()`. Both the Supabase class (unchanged) and `OfflineXxxRepository` `implements IXxxRepository` — the compiler keeps them in lockstep. Services import the default, so nothing above the repo layer changes.
- **Offline reads/writes hit a local SQLite mirror** (`expo-sqlite`) that returns the **same `Db*` row shapes** (incl. nested joins) the mappers already consume. Writes mutate the mirror and flag the row `_dirty = 1` (hard deletes are logged in `pending_deletes`). A small **sync** (`src/core/offline/sync.ts`) pushes every `_dirty` row (+ logged deletes) to Supabase, then pulls rows changed since one `last_pulled_at` timestamp — **latest `updated_at` wins**. Multi-device, bidirectional. No outbox, no cursors, no tombstones.
- **Online-only** (throw `RequiresConnectionError` offline, delegate to the Supabase sibling online): auth `signIn`/`getTenantByCode`, `User.create`/`delete`/`updatePassword` (edge fns), `Signup.*`, `Subscription.upgradeTenant`. Auth `getSession`/`getUserProfile`/`getTenant` are a read-through cache so the app boots offline after the first online login.
- Requires the Postgres changes now in `sql scripts/script.sql` (`updated_at` + BEFORE UPDATE triggers on every synced table) and a **dev-client rebuild** (native module).

**Full detail — read [docs/offline.md](docs/offline.md) before touching any repository or the sync engine.**

### State Management — key rules

- Arrays inside slices are named `items` (not `customers.customers`); other fields keep semantic names (`metrics`, `tiers`, `currentTier`, `monthGrid`, …).
- **Always pass a selector** in component bodies: `useCustomerSlice((s) => s.items)`. Subscribing to the whole slice (`const slice = useCustomerSlice()`) is **banned** — it re-renders on every change.
- The global store is stashed on `globalThis` (survives Metro Fast Refresh) via `getStore()` in [globalStore.ts](SubsTrack/src/state/globalStore.ts).
- **Two intentional exceptions** — standalone `persist`-middleware Zustand stores, kept out of the global store so domain state never accidentally persists: `src/shared/lib/uiPrefStore.ts` (last-used currency, `currentBranchId`) and `src/core/i18n/languageStore.ts` (en/ar). Both persist to AsyncStorage. The **display currency is NOT here** — it belongs to the organization, so it lives in `tenant_settings` (`useDisplayCurrencyId`).
- Tier/usage flow **into** actions as parameters from components; actions may still call `get().subscription.refreshUsage()` after a create. See the full slice template + tier-gating example in [docs/features.md](docs/features.md) → Subscription Tiers.
- **"Ensure loaded" actions guard on a `loaded` flag, never `items.length`.** Slices with a `getX()` companion to `fetchX()` (branches, currencies, customers, plans, products, users) carry `loaded: boolean` — set on a successful fetch, cleared in `reset()`. `getX()` returns early when `loaded || loading`. A length check re-queried on every caller for any tenant with **zero** rows (a fresh organization re-hit the DB on every form open), and made concurrent callers each fire their own fetch. `refreshActiveData` uses the same flag so an empty-but-visited screen still refreshes.
- **Never `// eslint-disable … react-hooks/*`.** `experiments.reactCompiler` is on, and one such comment switches React Compiler **off for the whole file** — silently losing auto-memoization on exactly the screens that need it. Slice actions are stable references, so just list them in the dep array. Full rules + the other compiler bail-outs (refs read during render, `try/finally`) in gotcha #52.

---

## Data Models

Domain types (camelCase) live in `src/core/types/index.ts` — used everywhere except inside repositories. DB row types (snake_case) live in `src/core/types/db.ts` and **never leave the repository layer**. Compact field reference (the source file is authoritative for exact shapes):

```typescript
type UserRole = "superadmin" | "admin" | "user";
type MonthStatus = "paid" | "unpaid" | "future" | "before_start" | "skipped"; // partial payments report as "paid" (remainder → debt); "skipped" = nothing expected, not payable

AuthUser     { id, username, fullName, role, active, tenantId, tenant, branchId /*null=tenant-wide admin*/, branch? }
AppUser      { id, username, fullName, phoneNumber, role, active, tenantId, branchId /*null=tenant-wide*/, createdAt }
Branch       { id, tenantId, name, active /*soft-delete*/, createdAt, updatedAt }
Tenant       { id, name, tenantCode, active, tierId, tier? /*joined from tier_plans*/, tierUpgradedAt, createdAt }
Currency     { id, tenantId, code /*e.g. LBP; USD never stored*/, name, symbol, ratePerUsd /*1 USD = N units*/, decimals /*0–6*/, active, createdAt, updatedAt }
TierPlan     { id, code /*free|pro|business*/, name, sortOrder, maxCustomers, maxUsers, maxPlans, maxBranches, maxCurrencies /*null=unlimited*/, multiCurrencyEnabled, multiMonthPlansEnabled, priceMonthlyUsd, priceYearlyUsd?, active }
TenantUsage  { customers, users, plans, branches, currencies }
TierResource = "customers" | "users" | "plans" | "branches" | "currencies"
Plan         { id, name, price, isCustomPrice, durationMonths /*1–12*/, currencyId /*null=USD*/, branchId /*null=SHARED*/, tenantId, createdAt }
Product      { id, tenantId, branchId /*null=SHARED*/, name, description, price, currencyId /*null=USD*/, active, stockOnHand /*DERIVED — ledger sum, no column*/, createdAt, updatedAt }
StockMovement{ id, tenantId, productId, quantityDelta /*signed, ≠0*/, reason: 'initial'|'restock'|'adjustment'|'sale', saleId /*only for 'sale'*/, note, recordedByUserId, occurredAt, voidedAt, voidedBy, createdAt }
Customer     { id, name, phoneNumber, address, area?, notes?, locationUrl /*raw Google Maps share link; open-in-Maps*/, active, isRegular /*subscription vs occasional*/, branchId /*null=UNASSIGNED*/, tenantId, startDate, cancelledAt, createdAt, updatedAt, customerPlans? /*service lines*/ }
CustomerPlan { id, customerId, planId /*null=custom/occasional line*/, startDate, cancelledAt, active, tenantId, createdAt, updatedAt, plan? } /*one service line; a customer can hold several, each paid independently*/
Payment      { id, billingMonth /*YYYY-MM-01*/, amountDue /*snapshot*/, amountPaid /*≤due; 0=unpaid slot*/, balance /*generated*/, durationMonths /*≥1*/, currencyId /*null=USD*/, ratePerUsdSnapshot /*frozen rate; USD=1*/, customerId, customerPlanId /*the service line*/, planId /*price snapshot*/, receivedByUserId, tenantId, paidAt, voidedAt, voidedBy, notes, remittedAt /*null=still in collector wallet*/, remittedBy /*admin who received the cash*/, createdAt }
SkippedMonth { id, tenantId, customerId, customerPlanId /*the service line*/, billingMonth /*YYYY-MM-01*/, skipped /*false = unskipped; the row is kept so the change syncs*/, note, skippedByUserId, createdAt, updatedAt }
MonthEntry   { year, month, label, billingMonth, status: MonthStatus, payment: Payment|null, isGroupSecondary /*true for months 2+ of a multi-month payment*/, balance, skip: SkippedMonth|null /*only when status === 'skipped'*/ }
TenantSetting{ id, tenantId, key, value, createdAt, updatedAt } /*per-tenant key/value config; tenant-scoped twin of AppOption, admin-writable*/
UnpaidStartRule = 'month_start' | 'customer_start_day' /*when the CURRENT month turns unpaid — see Month Grid*/
DashboardMetrics { totalCustomers, activeCustomers, monthlyRevenue /*= subscription + sales + debt; CASH COLLECTED, not billed*/, subscriptionRevenue, salesRevenue, debtRevenue, unpaidThisMonth, totalUsers, totalPlans, totalDebt /*NET debt still owed across all customers/categories, all-time — via DebtService.getDebtsView, not month-scoped*/, monthsDebt, salesDebt /*GROSS breakdown by category — these do NOT sum to totalDebt (net) and omit the custom category; the tile shows them anyway, by the owner's choice*/, walletCash /*collector-wallet cash not yet handed over, net USD — admin-only, 0 for non-admins (getMetrics(branchFilter, includeWallet))*/, walletCollectors, walletTransactions, newCustomersThisMonth, cancelledThisMonth, paymentsCollectedCount, salesCount, prevMonthRevenue, revenueTrend /*RevenuePoint[] — 6 months ending on the current month; the chart can page further back/forward via `DashboardService.getRevenueTrend(anchorYear, anchorMonth)` + the dashboard slice's `trend`/`trendAnchor`/`navigateTrend`, capped at the current month*/ }
RevenuePoint { month /*YYYY-MM*/, monthIndex, year, subscription /*USD*/, sales /*USD*/, debt /*USD*/, total /*USD = the three summed*/ }
```

> `products` + `sales` add a one-off ledger (separate from subscription `payments`). A **sale is a header (`sales`) + one or more product lines (`sale_items`)** — a customer can buy several products in one sale. The header carries the single sale-wide currency + frozen rate, the app-written summed `total_amount`, `amount_paid`, and a frozen `items_summary` (search + list/debt/wallet labels). `Sale` / `SaleItem` (domain) live in `src/core/types`. Their full shapes + behavior are in [docs/features.md](docs/features.md) → Products & One-Off Sales.

> **Product stock** is **computed at runtime**, never stored as a counter: `Product.stockOnHand = SUM(stock_movements.quantity_delta)` over the non-voided rows (the `product_stock` view on web, a `GROUP BY` on the SQLite mirror offline). Every product is tracked. Recording a sale appends one negative `'sale'` movement per line **inside the sale's own write** (offline: the same transaction); voiding a sale **soft-voids those movements** rather than inserting opposite ones, so a repeat void can't return the stock twice. Staff add stock through the product's **stock sheet** (`'restock'` / `'adjustment'`, each with a note + history), not by typing a total; a **batch restock sheet** (`ProductService.restockMany`, reachable from the products screen and the quick-actions menu) does the same for many products in one save — still one `'restock'` row per product. A sale that would oversell is **blocked in `SaleService.createSale`** — advisory only, since two offline devices can still each sell the last unit (see gotcha #48). Full behavior in [docs/features.md](docs/features.md) → Products & One-Off Sales.

> **Debts** (Transactions → Debts tab) is a per-customer accounts-receivable view. A customer's total debt is **computed at runtime**: `net = Σ(category debts) − Σ(debt payments)`. Categories: **months** (partial `payments` where `balance > 0`), **sales** (partial `sales` where `amount_paid < total_amount`), **services** (reserved, 0 for now), **custom** (the new `custom_debts` table). **Debt payments** (`debt_payments` table) are tied only to a customer and never modify the underlying payment/sale row. `CustomDebt` / `DebtPayment` / `DebtItem` / `DebtPaymentItem` / `DebtSummary` / `DebtCategory` live in `src/core/types`. Full behavior in [docs/features.md](docs/features.md) → Debts.

> **Dashboard revenue is CASH COLLECTED, never billed value** — one rule for all three streams: `payments.amount_paid` + `sales.amount_paid` + `debt_payments.amount`, each scoped by when the money arrived (`paid_at` / `sold_at`), summed in USD via the row's frozen rate. A partial payment or partial sale therefore adds only its paid part; the remainder is a debt and enters revenue in the month it's collected, so every collected amount is counted exactly once and nothing collected is lost. `salesCount` still counts every sale row — only the money is cash-based. Do **not** switch any revenue query back to `sales.total_amount` or `payments.amount_due`. Full detail in [docs/features.md](docs/features.md) → Products & One-Off Sales → Dashboard.

> **Collector Wallet** (Admin → Wallets; every user's own read-only view in Settings → My Wallet) shows the cash each user collected but has **not yet handed over** to an admin. Also **computed at runtime**, never stored as a balance: a collector's wallet = their non-voided, **unremitted** `payments.amount_paid` + `sales.amount_paid` + `debt_payments.amount`, grouped **per currency** (physical cash) and summed in USD via each row's frozen snapshot rate. Per-transaction settle: an admin marks rows received (stamps `remitted_at`/`remitted_by` on the source row — the only new columns, added to `payments`/`sales`/`debt_payments`), or "receive all" empties a collector's wallet at once. Void/edit of a source row self-corrects; a void + re-pay resets `remitted_at` to NULL. `WalletItem` / `WalletCurrencyTotal` / `CollectorWallet` / `CollectorWalletDetail` / `WalletSource` live in `src/core/types`; logic in `src/modules/wallet/services/WalletService.ts`. Full behavior in [docs/features.md](docs/features.md) → Collector Wallet.

> **WhatsApp Invoices** let staff send the customer a plain-text receipt over WhatsApp — from the **payment form** and **sale form** (a second, stacked "Save & send on WhatsApp" button), from **quick pay** (a "Pay & send" row in the month-cell and customer-card menus), from the **month-grid multi-select toolbar** (one invoice covering every selected month), and from the **saved receipt sheets** ("Send on WhatsApp"). It is one `wa.me` deep link via the existing `openWhatsApp` — no PDF, no native module, no DB change, so it ships over the air. Everything lives in `src/modules/invoicing/`: `utils/invoiceText.ts` holds **pure** builders that own the entire message format (`t` arrives inside an `InvoiceContext`, the `blockRangeLabel.ts` pattern), `hooks/useSendInvoice.ts` is the single seam that gathers the context from the stores and sends, and `components/SendOnWhatsAppButton.tsx` is the app's one green WhatsApp button. Amounts print in the **currency actually collected** (the row's frozen snapshot rate) with a `≈` display-currency suffix on the headline amount only; a multi-plan quick pay produces **one** message with a total **per currency**. No phone (or a walk-in sale) → the action is visible but **disabled with a caption**; a **voided** payment or sale never offers it. To supply the real receipt id, five `payments` slice actions now forward the created record(s) (`createPayment`, `createPayments`, `createMultiMonthPayment`, `createMultiMonthPayments`, `bulkPayCustomers`) — see gotcha #69 before adding state for it. Full behavior in [docs/features.md](docs/features.md) → WhatsApp Invoices; the traps are gotchas #68–#70.

> **Audit Trail** (Admin → Audit Log; a per-record **History** action on `PaymentDetailSheet`) is an **append-only** record of who changed what and what the value was before — nothing used to remember an edited `payments.amount_paid`, the exact fact a staff-vs-admin dispute turns on. **The app writes it, never a Postgres trigger**: a trigger fires only when the row reaches Postgres, so for an offline device it would stamp the sync moment and the syncing session instead of the real action and the real person. Each repository writes its own row via `BaseRepository.audit()` (online, never throws) / `OfflineBaseRepository.auditIn(db, …)` (native, inside the caller's `write()` transaction); an edit stores **only the changed columns**. Reads are **admins only** (RLS), locally a rolling 30-day window with the full history online-only on native. Builders in `src/core/audit/`, read side in `src/modules/admin/audit/` — both views (the admin screen and the per-record History sheet) render one presentational `<HistoryList>`; the screen's **filter session** lives in the `audit` slice (so it survives navigation and is cleared on logout), while **one record's** timeline lives in the local `useRecordHistory` hook. **Raw columns are stored, human text is shown**: a per-column **display registry** (`audit/utils/valueDisplay.ts`) maps a `(table, column)` to a label — coded values (`month_start`, `admin`) and id columns (staff, currency, branch) — falling back to the generic `formatValue` for anything unregistered; a column that needs a sibling to be readable (`tenant_settings.value` needs its `key`) is carried by `CONTEXT_FIELDS` outside the diff. Full behavior in [docs/features.md](docs/features.md) → Audit Trail; the traps are gotchas #57–#67.

### Database Schema (Supabase PostgreSQL)

| Table            | Key columns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenants`        | `id`, `name`, `tenant_code`, `active`, `tier_id`, `tier_upgraded_at`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `tier_plans`     | `id`, `code`, `name`, `sort_order`, `max_customers`, `max_users`, `max_plans`, `max_branches`, `max_currencies`, `multi_currency_enabled`, `multi_month_plans_enabled`, `price_monthly_usd`, `price_yearly_usd`, `active`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `app_options`    | `id`, `key` (unique), `value`, `description`, `created_at`, `updated_at` — **global** app-wide key/value config (e.g. `LiraRate`, `AllowPlanUpgrade`, `AllowSelfServiceSignup`, `SupportWhatsAppNumber`); NOT tenant-scoped. SuperAdmin writes (service role); read by **anon + authenticated** (anon needed because some flags gate pre-auth UI). Fetched at app bootstrap (not only post-auth) and intentionally **not** reset on logout. Read via typed hooks in `useOptionSlice.ts` (`useOptionValue` / `useBooleanOption` / `useCanUpgradePlan` / `useSelfServiceSignupEnabled` / `useSupportWhatsAppNumber`); for conditional UI wrap the element in the gate components `<CanUpgrade>` / `<CanCreateOrganization>` from `shared/components/FeatureGate.tsx`; keys live in `OPTION_KEYS` |
| `tenant_settings` | `id`, `tenant_id`, `key`, `value`, `created_at`, `updated_at` — **per-tenant** key/value config; the tenant-scoped twin of `app_options`. `UNIQUE(tenant_id, key)` (also the offline deterministic-id natural key). RLS: every tenant member SELECTs, **admins only** write. Synced like any tenant table. Keys live in `TENANT_SETTING_KEYS`; read via `useTenantSettingSlice` / `useUnpaidStartRule` / `useDisplayCurrencyId`. Current keys: `UnpaidStartRule` (`month_start` \| `customer_start_day`), `DisplayCurrencyId` (a `currencies.id`; blank/unset = USD) |
| `currencies`     | `id`, `tenant_id`, `code`, `name`, `symbol`, `rate_per_usd`, `decimals`, `active`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `branches`       | `id`, `tenant_id`, `name`, `active`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `users`          | `id` (= auth.users.id), `username`, `full_name`, `phone_number`, `role`, `active`, `tenant_id`, `branch_id`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `plans`          | `id`, `name`, `price`, `is_custom_price`, `duration_months`, `currency_id`, `branch_id`, `tenant_id`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `customers`      | `id`, `name`, `phone_number`, `address`, `area`, `notes`, `location_url` (raw Google Maps share link, nullable), `active`, `is_regular`, `branch_id`, `tenant_id`, `start_date`, `cancelled_at` (NO `plan_id` — a customer's plans live in `customer_plans`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `customer_plans` | `id`, `customer_id`, `plan_id` (null=custom/occasional line), `start_date`, `cancelled_at`, `active`, `tenant_id` — **one service line per row**; a customer can hold several plans, each paid independently. No own `branch_id` (RLS inherits the customer's).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `payments`       | `id`, `billing_month` (YYYY-MM-01), `amount_due`, `amount_paid`, `balance` (gen), `duration_months`, `currency_id`, `rate_per_usd_snapshot`, `customer_id`, `customer_plan_id` (the service line), `plan_id` (price snapshot), `received_by_user_id`, `tenant_id`, `paid_at`, `voided_at`, `voided_by`, `notes`, `remitted_at` / `remitted_by` (collector-wallet handover — also on `sales` + `debt_payments`)                                                                                                                                                                                                                                                                                                                                                                                 |

| `skipped_months` | `id`, `tenant_id`, `customer_id`, `customer_plan_id`, `billing_month`, `skipped` (bool toggle — `false` = unskipped, row kept), `note`, `skipped_by_user_id` — carries **no money**. `UNIQUE(customer_plan_id, billing_month)` (same natural key as `payments`, so offline derives a deterministic id and two devices converge). Branch inherited from the customer via RLS. |

| `audit_logs` | `id`, `tenant_id`, `branch_id` (denormalized from the row or its parent; NULL = tenant-wide — **no FK on purpose**: `ON DELETE SET NULL` would blank the trail when a branch is deleted), `table_name`, `record_id`, `action` (`create`\|`update`\|`delete`\|`void`\|`restore`), `before_data` / `after_data` / `changed` (JSONB — an **edit stores only the changed columns**), `label` (frozen one-liner), `actor_user_id`, `actor_username` (snapshot, survives user deletion), `occurred_at` (**device** clock = when staff acted, NOT sync time), `created_at`, `updated_at`. **Append-only, written by the app — never by a trigger** (a trigger would stamp the sync moment and the syncing session, and an offline device would keep no history). RLS: SELECT **admins only** (branch-aware), INSERT **every tenant member**, and **no UPDATE/DELETE policy** (service_role only). See [docs/features.md](docs/features.md) → Audit Trail. |

(`products` + `sales` + `sale_items` + `stock_movements` tables also exist — see [docs/features.md](docs/features.md) → Products & One-Off Sales. A sale is a **header + lines**: `sales` holds `items_summary`, `total_amount` (app-written sum, NOT generated), `amount_paid` (partial sales leave a debt), currency + rate snapshot, void/remit; `sale_items` holds one row per product (`sale_id`, `product_id`, `product_name_snapshot`, `quantity`, `unit_amount`; branch inherited from the parent sale via RLS `EXISTS`, `ON DELETE CASCADE`). Product delete-reference counts key off `sale_items.product_id`. `stock_movements` is the product stock ledger (`product_id`, signed `quantity_delta`, `reason`, `sale_id`, `note`, `recorded_by_user_id`, `occurred_at`, soft-void); branch is inherited from the parent **product** with SHARED semantics (`OR p.branch_id IS NULL`) — **not** `sale_items`' owned semantics, or every shared product would read as out of stock for a branch-scoped user. The `product_stock` view (`security_invoker`) sums it. `custom_debts` + `debt_payments` back the Debts tab. `exception_logs` (`id`, `tenant_id`, `user_id`, `username`, `source`, `message`, `stack`, `context`, `occurred_at`) is a native-only, push-only crash/error log — see [docs/offline.md](docs/offline.md) and Settings → Developer in [docs/features.md](docs/features.md).)

**Key constraints:**

- `UNIQUE(username, tenant_id)` on users
- `UNIQUE(tenant_id, branch_id, name)` on plans — same name can coexist as "Shared" + branch-specific (NULLs are unequal in PG)
- `UNIQUE(tenant_id, name)` on branches
- `UNIQUE(tenant_id, code)` on currencies; `code` is enforced uppercase and not 'USD'
- `UNIQUE(customer_plan_id, billing_month)` on payments — one payment per **service line** per month (was `(customer_id, billing_month)`); a customer with several lines can pay each line for the same month
- `plan_id` on customer_plans: `ON DELETE SET NULL` (deleting a plan leaves the line plan-less; payment history kept via `payments.plan_id` snapshot)
- `customer_id` on customer_plans / payments: `ON DELETE CASCADE`; `customer_plan_id` on payments: `ON DELETE CASCADE`
- `branch_id` on users / customers / plans: `ON DELETE SET NULL` (deleting a branch reverts records to "unassigned" / "shared")
- `currency_id` on plans and payments: `ON DELETE RESTRICT` (use `active = false` soft-delete on currencies instead)
- `product_id` on stock_movements: `ON DELETE CASCADE` (a never-sold product stays hard-deletable and takes its ledger with it); `quantity_delta <> 0`, and `reason = 'sale'` requires `sale_id IS NOT NULL AND quantity_delta < 0`. **No `on_hand >= 0` check** — the DB must accept whatever an offline device replays

---

## Critical Business Logic: Month Grid

**`PaymentService.buildMonthGrid(customerPlan, payments, skips, year, unpaidRule)`** is the **single source of truth** for month status. No other file may reimplement this. It builds the grid for **one service line** (`CustomerPlan`): `payments` are pre-scoped to that line and `customerPlan.startDate` sets the before_start boundary. A customer with several lines renders one grid per line (the payment slice keeps `monthGridsByLine`, keyed by line id).

```
Status algorithm per month:
1. month < line.startDate                                  → "before_start" (gray, non-tappable)
2. payment exists, voidedAt === null, amountPaid > 0       → "paid" (green for regular, yellow for non-regular) — INCLUDING partial payments (balance > 0)
3. an active skip covers the month                         → "skipped" (slate) — money always wins, so this ranks BELOW paid
4. month is in the future                                  → "future" (gray)
5. CURRENT month + 'customer_start_day' rule + today < the
   line's start day-of-month                               → "future" (gray) — "not due yet"; still payable
6. otherwise                                               → "unpaid" (red for regular, light gray for non-regular)
```

- Months are **never stored in DB** — generated dynamically from the payment list for a given year.
- Voided payments are invisible to the grid (treated as non-existent).
- **Partial payments look paid.** A payment with `amountPaid < amountDue` (`balance > 0`) still resolves to `"paid"` — the month/customer read as settled and the remaining amount is surfaced only through the **Debts** tab (never as a distinct month status; there is no `"partial"` `MonthStatus`). The owed amount rides along on `MonthEntry.balance` for drill-in views (`PaymentDetailSheet`, Payments-tab ledger, which read `payment.balance` directly). The payment form shows an inline notice that the remainder becomes a debt.
- **No grace period.** The current month is `"unpaid"` from its first day, so the customer-list red "Unpaid" badge (an _absence_ fallback — no payment recorded → red) always agrees with the grid. The tier `grace_days` setting was removed everywhere (DB column dropped); do not reintroduce a "not late yet" state without changing `buildMonthGrid`, the badge, and the dashboard tile together.
- **Per-tenant unpaid rule** (`tenant_settings.UnpaidStartRule`, admin-set in Admin → Tenant Settings; `'month_start'` default): under `'customer_start_day'` the CURRENT month is not overdue until each **line's own start day-of-month** arrives (clamped to the month's last day, so a 31st start still becomes due in February). It reports as `"future"` rather than a new `MonthStatus`, so the month stays payable and every existing colour map / selection guard keeps working. **Only the current month is affected** — past months are always due. The rule lives in ONE helper, `isNotDueYet()` in `src/core/utils/date.ts`, called only from `buildMonthGrid` — change it there, never in a caller. "This month is not due yet" and "older months are unpaid" are **two independent facts** and the card shows them as two separate pills ("Not due yet" + red "Overdue"), so neither can hide the other — see Customer-List Status below.
- Multi-month payments build a **coverage map**: each payment with `durationMonths > 1` covers consecutive months. Months 2+ in a block have `isGroupSecondary = true` and display "Included" instead of "Paid". A partially-paid bundle shows every covered month as `"paid"`.
- `customer.isRegular` controls cell colors and unpaid-banner visibility.
- **Skipped months** (`skipped_months` table) are months a line is **not expected to pay** — never unpaid, never overdue, and **never payable** (the UI offers "Unskip" instead, and a multi-month block covering one is refused). One row per `(customer_plan_id, billing_month)` with a `skipped` boolean toggle; unskip flips it to `false` and keeps the row so the change syncs. Any user can skip; an optional note says why. A customer whose **every** started line is skipped this month owes nothing, so the list shows a slate **"Skipped"** badge and the Unpaid tab drops them. Full behavior in [docs/features.md](docs/features.md) → Skipped Months.
- **Multiple plans per customer:** a customer holds 1..N service lines (`customer_plans`), each its own grid + independent payments. Lines are added / changed / removed from the **customer form's inline Plans editor** (`customerPlans.syncLines`); the payment panel's line selector is **view-only**. Status is **aggregated across a customer's active lines** by `PaymentService.buildCustomerStatus`: paid only when every DUE line has a covering payment (a partial payment counts as covered), overdue if any active line has an earlier unpaid month. A customer with **2+ due plans where some are paid and some are not** shows an amber **"N/M plans paid"** badge (`CustomerStatus.planCount`), so a partly-paid account never looks fully unpaid. Customer-list "Collect all due" pays every eligible fixed-price line for the current month at once. Full detail in [docs/features.md](docs/features.md) → Multiple Plans per Customer.

> Recording multi-month payments (`createMultiMonthPayment`, conflict resolution), the full payment scenarios (A/B/C/D, full vs partial, edit-payment re-snapshot), and the snapshot/currency rules are in [docs/features.md](docs/features.md) and [docs/gotchas.md](docs/gotchas.md).

### Customer-List Status (the card badges)

**`PaymentService.buildCustomerStatus(lines, payments, skips, unpaidRule)` is the only place a customer's list badge is decided**, and it derives everything from `buildMonthGrid` — the month rules exist once, nowhere else. It returns a `CustomerStatus`:

| Field | Meaning |
| --- | --- |
| `status` | **THIS month only**: `paid` · `mixed` (N/M plans) · `unpaid` · `skipped` · `not_due_yet` |
| `overdue` | **EARLIER months**: any active line still has an unpaid month before this one |
| `planCount` | `{ paid, total }` over the lines that are actually DUE this month |
| `notDueLineIds` | lines quick pay must not collect (already covered, or skipped) |

Four rules hold this together — breaking any one of them is how the badge went wrong before (gotcha #56):

1. **`status` and `overdue` are separate facts, never merged.** The card renders them as two pills, so "✓ Paid + Overdue" and "Not due yet + Overdue" both display truthfully. Only the plain red "Unpaid" pill is suppressed when `overdue` is set, because "Overdue" already says it.
2. **One query, one arrival.** `getCustomerStatuses(customers, rule)` fetches every active payment + skip **once** and builds the whole `Map<customerId, CustomerStatus>`. There is no second, slower scan that can contradict the first.
3. **Absence means "unknown", never "unpaid".** A customer missing from the map gets `status={null}` and the card shows **no** payment pill. The old red-by-absence default is what made loading states, new states, and half-loaded data all read as debt.
4. **No SQL mirror.** The repositories only supply rows (`findActivePayments`); the aggregation is not reimplemented in Postgres/SQLite, so there is nothing to keep in sync.

The slice holds one field, `customerStatuses`, refreshed by `fetchCustomerStatuses(customers)` (list mount/focus, after bulk pay or void, and when the unpaid rule changes) or patched for a single customer by `syncCustomerStatus` after a local mutation — valid because `findByCustomer` is not year-scoped, so the slice has that customer's full history.

---

## Styling

- NativeWind (Tailwind) classnames on all components. Design tokens in `src/shared/constants/colors.ts`.
- Custom `Text` component handles Cairo font for Arabic, system font for English.
- RTL support via `I18nManager`; language change triggers a full app reload (see gotcha #5).
- Keyboard avoidance uses `react-native-keyboard-controller`, **never** RN's built-in `KeyboardAvoidingView` (see gotcha #39).
- Entity list rows (customers, users, plans, branches, currencies, products, sales) share one shell: `<EntityCard>` (`src/shared/components/EntityCard.tsx`). It owns the common chrome — wrapper styling, the tap/long-press selection handshake, the icon-tile↔checkbox swap, and the trailing 3-dot menu — so each card only passes its icon (`icon`/`iconColor`/`iconBgClassName`), the `on*` callbacks, optional `dimmed`/`menuLoading`, and its body as children. Build new list cards on top of it; don't re-hand-roll the card skeleton.
- Web/desktop width is capped via `<ResponsiveContainer>` (`src/shared/components/ResponsiveContainer.tsx`) — wraps each screen's body (and each page-sheet form) in a centered, max-width column. It's a no-op on phones (always narrower than the cap), so phone layout is unaffected; it only kicks in on wide viewports. Centered dialogs (`ConfirmDialog`, `UpgradePromptModal`) cap themselves inline with a `max-w-*` class instead. Bottom sheets cap to the **same 768px column on web** — `AppBottomSheet` sets `width` + auto side margins on Gorhom's hosting container (see gotcha #45); native sheets stay edge-to-edge.
- All sheets are `@gorhom/bottom-sheet` (v5), built on one core: `<AppBottomSheet>` (`src/shared/components/AppBottomSheet.tsx`) wraps a Gorhom `BottomSheetModal` (rendered via the `BottomSheetModalProvider` at [app/\_layout.tsx](SubsTrack/app/_layout.tsx)) and bridges the app's declarative `visible`/`onDismiss` to Gorhom's imperative `present()`/`dismiss()`. Gorhom provides drag-down / backdrop-tap close for free; **Back is wired by the app** — `useAndroidBackDismiss` (native) + `useWebBackDismiss` (web), both for every variant, because Gorhom v5 ships no `BackHandler` of its own and Back must never reach the router while a sheet is open. Every sheet passes `enableContentPanningGesture={false}` so its body scrolls normally, and `android_keyboardInputMode` is `adjustPan` (never `adjustResize` — the app is edge-to-edge, so the window never shrinks). **No native rebuild was needed** — it rides on the already-installed reanimated + gesture-handler. Two public wrappers:
  - `<BottomSheetScaffold>` (`variant="auto"`, content-height) — transient tap-outside popups: `Dropdown`/`DropdownModal`, `DatePickerInput`, `CurrencyInput`, `AsyncEntityPicker`, `ActionMenu`. Stays out of web browser-Back history (closes by tapping the backdrop).
  - `<FormSheet>` (`src/shared/components/FormSheet.tsx`, `variant="full"` ≈ 92% snap) — every form / detail sheet, owning the shared chrome (Gorhom handle + header of title + one dismiss action + a `BottomSheetScrollView` body in `ResponsiveContainer`). **Replaced the deleted `SheetModal`.** On web, browser Back closes it via `useWebBackDismiss`. Sheets with a non-standard body (`DebtHistorySheet`, `DebtorDetailSheet`, the Wallets collector sheet) build on `<AppBottomSheet variant="full">` directly.
    **The body renders one frame after the chrome** (`useAfterFirstFrame`) so the slide-up isn't blocked by the form's own render — Gorhom can't start animating until native has laid the sheet out, and that can't happen while JS is rendering. Only valid for FIXED-snap sheets; never defer a content-sized `auto` body. Always-mounted sheets must pass their visibility. See gotcha #51.
  - **Sheet headers are a second drag handle.** `<SheetDragArea>` (`src/shared/components/SheetDragArea.tsx`) wraps a header row and re-attaches Gorhom's **handle** pan gesture to it, so the sheet drags (and pans down to close) from the whole title bar instead of only the thin grey handle. Content panning stays off app-wide (it freezes bodies — gotcha #45), and the header holds no scrollable, so nothing is stolen from a list. Already applied to `FormSheet`, `DropdownModal`, `CurrencyInput`, `DatePickerInput`, `AsyncEntityPicker`, and the four sheets built on `AppBottomSheet` directly. Use it on **headers only** — never around a list, since the handle gesture ignores scroll offset. A body with **no** scrollable is the exception: `ActionMenu` wraps its whole menu (title + rows) and passes `activationDistance={12}` so a sloppy tap still presses the row.
  - **Closing a dirty form asks to discard — wired once, not per form.** `AppBottomSheet` takes a `dirty` prop and routes **every** close path (header button, Android/browser Back, drag-down, backdrop tap) through `useUnsavedChangesGuard`, which awaits the global `confirm()` dialog. A form only reports whether it has been edited: `useDirtyForm(form)` (or `useDirtyForm({ a, b }, ["ignoreKey"])`) diffs against the first render's values, and `FormSheet`/`AppBottomSheet` take it from there. Include **only user-entered fields** — async-loaded data, busy flags, nested-sheet open flags and search terms cause false prompts, and so does any field a child seeds after mount (`CurrencyInput`'s last-used currency, `SaleItemsEditor`'s cart object). Read gotchas #54 / #55 before touching the guard, the back hooks, or a dirty check. QA: [QA/unsaved-changes.md](QA/unsaved-changes.md).
  - **Text inputs inside a sheet must be `BottomSheetTextInput`** (that's what makes the sheet lift/shrink for the keyboard) — `Input`/`CurrencyInput` swap automatically via `useSheetTextInput()`. Fixed-snap bodies (`FormSheet` / `variant="full"` / `auto scrollable`) can be plain or Gorhom lists, and dual-context bodies pick their scroll via `useSheetScrollView()`; a **content-sized (`auto`) body must be a PLAIN RN list** — a Gorhom scrollable overwrites the sheet's measured content height, so the sheet opens too short and clips its last rows (gotcha #47). Both hooks read `InsideBottomSheetContext`. **Confirmations / message dialogs (`ConfirmDialog`, `UpgradePromptModal`) stay CENTERED** RN `Modal`s — not sheets. Build new pickers on `BottomSheetScaffold`, new forms on `FormSheet`. See gotchas #44 / #45 / #47.
- `<PageHeader>` (`src/shared/components/PageHeader.tsx`) is on every screen and carries a top-right **3-dot quick-actions menu** — app-wide shortcuts (Payments history / Add customer / Record sale / Add custom debt / Record debt payment / Batch restock — admin-only). It's a UI-only global-store seam mirroring `confirm`: the menu flips the generic `ui` slice (`src/state/slices/ui/`, the home for ephemeral cross-screen UI state — distinct from the persisted `uiPrefStore`) and the sheets are hosted once by `QuickActionSheets` (`src/modules/quick-actions/`) in `app/(app)/_layout.tsx`. "Payments history" opens `PaymentsHistorySheet` (the full payments list, moved out of the Transactions tabs). Pass `hideQuickActions` to suppress it. Detail in [docs/features.md](docs/features.md) → Debts / Transactions Hub.

---

## Error Handling

- All async store actions wrap in try/catch → set `error: string | null`.
- Screens display errors via `<ErrorBanner>` — inline, **never** toast/alert.
- `clearError()` is called on user input or form unmount.
- Raw Supabase errors are caught in repositories and converted to user-friendly messages.
- `"account_not_configured"` is a special error code from AuthService that triggers specific UI.
- Edge-function errors go through `BaseRepository.handleFunctionsError`, never raw `handleError` (see gotcha #40).

---

## Code Quality & Architecture

- Write clean, readable, maintainable code — clarity beats cleverness. If the cleanest scalable solution is a big change, do it rather than a band-aid fix.
- Follow SOLID strictly: **S** one responsibility per file/class/function · **O** extend without modifying working code · **L** subtypes substitutable for base types · **I** small focused interfaces · **D** depend on abstractions, not concretions.

### Dependencies

- Introduce a library only when it meaningfully reduces complexity or risk; prefer well-maintained, widely adopted packages that fit the existing ecosystem (size, maintenance, license, TS support). Always check if a suitable library is already installed first.

### Simplicity

- Default to the simplest solution that correctly solves the problem — avoid over-engineering and premature abstraction. If logic feels complex, stop and rethink; there's almost always a simpler path. Write code a new team member could understand without explanation.

### Consistency

- Before implementing, scan the surrounding codebase for existing patterns, naming, and structure, and match them. When in doubt, prefer consistency with existing code over personal preference. If an existing pattern looks like an anti-pattern, flag it with a comment rather than silently diverging.

### Comments

- Keep comments **brief, plain, and meaningful** — one short line that explains _why_ (the intent or the non-obvious gotcha), not _what_ the code already says. Avoid long paragraphs, restating the code, and redundant noise.
- If a comment needs many lines to explain a rule, that detail belongs in the matching `docs/` file — link to it from a short in-code note instead of pasting it inline.
- When editing a file with existing over-long comments, trim them to this style as you go.

### QA

- When any new scenario is added, add the test-plan scenarios for it under `QA/`.

---

## Critical Non-Negotiable Rules

1. **Month status logic lives ONLY in `PaymentService.buildMonthGrid()`** — never reimplement elsewhere.
2. **`tenant_id` always from the Supabase JWT** — never from client-supplied input.
3. **DB row types (snake_case) never escape the repository layer.**
4. **No business logic in components or stores.**
5. **No direct Supabase calls outside the repository layer** (the offline **sync engine** in `src/core/offline/sync/` is the one sanctioned exception — it is the replay/pull bridge to Supabase; see [docs/offline.md](docs/offline.md)).
   5b. **Native repositories are a platform switch** (`Platform.OS === 'web' ? Supabase : Offline`). Never call `new XxxRepository()` directly from a service/slice — import the default. Both impls must `implements IXxxRepository`; a change to one's method surface must change the interface (and thus the other).
6. **RLS enforces multi-tenancy** — app-level filtering is secondary.
7. **No hard deletes** — use `voided_at` for payments, `active = false` / `cancelled_at` for customers (and `active = false` for branches/currencies/products).
8. **Payment amount is a snapshot** — never recompute from `plan.price` after recording.
9. **All app state lives in one global Zustand store** assembled from per-feature slices in `src/state/slices/`. Slice files may import peer-slice _types_ but never their creators or hooks. Cross-slice reads happen inside actions via `get().<otherSlice>`. Caller-supplied data (tier, usage, currency) still flows in as parameters from the component.
10. **All errors caught and stored in state** — never surface raw Supabase error messages to the user.
11. **Tier limits enforced at the service layer** — every `Service.createX()` calls `tierService.assertCanCreate(tier, usage, resource)` after `validate()`. `TierLimitError` flows through stores as a structured `tierLimitError` field; never parse error strings.
