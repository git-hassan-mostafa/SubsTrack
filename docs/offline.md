# Offline-First (native)

> Read this before touching **any repository** or the sync engine. Referenced from `CLAUDE.md`.
> Native only — on web (`Platform.OS === 'web'`) every repository talks to Supabase directly, exactly as before. Zero web behavior change.

## Why / what

Staff collect payments in the field with unreliable connectivity. The native app therefore works **fully offline** (reads + all tenant-table CRUD) and syncs to Supabase in the background. The change is confined to the **repository layer** + a small infra folder `src/core/offline/`; services, slices, and UI are untouched.

## The seam

Each repository file (`XxxRepository.ts`) is a **platform switch**. The Supabase class stays in that file (`export class … implements IXxxRepository`); a sibling `OfflineXxxRepository` (in `XxxRepository.offline.ts`) implements the same interface against SQLite; the interface lives in `IXxxRepository.ts`:

```ts
const impl: IXxxRepository =
  Platform.OS === 'web' ? new XxxRepository() : new OfflineXxxRepository();
export default impl;   // services & module index.ts import this — unchanged
```

Both classes `implements IXxxRepository` → the compiler guarantees they stay in lockstep. Offline classes return the **same `Db*` row shapes** (snake_case, incl. nested joins like `customer_plans(*, plans(*))`) the services' mappers already consume, so nothing above the repo layer can tell the difference. `PaymentService.buildMonthGrid` is pure, so the month grid works offline for free.

## The sync in one paragraph

Every local write flags its row `_dirty = 1` (created / edited / soft-deleted); a hard delete is logged in `pending_deletes`. A sync cycle is just: **push** — send every `_dirty` row up (upsert) and replay `pending_deletes` as real deletes; then **pull** — fetch rows the server changed since our single `last_pulled_at` timestamp and merge them in, newest `updated_at` winning. That is the whole engine — no outbox, no per-table cursors, no tombstones. It lives in one file, `src/core/offline/sync.ts`.

## `src/core/offline/` layout

| Path | Role |
| --- | --- |
| `platform.ts` | `IS_OFFLINE_CAPABLE = Platform.OS !== 'web'` — every offline path is gated on it. |
| `db/tables.ts` | **Single descriptor** of the local mirror (columns + types + scope). Drives DDL, encode/decode, and generic sync upserts — one source of truth. |
| `db/schema.ts` / `db/applySchema.ts` / `db/sqlite.ts` | DDL generated from `tables.ts` (`columnDefs`, `CREATE_TABLE_STATEMENTS`, `CREATE_INDEX_STATEMENTS`), the schema reconciler (`applySchema` — create missing tables, `ALTER` in missing columns, create missing indices; runs on every start, no version numbers), and the opened handle (`initOfflineDb`, `getDb`, `wipeOfflineData`). `sqlite.ts` is the **only** file with a *value* import of `expo-sqlite`; a sibling `sqlite.web.ts` stub (same export surface, no `expo-sqlite`) is what the web bundle resolves to, so Metro never pulls `expo-sqlite`'s wasm into web. All other `expo-sqlite` imports in the folder are `import type` (erased). |
| `db/codec.ts` | Row encode/decode (0/1↔boolean, TEXT-decimal↔number). |
| `db/dml.ts` | `insertDirty` / `updateDirty` / `upsertNaturalKeyDirty` (local write + `_dirty=1`), `markDeleted` (log a hard delete), and `upsertFromServer` (pull merge, `_dirty=0`). |
| `OfflineBaseRepository.ts` | Mirror of `BaseRepository`: handle, `handleError`, `branchWhere`/`combineWhere`/`searchWhere`, `all`/`first`/`count`/`decodeAll`/`rowsById`/`childrenByParent`/`referencedIdsIn`, and `write((db) => …)` (one local transaction — no outbox). |
| `sync.ts` | **The whole engine**: status (`SyncStatus`, `getSyncStatus`, `subscribeSyncStatus`), tiny `sync_meta` KV (`getMeta`/`setMeta`), `pushDirty`, `pullChanges` + `reconcileDeletes`, `runSync`/`syncNow`/`resyncFromScratch`/`startSync`. |
| `bootstrap/{offlineBootstrap,tenant}.ts` | `initOffline()` (kicked once from `app/_layout.tsx`) and `ensureTenantScope()`. |
| `ids.ts` | `newId()`, `nowIso()`, `deterministicId()`. |
| `net/connectivity.ts` | NetInfo wrapper. |

