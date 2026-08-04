# Audit Trail — QA Scenarios

Covers the append-only `audit_logs` trail: who changed what, when, and what the value was before. Written **by the app** next to each change — never by a Postgres trigger — because a trigger only fires when the row reaches the server, which for an offline device is at the next sync (it would record the sync moment and the syncing session, and an offline device would hold no history at all).

The device keeps a rolling **30-day window**; the server keeps everything.

**Reference code:**

- Row builder: [buildAuditRow.ts](../SubsTrack/src/core/audit/buildAuditRow.ts) (diff, actor, `null` when nothing changed), [describe.ts](../SubsTrack/src/core/audit/describe.ts) (the frozen `label`)
- Call helpers: [BaseRepository.ts](../SubsTrack/src/core/utils/BaseRepository.ts) (`audit`, `auditedUpdate`, `auditedDelete`), [OfflineBaseRepository.ts](../SubsTrack/src/core/offline/OfflineBaseRepository.ts) (`auditIn` — inside the caller's transaction)
- Sync flags: [tables.ts](../SubsTrack/src/core/offline/db/tables.ts) (`appendOnly`, `pullDays`, `ColType: 'json'`), [sync.ts](../SubsTrack/src/core/offline/sync.ts) (`ignoreDuplicates`, window filter, `pruneWindowedTables`)
- Read path: [AuditRepository.ts](../SubsTrack/src/modules/admin/audit/repository/AuditRepository.ts) / [.offline.ts](../SubsTrack/src/modules/admin/audit/repository/AuditRepository.offline.ts), [AuditService.ts](../SubsTrack/src/modules/admin/audit/services/AuditService.ts)
- UI: [AuditLogScreen.tsx](../SubsTrack/src/modules/admin/audit/screens/AuditLogScreen.tsx), [AuditEntrySheet.tsx](../SubsTrack/src/modules/admin/audit/components/AuditEntrySheet.tsx), [RecordHistorySheet.tsx](../SubsTrack/src/modules/admin/audit/components/RecordHistorySheet.tsx)
- Server: `sql scripts/script.sql` → `AUDIT LOGS` section + the `audit_logs_select` / `audit_logs_insert` policies
- Strings: the `audit.*` group in `en.json` / `ar.json`

> **Run `sql scripts/script.sql` first.** The client pushes a column set the server must already have.

---

## 0. Critical invariants

1. **The trail records the real person and the real moment.** `occurred_at` is the device clock when the staff member acted — never the sync time. A payment recorded offline at 09:00 and synced at 17:00 must read 09:00.
2. **An edit records the OLD value.** This is the whole point: editing a payment from 50 to 30 must show `50 → 30`.
3. **A no-op save records nothing.** Opening a form and saving without changing a field must add no entry. Most likely invariant to regress.
4. **It works offline.** Recording, editing and voiding with no connection must all produce local entries immediately.
5. **Admins only can read it.** Staff can write entries but never see one — that is what makes the trail useful in a staff-vs-admin dispute.
6. **It cannot be edited or erased from the app.** No UPDATE and no DELETE policy exists.
7. **A change and its entry are inseparable offline** — they commit in one transaction, so there is never a change without its trail (or vice versa).
8. **An un-pushed entry is never pruned**, no matter how old: it is the only copy in existence.

---

## 1. What gets recorded (online and offline both)

Sign in as an **admin** and check each via Admin → Audit Log.

| #   | Scenario              | Steps                                                            | Expected entry                                                              |
| --- | --------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1.1 | Record a payment      | Customer → tap an unpaid month → pay in full                      | **Added · Payment**, label shows the month + amount, actor = you            |
| 1.2 | Edit a payment amount | Payment detail → Edit → change 50 → 30 → Save                     | **Edited · Payment**, one field: `Amount paid  50 → 30`                     |
| 1.3 | Void a payment        | Payment detail → Void                                             | **Voided · Payment**, fields `Voided at` + `Voided by` (and notes if given)  |
| 1.4 | Record a sale         | Quick actions → Record sale (2+ products)                         | **Added · Sale** — exactly ONE entry, not one per line                       |
| 1.5 | Void a sale           | Sale detail → Void                                                | **Voided · Sale**. No separate `stock_movements` entries                     |
| 1.6 | Custom debt + payment | Add a custom debt, then record a debt payment                      | **Added · Custom debt**, then **Added · Debt payment**                       |
| 1.7 | Receive cash (remit)  | Admin → Wallets → receive one transaction                          | **Edited**, fields `Handed over at` + `Received by admin`                    |
| 1.8 | Add a customer        | Customers → + Add                                                  | **Added · Customer**, whole new row listed in the detail sheet               |
| 1.9 | Edit a customer       | Change only the phone number → Save                                | **Edited · Customer**, ONE field: `Phone  old → new`                         |
| 1.10 | Deactivate a customer | Customer → deactivate                                             | **Edited · Customer**, `Active  Yes → No` + `Cancelled`                      |
| 1.11 | Reactivate a customer | Customer → reactivate                                             | **Restored · Customer** (not "Edited")                                       |
| 1.12 | Delete a customer     | Delete one with no payments                                        | **Deleted · Customer**, detail shows the whole removed row                    |
| 1.13 | Skip / unskip a month | Skip a month, then unskip it                                       | **Added · Skipped month**, then **Restored · Skipped month**                  |
| 1.14 | Plans / products      | Add, edit, then delete a plan and a product                        | Added / Edited / Deleted entries for each                                    |
| 1.15 | Branch, currency      | Add + rename a branch; change a currency rate                      | Entries with the changed field only                                          |
| 1.16 | Staff member          | Add a user, change their role, deactivate them                      | Added, then `Role  user → admin`, then `Active  Yes → No`                     |
| 1.17 | Change a password     | Staff → change password                                            | **Edited · Staff member** — and the password value is **NOT** recorded        |
| 1.18 | Tenant setting        | Admin → Tenant Settings → switch the unpaid rule                    | **Edited · Setting**, `month_start → customer_start_day`                      |
| 1.19 | Bulk actions          | Select 3 customers → bulk deactivate                                | **3** entries, one per customer — not one lumped entry                       |

### 1b. What must NOT be recorded

| #    | Scenario                     | Steps                                                              | Expected                                                     |
| ---- | ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| 1.20 | No-op save                   | Open Edit customer → change nothing → Save                          | **No new entry** (invariant 3)                               |
| 1.21 | No-op payment edit           | Payment → Edit → re-enter the same amount → Save                     | **No new entry**                                             |
| 1.22 | Sale lines / stock movements | After 1.4, filter by every record type                              | No `sale_items` type exists; no stock entries from the sale   |
| 1.23 | Sync pull                    | Change a customer on device B → sync device A                        | Device A gains **no** entry of its own for that pull          |
| 1.24 | Adding stock                 | Product → stock sheet → restock                                     | No audit entry (the stock ledger already is one, with a note) |
| 1.25 | Child rows on a parent edit  | Customer with 2+ plan lines → Edit → change **only** the start date → Save → open the entry | Exactly **one** changed field, `Start date`, `2026-06-13 → 2026-06-14`. **No** `customer_plans` row, and no raw JSON anywhere in the sheet (gotcha #64) |
| 1.26 | …on a plan line edit         | Edit one service line's start date → Save → open the entry           | Only the line's own columns; **no** `plans` row from the join |
| 1.27 | …web and native agree        | Repeat 1.25 on web and on the native app                             | Same single changed field on both — the online path joins, the offline path doesn't, and neither may leak children |
| 1.28 | Blank optional field         | Void a sale leaving the reason box **empty** → open the entry         | `Voided at` and `Voided by` only. **No** `Void reason` row (a blank string over NULL is not a change, gotcha #65) |
| 1.29 | …a real reason still records | Void another sale **with** a reason → open the entry                  | `Void reason` recorded, `(empty) → wrong item`                |

---

## 2. Offline behaviour

Turn on airplane mode for each. Use Settings → Developer → `audit_logs` to inspect raw rows.

| #   | Scenario                    | Steps                                                                    | Expected result                                                                |
| --- | --------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 2.1 | Offline write               | Offline: record a payment, edit it, void it                                | 3 rows in `audit_logs`, all `_dirty = 1`, correct username                      |
| 2.2 | Offline read               | Offline: open Admin → Audit Log                                            | The entries show; note reads "last 30 days saved on this device"                |
| 2.3 | Real action time            | Note the clock, record a payment offline, wait, go online, sync            | `occurred_at` = when you recorded it, **not** the sync time (invariant 1)       |
| 2.4 | Push                        | From 2.1 → go online → wait for sync (or Settings → Sync now)               | The 3 rows become `_dirty = 0` and appear in Supabase `audit_logs`              |
| 2.5 | Full history needs a link   | Offline → tap **Load full history**                                        | Error banner: "requires an internet connection". List is unchanged, no crash    |
| 2.6 | Full history online         | Online → tap **Load full history**                                          | Note switches to "showing the full history from the server"; older rows appear  |
| 2.7 | Change + trail are atomic   | Offline: record a payment, then force-quit the app immediately; reopen      | Either both the payment and its entry exist, or neither. Never one alone        |
| 2.8 | Second device sees it       | Device A (staff) records offline → syncs. Device B (admin) syncs             | B's Audit Log shows A's entries with A's username and A's action time           |
| 2.9 | Org switch is not blocked   | Offline, with un-pushed audit rows only → log out → log in to another org    | Login is **not** refused (a log is not the user's money)                        |

---

## 3. The 30-day window and pruning

| #   | Scenario                     | Steps                                                                                    | Expected result                                              |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 3.1 | Old rows pruned              | Developer: set a synced row's `occurred_at` back 40 days → sync (or restart the app)      | The row is gone locally; it still exists in Supabase          |
| 3.2 | Un-pushed rows survive       | Set a row 40 days back **and** `_dirty = 1` → sync                                       | The row **survives** (invariant 8) — never deleted by age     |
| 3.3 | Recent rows kept             | A row 5 days old → sync                                                                   | Still there                                                   |
| 3.4 | Pull is windowed             | Fresh install → first sync                                                                | Only the last 30 days of the tenant's entries arrive          |
| 3.5 | Older history is online-only | Look for an entry 60 days old in the local view, then via **Load full history**            | Absent locally; present in the full view                      |
| 3.6 | Offline for a long time      | Stay offline past 30 days (or backdate the device) → reopen the app                        | Prune still runs at startup; nothing un-pushed is lost        |

---

## 4. Permissions (RLS)

| #   | Scenario                   | Steps                                                              | Expected result                                                                     |
| --- | -------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| 4.1 | Staff cannot see the menu  | Sign in as `user` → open the app                                    | No Admin tab at all, so no Audit Log                                                |
| 4.2 | Staff still writes         | As `user`: record a payment → sync → check Supabase                 | The entry **is** on the server with that user as actor                               |
| 4.3 | Staff pull returns nothing | As `user`: sync → Developer → `audit_logs`                          | Only that device's own rows; no colleague's entries (intended, invariant 5)          |
| 4.4 | Branch admin scoping       | Branch-scoped admin opens Audit Log                                 | Only their branch's records, plus tenant-wide ones (currencies, settings)            |
| 4.5 | Tenant-wide admin          | Admin with `branch_id = null`                                        | Every branch's entries                                                              |
| 4.6 | Append-only                | Try `update` and `delete` on `audit_logs` as an authenticated client  | Both refused; the row is unchanged                                                   |
| 4.7 | Cross-tenant               | Sign in to another organization                                      | None of the first organization's entries are visible                                |
| 4.8 | Per-record History gating  | Open a payment's detail sheet as `user`, then as admin                | The **History** action shows for the admin only                                     |

---

## 5. Filters, paging and the list

| #   | Scenario              | Steps                                                                | Expected result                                                            |
| --- | --------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 5.1 | Record-type filter    | Pick **Payment**                                                      | Only payment entries                                                       |
| 5.2 | Action filter         | Pick **Voided**                                                       | Only voids                                                                 |
| 5.3 | Staff filter          | Pick a staff member                                                   | Only that person's actions                                                 |
| 5.4 | Date range            | Set From/To to a single past day                                       | Only that day, bounds inclusive at both ends                               |
| 5.5 | Combined              | Payment + Voided + one staff member                                    | All three applied together                                                 |
| 5.6 | Clear filters         | With filters set → tap **Clear filters**                               | Chip clears; full list returns; the pill disappears                        |
| 5.7 | Filtered empty state  | Filter to a combination with no rows                                    | "No matching changes / Try changing the filters" — not the first-run text   |
| 5.8 | First-run empty state | A brand-new organization opens the Audit Log                            | "Nothing recorded yet / Changes staff make will appear here"                |
| 5.9 | Paging                | With 150+ entries, scroll to the bottom repeatedly                      | More load each time; **no stop after the first page** (native pages by 100) |
| 5.10 | Paging when full      | Switch to full history, then page                                       | Keeps loading (server pages by 30) — the page size follows the scope        |
| 5.11 | Stale response        | Change a filter twice quickly                                            | The list matches the LAST filter chosen, never the earlier one              |
| 5.12 | Pull to refresh       | Pull down                                                                | Reloads from the top                                                       |
| 5.13 | Newest first          | Any list                                                                 | Ordered newest → oldest by when staff acted                                |

---

## 6. Entry detail and per-record history

| #   | Scenario                | Steps                                                        | Expected result                                                             |
| --- | ----------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| 6.1 | Diff sheet              | Tap an **Edited** entry                                       | Who / when / record, then each changed field as `old → new`                  |
| 6.2 | Create sheet            | Tap an **Added** entry                                        | The whole new row's values; no arrows (nothing changed *from*)               |
| 6.3 | Delete sheet            | Tap a **Deleted** entry                                       | The whole removed row — this is the only place it still exists               |
| 6.4 | Readable values         | Any entry with a date, a true/false and an amount              | Date+time formatted, Yes/No not `1`/`0`, empty shown as `(empty)`            |
| 6.5 | Technical noise hidden  | Any entry                                                     | No `tenant_id`, `updated_at` or generated `balance` row                      |
| 6.6 | Record History          | Payment detail (as admin) → **History**                        | Only that payment's entries, newest first                                    |
| 6.7 | Record History full     | In the History sheet → **Load full history**                   | Fetches that record's complete server-side timeline                          |
| 6.8 | Record History empty    | Open History on a record created before this feature shipped    | "No changes recorded / not changed since the audit log started"              |
| 6.9 | Nested sheet closes     | History sheet → tap an entry → close the detail                  | Returns to the History list; the History sheet stays open                    |
| 6.10 | Deleted user's entries | Delete a staff member who had recorded payments                  | Their old entries still show their username (it is snapshotted)              |
| 6.11 | Deleted branch         | Delete a branch that had records                                  | Its entries remain visible and attributed                                   |
| 6.12 | Person id → name       | Void a payment or sale → open the entry                            | `Voided by` shows the **staff name**, never a UUID (gotcha #65)             |
| 6.13 | …received by           | Wallets → receive a collector's cash → open the entry                | `Received by admin` shows the admin's name, not an id                      |
| 6.14 | …after the user is gone | Delete that staff member → reopen the same entry                   | `Voided by` reads **"Deleted user"** — still no UUID. The "Staff" row keeps the snapshotted username |
| 6.15 | …opened from History   | Payment detail → History → tap the void entry (staff list not yet loaded) | Name still resolves — the sheet loads the staff list itself                |
| 6.16 | Record ids unchanged   | An entry whose diff moved `plan_id` or `currency_id`                 | Still shown as the raw id (intended: a deleted record has no name)          |
| 6.17 | Timestamp wording      | Open an entry for a **customer** or **plan** edit                    | The time row reads "When", not "Paid on"                                    |

---

## 7. Localisation and layout

| #   | Scenario         | Steps                                        | Expected result                                                          |
| --- | ---------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| 7.1 | Arabic labels    | Switch to Arabic → open the Audit Log         | Titles, actions, record types and field names all translated; no raw keys |
| 7.2 | RTL layout       | In Arabic                                     | Chips, rows and the `old → new` arrow mirror correctly                   |
| 7.3 | Long values      | Edit a customer's notes to a very long string  | The row truncates; the detail sheet wraps without overflow               |
| 7.4 | Unknown field    | (After adding a new column) view an entry      | Falls back to the raw column name rather than a blank or a crash          |

---

## 8. Regression watch-list

Each line is a specific way this feature has a known route to breaking.

| #   | Check                       | Steps                                                                       | Expected result                                                              |
| --- | --------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 8.1 | Retried push does not wedge | Force `_dirty = 1` on a row already on the server → sync, twice               | Push succeeds both times; the queue never sticks; no duplicate row            |
| 8.2 | No pull → audit → push loop | Sync repeatedly with no user action                                          | The row count stops growing; entries do not multiply                         |
| 8.3 | Corrupt JSON is survivable  | Developer: set a row's `changed` to `{oops` → open the Audit Log              | The list renders; that row degrades gracefully; no crash                     |
| 8.4 | Failed audit never blocks   | Simulate an audit-insert failure online                                      | The user's save still succeeds (the trail is best-effort online)             |
| 8.5 | New org, empty tables       | Brand-new organization: open every screen                                    | No errors; audit table exists and is empty                                   |
| 8.6 | Store reset on logout       | Admin views the Audit Log → log out → log in as another org's admin           | No entries from the previous organization are visible, even for a moment      |
| 8.7 | Money is never lost         | Offline: record payments until several are queued, then switch org             | Switching is still refused for the **payments** (only logs are exempt)       |
