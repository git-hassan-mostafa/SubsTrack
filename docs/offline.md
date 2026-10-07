# Offline-First (phone)

> Referenced from `CLAUDE.md`. Read before touching **any repository** or the sync engine. SubsTrack is phone-only (no Expo web) → every offline path runs unconditionally, no platform gate. `Web/` gets `createSupabaseRepositories()` from Shared (talks to Supabase directly, no offline layer).

## Why / what

Staff collect money in the field w/ unreliable connectivity → native app works **fully offline** (reads + all tenant-table CRUD), syncs to Supabase in background. Confined to the **repository layer** + `SubsTrack/src/core/offline/`; services, slices, UI untouched. All in SubsTrack — nothing offline lives in `Shared/`.

## The seam

Supabase class in Shared (`Shared/src/modules/**/repository/XxxRepository.ts`, `export class … implements IXxxRepository`, class only); sibling `OfflineXxxRepository` (SubsTrack `XxxRepository.offline.ts`, same folder path) implements same interface on SQLite; interface in Shared `IXxxRepository.ts`. Services never import either class — call `repositories().xxx` inside a method; app hands its set over once at startup:

```ts
// SubsTrack/src/platform/configurePhone.ts
repositories: createOfflineRepositories(), // SubsTrack/src/platform/offlineRepositories.ts
```

`Web/` hands `createSupabaseRepositories()` (`Shared/src/core/runtime/supabaseRepositories.ts`) from `configureWeb()`. Offline twin delegating online (`private online = new XxxRepository()`) imports the class from `@shared/…`. New repository = key on `Repositories` (`Shared/src/core/runtime/repositories.ts`) + one line in each factory.

Both `implements IXxxRepository` → compiler keeps them in lockstep. Offline classes return **same `Db*` row shapes** (snake_case, incl. nested joins like `customer_plans(*, plans(*))`) the mappers consume, so nothing above repo layer can tell. `monthStatus.buildMonthGrid` is pure → month grid works offline free.

## The sync in one paragraph

Every local write flags its row `_dirty = 1` (create/edit/soft-delete); hard delete logged in `pending_deletes`. Cycle: **push** — upsert every `_dirty` row, replay `pending_deletes` as real deletes; then **pull** — fetch rows changed since single `last_pulled_at`, merge, newest `updated_at` wins. No outbox, no per-table cursors, no tombstones. Lives in `src/core/offline/sync/`.

**Network-parallel, DB-sequential.** Cost = round trips, not rows (was ~27 sequential requests even w/ nothing changed). Pull fetches every table at once; push goes up in **dependency waves**; every SQLite write queues behind one lock — expo-sqlite gives ONE connection, so two concurrent `withTransactionAsync` interleave and fail. See **Parallelism**.

## `SubsTrack/src/core/offline/` layout

|Path|Role|
|-|-|
|`db/tables.ts`|**Single descriptor** of the mirror (columns + types + scope). Drives DDL, encode/decode, generic sync upserts.|
|`db/schema.ts` / `db/applySchema.ts` / `db/sqlite.ts`|DDL from `tables.ts` (`columnDefs`, `CREATE_TABLE_STATEMENTS`, `CREATE_INDEX_STATEMENTS`); reconciler (`applySchema` — create missing tables, `ALTER` in missing columns, create missing indices; every start, no version numbers); handle (`initOfflineDb`, `getDb`, `wipeOfflineData`). `sqlite.ts` = **only** _value_ import of `expo-sqlite`; all other `expo-sqlite` imports are `import type`.|
|`db/codec.ts`|Row encode/decode (0/1↔boolean, TEXT-decimal↔number).|
|`db/dml.ts`|`insertDirty` / `updateDirty` / `upsertNaturalKeyDirty` (local write + `_dirty=1`), `markDeleted` (log hard delete), `upsertFromServer` (one-row merge, `_dirty=0`, used by read-through caches), pull's batched trio `dirtyIdSet` / `clearNaturalKeyDuplicates` / `upsertManyFromServer`.|
|`batch.ts`|`inBatches(items, size)` — the one list-splitter (SQLite bound params, PostgREST query strings).|
|`OfflineBaseRepository.ts`|Mirror of `BaseRepository`: handle, `handleError`, `branchWhere`/`combineWhere`/`searchWhere`, `all`/`first`/`count`/`decodeAll`/`rowsById`/`childrenByParent`/`referencedIdsIn`, `write((db) => …)` (one local transaction).|
|`sync/index.ts`|Engine's whole public surface — nothing outside imports below it; `@/src/core/offline/sync` is stable.|
|`sync/engine.ts`|`runSync` (push → pull → prune, serialized, session-gated), `runSyncIfDue`, `syncNow`, `flushPendingWrites`, `resyncFromScratch`, `startSync`.|
|`sync/push.ts`|`pushDirty()` — dirty rows in `PUSH_WAVES` order, then batched hard-delete replay.|
|`sync/pull.ts`|`pullChanges()` (all tables concurrently) + `reconcileDeletes()` + `pruneWindowedTables()`.|
|`sync/parallel.ts`|`NETWORK_CONCURRENCY`, `mapWithLimit` (bounded fan-out), `withDbLock` (single-connection write lock).|
|`sync/meta.ts`|`sync_meta` KV (`getMeta`/`setMeta`) + keys.|
|`sync/status.ts`|`SyncStatus`, `getSyncStatus`, `subscribeSyncStatus`.|
|`bootstrap/{offlineBootstrap,tenant}.ts`|`initOffline()` (once from `app/_layout.tsx`), `ensureTenantScope()`.|
|`backup/{types,validate,dump,restore,tableOrder}.ts`|JSON-file backup: envelope, **pure** `validateBackup()`, streaming `writeBackup()`, whole-mirror `restoreBackup()`, `BACKUP_TABLE_ORDER` (from `PUSH_WAVES`). No `expo-file-system` import — screen owns file I/O via `shared/lib/shareFile.ts`.|
|`ids.ts`|`newId()`, `nowIso()`, `deterministicId()`.|
|`net/connectivity.ts`|NetInfo wrapper.|

