# Offline-First (native)

> Read this before touching **any repository** or the sync engine. Referenced from `CLAUDE.md`.
> Native only — on web (`Platform.OS === 'web'`) every repository talks to Supabase directly, exactly as before. Zero web behavior change.

## Why / what

Staff collect payments in the field with unreliable connectivity. The native app therefore works **fully offline** (reads + all tenant-table CRUD) and syncs to Supabase in the background. Real money data must never be lost. The change is confined to the **repository layer** + a new infra folder `src/core/offline/`; services, slices, and UI are untouched.

## The seam

Each repository file (`XxxRepository.ts`) is a **platform switch**. Today's Supabase class stays in that file (now `export class … implements IXxxRepository`); a sibling `OfflineXxxRepository` (in `XxxRepository.offline.ts`) implements the same interface against SQLite; the interface lives in `IXxxRepository.ts`:

```ts
const impl: IXxxRepository =
  Platform.OS === 'web' ? new XxxRepository() : new OfflineXxxRepository();
export default impl;   // services & module index.ts import this — unchanged
```

Both classes `implements IXxxRepository` → the compiler guarantees they stay in lockstep. Offline classes return the **same `Db*` row shapes** (snake_case, incl. nested joins like `customer_plans(*, plans(*))`) the services' mappers already consume, so nothing above the repo layer can tell the difference. `PaymentService.buildMonthGrid` is pure, so the month grid works offline for free.

## `src/core/offline/` layout

| Path | Role |
| --- | --- |
| `platform.ts` | `IS_OFFLINE_CAPABLE = Platform.OS !== 'web'` — every offline path is gated on it. |
| `db/tables.ts` | **Single descriptor** of the local mirror (columns + types + scope). Drives DDL, encode/decode, and generic sync upserts — one source of truth. |
| `db/schema.ts` / `db/migrations.ts` / `db/sqlite.ts` | Versioned DDL (`user_version`), migration runner, the opened handle (`initOfflineDb`, `getDb`, `wipeOfflineData`). `sqlite.ts` is the **only** file with a *value* import of `expo-sqlite`; a sibling `sqlite.web.ts` stub (same export surface, no `expo-sqlite`) is what the web bundle resolves to, so Metro never pulls `expo-sqlite`'s wasm into web. (Runtime `IS_OFFLINE_CAPABLE` guards don't help here — the bundler follows static imports regardless.) All other `expo-sqlite` imports in the folder are `import type` (erased). |
| `db/codec.ts` | Row encode/decode (0/1↔boolean, TEXT-decimal↔number). |
| `db/dml.ts` | `insertDirty` / `updateDirty` / `upsertPaymentDirty` (local write + `_dirty=1`) and `upsertFromServer` (pull merge, `_dirty=0` + `_server_updated_at`). |
| `outbox/outbox.ts` | Durable op log: `enqueue`, `dueOps`, `markDone/Retry/Parked`, `hasPendingForRow`, `countParked`. |
| `OfflineBaseRepository.ts` | Mirror of `BaseRepository`: handle, `handleError`, `branchWhere`/`combineWhere`/`searchWhere`, `all`/`first`/`count`/`decodeAll`/`rowsById`/`childrenByParent`/`referencedIdsIn`, and `write((db, queue) => …)` (data + outbox in one txn). |
| `sync/{engine,push,pull,tombstones,executors,cursors}.ts` | The sync engine. |
| `bootstrap/{offlineBootstrap,tenant}.ts` | `initOffline()` (kicked once from `app/_layout.tsx`) and `ensureTenantScope()`. |
| `ids.ts` | `newId()`, `nowIso()`, `deterministicId()`. |
| `net/connectivity.ts` | NetInfo wrapper. |

## Local store

- Mirror tables match `src/core/types/db.ts` **exactly** (snake_case). Money/rate columns are **TEXT (exact decimal)** — never SQLite `REAL` (float drift). Read via `Number()` (as the mappers do). **Numeric comparisons in SQL use `CAST(col AS REAL)`** (a TEXT column compared to `0` would otherwise compare by storage class, not value).
- `payments.balance` and `sales.total_amount` (server-generated columns) are **computed locally** on write.
- Two local-only columns per table: `_dirty` (1 while a write awaits push) and `_server_updated_at` (last server `updated_at` seen — the LWW + pull-cursor key).
- No SQL foreign keys (rows arrive out of order on pull; cascade deletes come via tombstones). The DB is **scoped to one tenant**; `ensureTenantScope()` wipes + re-pulls on a different-tenant login, and **refuses the wipe while the outbox has un-pushed writes** (money is never discarded silently).

## Writes → durable outbox

