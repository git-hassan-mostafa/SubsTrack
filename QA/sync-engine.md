# Offline Sync Engine — QA Scenarios & Review

Covers the native offline-first sync engine: local writes, push, pull, delete reconcile, tenant/branch scoping, and recovery. **This is the one subsystem where a bug means lost money**, so every scenario below carries a verdict from a code review of the current implementation.

**Reference code:**

- Engine: [sync.ts](../SubsTrack/src/core/offline/sync.ts) (`pushDirty`, `pullChanges`, `reconcileDeletes`, `pruneWindowedTables`, `runSync`, `syncNow`, `flushPendingWrites`, `resyncFromScratch`, `startSync`)
- Write helpers: [db/dml.ts](../SubsTrack/src/core/offline/db/dml.ts) (`insertDirty`, `updateDirty`, `upsertNaturalKeyDirty`, `clearNaturalKeyDuplicate`, `upsertFromServer`, `markDeleted`)
- Schema mirror: [db/tables.ts](../SubsTrack/src/core/offline/db/tables.ts) (`TABLES`, `SYNC_PULL_ORDER`, `generated`, `pushOnly`, `appendOnly`, `pullDays`), [db/schema.ts](../SubsTrack/src/core/offline/db/schema.ts), [db/applySchema.ts](../SubsTrack/src/core/offline/db/applySchema.ts)
- Ids: [ids.ts](../SubsTrack/src/core/offline/ids.ts) (`newId`, `deterministicId`)
- Scoping: [bootstrap/tenant.ts](../SubsTrack/src/core/offline/bootstrap/tenant.ts) (`ensureTenantScope`, `hasUnsyncedWrites`), [db/sqlite.ts](../SubsTrack/src/core/offline/db/sqlite.ts) (`wipeOfflineData`)
- Write transaction + queue: [OfflineBaseRepository.ts](../SubsTrack/src/core/offline/OfflineBaseRepository.ts) (`write`, `auditIn`, `writeQueue`)
- Login path: [AuthRepository.offline.ts](../SubsTrack/src/modules/authentication/auth/repository/AuthRepository.offline.ts)
- Server contract: [script.sql](../sql%20scripts/script.sql) (`set_updated_at()` triggers, `uq_payments_line_month`, `uq_skipped_months_line_month`, `uq_tenant_settings_key`)

**Verdict legend:** ✅ passes · ⚠️ passes but with a caveat · ❌ fails (bug ID in brackets, see §10)

---

## 0. Critical invariants

1. **No collected money is ever lost.** A row written offline reaches the server, or stays `_dirty` until it does. Nothing may clear `_dirty` without a confirmed server write.
2. **`_dirty` beats the server.** A pull must never overwrite an un-pushed local row.
3. **The pull cursor never outruns un-pulled data.** `last_pulled_at` advances only when the whole cycle succeeded.
4. **A local row is deleted only on proof.** Never on an empty/ambiguous server response, and never while `_dirty`.
5. **One tenant + one branch scope per mirror.** A different scope means wipe-and-repull, or refuse.
6. **Replay is idempotent.** Re-running push or pull produces the same result, never duplicates.
7. **Never sync signed out.** An empty RLS result must never be read as "everything was deleted".
8. **A single bad row must not stop the queue.** One rejected row may not block other rows or other tables, forever.

---

## 1. Local write (offline)

| #   | Scenario | Steps | Expected | Verdict |
| --- | --- | --- | --- | --- |
| 1.1 | Payment offline | Airplane mode → collect a payment | Row in SQLite, `_dirty = 1`, grid turns green, no error | ✅ |
| 1.2 | Audit written atomically | 1.1 | `audit_logs` row also `_dirty = 1`, same transaction, `occurred_at` = the real (device) moment | ✅ |
| 1.3 | Rollback on failure | Force an error inside `write()` | Neither the row nor its audit entry exists | ✅ |
| 1.4 | Concurrent repository writes | Remit payments + sales + debt_payments via `Promise.all` | All succeed; `writeQueue` serialises them | ✅ |
| 1.5 | App killed after save | Save → kill the app → reopen | Row still there, still `_dirty` | ✅ |
| 1.6 | Void offline | Void a payment offline | `voided_at` set, `_dirty = 1` | ✅ |
| 1.7 | Same month re-paid after void | Void then re-pay the same (line, month) | `upsertNaturalKeyDirty` replaces the row, no duplicate | ✅ |
| 1.8 | Local `updated_at` | Any offline edit | Set from the device clock, but stripped on push; the server value comes back on pull | ✅ |
| 1.9 | Save during a running pull | Start a big pull (post-login) → save a payment | Save succeeds | ❌ **[B3]** — the sync opens transactions outside `writeQueue`; overlapping `BEGIN` on the one shared connection throws |