## Local store

- Mirror tables match `Shared/src/core/types/db.ts` **exactly** (snake_case). Money/rate columns **TEXT (exact decimal)**, never `REAL` (float drift); read via `Number()`. **SQL numeric comparisons use `CAST(col AS REAL)`** (TEXT vs `0` compares by storage class, not value).
- **No mirrored column is server-generated.** Bill balance = `SUM(collection_items)` (`charge_balances` view on server, same `GROUP BY` locally) — offline-safe b/c a counter would be clobbered by latest-`updated_at`-wins when two devices collect one bill; additive item rows merge. `sales.total_amount` is app-written, pushed normally. Keep `generated` in `db/tables.ts` empty unless a `GENERATED ALWAYS` column reappears (Postgres rejects a value, SQLSTATE `428C9`).
- One local-only column per table: `_dirty`, w/ a **partial index** per tenant table (`… ON t(_dirty) WHERE _dirty = 1`) so push scans and `hasUnsyncedWrites` counts read an almost-empty index. Bookkeeping tables: `sync_meta` (`active_tenant_id`, `active_branch_scope`, `active_role_scope`, `last_pulled_at`, `last_sync_at`), `pending_deletes` (`table_name`, `row_id`).
- **`journal_mode = WAL` + `synchronous = NORMAL`** (`db/sqlite.ts`) → #120 (FULL fsyncs every commit; NORMAL in WAL risks only last commits on power cut).
- **Read-path indices hand-maintained** in `CREATE_INDEX_STATEMENTS` (`db/schema.ts`), applied after column reconcile every start; nothing warns when one is missing (`sale_items(sale_id)` was, #120). Add one whenever a new query filters/joins on a column.
- No SQL foreign keys (rows arrive out of order). DB **scoped to one tenant _and_ one branch view**; `ensureTenantScope(tenantId, branchId, role)` wipes + re-pulls on different tenant, **branch scope or role scope**, and **refuses the wipe while any un-pushed write remains** (`_dirty` row or `pending_deletes` entry). See next section.

## Tenant scope & logout

Mirror holds one tenant **through one branch view by one kind of reader**, **kept on logout** (never wiped) — protects un-pushed writes, fast same-person re-login (incremental). Login is online-only anyway.

**Why branch view:** RLS gives tenant-wide admin (`users.branch_id IS NULL`) all branches, branch user one. Unscoped, a branch user's pull + `reconcileDeletes` (branch-limited server ids vs full local set) **silently drop other branches' rows**, never re-pulled later (cursor moved past).

**Why ROLE is in scope** → #154 (`expenses_all` / `audit_logs_select` need `u.role IN ('admin','superadmin')` → empty under staff, `ok: true`, cursor advances past them; admin→staff hand-over in same branch must re-scope).

Key = **`tenant_id` + branch scope + role scope**, in `sync_meta` as `active_tenant_id` + `active_branch_scope` + `active_role_scope`. Pure helpers in `core/offline/scope.ts`: `scopeKeyOf(branchId)` (`BRANCH_SCOPE_ALL = '__all__'` for tenant-wide admin, else user's `branch_id`), `roleScopeOf(role)` (`'admin'` for admin/superadmin, else `'staff'`; raw role would wipe needlessly on superadmin↔admin). Change in _any_ of three → same wipe + full re-pull as tenant switch. Pre-role-key mirror (no `active_role_scope`) is **backfilled, not wiped**; a gap it holds is repaired by **Settings → Developer → Clear local data**.

- **Logout** = one seam, `shared/lib/session.ts` `endSession()` (epoch, auth slice `logout`, `resetAllDomainStores()`, `uiPrefStore` — gotcha #156). Underneath, `OfflineAuthRepository.signOut` does **best-effort push while session still valid** if un-pushed writes _and_ online (skipped when nothing pending → instant); the last moment those rows can be pushed. Sign-out `{ scope: "local" }` + fallback delete of `AUTH_STORAGE_KEY`, else offline logout won't stick (gotcha #158).
- **Same tenant + branch scope + role** → keep data, incremental.
- **Different tenant/branch scope/role, nothing pending** → `ensureTenantScope` wipes; login does full re-pull.
- **Different scope w/ un-pushed writes** → **blocked**: `getUserProfile` throws `OrganizationSwitchBlockedError` _before_ caching anything; `AuthService` signs the new session back out (nothing half-applied). User sees localized "sign back into previous account and sync first". Can't wipe (money lost), can't push old rows under new session (RLS rejects). Only happens after an **offline** logout w/ pending writes. A row the server permanently refuses would block forever → **Settings → Developer → Clear local data** (gotcha #150).
- **DEACTIVATED profile never re-scopes** (gotcha #159): `getUserProfile` returns before `ensureTenantScope` when `active` false (service's `!profile.active` check runs too late).

## Writes

Every mutating offline method = **one SQLite transaction** via `write((db) => …)`:

- create/edit/soft-delete → `insertDirty` / `updateDirty` / `upsertNaturalKeyDirty` set `_dirty = 1` (the entire "needs push" intent).
- hard delete → `DELETE` local row(s) **and** `markDeleted(db, table, id)` (`INSERT OR IGNORE` into `pending_deletes`). Only parent id logged; server FK cascade removes children.

Client-generated ids (`newId()`) → push upsert-by-id idempotent. **Deterministic ids**: `deterministicId(customer_plan_id, billing_month)` for `charges` kind `month` (skip one prefixed `'skip'`, never collides), `deterministicId(tenant_id, key)` for `tenant_settings` → two devices collecting one month offline **converge on ONE bill** (why months bill lazily).

`charges`, `collection_items`, `skipped_months`, `tenant_settings` have **two** UNIQUE constraints (id + natural key: `(customer_plan_id, billing_month)` for `charges`/`skipped_months`, `(collection_id, charge_id)` for `collection_items`, `(tenant_id, key)` for `tenant_settings`; all in `NATURAL_KEYS`) → `upsertNaturalKeyDirty` resolves target by lookup, not one `ON CONFLICT` (SQLite heals only the named target; drifted id/key → INSERT fails on id, gotcha #49). Finds by `(customer_plan_id, billing_month)` and `UPDATE`s (keeps that row's id — may be a random web id), else inserts, falling back to fresh `newId()` if deterministic id is taken by an unrelated row. **Returns id actually stored**, which repo echoes (intended id → caller holds a missing row, next void silently misses). `CollectionRepository.create` does same by hand: find-or-create each month bill on natural key, **remap items to the id that really exists** (item on missing charge = cash pointing at nothing).

## Parallelism — `sync/parallel.ts`

- **`mapWithLimit(items, NETWORK_CONCURRENCY, fn)`** — bounded fan-out for Supabase requests (`NETWORK_CONCURRENCY = 6`). Not correctness: keeps first full sync from holding twenty 1000-row pages in memory + twenty sockets on mobile radio.
- **`withDbLock(fn)`** — promise-chain lock every local write queues behind. **ONE expo-sqlite connection** → concurrent `withTransactionAsync` fail ("cannot start a transaction within a transaction"). Sync overlaps only network (~95% of wall time), never DB.

**Pull needs no ordering** (why it fans out): mirror has **no foreign keys** (`PRAGMA foreign_keys` off, see `db/schema.ts`), each table's pull touches only its own table. `SYNC_TABLES` order meaningless to pull; shared `last_pulled_at` read **once** before fan-out, advances only when every table succeeded — same semantics as old sequential loop.

**Push needs ordering** — server FKs are real (child before parent = 23503). `PUSH_WAVES` (`db/tables.ts`) = **dependency levels**: a wave in parallel, waves sequential (22 steps → 5):

|Wave|Tables|
|-|-|
|0|`tenants` (+ read-only global `app_options`, push skips on `scope`)|
|1|`tenant_settings`, `currencies`, `branches`|
|2|`users`, `plans`, `customers`, `products`, `services`|
|3|`customer_plans`, `sales`, `expenses`, `collections`, `exception_logs`, `audit_logs`|
|4|`charges`, `skipped_months`, `sale_items`, `stock_movements`|
|5|`collection_items`|

**`SYNC_TABLES` derived from `PUSH_WAVES`** (`.flat()`) — two lists would let a table be silently never pushed/pulled. One list; a table must sit below every table it references.

## Push — `pushDirty()` in `sync/push.ts`

1. **Upserts.** Per tenant table, wave by wave: `SELECT * WHERE _dirty = 1`, decode to `Db*`, strip `updated_at` (server trigger owns it; null for locally-created plans) and any `generated` column, `supabase.from(table).upsert(rows, { onConflict })` — `onConflict` = natural key where one exists (`customer_plan_id,billing_month` for `charges` + `skipped_months`, `collection_id,charge_id` for `collection_items`, `tenant_id,key` for `tenant_settings`), else `id`. `conflictTarget()` must match `NATURAL_KEYS`, else a server row under a different id inserts a duplicate and stalls the push on the UNIQUE index forever. On success clear `_dirty` for exactly those ids. Nothing dirty → **no request**.
2. **Hard deletes.** Grouped by table, one `delete().in('id', ids)` per batch; log entries drop on success. **Tables stay sequential** (parent + child cascading deletes concurrently can deadlock in Postgres). Batch failure → **falls back to one request per row** (one undeletable row, e.g. `ON DELETE RESTRICT` ref, would otherwise block every queued delete forever).

**`_dirty` is an upload INSTRUCTION, not a display flag** → #150 (`pushTable` = unconditional last-writer-wins before the healing pull; setting `_dirty` overwrites live server state).

Failed network call → row/table left as-is (`_dirty` stays 1 / delete stays logged), retried next cycle. No backoff, no parking.

## Pull — `pullChanges()` + `reconcileDeletes()` in `sync/pull.ts`

Read single `last_pulled_at`, pull every table **concurrently**, paging `updated_at > pullFloor(last_pulled_at)` = cursor **minus 5-minute overlap** (`updated_at` = `now()` at transaction START, so a batch committing after our pull is already behind the cursor, gotcha #160); stored cursor stays true max seen, so floor never drags it back. Each page merged under `withDbLock` in one transaction: drop rows whose local copy is `_dirty = 1` (un-pushed edit wins), then `clearNaturalKeyDuplicates` (local row holding incoming `(line, month)` under a **different** id would fail the UNIQUE merge and stall the table every cycle — server wins, stale duplicate dropped; if still dirty, incoming row skipped, next push converges ids), then `upsertManyFromServer`. Store newest `updated_at` seen as new `last_pulled_at` (push runs first → almost nothing dirty at pull).

**Page merged in a handful of statements** (each SQLite call crosses JS↔native bridge; never per-row `SELECT _dirty` + lookup + upsert, 2–3 round trips × 1000 rows): batched (`dirtyIdSet`, `clearNaturalKeyDuplicates`, `upsertManyFromServer` — multi-row `INSERT … ON CONFLICT`, 200 rows/statement, far under bound-param limit). A still-colliding row fails its **whole batch** → table un-merged, retried next cycle (never a half-applied page). Hence callers must filter skip sets out _before_ `upsertManyFromServer`.

**Cursor advances only after a FULLY successful cycle.** `last_pulled_at` is shared by all tables. Each table pull try/catch'd; request error or merge failure marks cycle incomplete, cursor **held** (re-pull from same point; upserts idempotent). Else a succeeded table's newer row pushes cursor **past** a failed table's un-pulled rows → stranded forever (real bug: one transient error left `branches`/`currencies` at 0 rows). Repair: **`resyncFromScratch()`** (Settings → Developer → "Full re-pull") clears `last_pulled_at`, runs normal push→pull (local writes up first; non-destructive, `_dirty` rows still win).

**Hard deletes elsewhere** (web / other device) leave no `updated_at` → `reconcileDeletes()`: for low-volume tables (`customers`, `plans`, `branches`, `currencies`, `products`, `services`) fetch server id list (**paged** — unpaged `select('id')` capped at 1000 by PostgREST; ids past cap would look deleted) and drop local `_dirty = 0` rows missing from it, batched `DELETE … IN (…)`. Six tables run **concurrently**, each takes DB lock for its delete phase. Ledger tables (`charges`, `collections`, `collection_items`, `sales`) only soft-voided → skipped. **Never mass-deletes on empty server list** (ambiguous: all deleted vs session/RLS returned nothing) → empty-with-local-rows skips. Only cycle part whose cost grows w/ tenant size: downloads every id of those six tables **every** cycle.

**Two safety rails vs whole-mirror wipe:** (1) `runSync()` checks `supabase.auth.getSession()` and **does nothing while signed out** — logged-out pull returns empty rows (RLS, no error) → `reconcileDeletes` would wipe every reconciled table, possibly unattended. (2) Pull uses **offset paging over stable `updated_at > cursor` ordered by `(updated_at, id)`**, not keyset-on-`updated_at`: keyset drops rows when >1000 share a timestamp (guaranteed by the `updated_at` backfill migration — every row one `NOW()` — and any bulk insert). Not fully successful → reports `sync_incomplete` (`syncNow()` returns `ok: false`).

**Push-only tables.** `TableSpec.pushOnly` (only `exception_logs`) → `pullChanges()` skips it; pushed, never pulled (write-mostly logs; pulling fills every mirror w/ others' rows). New one = one-line `pushOnly: true` in `db/tables.ts`.

**Append-only tables.** `TableSpec.appendOnly` (`audit_logs` + `exception_logs`):

1. **Push passes `ignoreDuplicates: true`** → `ON CONFLICT DO NOTHING`. **Load-bearing**: `_dirty` clears only on successful reply, so a committed push w/ lost response is re-sent; plain upsert's `DO UPDATE` is **refused forever by insert-only RLS** (`audit_logs` has no UPDATE policy) → wedges that table's queue and every later audit row.
2. **Un-pushed rows don't block an organization switch** — `hasUnsyncedWrites` skips them (a log isn't money; fixes that for `exception_logs`).

**Windowed tables.** `TableSpec.pullDays` keeps a rolling local window (`audit_logs`: 30, `AUDIT_LOCAL_DAYS`); audit **reads go to server anyway** (window = offline fallback, features.md → Audit Trail). Pull adds `.gte('occurred_at', cutoff)`; `pruneWindowedTables(db)` deletes older local rows. **Prune guarded by `_dirty = 0`** (un-pushed row = ONLY copy). Runs after each complete cycle **and** once at bootstrap (device offline for months still prunes).

**`ColType: 'json'`** — TEXT locally, `jsonb` on server (audit `before_data` / `after_data` / `changed`). `JSON.stringify` on encode; decode = `try/catch JSON.parse`, corrupt → `null`, never throws mid-query.

**Audit trail (`audit_logs`).** In `PUSH_WAVES` (absent = neither pushed nor pulled) w/ `appendOnly` + `pullDays: 30`. Written by each repo — `OfflineBaseRepository.auditIn(db, input)` runs **inside caller's `write()` transaction** (change + trail commit/roll back together). Never audit `upsertFromServer` (`db/dml.ts`): pull merge, not user action; would loop (pull → audit → push → pull). Staff INSERT but can't SELECT audit rows → non-admin pull returns none legitimately. **Reading is where the mirror isn't the source**: `OfflineAuditRepository` queries Supabase, merges own `_dirty` rows on top, local window only when server unreachable. features.md → Audit Trail, gotchas #57–#63, #76.

## Triggers — when a cycle runs

**Push → pull → prune**, serialized (second `runSync()` returns running promise), **gated on signed-in session**. Deliberately calm: not after writes, not on resume-from-RAM, **no interval timer, no connectivity-returned trigger**:

- **Cold start** — `startSync(cb)` in `app/_layout.tsx` seeds `SyncStatus.lastSyncAt` from durable stamp (in-memory starts blank), awaits `runSyncIfDue()`, calls `refreshActiveData`.
- **Session restore / login** — `OfflineAuthRepository.getUserProfile`: **empty** mirror (first login / just-wiped scope switch) **blocks** on full `runSync()` so screens don't mount on nothing; else fires `runSyncIfDue()` in background.
- **Manual** — Settings → "Sync now" (`syncNow()`), Settings → Developer → "Full re-pull" (`resyncFromScratch()`).

**`runSyncIfDue()` = THE app-open trigger, 24-hour staleness gate.** Cold start and every `getUserProfile` restore go through it; only **manual** ignores it. Stamp = **`sync_meta.last_sync_at`** (survives restart), not in-memory `SyncStatus.lastSyncAt`; only a **complete** cycle writes it (partial retried at next open). `wipeOfflineData()` clears `last_sync_at` w/ `last_pulled_at`, else a wiped mirror reads fresh and new tenant sits on empty screen for a day.

**Fresh enough skips PULL, never PUSH.** "Not due" still calls `flushPendingWrites()`: un-pushed row = only copy of that money; waiting a day keeps collector payments off server (invisible to admin) though online. Free when nothing dirty (`pushTable` returns on empty select); `try/catch`-wrapped b/c call sites fire-and-forget.

## Refreshing the stores after a sync (UI refresh)

Sync fills SQLite, but **Zustand stores** hold old data. `refreshActiveData()` (`Shared/src/state/refreshActiveData.ts`) closes the gap, fired **by the caller, not the engine** (keeps `src/core/` from importing `Shared/src/state/`):

- **Cold start** — `app/_layout.tsx` passes it to `startSync(cb)`, called after first cycle.
- **Manual sync** — `SettingsScreen` calls it after `syncNow()` resolves.

Nothing fires it on background `runSyncIfDue()` (reloading under user's fingers worse than a few stale rows; next focus re-fetches). It always refreshes dashboard, re-fetches every list slice already holding data (= only what's on screen), current-month payment flags / net-debt when customers loaded, and tenant-wide active customer + service-line counts (allowances). List fetches reset to page 1.

## Manual sync + observable status

`sync/status.ts`: `SyncStatus = { syncing, lastSyncAt, lastError }` via `getSyncStatus()` / `subscribeSyncStatus()`; `runSync()` broadcasts, so **every** cycle flips `syncing`. `syncNow()` = manual entry (probes connectivity first, returns `{ ok, offline }` to tell "reached server" from "no connection"). Re-exported from `src/core/offline/index.ts`; components read via `useSyncStatus()` (`src/shared/hooks/`, `useSyncExternalStore`).

- **Global marker** — `SyncIndicator` (`src/shared/components/`) mounted once in `app/(app)/_layout.tsx` → top-center "Syncing data…" pill on **all pages** while `syncing`. Nothing when idle.
- **Settings** — "Sync now" row → `syncNow()`; brief bottom flash reports outcome (done / offline / failed).

## Conflict policy

**Latest `updated_at` wins.** Push-before-pull + deterministic month-bill ids → common money ops conflict-free (one bill, separate collections, balance = sum). Voids idempotent; creates have distinct ids; pull skips `_dirty = 1`. No per-field merge.

## Online-only (native)

`signIn` / `getTenantByCode`, `User.create`/`delete`/`updatePassword` (edge fns), all `Signup.*`, every `CustomerRequest.*`, `CustomerStatus.findPage` (`customer-status` edge function; phone list doesn't call it yet): throw `RequiresConnectionError` (localized, via ErrorBanner) offline, else delegate to Supabase sibling + cache locally. `Auth.getSession`/`getUserProfile`/`getTenant` = **read-through cache** (online fetch + cache profile, branch, tenant; offline serve cache) → app boots offline after **first online login** (which blocks on initial full pull when DB empty).

**`customer_requests` is in neither `TABLES` nor `PUSH_WAVES`** — the one tenant table deliberately not mirrored: "exactly one pending request per tenant" is a partial unique index the client can't evaluate; two offline devices would each insert pending and the loser wedges its wave forever. Both allowances **do** sync (columns on mirrored `tenants`) → **customer cap + service-line cap still block offline**; only requesting bigger ones needs connection. Counts come from mirror (branch-scoped on a branch-admin device), so two offline devices can each take the last seat — advisory, same compromise as `SaleService` oversell guard. Lowering a limit is online-only (floors = server live counts).

## Required Postgres changes — in `sql scripts/script.sql`

`updated_at` + BEFORE UPDATE triggers on every synced table (drives incremental pull; immune to client clock skew). **No tombstone table/triggers** — client propagates hard deletes (push replays `pending_deletes`; `reconcileDeletes` drops server-gone rows). `script.sql` is idempotent and is the migration (creates missing triggers + columns via per-table `ALTER TABLE … ADD COLUMN IF NOT EXISTS`). See its "HOW TO CHANGE THIS SCRIPT" header.

**The ledger (`charges` + `collections` + `collection_items`):** three synced tenant tables (replaced `payments`, `custom_debts`, `debt_payments`); three `db/tables.ts` entries (+ `PUSH_WAVES`), generic push/pull, no engine change. Details:

- **Waves.** `collections` wave 3 (beside `sales`), `charges` wave 4 (`sale_id` → `sales`), `collection_items` wave 5 (references both).
- **Balance not a column, either side** (see Local store): `GROUP BY` is a correlated subquery on mirror; same reasoning as `stock_movements` vs stock column.
- **Two devices, one month, no duplicate bill** (see Writes): same deterministic bill id, two collections → bill upserts onto itself, billed once, credited twice.
- **One transaction.** `OfflineCollectionRepository.create` writes materialized bills, header, items in one `write()` (no cash against an unsaved bill); bill find-or-create + item remap as in Writes (gotcha #105 / #106) — **not** offline-only, web does same via pure `resolveBillTarget` (gotcha #114).
- **Void + replacement share one transaction.** `OfflineCollectionRepository.replace` (correct amount, sale-edit rebuild) runs `voidManyIn` + `insertIn` in the SAME `write()` (never half-applied). `create` / `voidMany` are thin wrappers → one insert path, one void path. Replacement ids deterministic (`deterministicId("replaces", originalId)`) → two devices converge (gotcha #171).

Branch scoping: the one deliberate mirror ≠ RLS — both tables filter on **own** `branch_id` (`{ kind: 'owned' }`) while server policy inherits from customer; gotcha #103 (joined version can't work through PostgREST).

**Multi-item sales:** header (`sales`) + lines (**`sale_items`**, wave 4, below `sales` b/c FK), each a product or service. `sale_items` inherits branch from parent sale (RLS `EXISTS`; offline reads join `sales`). Offline `create` writes header, lines, stock movements **and the sale's `charges` row** in one `write()` (sale w/o bill invisible to every debt surface). Till money NOT in that transaction — normal collect path afterwards (gotcha #110). `sales.total_amount` app-written; no `amount_paid` or custody column. features.md → Products & One-Off Sales.

**Services (`services`), and the rename the mirror couldn't do:** synced tenant table, wave 2 next to `products` (above `sale_items` wave 4, `service_id` → it). Owns `branch_id` w/ **`shared`** semantics like `products`; no natural key, no children → no `conflictTarget`, no `NATURAL_KEYS`. **Is** hard-deletable (soft-deleted only once a sale line references it) → belongs in **`DELETE_RECONCILE_TABLES`** next to `products` (id-list compare is only way other devices learn). `sale_items` gained additive `line_type`, `service_id` (`applySchema` `ALTER`s in). **RENAMED `product_name_snapshot` → `item_name_snapshot`** → additive reconcile can't; hence `backfillRenamedColumns()` in `applySchema.ts` (self-guarding list, copies only when **both** columns exist; no-op on fresh install). Orphaned local column harmless (`decodeRow` returns only spec columns → `stripForPush` never sees it). Full trap → gotcha #99 (read before renaming anything mirrored). Offline sale reads resolve both catalog joins (`products`, `services`) w/ null guard — a line fills at most one, a **one-off** service neither. features.md → Products & One-Off Sales → Services.

**Editing a sale; a line is never deleted** (gotcha #90): `sale_items` **not** in `DELETE_RECONCILE_TABLES` (would fetch every line id ever) → dropped line **soft-voided** (`sale_items.voided_at`, additive, filtered in `mapDbSaleToSale`), same reasoning as unskip = flag flip. `OfflineSaleRepository.update` matches lines **by position**, writes header + lines + replacement stock movements in one `write()`, like `create`.

**Product stock (`stock_movements`):** wave 4, below `products` + `sales` (`product_id` / `sale_id` FKs). Stock never a column — `SUM(quantity_delta)` over non-voided rows (`product_stock` view on web, `GROUP BY` on mirror) → **offline-safe**, same as balance. Offline sale `create` writes header + lines + movements in **same** `write()`; voiding soft-voids movements in one idempotent `UPDATE`. **Editing** swaps — soft-void live `'sale'` rows, insert new — only when per-product unit count changed (gotcha #90). Engine does _not_: `OfflineProductRepository.delete` must delete product's movements by hand (no FKs; dirty orphan poisons whole `stock_movements` push batch); `stock_movements` stays out of `DELETE_RECONCILE_TABLES` (soft-voided ledger). Gotcha #48.

**Expenses (`expenses`):** wave 3, next to `collections`. **Owns** `branch_id` (`{ kind: 'owned' }` in both `BRANCH_SCOPES` maps), no natural key, soft-void only → no `conflictTarget`, `NATURAL_KEYS` or `DELETE_RECONCILE_TABLES` entry. RLS **admin-only** → collector device pulls zero rows, no client-side gate needed. Also added `stock_movements` (`unit_cost`, `currency_id`, `rate_per_usd_snapshot`) and `products` (`cost_price`, `cost_currency_id`) additive columns (`applySchema` `ALTER`s → ships OTA). **Stock-purchase cost never stored as expense row**; `ExpenseService` derives it from movements at read time (features.md → Expenses, gotcha #89).

**Skipped months (`skipped_months`):** wave 4 next to `charges` (branch-via-customer RLS, `set_updated_at` trigger). **Same natural key** as month `charges` — `UNIQUE (customer_plan_id, billing_month)` locally too → in `NATURAL_KEYS`, writes via `upsertNaturalKeyDirty` (generalized `upsertPaymentDirty`), `deterministicId('skip', line, month)`. Unskip = **boolean flip, never delete**: a deleted row carries nothing through latest-wins pull, so `skipped = false` tells other devices (nothing in `pending_deletes`). features.md → Skipped Months.

## Exception logger (`src/core/errorLog/`) + Developer page

Small, deliberately unlayered debug feature:

- `errorLog/errorLogger.ts` `logException({ source, message, stack?, context? })` — one row into local `exception_logs` (`pushOnly: true`) via `insertDirty`. Reads user/tenant via `getStore().getState().auth.user` (no hook — runs outside React). Never throws; failure only `console.error`s (can't mask original error or loop).
- `errorLog/globalHandler.ts` `installGlobalErrorHandler()`, once from `app/_layout.tsx` bootstrap effect. Wraps RN `ErrorUtils.setGlobalHandler`, chaining to existing handler (Expo overlay) — only adds logging.
- Wired into: `ErrorBoundary.componentDidCatch` (`source: 'boundary'`), global handler (`source: 'global_handler'`), `BaseRepository.handleError` / `OfflineBaseRepository.handleError` (`source: 'repository'`) — every repo's catch funnels through these.
- **Settings → Developer** (`src/modules/settings/developer/`, row gated by `isAdmin` only): read-only mirror browser — every `TABLES` table + `sync_meta`, `pending_deletes` w/ row counts, opens any in `DbTableViewer` (`src/shared/components/DbTableViewer.tsx`; takes only `tableName`, does own `SELECT * FROM <table>` + column discovery). Intentionally not layered — debug tool.
- **Export/Import**, same screen, **admin-only**: JSON **file** via share sheet / file picker (`shared/lib/shareFile.ts`; `expo-file-system` 19 has `FileHandle` + `File.pickFileAsync` → no new dependency, no native rebuild).
  - **Export refuses while any un-pushed write remains**, offers "Sync now": backup = fully-synced snapshot, `_dirty` stripped, `pending_deletes` never carried. Streams row by row via `FileHandle` (one `JSON.stringify` of whole mirror = un-catchable OOM kill).
  - Envelope: `format` / `version` / `exportedAt` / `app` / `tenant` / `branchScope` / `user` / `counts` / `tables`. `tables` holds **every** `TABLES` entry (empty arrays too) in `BACKUP_TABLE_ORDER`; missing key = refusal, never "leave table alone". No `sync_meta` (device identity, not data).
  - **Import validates before touching anything** (`backup/validate.ts`, pure): format/version · all table keys present + arrays · primitive values only · no `_dirty` · non-empty unique `id` · natural keys unique within `charges`/`skipped_months`/`collection_items` · envelope tenant · **every row's `tenant_id`** (`tenants` by `id`, exactly one row; `app_options` exempt) · branch scope · file holds importer's own `users` row, the `tenants` row and their `branches` row. Unknown columns dropped w/ warning.
  - No FKs → table order never errors; duplicate-`id` + natural-key checks make restore un-failable. `BACKUP_TABLE_ORDER` kept anyway (free, matches push).
  - Restore under `suspendSync()` + `withDbLock` + one transaction: re-check `hasUnsyncedWrites`, delete every table (reverse order), insert from **live spec's** column list in `inBatches(rows, rowsPerStatement(cols))` (≤999 bound params), re-stamp `active_tenant_id` / `active_branch_scope` / `active_role_scope` from live session, clear `last_pulled_at` + `last_sync_at`. Never calls `wipeOfflineData()` (own transaction), never `DELETE`s `sync_meta` wholesale (empty scope key → `ensureTenantScope` silently adopts next tenant).
  - **Clearing the pull cursor is mandatory** — it describes the destroyed mirror, not the file; kept → next pull asks `updated_at > <export date>`, stranding every server row changed since. Cleared → next pull re-fetches all, heals import.
  - After restore, screen calls `resetAllDomainStores()` + `refreshActiveData()` (engine never fires them; `core/` doesn't import `Shared/src/state/`).
  - **Import never writes to server by itself.** Second confirm: **also replace server's copy**? Yes → every restored row `_dirty = 1` (except `tenants`, `app_options`, `users`, `audit_logs`, `exception_logs` — gotcha #150) + `syncNow()` → file wins every row it holds (unconditional last-writer-wins). **Overwrites and adds, never deletes**; offered only online. No → import local; healing pull may replace it.
- **Full re-pull**, same screen: `resyncFromScratch()` — clears `last_pulled_at`, one normal push→pull. Non-destructive; repairs a mirror whose incremental pull skipped rows.

## Gotchas specific to this layer

- **Local schema reconciles itself — no migrations.** `applySchema(db)` every start, one transaction: `CREATE TABLE IF NOT EXISTS` per `TABLES` entry, diff spec vs `PRAGMA table_info` and `ALTER TABLE … ADD COLUMN` missing (SQLite has no `ADD COLUMN IF NOT EXISTS`), then `CREATE INDEX IF NOT EXISTS`. **Editing `tables.ts` = entire local schema change**, fresh + existing installs — no delta array, no `user_version` (old versioned runner + `MIGRATIONS` gone). Columns must stay ALTER-able: no `UNIQUE`/`PRIMARY KEY`, no `NOT NULL` w/o constant `DEFAULT` (`_dirty` has one; `id` only ships w/ freshly created table).
- **Reconcile is ADDITIVE ONLY.** Dropped/renamed column, changed type, new/changed table-level `constraints` entry → fresh installs only. Else rebuild mirror (Settings → Developer → full re-pull after clearing app data, or bump `DB_NAME` in `sqlite.ts`), first ensuring no `_dirty` rows (rebuild discards un-pushed writes). Matching Postgres change must ship too, or pull breaks.
- Two impls per read method must stay behaviorally identical (`ilike`→`LIKE COLLATE NOCASE`, ordering, NULL handling). `implements` catches shape drift; read-parity test catches behavior drift.
- On-device SQLite unencrypted by default — evaluate SQLCipher for production; DB wiped on different-tenant login.
- Circular import (offline class composes online sibling for online-only methods): safe b/c offline instance constructed at bottom of switch file, after online class declared. Smoke-test on real build.

**WhatsApp tables are server-only too** — `whatsapp_accounts`, `whatsapp_credentials`, `whatsapp_connect_sessions`, `whatsapp_templates`, `whatsapp_messages`, `whatsapp_opt_outs` in neither `TABLES` nor `PUSH_WAVES`. Every write = Edge Function call (Meta round-trip anyway) → native `WhatsAppRepository.offline.ts` is pure `requireOnline()` delegate like `CustomerRequestRepository.offline.ts`. Only `tenants.whatsapp_enabled` (mirrored column) and `tenant_settings.WhatsAppLanguage` (mirrored row) reach device. docs/whatsapp.md.