## Local store

- Mirror tables match `src/core/types/db.ts` **exactly** (snake_case). Money/rate columns are **TEXT (exact decimal)** — never SQLite `REAL` (float drift). Read via `Number()` (as the mappers do). **Numeric comparisons in SQL use `CAST(col AS REAL)`** (a TEXT column compared to `0` would otherwise compare by storage class, not value).
- `payments.balance` (a server-generated column) is **computed locally** on write, and **stripped before push** (`generated` in `db/tables.ts`) — Postgres rejects a value for a `GENERATED ALWAYS` column (SQLSTATE `428C9`). (`sales.total_amount` used to be generated too, but is now **app-written** — the summed line total — so it is NOT in `generated` and IS pushed like any normal column.)
- One local-only column per table: `_dirty` (1 while a write awaits push). Two tiny bookkeeping tables: `sync_meta` (`active_tenant_id`, `active_branch_scope`, `last_pulled_at`) and `pending_deletes` (`table_name`, `row_id`).
- No SQL foreign keys (rows arrive out of order on pull). The DB is **scoped to one tenant _and_ one branch view**; `ensureTenantScope(tenantId, branchId)` wipes + re-pulls on a different-tenant **or different-branch-scope** login, and **refuses the wipe while any un-pushed write remains** (a `_dirty` row or a `pending_deletes` entry) so data is never discarded silently. See **Tenant scope & logout** below for what happens when the wipe is refused.

## Tenant scope & logout

The mirror holds exactly one tenant's data **as seen through one branch view** and is **kept on logout** (never wiped) — this protects un-pushed offline writes and makes re-login by the same person fast (incremental sync, no full re-download). Login is online-only, so a full re-pull on every login would be wasteful anyway.