---

## 2. Push (local → server)

| #   | Scenario | Steps | Expected | Verdict |
| --- | --- | --- | --- | --- |
| 2.1 | Happy path | 1 dirty payment → sync | Upserted, `_dirty = 0`, `lastSyncAt` stamped | ✅ |
| 2.2 | `updated_at` stripped | 2.1 | Server stamps its own via `set_updated_at()`; client value never sent | ✅ |
| 2.3 | Generated column stripped | Push a payment | `balance` removed (server `GENERATED ALWAYS`); no 428C9 error | ✅ |
| 2.4 | `sales.total_amount` sent | Record a sale offline → sync | Value **is** pushed (it is app-written, not generated) — server total correct | ✅ (sync.ts's comment naming it "generated" is stale — **[B19]**) |
| 2.5 | Parent-before-child | New customer + line + payment offline → sync | Pushed in `SYNC_PULL_ORDER`; no FK error | ✅ |
| 2.6 | Network dies mid-push | Kill the network during the upsert | Rows stay `_dirty`, retried next cycle | ✅ |
| 2.7 | Committed but reply lost | Server commits, response dropped | Next cycle re-sends; upsert by id is idempotent | ✅ |
| 2.8 | Re-sent audit batch | Same as 2.7 for `audit_logs` | `ignoreDuplicates: true` → `DO NOTHING`; insert-only RLS not violated | ✅ |
| 2.9 | Edit during the network call | Save row X → while the upsert is in flight, edit X again | The second edit must still push | ❌ **[B2]** — `_dirty` is cleared for every id in the batch, so the second edit is marked clean and never sent; the next pull then overwrites it |
| 2.10 | Duplicate name, two devices | Two devices offline each create product "Cable" in the same branch → both sync | Both converge or one is reported | ❌ **[B5]** — `uq_products_name_tenant_branch` fails the whole batch; retried identically forever, blocking every other product row |
| 2.11 | Payment for a server-deleted line | Line deleted on web; device collects on it offline → sync | Row rejected but isolated | ❌ **[B5]**+**[B6]** — FK violation wedges the entire `payments` queue |
| 2.12 | Big backlog | Offline 1 month, ~3000 dirty rows → sync | Pushed in chunks | ❌ **[B10]** — one unbounded request per table; a size/timeout failure repeats every cycle |
| 2.13 | Hard delete replay | Delete a product offline → sync | Server `DELETE`, `pending_deletes` entry dropped | ✅ |
| 2.14 | Hard delete refused by RLS | Non-admin's queued delete → sync | Entry kept and surfaced | ❌ **[B12]** — an RLS-filtered delete returns success/0 rows; the entry is dropped and the row silently survives on the server |
| 2.15 | Delete of a never-pushed row | Create then delete offline → sync | Delete affects 0 rows, entry dropped, no error | ✅ |
| 2.16 | Global tables not pushed | Any sync | `tier_plans` / `app_options` skipped (`scope: 'global'`) | ✅ |
| 2.17 | `exception_logs` push-only | Crash offline → sync | Pushed, never pulled back | ✅ |

---

## 3. Pull (server → local)

| #   | Scenario | Steps | Expected | Verdict |
| --- | --- | --- | --- | --- |
| 3.1 | First ever pull | Fresh install → login | No cursor → every row pulled; blocks on the initial pull (`wasEmpty`) | ✅ |
| 3.2 | Incremental pull | Change one customer on web → sync | Only rows with `updated_at >` cursor fetched | ✅ |
| 3.3 | `_dirty` wins | Edit row X offline; X also edited on web → sync (pull only) | Local edit kept; server row skipped | ✅ |
| 3.4 | Own row round-trip | 2.1 then pull | Own row comes back with the server `updated_at`; `_dirty` already 0 so it applies | ✅ |
| 3.5 | Ties beyond one page | >1000 rows share one `updated_at` (migration backfill) | `(updated_at, id)` ordering keeps paging correct | ✅ |
| 3.6 | Concurrent write during paging | >1000 changed rows; another device updates one mid-paging | No row skipped | ❌ **[B11]** — offset paging over a shifting set skips one row at the page boundary, and the cursor advances past it |
| 3.7 | One table fails | Break `payments` only | Cursor pinned; `lastError = 'sync_incomplete'`; `lastSyncAt` unchanged; next cycle re-reaches the stranded rows | ✅ |
| 3.8 | Natural-key duplicate, clean | Server payment for (line, month) held locally under another id, `_dirty = 0` | Stale local row deleted, server row merged | ✅ |
| 3.9 | Natural-key duplicate, dirty | Same but local row `_dirty = 1` | Server row skipped; next push converges on the natural key | ✅ |
| 3.10 | Audit window | Sync | Only the last 30 days of `audit_logs` pulled | ✅ |
| 3.11 | Prune respects `_dirty` | Un-pushed audit row older than 30 days | **Not** deleted (only copy in existence) | ✅ |
| 3.12 | Unknown server column | Add a Postgres column not in `tables.ts` | Ignored by `encodeRow`, no crash | ✅ |
| 3.13 | Cursor format | Any pull | Max `updated_at` stored as the server returned it | ⚠️ **[B16]** — compared as a JS string; correct only while PostgREST returns one fixed UTC offset |

---

## 4. Delete reconcile

| #   | Scenario | Steps | Expected | Verdict |
| --- | --- | --- | --- | --- |
| 4.1 | Product deleted on web | Delete on web → sync | Local row removed | ✅ |
| 4.2 | Small tenant | <1000 customers | Correct reconcile | ✅ |
| 4.3 | **Large tenant** | 1500 customers → sync | No local row deleted | ❌ **[B1]** — the id list is paged **without `ORDER BY`**, so pages can overlap/skip and present customers are deleted locally |
| 4.4 | Empty server list | Session gone / RLS returns nothing | Reconcile skipped, mirror intact | ✅ |
| 4.5 | Un-pushed local create | Create a product offline → sync where the push failed | Not deleted (`_dirty = 0` guard) | ✅ |
| 4.6 | Ledger tables skipped | Void a payment on web | Not id-compared (voids arrive via `updated_at`) | ✅ |
| 4.7 | **Service line deleted on web** | Delete a `customer_plans` row on web → sync on the phone | Local line removed | ❌ **[B6]** — `customer_plans` is hard-deletable but absent from `DELETE_RECONCILE_TABLES`: a phantom line lives forever, shows as unpaid, and can be collected against (→ 2.11) |
| 4.8 | Staff deleted | Admin deletes a user (delete-user edge fn hard-deletes the row) | Local row removed | ❌ **[B6]** — `users` also missing from the list; the deleted person keeps appearing in pickers |
| 4.9 | Customer deleted on web | Delete on web → sync | Customer **and its children** gone locally | ❌ **[B7]** — only the customer row is removed; local `payments`, `customer_plans`, `skipped_months`, `custom_debts`, `debt_payments` become orphans |
| 4.10 | Reconcile id-fetch fails | Network flaky | Cycle reported incomplete, nothing deleted | ✅ |

---

## 5. Two-device convergence

| #   | Scenario | Steps | Expected | Verdict |
| --- | --- | --- | --- | --- |
| 5.1 | Same month, both offline | A and B both collect (line L, month M) → both sync | One row; ids match via `deterministicId` | ✅ |
| 5.2 | Later push wins | A syncs 14:00, B 15:00 | B's values win; A pulls them | ✅ |
| 5.3 | Different fields, same row | A edits phone offline, web edits address | Last push wins **for the whole row**; the web edit is lost | ⚠️ by design (no field-level merge) — must stay documented |
| 5.4 | Web-created row, phone re-records | Payment created on web with id X; phone writes the same (line, month) with id Y | Converges on `customer_plan_id,billing_month`; the loser id is dropped locally by `clearNaturalKeyDuplicate` | ✅ |
| 5.5 | Oversell race | Two offline devices each sell the last unit | Both accepted; stock goes negative | ⚠️ by design (gotcha #48; no `on_hand >= 0` check server-side) |
| 5.6 | Skip vs pay race | A skips month M, B pays month M | Money outranks the skip in `buildMonthGrid`; both rows survive | ✅ |

---

## 6. Tenant & branch scoping

| #   | Scenario | Steps | Expected | Verdict |
| --- | --- | --- | --- | --- |
| 6.1 | Same user re-login | Logout → login | No wipe; background sync | ✅ |
| 6.2 | Different tenant, clean | Logout (flushes) → login as another tenant | Wipe + full re-pull, blocking | ✅ |
| 6.3 | Different tenant, pending | Un-pushed writes → login as another tenant | Refused with `OrganizationSwitchBlockedError`; old data kept | ✅ |
| 6.4 | Branch-scope change, clean | Tenant-wide admin's device → branch user logs in | Wipe + re-pull (RLS row set differs) | ✅ |
| 6.5 | **Branch reassigned with pending writes** | Admin moves a collector from branch A to B on web; collector has un-pushed payments; collector restarts the app | Collector can sign in and their money syncs | ❌ **[B4]** — scope change ⇒ `blockedByPending` ⇒ login throws. The pending rows belong to branch A, which RLS no longer grants, so they can never push. Settings is unreachable, so no resync/import. **Only escape is a reinstall, destroying the money.** |
| 6.6 | Wipe forgets the cursor | 6.2 | `last_pulled_at` cleared so the new tenant pulls in full | ✅ |
| 6.7 | Un-pushed audit at logout | Only `audit_logs` dirty → logout → different-tenant login | Audit rows pushed before the wipe | ❌ **[B13]** — `signOut` gates the flush on `hasUnsyncedWrites()`, which **excludes** appendOnly tables, so no flush runs and the wipe destroys them |
| 6.8 | Cold-start ordering | App killed mid-switch; persisted session ≠ mirror tenant | Sync refuses until scoping settles | ❌ **[B14]** — `startSync()` is fired at bootstrap without awaiting `restoreSession()`; the pull can merge another tenant's rows before `ensureTenantScope` runs |
| 6.9 | Deleted user's session | Staff row deleted while offline → sync | Mirror not wiped | ✅ (§4.4's empty-list guard covers it) |

---

## 7. Triggers, status & recovery

| #   | Scenario | Steps | Expected | Verdict |
| --- | --- | --- | --- | --- |
| 7.1 | Cold start | Open the app online | One cycle runs, then `refreshActiveData()` | ✅ |
| 7.2 | Manual sync | Settings → Sync now | Cycle runs; offline reported distinctly | ✅ |
| 7.3 | Serialised cycles | Tap "Sync now" twice fast | Second call awaits the first (`running` guard) | ✅ |
| 7.4 | Signed out | Log out → force a cycle | No-op; mirror untouched | ✅ |
| 7.5 | **Reconnect** | Offline collect → signal returns, app stays open | Sync fires automatically | ❌ **[B9]** — no NetInfo listener |
| 7.6 | **Foreground / periodic** | App open all day, no manual tap | Sync fires periodically | ❌ **[B9]** — no interval, no AppState listener; `AppState` is imported and unused. Doc comments claim both exist |
| 7.7 | Partial cycle status | One table fails | `lastError = 'sync_incomplete'`, `lastSyncAt` not advanced | ✅ |
| 7.8 | Resync from scratch | Developer → Resync | Push first, then re-pull everything; `_dirty` rows still win | ✅ |
| 7.9 | Import replaces data | Developer → Import JSON | Tables replaced | ⚠️ **[B18]** — `pending_deletes` and `sync_meta` are not cleared, so stale deletes replay and the old cursor is kept |
| 7.10 | UI refresh after pull | Pull brings new rows | Visited screens re-fetch | ✅ (comment naming `setSyncRefreshHandler` / 5-minute ticks is stale — **[B19]**) |

---

## 8. Schema contract (server ↔ mirror)

| #   | Scenario | Check | Verdict |
| --- | --- | --- | --- |
| 8.1 | Every synced table has `updated_at` | 21/21 in `SYNC_PULL_ORDER` | ✅ |
| 8.2 | Every synced table has a BEFORE UPDATE trigger | 21 `trg_*_updated_at` present | ✅ |
| 8.3 | `TABLES` ⇔ `SYNC_PULL_ORDER` | Identical sets | ✅ |
| 8.4 | `ON CONFLICT` targets are real, non-partial | `uq_payments_line_month`, `uq_skipped_months_line_month`, `uq_tenant_settings_key` | ✅ |
| 8.5 | `generated` matches Postgres | Only `payments.balance` | ✅ |
| 8.6 | New column self-heals | Add to `tables.ts` → restart | `ALTER TABLE ADD COLUMN` applied | ✅ |
| 8.7 | New table-level constraint self-heals | Add to `constraints` → restart | Applied on existing installs | ❌ **[B15]** — CREATE-time only; installs predating `UNIQUE(customer_plan_id, billing_month)` still lack it locally |
| 8.8 | No local foreign keys | `PRAGMA foreign_keys` off | ✅ by design (rows arrive out of order) |
| 8.9 | Money precision | `num` stored as exact decimal TEXT | ✅ (no SQL ordering/comparison on money columns found in offline repos) |

---

## 9. Destructive local paths

| #   | Scenario | Steps | Expected | Verdict |
| --- | --- | --- | --- | --- |
| 9.1 | **Delete a customer with un-pushed payments** | Collect offline → delete that customer before syncing | Refused, or the payments push first | ❌ **[B8]** — `DELETE FROM payments WHERE customer_id = ?` destroys `_dirty` rows that exist nowhere else. Money gone, no trace |
| 9.2 | Delete a line with un-pushed payments | Same via the Plans editor | Refused | ❌ **[B8]** — same in `CustomerPlanRepository.offline.delete` |
| 9.3 | Local cascade completeness | Delete a customer offline | All server-cascaded children removed locally | ❌ **[B7]** — `skipped_months`, `custom_debts`, `debt_payments` left behind; if any is `_dirty` its push hits an FK violation and wedges that table |
| 9.4 | Orphan stock movements | Product deleted on web → sync | Local `stock_movements` for it removed | ⚠️ **[B7]** — orphans linger (mirror bloat; excluded from joined reads) |

---

## 10. Findings

Severity: **C** = can lose or corrupt data / lock the user out · **H** = breaks sync durably · **M** = wrong or degraded behavior · **L** = hygiene.

| ID | Sev | Finding | Fix |
| --- | --- | --- | --- |
| **B1** | C | `reconcileDeletes` pages the server id list with **no `ORDER BY`** → unstable paging → present rows judged missing and **deleted locally** on any table over 1000 rows | Add `.order('id', { ascending: true })` to the id-list query |
| **B2** | C | Push clears `_dirty` for every id in the batch, so an edit made **during** the network call is marked clean and never sent (the comment claims the opposite); the next pull then overwrites it | Two-phase flag: set `_dirty = 2` before the request, clear only `WHERE _dirty = 2`; read `_dirty >= 1` in the pull skip, `hasUnsyncedWrites`, and the push SELECT |
| **B3** | C | The sync engine calls `db.withTransactionAsync` directly, bypassing `writeQueue`; on the single shared connection an overlapping user save throws "cannot start a transaction within a transaction" | Export the queue and route the pull's page transactions through it (or `withExclusiveTransactionAsync`) |
| **B4** | C | Reassigning a user's branch while they hold un-pushed writes **permanently locks them out**: the scope change blocks login, and the pending rows belong to a branch RLS no longer grants | Try `flushPendingWrites()` before blocking; for a same-tenant branch change don't block; add a login-time "discard local data" escape |
| **B5** | H | One `upsert` per table per cycle: a single rejected row (unique or FK violation) fails the whole batch and is retried identically **forever**, blocking every other row in that table | On batch failure, retry row-by-row; quarantine a row that keeps failing and surface it |
| **B6** | H | `customer_plans` and `users` are hard-deletable but missing from `DELETE_RECONCILE_TABLES` → phantom rows forever; a phantom line can be collected against, which then wedges the payments push (B5) | Add both to `DELETE_RECONCILE_TABLES` |
| **B7** | H | Local deletes don't mirror the server cascade (`skipped_months`, `custom_debts`, `debt_payments`, `stock_movements` survive) → orphan rows in reads, and a `_dirty` orphan wedges its table on push | Delete every cascaded child locally; derive the child list from one place |
| **B8** | H | Deleting a customer / line destroys **un-pushed** payments — the only copy in existence — with no error and no audit of the money | Refuse the delete while `_dirty` children exist (or force a flush first) |
| **B9** | H | No reconnect and no periodic sync trigger; `AppState` is imported and unused. A collector with the app open all day never syncs unless they tap "Sync now" | Add an AppState foreground trigger, a NetInfo reconnect listener, and an interval — the behavior the comments already claim |
| **B10** | M | Push is unbounded (one request per table, all dirty rows; `WHERE id IN (…)` with one placeholder per row) — a large backlog fails on size/timeout and repeats every cycle | Chunk at ~250–500 rows, clearing `_dirty` per chunk |
| **B11** | M | Offset paging over a set that is being written to can skip one row per page boundary, and the cursor then advances past it | Keyset-page on the composite `(updated_at, id)` tuple — also keeps the tie-safety the current comment is protecting |
| **B12** | M | An RLS-refused hard delete returns success with 0 rows; the queue entry is dropped and the row silently survives on the server while gone locally | Request the affected rows (`.select()`) and keep the entry when nothing was deleted |
| **B13** | M | `signOut` gates `flushPendingWrites()` on `hasUnsyncedWrites()`, which excludes appendOnly tables — so un-pushed audit rows are never flushed and a later wipe destroys them | Use "any dirty row" for the flush gate; keep the narrow predicate only for the block decision |
| **B14** | M | `startSync()` runs at bootstrap without awaiting `restoreSession()`, so a pull can merge another tenant's rows before `ensureTenantScope` runs | Compare the session's tenant to `META_ACTIVE_TENANT` inside `runSync` and bail on mismatch |
| **B15** | L | Local table-level constraints apply at CREATE only, so older installs lack `UNIQUE(customer_plan_id, billing_month)`; two local rows for one (line, month) can coexist | Express natural keys as `CREATE UNIQUE INDEX IF NOT EXISTS` in `CREATE_INDEX_STATEMENTS` — SQLite reconciles those |
| **B16** | L | The cursor max is chosen by JS **string** comparison; correct only while PostgREST returns one fixed UTC offset | Compare with `Date.parse` |
| **B17** | L | No index on `_dirty`; every push full-scans 21 tables | Index `_dirty` on the high-volume tables |
| **B18** | L | Developer import clears the tables but not `pending_deletes` / `sync_meta` | Clear both inside the import transaction |
| **B19** | L | Stale comments in the most safety-critical file: `sales.total_amount` called generated (it isn't — the code is right), `startSync`'s trigger list, `refreshActiveData`'s `setSyncRefreshHandler` and "5-minute ticks" | Correct the comments together with B9 |

### Suggested order

1. **B1, B2, B3, B4** — data loss and lockout. Nothing else matters until these are closed.
2. **B5, B6, B7, B8** — the wedge-and-orphan family; B5 is the shared safety net for B6/B7.
3. **B9** — without it the whole engine only runs when someone remembers to tap a button.
4. **B10–B14**, then the L items.