Every mutating offline method does, in **one SQLite transaction**: (1) mutate the mirror, (2) `enqueue` an operation-based outbox op. So a crash right after recording a payment loses neither the row nor the intent. Op types: `insert` (payload `{ row, onConflict? }`), `update`/`void`/`soft_delete` (payload `{ fields }`), `hard_delete`. Inserts carry **client-generated ids** (`newId()`), so replay is idempotent (upsert-by-id). **Payment ids are deterministic** (`deterministicId(customer_plan_id, billing_month)`) so two devices recording the same month converge instead of colliding on the natural-key UNIQUE.

## Push (replay) — `sync/push.ts` + `executors.ts`

FIFO by `op_seq`. `executors.replay` calls Supabase directly under the user's JWT (RLS applies): insert→upsert (payments on the natural key), update→`update.eq('id')` (+ `.eq('updated_at', base_version)` conflict guard on high-value edits), void→`update…is('voided_at', null)` (monotonic), soft_delete→update, hard_delete→delete. Success → drop the op + clear `_dirty`. Transient failure → exponential backoff, stop to preserve FIFO. **Permanent rejection (RLS / tier-limit / constraint / conflict) → `parked`, never dropped** (surfaced for review).

## Pull — `sync/pull.ts` + `tombstones.ts`

Per table: `updated_at > cursor` (server-authoritative via BEFORE UPDATE trigger), LWW-merge into the mirror, **skip rows that still have a pending outbox op** (don't clobber un-pushed edits), advance the cursor. Tombstones (`tombstones` table, populated by AFTER DELETE triggers incl. cascade children) drive local deletion of hard-deleted rows. The engine runs **push → then pull**, serialized, on reconnect / foreground / after each write / periodically, and once at bootstrap.

## Manual sync + observable status

`sync/engine.ts` also exposes an observable status (`SyncStatus = { syncing, lastSyncAt, lastError }`) via `getSyncStatus()` / `subscribeSyncStatus()` — `runSync()` broadcasts the transitions, so **every** sync cycle (manual or automatic: reconnect / foreground / periodic / after a write) flips `syncing`. `syncNow()` is the manual UI entry point (probes connectivity first, returns `{ ok, offline }` so a button can tell "reached the server" from "no connection"). All re-exported from `src/core/offline/index.ts`; components read the status through the `useSyncStatus()` hook (`src/shared/hooks/`, `useSyncExternalStore`).

- **Global marker** — `SyncIndicator` (`src/shared/components/`) is mounted once in the authenticated layout (`app/(app)/_layout.tsx`, beside `GlobalConfirmDialog`), so a top-center "Syncing data…" pill appears on **all pages** while `syncing` is true. Renders nothing when idle or on web.
- **Settings** — a "Sync now" row (native only) triggers `syncNow()`; a brief bottom flash reports the one-off outcome (done / offline / failed). The syncing state itself is left to the global marker.

## Conflict policy (money)

Inserts are keyed/idempotent; voids are monotonic; the common money ops are conflict-free. For concurrent same-row **edits**, `payments.updatePayment` and `customers.update` carry `base_version` and replay as a guarded update → if the row moved, the op is **parked** (surfaced) rather than blindly overwriting. Everything else is LWW by server `updated_at`. Full per-field merge is out of scope.

## Online-only (native)

`signIn` / `getTenantByCode`, `User.create`/`delete`/`updatePassword` (edge fns), all `Signup.*`, `Subscription.upgradeTenant`: throw `RequiresConnectionError` (localized, flows through the normal ErrorBanner) when offline, else delegate to the Supabase sibling and cache the result locally. `Auth.getSession`/`getUserProfile`/`getTenant` are a **read-through cache** — online they fetch + cache (profile, branch, tenant, tier); offline they serve the cache, so the app boots offline after the **first online login** (which blocks on an initial full pull when the local DB is empty).

## Required Postgres changes — in `sql scripts/script.sql`

`updated_at` + BEFORE UPDATE triggers on the tables that lacked them (tenants, users, plans, payments, sales, tier_plans); a `tombstones` table (RLS SELECT by tenant) + a SECURITY-DEFINER `record_tombstone()` and AFTER DELETE triggers on every hard-deletable table (and cascade children). These live in `script.sql` (a fresh run creates them). To migrate an existing DB, run the migration snippet provided in chat when the change was made.

## Gotchas specific to this layer

- Adding a synced column ⇒ update `db/tables.ts`, append a migration in `db/schema.ts`, **and** the Postgres side — they must ship together or pull breaks.
- Two implementations per read method must stay behaviorally identical (`ilike`→`LIKE COLLATE NOCASE`, ordering, NULL handling). The `implements` interface catches shape drift; a read-parity test catches behavior drift.
- On-device SQLite is unencrypted by default — evaluate SQLCipher for production; the DB is wiped on a different-tenant login.
- Circular import (offline class composes its online sibling for online-only methods): safe because the offline instance is only constructed at the bottom of the switch file, after the online class is declared. Smoke-test on a real build.