**Why branch view is part of the scope:** RLS returns a *different* row set to a tenant-wide admin (`users.branch_id IS NULL` → sees every branch) than to a branch-scoped user (sees only their branch). If the mirror weren't re-scoped when the branch view changes, a branch user's partial pull — and worse, `reconcileDeletes` comparing the server's branch-limited id list against the full local set — would **silently drop the other branches' rows**, and a later tenant-wide login would never re-pull them (the incremental cursor has already moved past them). So `ensureTenantScope` keys the mirror on **`tenant_id` + branch scope** (`BRANCH_SCOPE_TENANT_WIDE = '__all__'` for a tenant-wide admin, else the user's `branch_id`), stored in `sync_meta` as `active_tenant_id` + `active_branch_scope`. A change in *either* triggers the same wipe + full re-pull as a tenant switch.

- **Logout** (`OfflineAuthRepository.signOut`) does a **best-effort push while the session is still valid**: if there are un-pushed writes *and* the device is online, it runs one sync cycle before signing out (a clean logout stays instant — the check is skipped when nothing is pending). After sign-out the session is gone, so this is the only moment the current tenant's rows can still be pushed.
- **Same-tenant, same-branch-scope login** → keep data, incremental sync.
- **Different-tenant OR different-branch-scope login, nothing pending** → `ensureTenantScope` wipes the mirror and the login proceeds to a full re-pull for the new scope.
- **Different-tenant/branch-scope login while the previous scope still has un-pushed writes** → the switch is **blocked**: `getUserProfile` throws `OrganizationSwitchBlockedError` *before* caching anything, and `AuthService` signs the just-created session back out so nothing is half-applied. The user sees a localized message to sign back into the previous account and sync first. We can't wipe (money would be lost) nor push the old rows under the new session (RLS would reject them), so refusing is the only safe option. (Normally this never triggers, because the logout push already flushed the writes; it only happens after an **offline** logout with pending writes.)

## Writes

Every mutating offline method runs in **one SQLite transaction** via `write((db) => …)`:

- create / edit / soft-delete → `insertDirty` / `updateDirty` / `upsertNaturalKeyDirty`, which set `_dirty = 1`. That flag is the entire "needs push" intent.
- hard delete → physically `DELETE` the local row(s) **and** `markDeleted(db, table, id)` (an `INSERT OR IGNORE` into `pending_deletes`). Only the parent id is logged; the server's FK cascade removes children.

Inserts carry **client-generated ids** (`newId()`), so a push upsert-by-id is idempotent. **Payment, skipped-month and tenant-setting ids are deterministic** (`deterministicId(customer_plan_id, billing_month)` — the skip one prefixed `'skip'` so the two never collide; `deterministicId(tenant_id, key)` for `tenant_settings`) so two devices recording/skipping the same month, or setting the same option, converge instead of colliding on the natural-key UNIQUE.

`payments`, `skipped_months` and `tenant_settings` are the mirror tables with **two** UNIQUE constraints (their id + a natural key — `(customer_plan_id, billing_month)` for the first two, `(tenant_id, key)` for `tenant_settings`; all listed in `NATURAL_KEYS`), so `upsertNaturalKeyDirty` resolves the target row with a lookup instead of one `ON CONFLICT` clause — SQLite heals only the single target it is given, and a mirror row whose id and key have drifted apart otherwise makes the INSERT fail hard on `payments.id` (gotcha #49). It looks up the row by `(customer_plan_id, billing_month)` and `UPDATE`s it (keeping that row's id — it may have been created on the web with a random one), else inserts, falling back to a fresh `newId()` if the deterministic id is already taken by an unrelated row. It **returns the id actually stored**, which the repository echoes back on the created `DbPayment` — returning the intended id would hand the caller a Payment pointing at a row that isn't there, and its next void/edit would silently miss.

## Push — `pushDirty()` in `sync.ts`

1. **Upserts.** For each tenant table in parents-before-children order (`SYNC_PULL_ORDER`): `SELECT * WHERE _dirty = 1`, decode to the `Db*` shape, strip `updated_at` (server trigger owns it; it is null for locally-created plans) and any `generated` column, then `supabase.from(table).upsert(rows, { onConflict })` — `onConflict` is each table's natural key where it has one (`customer_plan_id,billing_month` for `payments` + `skipped_months`, `tenant_id,key` for `tenant_settings`) and `id` for everything else — `conflictTarget()` must stay in sync with `NATURAL_KEYS`, or a row that exists on the server under a different id inserts a duplicate and stalls the push on the UNIQUE index forever. On success clear `_dirty` for exactly those ids.
2. **Hard deletes.** For each `pending_deletes` row, `supabase.from(table).delete().eq('id', row_id)` (server FKs cascade to children); drop the log entry on success.

A row/table whose network call fails is simply left as-is (`_dirty` stays 1, or the delete stays logged) and retried on the next cycle. No backoff, no parking — the whole thing just runs again.

## Pull — `pullChanges()` + `reconcileDeletes()` in `sync.ts`

Read the single `last_pulled_at`. For each table in `SYNC_PULL_ORDER`: page through `updated_at > last_pulled_at` (server-authoritative via BEFORE UPDATE trigger), and for each row **skip it if the local copy is still `_dirty = 1`** (an un-pushed local edit wins until pushed), else `clearNaturalKeyDuplicate` (payments only: a local row holding this row's `(line, month)` under a **different** id would fail the merge on that UNIQUE index and stall the table's whole pull every cycle — the server wins, so the stale duplicate is dropped; if it is still dirty the server row is skipped and the next push converges the ids) and `upsertFromServer`. Track the newest `updated_at` seen and store it back as the new `last_pulled_at`. This is **latest-`updated_at`-wins**: we only fetch rows the server changed after our last pull, and never clobber a pending local edit (push runs first, so at pull time almost nothing is dirty).

**The cursor advances only after a FULLY successful cycle.** `last_pulled_at` is one value shared by every table, so it may move forward only once every table has been pulled up to that point. Each table's pull is wrapped in try/catch; a request error or merge failure marks the cycle incomplete and the cursor is **held at its old value** (the next cycle re-pulls from the same point — upserts are idempotent). Without this, a newer row from a table that succeeded would push the shared cursor **past** a failed table's un-pulled rows, and `updated_at > cursor` would hide them from every future pull — silently stranding whole tables (this was a real bug: one transient error on `branches`/`currencies` left them permanently at 0 rows). To repair a mirror already corrupted this way, use **`resyncFromScratch()`** (Settings → Developer → "Full re-pull"): it clears `last_pulled_at` and runs a normal push→pull, so local writes go up first and every row is re-pulled and re-merged (non-destructive — `_dirty` rows still win).

**Hard deletes done elsewhere** (web app / another device) leave no `updated_at` to pull, so `reconcileDeletes()` handles them: for the low-volume tables (`customers`, `plans`, `branches`, `currencies`, `products`) it fetches the server's id list (**paged** — an unpaged `select('id')` is capped at 1000 by PostgREST, and any id past the cap would look deleted and be wrongly dropped) and drops any local `_dirty = 0` row missing from it. Ledger tables (payments, sales, debts) are only ever soft-voided, so they're skipped. **It never mass-deletes on an empty server list** — an empty result is ambiguous ("all deleted" vs. "nothing visible because the session/RLS returned nothing"), so on empty-with-local-rows it skips rather than wipe the table.

**Two safety rails guard against a whole-mirror wipe:** (1) `runSync()` first checks `supabase.auth.getSession()` and **does nothing while signed out** — a logged-out pull returns empty rows (RLS, no error), which would otherwise let `reconcileDeletes` wipe every reconciled table (and, because `startSync`'s interval keeps firing after logout, that could happen unattended). (2) The pull pages with **offset paging over a stable `updated_at > cursor` predicate ordered by `(updated_at, id)`**, not keyset-on-`updated_at`: keyset would silently drop rows whenever >1000 rows share one timestamp — which the `updated_at` backfill migration (every existing row stamped with one transaction `NOW()`) and any bulk insert guarantee. A cycle that isn't fully successful reports `sync_incomplete` (so `syncNow()` returns `ok: false`) instead of claiming success.

**Push-only tables.** `TableSpec.pushOnly` (currently only `exception_logs`) makes `pullChanges()` skip that table entirely — its rows are pushed up like any other tenant table but never pulled back down. This is for write-mostly logs where pulling would just fill every device's mirror with every other device's rows for no benefit. Adding a new push-only table is a one-line `pushOnly: true` in `db/tables.ts`; no other engine change is needed.

**Append-only tables.** `TableSpec.appendOnly` (`audit_logs` + `exception_logs`) changes two things:

1. **The push passes `ignoreDuplicates: true`** → `ON CONFLICT DO NOTHING` instead of `DO UPDATE`. **This is load-bearing, not a tidy-up.** `_dirty` clears only on a successful reply, so a push that committed on the server but lost its response is re-sent, hits the conflict — and a plain upsert's `DO UPDATE` path is **refused forever by an insert-only RLS table** (`audit_logs` has no UPDATE policy, by design). That one row would then wedge its whole table's queue, and every later audit row behind it.
2. **Un-pushed rows do not block an organization switch** — `hasUnsyncedWrites` skips them. A log is not the user's money; refusing a login over a queued crash log is wrong. Setting the flag on `exception_logs` fixes exactly that pre-existing behavior.

**Windowed tables.** `TableSpec.pullDays` keeps only a rolling local window (`audit_logs`: 30, `AUDIT_LOCAL_DAYS`) — a device does not need a year of trail on disk, and the audit **reads go to the server anyway** (the window is their offline fallback, see features.md → Audit Trail). The pull adds `.gte('occurred_at', cutoff)`, and `pruneWindowedTables(db)` deletes older local rows. **The prune is guarded by `_dirty = 0`**: an un-pushed row is the ONLY copy in existence, so age must never delete it. It runs after each complete sync cycle **and** once at bootstrap, so a device offline for months still prunes.

**`ColType: 'json'`** — TEXT locally, `jsonb` on the server (the audit `before_data` / `after_data` / `changed` columns). `JSON.stringify` on encode; decode is a `try/catch JSON.parse` so a corrupt value becomes `null` instead of throwing mid-query.

**Audit trail (`audit_logs`).** Registered **last** in `SYNC_PULL_ORDER` (a table absent from that array is neither pushed nor pulled) with `appendOnly` + `pullDays: 30`. Rows are written by each repository — `OfflineBaseRepository.auditIn(db, input)` runs **inside the caller's own `write()` transaction**, so the change and its trail commit or roll back together. Never audit `upsertFromServer` (`db/dml.ts`): that is the pull merging the server's rows, not a user action, and auditing it would loop (pull → audit row → push → pull). Staff can INSERT but not SELECT audit rows, so a non-admin's pull legitimately returns none. **Reading is the one place the mirror is not the source**: `OfflineAuditRepository` queries Supabase and merges its own still-`_dirty` rows on top (they exist nowhere else until the push lands), using the local window only when the server is unreachable. See features.md → Audit Trail and gotchas #57–#63, #76.

The cycle is **push → then pull**, serialized (one in-flight run), and **gated on a signed-in session**. Triggers are deliberately calm: **once at cold start, once when connectivity returns, and every 5 minutes while the app is foregrounded** — not after each write, not on resume-from-RAM. Local writes land durably in SQLite and go up on the next tick.

## Refreshing the stores after a sync (UI refresh)

Sync pulls fresh rows into SQLite, but the **Zustand stores** were already filled from the old local data when each screen first loaded — nothing tells them to reload. `runSync({ refreshUi: true })` closes that gap: after a **fully-successful** pull it fires a registered callback that re-fetches the loaded stores. It fires only on the cases the user expects a visible refresh, **never on the calm background ticks** (which would reload the screen under the user's fingers):

- **Cold start** — `startSync()`'s first `runSync` passes `refreshUi: true`.
- **First data after login** — `OfflineAuthRepository.getUserProfile` passes it on the same-tenant background re-login pull (the `wasEmpty` first-login/switch case blocks on the pull first, so screens mount fresh and need no refresh).
- **Manual sync** — `syncNow()` and `resyncFromScratch()` (Settings → "Sync now" / "Full re-pull").

The interval and connectivity-returned triggers call plain `runSync()` (no refresh).

**Dependency inversion (core must not import state):** `sync.ts` exposes `setSyncRefreshHandler(fn)`; `app/_layout.tsx` registers `refreshActiveData` (from `src/state/refreshActiveData.ts`) **before** `initOffline()` (which kicks the first sync). `refreshActiveData()` always refreshes the dashboard (the landing screen) and re-fetches every list slice that already holds data (`items.length > 0` — a slice is only populated if its screen was opened, so this is "only what's on screen"), plus current-month payment flags / net-debt when customers are loaded, and tier usage. List fetches reset to page 1.

## Manual sync + observable status

`sync.ts` exposes an observable status (`SyncStatus = { syncing, lastSyncAt, lastError }`) via `getSyncStatus()` / `subscribeSyncStatus()` — `runSync()` broadcasts the transitions, so **every** cycle (manual or automatic) flips `syncing`. `syncNow()` is the manual UI entry point (probes connectivity first, returns `{ ok, offline }` so a button can tell "reached the server" from "no connection"). All re-exported from `src/core/offline/index.ts`; components read the status through the `useSyncStatus()` hook (`src/shared/hooks/`, `useSyncExternalStore`).

- **Global marker** — `SyncIndicator` (`src/shared/components/`) is mounted once in the authenticated layout (`app/(app)/_layout.tsx`), so a top-center "Syncing data…" pill appears on **all pages** while `syncing` is true. Renders nothing when idle or on web.
- **Settings** — a "Sync now" row (native only) triggers `syncNow()`; a brief bottom flash reports the one-off outcome (done / offline / failed).

## Conflict policy

**Latest `updated_at` wins.** Because push runs before pull and payment ids are deterministic, the common money ops are effectively conflict-free: a re-recorded month upserts onto the same row, voids are idempotent, and independent creates carry distinct ids. On pull, a row with an un-pushed local edit (`_dirty = 1`) is skipped so it is never overwritten before it syncs. Full per-field merge is out of scope.

## Online-only (native)

`signIn` / `getTenantByCode`, `User.create`/`delete`/`updatePassword` (edge fns), all `Signup.*`, `Subscription.upgradeTenant`: throw `RequiresConnectionError` (localized, flows through the normal ErrorBanner) when offline, else delegate to the Supabase sibling and cache the result locally. `Auth.getSession`/`getUserProfile`/`getTenant` are a **read-through cache** — online they fetch + cache (profile, branch, tenant, tier); offline they serve the cache, so the app boots offline after the **first online login** (which blocks on an initial full pull when the local DB is empty).

## Required Postgres changes — in `sql scripts/script.sql`

`updated_at` + BEFORE UPDATE triggers on every synced table (drives the incremental pull; immune to client clock skew). **No tombstone table/triggers** — the client propagates hard deletes itself (push replays `pending_deletes`; pull's `reconcileDeletes` drops rows gone from the server). `script.sql` is idempotent and is itself the migration — re-running it on an existing DB creates any missing trigger (and any missing column, via the per-table `ALTER TABLE … ADD COLUMN IF NOT EXISTS` blocks). See the "HOW TO CHANGE THIS SCRIPT" header at the top of that file.

**Debts feature:** two synced tenant tables `custom_debts` + `debt_payments` (branch-via-customer RLS like `payments`, `set_updated_at` triggers), and a `sales.amount_paid` column (partial sales leave a debt). Locally these are just more entries in `db/tables.ts` (+ `SYNC_PULL_ORDER`), included in `SCHEMA_V1` like every other table. The generic push/pull picks them up with no engine change. Debts themselves are **computed at runtime** (see features.md → Debts).

**Multi-product sales:** a sale is now a header (`sales`) + one or more product lines (**`sale_items`**, a synced tenant table registered right after `sales` in `SYNC_PULL_ORDER` — parents-before-children). `sale_items` inherits its branch from the parent sale (RLS `EXISTS`; the offline reads join `sales`). The offline `create` writes the header + all lines in one `write()` transaction; the generic push sends the header then the lines (order matters for the FK). `sales.total_amount` is no longer generated (app-written sum). No engine change — just the new descriptor. See features.md → Products & One-Off Sales.

**Editing a sale, and why a line is never deleted:** `sale_items` is **not** in `DELETE_RECONCILE_TABLES` (it would mean fetching the server id list of every line of every sale ever), so a hard-deleted line leaves no trace for the other devices to act on — it would stay alive in their mirrors forever, showing a three-product receipt under a two-product total. A line an edit drops is therefore **soft-voided** (`sale_items.voided_at`, additive column, filtered out in `mapDbSaleToSale`), the same reasoning that makes an unskip a boolean flip rather than a delete. `OfflineSaleRepository.update` matches the new lines to the existing rows **by position**, so an edited quantity or price is a plain dirty UPDATE, and writes the header + lines + the replacement stock movements in one `write()` transaction, exactly like `create`. Gotcha #90.

**Product stock (`stock_movements`):** a synced tenant table registered after `sale_items` in `SYNC_PULL_ORDER` (its `sale_id` FK points at `sales`). Stock on hand is never a column — it is `SUM(quantity_delta)` over non-voided rows, computed by the `product_stock` view on web and a plain `GROUP BY` on the mirror. **That choice is what makes stock offline-safe:** the push sends whole rows with latest-`updated_at`-wins, so a counter column would be silently clobbered when two devices each sell one unit offline; additive rows merge. The offline sale `create` writes header + lines + movements in the **same** `write()` transaction, and voiding a sale soft-voids its movements in one idempotent `UPDATE`. **Editing** a sale does the same swap — soft-void the live `'sale'` rows, insert the new ones — and only when the per-product unit count actually changed (gotcha #90). Two things the engine does *not* do for you: `OfflineProductRepository.delete` must delete the product's movements by hand (the mirror has no FKs, and a dirty orphan would poison the whole `stock_movements` push batch), and `stock_movements` stays out of `DELETE_RECONCILE_TABLES` (a ledger, soft-voided like payments/sales). See gotcha #48.

**Expenses (`expenses`):** one synced tenant table registered after `debt_payments` in `SYNC_PULL_ORDER`. It **owns** its `branch_id` (`{ kind: 'owned' }` in both `BRANCH_SCOPES` maps) rather than inheriting via a customer, has no natural key, and is soft-void only — so it needs no `conflictTarget`, no `NATURAL_KEYS` entry and no `DELETE_RECONCILE_TABLES` entry. Its RLS is **admin-only**, which the mirror gets for free: a collector's device simply pulls zero rows, so no client-side gate is needed in the offline repository. The same change also added three additive columns to `stock_movements` (`unit_cost`, `currency_id`, `rate_per_usd_snapshot`) and two to `products` (`cost_price`, `cost_currency_id`) — `applySchema` `ALTER`s them in on the next app start, so the whole feature ships over the air. The **cost of buying stock is never stored as an expense row**; `ExpenseService` derives it from the movement ledger at read time (features.md → Expenses, gotcha #89).

**Skipped months (`skipped_months`):** a synced tenant table registered right after `payments` in `SYNC_PULL_ORDER` (branch-via-customer RLS, `set_updated_at` trigger). It carries the **same natural key** as `payments` — `UNIQUE (customer_plan_id, billing_month)` locally too — so it joins `NATURAL_KEYS` and writes go through `upsertNaturalKeyDirty` (the generalized `upsertPaymentDirty`), with `deterministicId('skip', line, month)` for cross-device convergence. Unskip is a **boolean flip, never a delete**: a deleted row carries nothing through a latest-`updated_at`-wins pull, so `skipped = false` is what tells the other devices the skip is gone (nothing to add to `pending_deletes`). See features.md → Skipped Months.

## Exception logger (`src/core/errorLog/`) + Developer page

A small, deliberately unlayered debug feature, native-only:

- `errorLog/errorLogger.ts` exports `logException({ source, message, stack?, context? })` — writes one row to the local `exception_logs` table (`pushOnly: true`, see above) via `insertDirty`. Reads the current user/tenant with `getStore().getState().auth.user` (no hook — this runs outside React in repository code). Never throws; a logging failure only `console.error`s, so it can never mask the original error or loop back on itself.
- `errorLog/globalHandler.ts` exports `installGlobalErrorHandler()`, called once from `app/_layout.tsx`'s bootstrap effect. Wraps RN's `ErrorUtils.setGlobalHandler`, chaining to whatever handler was already installed (Expo's dev/prod error overlay) so this only adds logging.
- Wired into: `ErrorBoundary.componentDidCatch` (`source: 'boundary'`), the global handler above (`source: 'global_handler'`), and both `BaseRepository.handleError` / `OfflineBaseRepository.handleError` (`source: 'repository'`) — the two methods every repository's catch blocks funnel through, online and offline.
- **Settings → Developer** (`src/modules/developer/`, native-only row gated by `IS_OFFLINE_CAPABLE`) is a read-only browser for the local SQLite mirror: lists every table in `TABLES` plus the two bookkeeping tables (`sync_meta`, `pending_deletes`) with row counts, and opens any of them in `DbTableViewer` (`src/shared/components/DbTableViewer.tsx`) — a self-contained component that takes only a `tableName` prop and does its own `SELECT * FROM <table>` + column discovery. This is intentionally not layered through services/repositories; it's a debug tool, not a feature.
- **Export/Import** on the same screen: Export dumps every table (raw rows, undecoded, `_dirty` included) as one JSON blob to the clipboard (`expo-clipboard`). Import parses pasted JSON, wipes every known local table, and inserts the JSON's rows exactly as given (no `encodeRow`/decode round-trip) inside one transaction — a deliberately raw, unsafe, developer-only operation.
- **Full re-pull** on the same screen: calls `resyncFromScratch()` — clears the `last_pulled_at` cursor and runs one normal push→pull. Non-destructive (un-pushed local writes go up first and still win the merge); use it to repair a mirror whose incremental pull skipped rows.

## Gotchas specific to this layer

- **The local schema reconciles itself — there are no migrations.** `applySchema(db)` runs on every app start and, in one transaction: `CREATE TABLE IF NOT EXISTS` for every entry in `TABLES`, then for each table diffs the spec against `PRAGMA table_info` and `ALTER TABLE … ADD COLUMN`s whatever is missing (SQLite has no `ADD COLUMN IF NOT EXISTS`), then `CREATE INDEX IF NOT EXISTS`. So **editing `tables.ts` is the entire local schema change** for fresh and existing installs alike — no delta array, no `user_version` (the old versioned runner and `MIGRATIONS` are gone). Column definitions must stay ALTER-able: no `UNIQUE`/`PRIMARY KEY`, no `NOT NULL` without a constant `DEFAULT` (`_dirty` has one; `id` only ever ships with a freshly created table).
- **The reconcile is ADDITIVE ONLY.** A dropped or renamed column, a changed type, and a new/changed table-level `constraints` entry all reach **fresh installs only** — SQLite can't ALTER them in. For those, rebuild the mirror instead (Settings → Developer → full re-pull after clearing app data, or bump `DB_NAME` in `sqlite.ts`), and make sure no `_dirty` rows are pending first, since a rebuild discards un-pushed writes. Either way the matching Postgres change must ship too, or pull breaks.
- Two implementations per read method must stay behaviorally identical (`ilike`→`LIKE COLLATE NOCASE`, ordering, NULL handling). The `implements` interface catches shape drift; a read-parity test catches behavior drift.
- On-device SQLite is unencrypted by default — evaluate SQLCipher for production; the DB is wiped on a different-tenant login.
- Circular import (offline class composes its online sibling for online-only methods): safe because the offline instance is only constructed at the bottom of the switch file, after the online class is declared. Smoke-test on a real build.
